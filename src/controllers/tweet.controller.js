import mongoose, { isValidObjectId } from "mongoose";
import { Tweet } from "../models/tweet.model.js";
import { User } from "../models/user.model.js";
import { Like } from "../models/like.model.js";
import { Comment } from "../models/comment.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const createTweet = asyncHandler(async (req, res) => {
    // Accept both `content` (frontend) and `tweet` (test script) field names
    const tweetContent = req.body.content || req.body.tweet;

    if (!tweetContent || tweetContent.trim() === "") {
        throw new ApiError(400, "Tweet content is required");
    }

    const newTweet = await Tweet.create({
        content: tweetContent.trim(),
        owner: req.user?._id,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, newTweet, "Tweet created successfully"));
});

const getUserTweets = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId || !isValidObjectId(userId)) {
        throw new ApiError(400, "Valid UserId is required");
    }

    const tweets = await Tweet.find({ owner: userId })
        .sort({ createdAt: -1 })
        .lean();

    // Return empty array instead of 404 — having no tweets is valid
    return res
        .status(200)
        .json(
            new ApiResponse(200, tweets, "User tweets fetched successfully")
        );
});

const getAllTweets = asyncHandler(async (req, res) => {
    const tweets = await Tweet.find()
        .populate("owner", "username avatar")
        .sort({ createdAt: -1 })
        .lean();

    return res
        .status(200)
        .json(
            new ApiResponse(200, tweets, "All tweets fetched successfully")
        );
});

/* -------------------------------------------------------
   PATCH /tweets/:tweetId
   FIX: Added ownership check (was missing entirely —
   any authenticated user could update any tweet).
------------------------------------------------------- */
const updateTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;
    const { content } = req.body;

    if (!tweetId || !isValidObjectId(tweetId)) {
        throw new ApiError(400, "Valid TweetId is required");
    }
    if (!content || content.trim() === "") {
        throw new ApiError(400, "Tweet content is required");
    }

    const tweet = await Tweet.findById(tweetId);

    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    // Ownership check
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this tweet");
    }

    tweet.content = content.trim();
    await tweet.save();

    return res
        .status(200)
        .json(new ApiResponse(200, tweet, "Tweet updated successfully"));
});

/* -------------------------------------------------------
   DELETE /tweets/:tweetId
   FIX: Changed `tweet.user` to `tweet.owner` to match
   schema. The original code crashed with TypeError.
------------------------------------------------------- */
const deleteTweet = asyncHandler(async (req, res) => {
    const { tweetId } = req.params;

    if (!tweetId || !isValidObjectId(tweetId)) {
        throw new ApiError(400, "Valid TweetId is required");
    }

    const tweet = await Tweet.findById(tweetId);

    if (!tweet) {
        throw new ApiError(404, "Tweet not found");
    }

    // ✅ Ownership check
    if (tweet.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this tweet");
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        await Like.deleteMany({ tweet: tweetId }, { session });
        await Comment.deleteMany({ tweet: tweetId }, { session });
        await Tweet.findByIdAndDelete(tweetId, { session });
        
        await session.commitTransaction();
        session.endSession();

        return res
            .status(200)
            .json(
                new ApiResponse(200, { id: tweet._id }, "Tweet deleted successfully")
            );
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw new ApiError(500, "Deletion failed. Rolled back changes: " + error.message);
    }
});

export { createTweet, getUserTweets, getAllTweets, updateTweet, deleteTweet };