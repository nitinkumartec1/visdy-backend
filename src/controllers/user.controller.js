import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { uploadOnCloudinary, deleteFromCloudinary } from "../utils/cloudinary.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { Tweet } from "../models/tweet.model.js";
import { Playlist } from "../models/playlist.model.js";
import { Subscription } from "../models/subscription.model.js";
import { firebaseAuth } from "../utils/firebaseAdmin.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

/* -------------------------------------------------------
   Token Generation Utility
   Generates access + refresh tokens and persists the
   refresh token in the user document.
------------------------------------------------------- */
const generateAccessAndRefreshToken = async (userId) => {
  try {
    const user = await User.findById(userId);

    if (!user) {
      throw new ApiError(404, "User not found during token generation");
    }

    const accessToken = user.generateAccessToken();
    const refreshToken = user.generateRefreshToken();

    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });

    return { accessToken, refreshToken };
  } catch (error) {
    throw new ApiError(
      500,
      "Something went wrong while generating access and refresh token"
    );
  }
};

/* -------------------------------------------------------
   Cookie Options Factory
   FIX: Added sameSite and maxAge. secure is only true
   in production (localhost doesn't use HTTPS).
------------------------------------------------------- */
const getCookieOptions = (maxAgeMs) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "strict",
  maxAge: maxAgeMs,
});

/* -------------------------------------------------------
   POST /register
------------------------------------------------------- */
const registerUser = asyncHandler(async (req, res) => {
  const { fullName, email, username, password } = req.body;

  // Validation - fields should not be empty
  if (
    [fullName, email, username, password].some(
      (field) => !field || field.trim() === ""
    )
  ) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if user already exists using username or email
  const existedUser = await User.findOne({
    $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
  });
  if (existedUser) {
    throw new ApiError(409, "User with email or username already exists");
  }

  // Get avatar local path from uploaded files
  const avatarLocalPath = req.files?.avatar?.[0]?.path;

  // Check and get cover image local path
  let coverImageLocalPath;
  if (Array.isArray(req.files?.coverImage) && req.files.coverImage.length > 0) {
    coverImageLocalPath = req.files.coverImage[0].path;
  }

  // Avatar is required
  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is required");
  }

  // Upload avatar to Cloudinary
  const avatar = await uploadOnCloudinary(avatarLocalPath);
  if (!avatar?.url) {
    throw new ApiError(500, "Avatar upload failed");
  }

  // Upload cover image to Cloudinary (optional)
  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  // Create user object and save to DB
  const user = await User.create({
    fullName,
    email,
    password,
    avatar: avatar.url,
    avatarPublicId: avatar.public_id,
    coverImage: coverImage?.url || "",
    coverImagePublicId: coverImage?.public_id || "",
    username: username.toLowerCase(),
  });

  // Select user without password and refreshToken for response
  const createdUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  if (!createdUser) {
    throw new ApiError(500, "Something went wrong while registering the user");
  }

  // Generate tokens for auto-login
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    createdUser._id
  );

  // Return final response with cookies and tokens
  return res
    .status(201)
    .cookie("accessToken", accessToken, getCookieOptions(24 * 60 * 60 * 1000)) // 1 day
    .cookie("refreshToken", refreshToken, getCookieOptions(10 * 24 * 60 * 60 * 1000)) // 10 days
    .json(
      new ApiResponse(
        201,
        {
          user: createdUser,
          accessToken,
          refreshToken,
        },
        "User registered and logged in successfully"
      )
    );
});

/* -------------------------------------------------------
   POST /login
------------------------------------------------------- */
const loginUser = asyncHandler(async (req, res) => {
  const { email, username, password } = req.body;

  if (!username && !email) {
    throw new ApiError(400, "username or email is required");
  }

  if (!password) {
    throw new ApiError(400, "password is required");
  }

  // -------------------------------------------------------
  // ADMIN LOGIN OVERRIDE (from .env)
  // -------------------------------------------------------
  if (
    process.env.ADMIN_EMAIL &&
    process.env.ADMIN_PASSWORD &&
    email?.toLowerCase() === process.env.ADMIN_EMAIL.toLowerCase() &&
    password === process.env.ADMIN_PASSWORD
  ) {
    let adminUser = await User.findOne({ email: process.env.ADMIN_EMAIL.toLowerCase() });

    if (!adminUser) {
      // Ensure username 'admin' isn't taken by a normal user, if it is, append a random number
      let adminUsername = "admin";
      while (await User.findOne({ username: adminUsername })) {
        adminUsername = `admin${Math.floor(Math.random() * 1000)}`;
      }

      adminUser = await User.create({
        fullName: "System Admin",
        email: process.env.ADMIN_EMAIL.toLowerCase(),
        username: adminUsername,
        password: process.env.ADMIN_PASSWORD,
        avatar: "https://ui-avatars.com/api/?name=Admin&background=722F37&color=fff",
        role: "admin",
      });
    } else if (adminUser.role !== "admin") {
      adminUser.role = "admin";
      await adminUser.save({ validateBeforeSave: false });
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshToken(adminUser._id);
    const loggedInAdmin = await User.findById(adminUser._id).select("-password -refreshToken");

    return res
      .status(200)
      .cookie("accessToken", accessToken, getCookieOptions(24 * 60 * 60 * 1000))
      .cookie("refreshToken", refreshToken, getCookieOptions(10 * 24 * 60 * 60 * 1000))
      .json(
        new ApiResponse(200, { user: loggedInAdmin, accessToken, refreshToken }, "Admin logged in successfully")
      );
  }
  // -------------------------------------------------------

  // Explicitly build the $or query to avoid searching for 'undefined'
  // and ensure we convert to lowercase since registration saves usernames/emails in lowercase.
  const searchConditions = [];
  if (username) searchConditions.push({ username: username.toLowerCase() });
  if (email) searchConditions.push({ email: email.toLowerCase() });

  const user = await User.findOne({
    $or: searchConditions,
  });

  if (!user) {
    throw new ApiError(404, "user does not exist");
  }

  const isPasswordValid = await user.isPasswordCorrect(password);

  if (!isPasswordValid) {
    throw new ApiError(401, "invalid user credentials");
  }

  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, getCookieOptions(24 * 60 * 60 * 1000))
    .cookie("refreshToken", refreshToken, getCookieOptions(10 * 24 * 60 * 60 * 1000))
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "User logged In successfully"
      )
    );
});

/* -------------------------------------------------------
   POST /logout
   FIX: Changed $set: { refreshToken: undefined } to
   $unset: { refreshToken: 1 }. Mongoose ignores
   undefined in $set, so the token was never removed.
------------------------------------------------------- */
const logoutUser = asyncHandler(async (req, res) => {
  await User.findByIdAndUpdate(
    req.user._id,
    {
      $unset: { refreshToken: 1 }, // Actually removes the field from the document
    },
    { new: true }
  );

  const cookieOpts = getCookieOptions(0); // maxAge: 0 expires immediately

  return res
    .status(200)
    .clearCookie("accessToken", cookieOpts)
    .clearCookie("refreshToken", cookieOpts)
    .json(new ApiResponse(200, {}, "User logged Out"));
});

/* -------------------------------------------------------
   POST /refresh-token
   FIXES:
   1. Reads cookie name "refreshToken" (was "refereshToken" typo)
   2. Compares against user.refreshToken (was user.refereshToken)
   3. Destructures { accessToken, refreshToken } correctly
      (was { accessToken, newRefreshToken } which was always undefined)
------------------------------------------------------- */
const refreshAccessToken = asyncHandler(async (req, res) => {
  const incomingRefreshToken =
    req.cookies.refreshToken || req.body.refreshToken;

  if (!incomingRefreshToken) {
    throw new ApiError(401, "Unauthorized Request");
  }

  try {
    const decodedToken = jwt.verify(
      incomingRefreshToken,
      process.env.REFRESH_TOKEN_SECRET
    );

    const user = await User.findById(decodedToken?._id);

    if (!user) {
      throw new ApiError(401, "Invalid refresh token");
    }

    if (incomingRefreshToken !== user.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }

    // Generate new token pair (refresh token rotation)
    const { accessToken, refreshToken: newRefreshToken } =
      await generateAccessAndRefreshToken(user._id);

    return res
      .status(200)
      .cookie("accessToken", accessToken, getCookieOptions(24 * 60 * 60 * 1000))
      .cookie("refreshToken", newRefreshToken, getCookieOptions(10 * 24 * 60 * 60 * 1000))
      .json(
        new ApiResponse(
          200,
          {
            accessToken,
            refreshToken: newRefreshToken,
          },
          "Access Token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh token");
  }
});

/* -------------------------------------------------------
   POST /change-password
------------------------------------------------------- */
const changeCurrentPassword = asyncHandler(async (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!oldPassword || !newPassword) {
    throw new ApiError(400, "Old password and new password are required");
  }

  if (newPassword.length < 6) {
    throw new ApiError(400, "New password must be at least 6 characters");
  }

  const user = await User.findById(req.user?._id);

  const isPasswordCorrect = await user.isPasswordCorrect(oldPassword);

  if (!isPasswordCorrect) {
    throw new ApiError(400, "Invalid old password");
  }

  user.password = newPassword;
  await user.save({ validateBeforeSave: false });

  return res
    .status(200)
    .json(new ApiResponse(200, {}, "Password changed successfully"));
});

/* -------------------------------------------------------
   GET /current-user
------------------------------------------------------- */
const getCurrentUser = asyncHandler(async (req, res) => {
  return res
    .status(200)
    .json(new ApiResponse(200, req.user, "User fetched successfully"));
});

/* -------------------------------------------------------
   PATCH /update-account
------------------------------------------------------- */
const updateAccountDetails = asyncHandler(async (req, res) => {
  const { email, fullName } = req.body;

  if (!email || !fullName) {
    throw new ApiError(400, "All fields are required");
  }

  // Check if email is taken by a different user
  const emailTaken = await User.findOne({ email, _id: { $ne: req.user._id } });
  if (emailTaken) {
    throw new ApiError(409, "Email is already in use by another account");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        fullName,
        email: email,
      },
    },
    { new: true }
  ).select("-password");

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Account details updated successfully"));
});

/* -------------------------------------------------------
   PATCH /avatar
   FIX: Added missing `await` on findByIdAndUpdate.
   FIX: Deletes old avatar from Cloudinary to prevent
   orphaned asset accumulation.
------------------------------------------------------- */
const updateUserAvatar = asyncHandler(async (req, res) => {
  const avatarLocalPath = req.file?.path;

  if (!avatarLocalPath) {
    throw new ApiError(400, "Avatar file is missing");
  }

  // Get old avatar URL before updating
  const currentUser = await User.findById(req.user?._id).select("avatar avatarPublicId");
  const oldAvatarUrl = currentUser?.avatarPublicId || currentUser?.avatar;

  const avatar = await uploadOnCloudinary(avatarLocalPath);

  if (!avatar?.url) {
    throw new ApiError(400, "Error while uploading avatar");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        avatar: avatar.url,
        avatarPublicId: avatar.public_id,
      },
    },
    { new: true }
  ).select("-password");

  // Delete old avatar from Cloudinary (non-blocking, best-effort)
  if (oldAvatarUrl) {
    deleteFromCloudinary(oldAvatarUrl, "image").catch(() => {});
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Avatar image updated successfully"));
});

/* -------------------------------------------------------
   PATCH /cover-image
   FIX: Deletes old cover from Cloudinary.
------------------------------------------------------- */
const updateUserCoverImage = asyncHandler(async (req, res) => {
  const coverImageLocalPath = req.file?.path;

  if (!coverImageLocalPath) {
    throw new ApiError(400, "Cover image file is missing");
  }

  // Get old cover URL before updating
  const currentUser = await User.findById(req.user?._id).select("coverImage coverImagePublicId");
  const oldCoverUrl = currentUser?.coverImagePublicId || currentUser?.coverImage;

  const coverImage = await uploadOnCloudinary(coverImageLocalPath);

  if (!coverImage?.url) {
    throw new ApiError(400, "Error while uploading coverImage");
  }

  const user = await User.findByIdAndUpdate(
    req.user?._id,
    {
      $set: {
        coverImage: coverImage.url,
        coverImagePublicId: coverImage.public_id,
      },
    },
    { new: true }
  ).select("-password");

  // Delete old cover from Cloudinary (non-blocking)
  if (oldCoverUrl) {
    deleteFromCloudinary(oldCoverUrl, "image").catch(() => {});
  }

  return res
    .status(200)
    .json(new ApiResponse(200, user, "Cover image updated successfully"));
});

/* -------------------------------------------------------
   GET /c/:username — Channel Profile
------------------------------------------------------- */
const getUserChannelProfile = asyncHandler(async (req, res) => {
  const { username } = req.params;

  if (!username?.trim()) {
    throw new ApiError(400, "username is missing");
  }

  const channel = await User.aggregate([
    {
      $match: {
        username: username.toLowerCase(),
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "channel",
        as: "subscribers",
      },
    },
    {
      $lookup: {
        from: "subscriptions",
        localField: "_id",
        foreignField: "subscriber",
        as: "subscribedTo",
      },
    },
    {
      $addFields: {
        subscribersCount: {
          $size: "$subscribers",
        },

        channelsSubscribedToCount: {
          $size: "$subscribedTo",
        },

        isSubscribed: {
          $cond: {
            if: {
              $in: [
                req.user?._id
                  ? new mongoose.Types.ObjectId(req.user._id)
                  : null,
                "$subscribers.subscriber",
              ],
            },
            then: true,
            else: false,
          },
        },
      },
    },
    {
      $project: {
        fullName: 1,
        username: 1,
        subscribersCount: 1,
        channelsSubscribedToCount: 1,
        isSubscribed: 1,
        avatar: 1,
        coverImage: 1,
        email: 1,
        _id: 1,
      },
    },
  ]);

  if (!channel?.length) {
    throw new ApiError(404, "channel does not exist");
  }

  return res
    .status(200)
    .json(
      new ApiResponse(200, channel[0], "User channel fetched successfully")
    );
});

/* -------------------------------------------------------
   GET /history — Watch History
   FIX: Changed $first: "owner" to $first: "$owner"
   (missing $ prefix caused MongoDB to use literal string
   instead of field reference)
------------------------------------------------------- */
const toggleWatchLater = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!videoId) {
    throw new ApiError(400, "videoId is required");
  }

  const user = await User.findById(req.user._id);
  const isWatchLater = user.watchLater.includes(videoId);

  if (isWatchLater) {
    user.watchLater.pull(videoId);
  } else {
    user.watchLater.push(videoId);
  }

  await user.save({ validateBeforeSave: false });

  return res.status(200).json(
    new ApiResponse(
      200,
      { isWatchLater: !isWatchLater },
      isWatchLater ? "Removed from Watch Later" : "Added to Watch Later"
    )
  );
});

const getWatchLaterVideos = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchLater",
        foreignField: "_id",
        as: "watchLater",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner",
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0]?.watchLater || [],
        "Watch later videos fetched successfully"
      )
    );
});

const getWatchHistory = asyncHandler(async (req, res) => {
  const user = await User.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(req.user._id),
      },
    },
    {
      $lookup: {
        from: "videos",
        localField: "watchHistory",
        foreignField: "_id",
        as: "watchHistory",
        pipeline: [
          {
            $lookup: {
              from: "users",
              localField: "owner",
              foreignField: "_id",
              as: "owner",
              pipeline: [
                {
                  $project: {
                    fullName: 1,
                    username: 1,
                    avatar: 1,
                  },
                },
              ],
            },
          },
          {
            $addFields: {
              owner: {
                $first: "$owner", // FIX: was "owner" (missing $)
              },
            },
          },
        ],
      },
    },
  ]);

  return res
    .status(200)
    .json(
      new ApiResponse(
        200,
        user[0]?.watchHistory || [],
        "Watch history fetched successfully"
      )
    );
});

/* -------------------------------------------------------
   POST /firebase-login
   Verifies a Firebase ID token (from Google Sign-In or
   Email Link auth), finds or creates a MongoDB user,
   and returns app JWT tokens.
------------------------------------------------------- */
const firebaseLogin = asyncHandler(async (req, res) => {

  const { idToken } = req.body;

  if (!idToken) {
    throw new ApiError(400, "Firebase ID token is required");
  }

  // Step 1: Verify the Firebase ID token
  let firebaseUser;
  try {
    firebaseUser = await firebaseAuth.verifyIdToken(idToken);
  } catch (error) {
    throw new ApiError(401, "Invalid or expired Firebase token");
  }

  const { uid, email, name, picture, firebase } = firebaseUser;

  if (!email) {
    throw new ApiError(400, "Email is required from Firebase provider");
  }

  // Determine auth provider from Firebase sign-in method
  const signInProvider = firebase?.sign_in_provider || "unknown";
  let authProvider = "google";
  if (signInProvider === "password" || signInProvider === "emailLink") {
    authProvider = "email-link";
  }

  // Step 2: Find existing user by firebaseUid OR email
  let user = await User.findOne({
    $or: [{ firebaseUid: uid }, { email: email.toLowerCase() }],
  });

  if (user) {
    // Link Firebase UID if not already linked
    if (!user.firebaseUid) {
      user.firebaseUid = uid;
      user.authProvider = authProvider;
      await user.save({ validateBeforeSave: false });
    }
  } else {
    // Step 3: Auto-register new user
    // Generate a unique username from email prefix
    const emailPrefix = email.split("@")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
    let username = emailPrefix;
    let counter = 1;
    while (await User.findOne({ username })) {
      username = `${emailPrefix}${counter}`;
      counter++;
    }

    // Use Google profile picture or generate a default avatar URL
    const avatarUrl =
      picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(name || email)}&background=722F37&color=fff&size=200`;

    user = await User.create({
      fullName: name || email.split("@")[0],
      email: email.toLowerCase(),
      username,
      avatar: avatarUrl,
      coverImage: "",
      firebaseUid: uid,
      authProvider,
      // No password for Firebase users
    });
  }

  // Step 4: Generate app JWT tokens
  const { accessToken, refreshToken } = await generateAccessAndRefreshToken(
    user._id
  );

  // Fetch clean user object (without password/refreshToken)
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res
    .status(200)
    .cookie("accessToken", accessToken, getCookieOptions(24 * 60 * 60 * 1000))
    .cookie("refreshToken", refreshToken, getCookieOptions(10 * 24 * 60 * 60 * 1000))
    .json(
      new ApiResponse(
        200,
        {
          user: loggedInUser,
          accessToken,
          refreshToken,
        },
        "Firebase login successful"
      )
    );
});

const deleteAccount = asyncHandler(async (req, res) => {
  const userId = req.user._id;
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const user = await User.findById(userId).session(session);
    const userVideos = await Video.find({ owner: userId }).session(session);
    const videoIds = userVideos.map((v) => v._id);

    // 1. Delete all user's videos Cloudinary assets
    for (const video of userVideos) {
      if (video.videoFilePublicId) await deleteFromCloudinary(video.videoFilePublicId, "video");
      else if (video.videoFile) await deleteFromCloudinary(video.videoFile, "video").catch(() => {});
      
      if (video.thumbnailPublicId) await deleteFromCloudinary(video.thumbnailPublicId, "image");
      else if (video.thumbnail) await deleteFromCloudinary(video.thumbnail, "image").catch(() => {});
    }

    // 2. Delete all user's videos from DB
    await Video.deleteMany({ owner: userId }, { session });

    // 3. Cascade delete associated with those videos or the user
    await Comment.deleteMany(
      { $or: [{ owner: userId }, { video: { $in: videoIds } }] },
      { session }
    );
    await Like.deleteMany(
      { $or: [{ likedBy: userId }, { video: { $in: videoIds } }] },
      { session }
    );
    await Tweet.deleteMany({ owner: userId }, { session });
    await Playlist.deleteMany({ owner: userId }, { session });
    await Subscription.deleteMany(
      { $or: [{ subscriber: userId }, { channel: userId }] },
      { session }
    );

    // 4. Remove deleted videos from other users' playlists and history
    if (videoIds.length > 0) {
      await Playlist.updateMany(
        {},
        { $pull: { videos: { $in: videoIds } } },
        { session }
      );
      await User.updateMany(
        {},
        {
          $pull: {
            watchHistory: { $in: videoIds },
            watchLater: { $in: videoIds },
          },
        },
        { session }
      );
    }

    // 5. Delete User's own Cloudinary assets
    if (user.avatarPublicId) await deleteFromCloudinary(user.avatarPublicId, "image");
    else if (user.avatar) await deleteFromCloudinary(user.avatar, "image").catch(() => {});
    
    if (user.coverImagePublicId) await deleteFromCloudinary(user.coverImagePublicId, "image");
    else if (user.coverImage) await deleteFromCloudinary(user.coverImage, "image").catch(() => {});

    // 6. Delete User document
    await User.findByIdAndDelete(userId, { session });

    await session.commitTransaction();
    session.endSession();

    return res
      .status(200)
      .clearCookie("accessToken")
      .clearCookie("refreshToken")
      .json(new ApiResponse(200, {}, "Account deleted successfully"));
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw new ApiError(500, "Failed to delete account. Rolled back: " + error.message);
  }
});

export {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  getWatchLaterVideos,
  toggleWatchLater,
  firebaseLogin,
  deleteAccount,
};
