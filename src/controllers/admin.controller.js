import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { User } from "../models/user.model.js";
import { Video } from "../models/video.model.js";
import { Comment } from "../models/comment.model.js";
import { Tweet } from "../models/tweet.model.js";
import { Like } from "../models/like.model.js";
import { Subscription } from "../models/subscription.model.js";
import { deleteFromCloudinary } from "../utils/cloudinary.js";
import mongoose from "mongoose";

/* -------------------------------------------------------
   GET /admin/stats
   Returns aggregated counts of all major entities
------------------------------------------------------- */
const getPlatformStats = asyncHandler(async (req, res) => {
  const [totalUsers, totalVideos, totalComments, totalTweets] = await Promise.all([
    User.countDocuments(),
    Video.countDocuments(),
    Comment.countDocuments(),
    Tweet.countDocuments(),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { totalUsers, totalVideos, totalComments, totalTweets },
      "Platform stats fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   GET /admin/users
   Paginated list of all users
------------------------------------------------------- */
const getAllUsers = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const query = req.query.query || "";

  const filter = {};
  if (query) {
    filter.$or = [
      { username: { $regex: query, $options: "i" } },
      { email: { $regex: query, $options: "i" } },
      { fullName: { $regex: query, $options: "i" } },
    ];
  }

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("-password -refreshToken")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { users, total, page, limit, pages: Math.ceil(total / limit) },
      "Users fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   DELETE /admin/users/:userId
   Deletes a user and ALL associated data
------------------------------------------------------- */
const deleteUser = asyncHandler(async (req, res) => {
  const { userId } = req.params;

  if (!mongoose.isValidObjectId(userId)) {
    throw new ApiError(400, "Invalid User ID");
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new ApiError(404, "User not found");
  }

  // Prevent admin from deleting themselves (or maybe other admins depending on policy, we'll just prevent self-deletion for now)
  if (user._id.toString() === req.user._id.toString()) {
    throw new ApiError(403, "You cannot delete your own admin account");
  }

  // 1. Delete all videos by this user from DB and Cloudinary
  const userVideos = await Video.find({ owner: userId });
  for (const video of userVideos) {
    const vPublicId = video.videoFilePublicId || video.videoFile;
    const tPublicId = video.thumbnailPublicId || video.thumbnail;
    if (vPublicId) await deleteFromCloudinary(vPublicId, "video").catch(() => {});
    if (tPublicId) await deleteFromCloudinary(tPublicId, "image").catch(() => {});
  }
  await Video.deleteMany({ owner: userId });

  // 2. Delete avatar and cover from Cloudinary
  if (user.avatar && !user.avatar.includes("ui-avatars.com") && !user.avatar.includes("googleusercontent.com")) {
      await deleteFromCloudinary(user.avatar, "image").catch(() => {});
  }
  if (user.coverImage) {
      await deleteFromCloudinary(user.coverImage, "image").catch(() => {});
  }

  // 3. Delete all other related documents
  await Promise.all([
    Comment.deleteMany({ owner: userId }),
    Tweet.deleteMany({ owner: userId }),
    Like.deleteMany({ likedBy: userId }),
    Subscription.deleteMany({ $or: [{ subscriber: userId }, { channel: userId }] }),
  ]);

  // 4. Finally delete the user
  await user.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, { userId }, "User and all associated data deleted successfully")
  );
});

/* -------------------------------------------------------
   GET /admin/videos
   Paginated list of all videos (published & unpublished)
------------------------------------------------------- */
const getAllVideos = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const skip = (page - 1) * limit;
  const query = req.query.query || "";

  const filter = {};
  if (query) {
    filter.title = { $regex: query, $options: "i" };
  }

  const [videos, total] = await Promise.all([
    Video.find(filter)
      .populate("owner", "username email avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Video.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { videos, total, page, limit, pages: Math.ceil(total / limit) },
      "Videos fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   DELETE /admin/videos/:videoId
   Admin delete video
------------------------------------------------------- */
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!mongoose.isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid Video ID");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Delete assets from Cloudinary
  const vPublicId = video.videoFilePublicId || video.videoFile;
  const tPublicId = video.thumbnailPublicId || video.thumbnail;
  if (vPublicId) await deleteFromCloudinary(vPublicId, "video").catch(() => {});
  if (tPublicId) await deleteFromCloudinary(tPublicId, "image").catch(() => {});

  // Clean up references
  await Promise.all([
    Comment.deleteMany({ video: videoId }),
    Like.deleteMany({ video: videoId })
  ]);

  await video.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, { videoId }, "Video deleted successfully")
  );
});

/* -------------------------------------------------------
   GET /admin/comments
------------------------------------------------------- */
const getAllComments = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [comments, total] = await Promise.all([
    Comment.find()
      .populate("owner", "username avatar")
      .populate("video", "title")
      .populate("tweet", "content")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Comment.countDocuments(),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { comments, total, page, limit, pages: Math.ceil(total / limit) },
      "Comments fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   DELETE /admin/comments/:commentId
------------------------------------------------------- */
const deleteComment = asyncHandler(async (req, res) => {
  const { commentId } = req.params;

  if (!mongoose.isValidObjectId(commentId)) {
    throw new ApiError(400, "Invalid Comment ID");
  }

  const comment = await Comment.findById(commentId);
  if (!comment) {
    throw new ApiError(404, "Comment not found");
  }

  await Like.deleteMany({ comment: commentId });
  await comment.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, { commentId }, "Comment deleted successfully")
  );
});

/* -------------------------------------------------------
   GET /admin/tweets
------------------------------------------------------- */
const getAllTweets = asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const skip = (page - 1) * limit;

  const [tweets, total] = await Promise.all([
    Tweet.find()
      .populate("owner", "username avatar")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Tweet.countDocuments(),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      { tweets, total, page, limit, pages: Math.ceil(total / limit) },
      "Tweets fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   DELETE /admin/tweets/:tweetId
------------------------------------------------------- */
const deleteTweet = asyncHandler(async (req, res) => {
  const { tweetId } = req.params;

  if (!mongoose.isValidObjectId(tweetId)) {
    throw new ApiError(400, "Invalid Tweet ID");
  }

  const tweet = await Tweet.findById(tweetId);
  if (!tweet) {
    throw new ApiError(404, "Tweet not found");
  }

  await Comment.deleteMany({ tweet: tweetId });
  await Like.deleteMany({ tweet: tweetId });
  await tweet.deleteOne();

  return res.status(200).json(
    new ApiResponse(200, { tweetId }, "Tweet deleted successfully")
  );
});

export {
  getPlatformStats,
  getAllUsers,
  deleteUser,
  getAllVideos,
  deleteVideo,
  getAllComments,
  deleteComment,
  getAllTweets,
  deleteTweet,
};
