import mongoose from "mongoose";
import { Comment } from "../models/comment.model.js";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";
import { Tweet } from "../models/tweet.model.js";

const getVideoComments = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    let { page = 1, limit = 10 } = req.query;

    if (!videoId) {
        throw new ApiError(400, "VideoId is required");
    }

    // Convert to numbers
    page = parseInt(page);
    limit = Math.min(parseInt(limit), 100); // Cap at 100

    if (isNaN(page) || page < 1) {
        throw new ApiError(400, "Page must be a positive number");
    }
    if (isNaN(limit) || limit < 1) {
        throw new ApiError(400, "Limit must be a positive number");
    }

    // Pagination calculation
    const skip = (page - 1) * limit;

    // Parallel: fetch comments + count
    const [videoComments, totalComments] = await Promise.all([
        Comment.find({ video: videoId })
            .populate("owner", "username email avatar")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean(),
        Comment.countDocuments({ video: videoId }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                comments: videoComments,
                page,
                limit,
                totalComments,
                totalPages: Math.ceil(totalComments / limit),
            },
            "Video comments fetched successfully"
        )
    );
});

const addComment = asyncHandler(async (req, res) => {
    const { videoId } = req.params;
    const userId = req.user?._id;
    const { content } = req.body;

    if (!videoId)
        throw new ApiError(400, "VideoId is required");
    if (!userId)
        throw new ApiError(401, "User not authenticated");
    if (!content || content.trim() === "")
        throw new ApiError(400, "Content is required");

    const videoExists = await Video.findById(videoId);
    if (!videoExists) throw new ApiError(404, "Video not found");

    let comment = await Comment.create({
        video: videoId,
        owner: userId,
        content: content.trim(),
    });

    // Auto-populate owner details
    comment = await comment.populate("owner", "username email avatar");

    return res
        .status(201)
        .json(new ApiResponse(201, { comment }, "Comment added successfully"));
});

const getTweetComments = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    let { page = 1, limit = 10 } = req.query;

    if (!tweetId) {
        throw new ApiError(400, "TweetId is required");
    }

    // Convert to numbers
    page = parseInt(page);
    limit = Math.min(parseInt(limit), 100);

    if (isNaN(page) || page < 1) {
        throw new ApiError(400, "Page must be a positive number");
    }
    if (isNaN(limit) || limit < 1) {
        throw new ApiError(400, "Limit must be a positive number");
    }

    const skip = (page - 1) * limit;

    const [tweetComments, totalComments] = await Promise.all([
        Comment.find({ tweet: tweetId })
            .populate("owner", "username email avatar")
            .skip(skip)
            .limit(limit)
            .sort({ createdAt: -1 })
            .lean(),
        Comment.countDocuments({ tweet: tweetId }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                comments: tweetComments,
                page,
                limit,
                totalComments,
                totalPages: Math.ceil(totalComments / limit),
            },
            "Tweet comments fetched successfully"
        )
    );
});

const addTweetComment = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    const userId = req.user?._id;
    const { content } = req.body;

    if (!tweetId)
        throw new ApiError(400, "TweetId is required");
    if (!userId)
        throw new ApiError(401, "User not authenticated");
    if (!content || content.trim() === "")
        throw new ApiError(400, "Content is required");

    const tweetExists = await Tweet.findById(tweetId);
    if (!tweetExists) throw new ApiError(404, "Tweet not found");

    let comment = await Comment.create({
        tweet: tweetId,
        owner: userId,
        content: content.trim(),
    });

    comment = await comment.populate("owner", "username email avatar");

    return res
        .status(201)
        .json(new ApiResponse(201, { comment }, "Comment added successfully"));
});

/* -------------------------------------------------------
   PATCH /comments/c/:commentId
   FIX: Changed `comment.user` to `comment.owner` to match
   the schema field name. The original code always crashed
   with TypeError because `comment.user` is undefined.
------------------------------------------------------- */
const updateComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;
    const { content } = req.body;

    if (!commentId) {
        throw new ApiError(400, "CommentId is required");
    }

    if (!content || content.trim() === "") {
        throw new ApiError(400, "Content is required");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // ✅ Ownership check (FIX: was `comment.user`, schema uses `owner`)
    if (comment.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not allowed to update this comment");
    }

    comment.content = content.trim();
    await comment.save();

    return res
        .status(200)
        .json(new ApiResponse(200, comment, "Comment updated successfully"));
});

/* -------------------------------------------------------
   DELETE /comments/c/:commentId
   FIX: Same `comment.user` → `comment.owner` fix.
------------------------------------------------------- */
const deleteComment = asyncHandler(async (req, res) => {
    const { commentId } = req.params;

    if (!commentId) {
        throw new ApiError(400, "CommentId is required");
    }

    const comment = await Comment.findById(commentId);

    if (!comment) {
        throw new ApiError(404, "Comment not found");
    }

    // ✅ Ownership check
    if (comment.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not allowed to delete this comment");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await Like.deleteMany({ comment: commentId }, { session });
        await Comment.findByIdAndDelete(commentId, { session });
        
        await session.commitTransaction();
        session.endSession();

        return res
            .status(200)
            .json(new ApiResponse(200, {}, "Comment deleted successfully"));
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw new ApiError(500, "Deletion failed. Rolled back changes: " + error.message);
    }
});

export { getVideoComments, addComment, getTweetComments, addTweetComment, updateComment, deleteComment };