import mongoose, { isValidObjectId } from "mongoose";
import { Video } from "../models/video.model.js";
import { User } from "../models/user.model.js";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { Playlist } from "../models/playlist.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { uploadOnCloudinary, deleteFromCloudinary, generateUploadSignature } from "../utils/cloudinary.js";

/* -------------------------------------------------------
   Utility: Escape special regex characters from user input
   to prevent ReDoS attacks.
------------------------------------------------------- */
const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/* -------------------------------------------------------
   Whitelist of allowed sort fields (prevents sort-field
   injection that could probe internal schema fields).
------------------------------------------------------- */
const ALLOWED_SORT_FIELDS = new Set([
  "createdAt",
  "updatedAt",
  "title",
  "views",
  "duration",
]);

/* -------------------------------------------------------
   GET /videos/generate-signature — Get Cloudinary Signature
------------------------------------------------------- */
const generateSignature = asyncHandler(async (req, res) => {
  const signaturePayload = generateUploadSignature();
  return res
    .status(200)
    .json(new ApiResponse(200, signaturePayload, "Upload signature generated successfully"));
});

/* -------------------------------------------------------
   GET /videos — List Videos with Pagination & Filtering
------------------------------------------------------- */
const getAllVideos = asyncHandler(async (req, res) => {
  let {
    page = 1,
    limit = 10,
    query,
    sortBy = "createdAt",
    sortType = "desc",
    userId,
  } = req.query;

  page = parseInt(page);
  limit = Math.min(parseInt(limit), 100); // Cap at 100 to prevent abuse

  if (isNaN(page) || page < 1) {
    throw new ApiError(400, "Page must be a positive number");
  }
  if (isNaN(limit) || limit < 1) {
    throw new ApiError(400, "Limit must be a positive number");
  }

  // Validate sort field against whitelist
  if (!ALLOWED_SORT_FIELDS.has(sortBy)) {
    sortBy = "createdAt";
  }

  // Filters
  const filter = { isPublished: true }; // Only show published videos

  if (query) {
    filter.title = { $regex: escapeRegex(query), $options: "i" };
  }
  if (userId) {
    if (!isValidObjectId(userId)) {
      throw new ApiError(400, "Invalid userId");
    }
    filter.owner = userId;
  }

  // Sorting
  const sortOrder = sortType === "asc" ? 1 : -1;
  const sort = { [sortBy]: sortOrder };

  // Pagination
  const skip = (page - 1) * limit;

  // Parallel query: videos + total count
  const [videos, total] = await Promise.all([
    Video.find(filter)
      .populate("owner", "username email avatar")
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean(),
    Video.countDocuments(filter),
  ]);

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        videos,
        total,
        limit,
        page,
        pages: Math.ceil(total / limit),
      },
      "Videos fetched successfully"
    )
  );
});

/* -------------------------------------------------------
   POST /videos — Publish a New Video
------------------------------------------------------- */
const publishAVideo = asyncHandler(async (req, res) => {
  const { title, description, videoUrl, videoPublicId, thumbnailUrl, thumbnailPublicId, duration } = req.body;

  if (
    [title, description].some((field) => !field || field.trim() === "")
  ) {
    throw new ApiError(400, "Title and description are required");
  }

  if (!videoUrl || !videoPublicId || !thumbnailUrl || !thumbnailPublicId) {
    throw new ApiError(400, "Video and thumbnail details from Cloudinary are required");
  }

  try {
    const video = await Video.create({
      videoFile: videoUrl,
      videoFilePublicId: videoPublicId,
      thumbnail: thumbnailUrl,
      thumbnailPublicId: thumbnailPublicId,
      title,
      description,
      duration: duration || 0,
      owner: req.user._id,
      isPublished: true,
    });

    return res
      .status(201)
      .json(new ApiResponse(201, video, "Video published successfully"));
  } catch (error) {
    throw new ApiError(500, "Database creation failed: " + error.message);
  }
});

/* -------------------------------------------------------
   GET /videos/:videoId — Get Single Video
------------------------------------------------------- */
const getVideoById = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid VideoId");
  }

  // Atomically increment views count when video is fetched
  const video = await Video.findByIdAndUpdate(
    videoId,
    { $inc: { views: 1 } },
    { new: true } // return the updated document
  ).populate("owner", "username avatar");

  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  return res
    .status(200)
    .json(new ApiResponse(200, video, "Video fetched successfully"));
});

/* -------------------------------------------------------
   PATCH /videos/:videoId — Update Video Details
   FIX: Added ownership check — only the video owner
   can update their own video.
------------------------------------------------------- */
const updateVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid VideoId");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Ownership check
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not authorized to update this video");
  }

  const { title, description, thumbnailUrl, thumbnailPublicId } = req.body;

  if (!title) {
    throw new ApiError(400, "Title is required");
  }
  if (!description) {
    throw new ApiError(400, "Description is required");
  }

  // Handle optional thumbnail update via frontend Cloudinary upload
  let updatedThumbnailUrl = video.thumbnail;
  let updatedThumbnailPublicId = video.thumbnailPublicId;
  
  if (thumbnailUrl && thumbnailPublicId) {
    // Optionally delete old thumbnail from Cloudinary here
    const oldPublicId = video.thumbnailPublicId || video.thumbnail;
    deleteFromCloudinary(oldPublicId, "image").catch(() => {});
    updatedThumbnailUrl = thumbnailUrl;
    updatedThumbnailPublicId = thumbnailPublicId;
  }

  const updatedVideo = await Video.findByIdAndUpdate(
    videoId,
    { title, description, thumbnail: updatedThumbnailUrl, thumbnailPublicId: updatedThumbnailPublicId },
    { new: true, runValidators: true }
  );

  return res
    .status(200)
    .json(new ApiResponse(200, updatedVideo, "Video updated successfully"));
});

/* -------------------------------------------------------
   DELETE /videos/:videoId — Delete Video
   (Already had ownership check — kept as-is)
------------------------------------------------------- */
const deleteVideo = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid VideoId");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Ownership check
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(403, "You are not authorized to delete this video");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
      await Comment.deleteMany({ video: videoId }, { session });
      await Like.deleteMany({ video: videoId }, { session });
      await Playlist.updateMany({ videos: videoId }, { $pull: { videos: videoId } }, { session });
      await User.updateMany(
          { $or: [{ watchHistory: videoId }, { watchLater: videoId }] },
          { $pull: { watchHistory: videoId, watchLater: videoId } },
          { session }
      );

      const vPublicId = video.videoFilePublicId || video.videoFile;
      const tPublicId = video.thumbnailPublicId || video.thumbnail;
      
      if (vPublicId) await deleteFromCloudinary(vPublicId, "video");
      if (tPublicId) await deleteFromCloudinary(tPublicId, "image");

      await Video.findByIdAndDelete(videoId, { session });

      await session.commitTransaction();
      session.endSession();

      return res
        .status(200)
        .json(new ApiResponse(200, { id: video._id }, "Video and all associations deleted successfully"));
  } catch (error) {
      await session.abortTransaction();
      session.endSession();
      throw new ApiError(500, "Deletion failed. Rolled back changes: " + error.message);
  }
});

/* -------------------------------------------------------
   PATCH /videos/toggle/publish/:videoId
   FIX: Added ownership check.
------------------------------------------------------- */
const togglePublishStatus = asyncHandler(async (req, res) => {
  const { videoId } = req.params;

  if (!isValidObjectId(videoId)) {
    throw new ApiError(400, "Invalid VideoId");
  }

  const video = await Video.findById(videoId);
  if (!video) {
    throw new ApiError(404, "Video not found");
  }

  // Ownership check
  if (video.owner.toString() !== req.user._id.toString()) {
    throw new ApiError(
      403,
      "You are not authorized to change publish status of this video"
    );
  }

  video.isPublished = !video.isPublished;
  await video.save();

  return res.status(200).json(
    new ApiResponse(
      200,
      { isPublished: video.isPublished },
      `Video is now ${video.isPublished ? "published" : "unpublished"}`
    )
  );
});

/* -------------------------------------------------------
   POST /videos/edited — Publish an Edited Video
------------------------------------------------------- */
const publishEditedVideo = asyncHandler(async (req, res) => {
  const { title, description, editMetadata, videoUrl, videoPublicId, thumbnailUrl, thumbnailPublicId, duration } = req.body;

  if (
    [title, description].some((field) => !field || field.trim() === "")
  ) {
    throw new ApiError(400, "Title and description are required");
  }

  if (!videoUrl || !videoPublicId || !thumbnailUrl || !thumbnailPublicId) {
    throw new ApiError(400, "Video and thumbnail details from Cloudinary are required");
  }

  // Parse editMetadata (might be string if sent via FormData, or object if JSON)
  let parsedEditMetadata = {};
  try {
    parsedEditMetadata = typeof editMetadata === 'string' ? JSON.parse(editMetadata) : (editMetadata || {});
  } catch {
    parsedEditMetadata = {};
  }

  try {
    const video = await Video.create({
      videoFile: videoUrl,
      videoFilePublicId: videoPublicId,
      thumbnail: thumbnailUrl,
      thumbnailPublicId: thumbnailPublicId,
      title,
      description,
      duration: duration || 0,
      owner: req.user._id,
      isPublished: true,
      isEdited: true,
      editMetadata: {
        clipCount: parsedEditMetadata.clipCount || 1,
        appliedFilters: parsedEditMetadata.appliedFilters || [],
        originalClips: parsedEditMetadata.originalClips || [],
      },
    });

    return res
      .status(201)
      .json(new ApiResponse(201, video, "Edited video published successfully"));
  } catch (error) {
    throw new ApiError(500, "Database creation failed: " + error.message);
  }
});

export {
  getAllVideos,
  publishAVideo,
  publishEditedVideo,
  getVideoById,
  updateVideo,
  deleteVideo,
  togglePublishStatus,
  generateSignature,
};