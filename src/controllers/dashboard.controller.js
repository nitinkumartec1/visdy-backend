import mongoose from "mongoose";
import { Video } from "../models/video.model.js";
import { Subscription } from "../models/subscription.model.js";
import { Like } from "../models/like.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* -------------------------------------------------------
   GET /dashboard/stats
   FIX: Used aggregation pipeline instead of fetching ALL
   videos into memory. The original code loaded every video
   document just to count them and sum views — O(n) memory.
   Now uses $group to compute stats in MongoDB with O(1) memory.
------------------------------------------------------- */
const getChannelStats = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "User not authenticated");
    }

    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Use aggregation to compute all stats in a single DB round-trip
    const [videoStats] = await Video.aggregate([
        { $match: { owner: userObjectId } },
        {
            $group: {
                _id: null,
                totalVideos: { $sum: 1 },
                totalViews: { $sum: "$views" },
                videoIds: { $push: "$_id" },
            },
        },
    ]);

    const totalVideos = videoStats?.totalVideos || 0;
    const totalViews = videoStats?.totalViews || 0;
    const videoIds = videoStats?.videoIds || [];

    // Parallel: subscriber count + like count
    const [totalSubscribers, totalLikes] = await Promise.all([
        Subscription.countDocuments({ channel: userId }),
        Like.countDocuments({ video: { $in: videoIds } }),
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                totalVideos,
                totalViews,
                totalSubscribers,
                totalLikes,
            },
            "Channel stats fetched successfully"
        )
    );
});

/* -------------------------------------------------------
   GET /dashboard/videos
------------------------------------------------------- */
const getChannelVideos = asyncHandler(async (req, res) => {
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "User not authenticated");
    }

    const allChannelVideos = await Video.find({ owner: userId })
        .sort({ createdAt: -1 })
        .populate("owner", "username email avatar")
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            allChannelVideos,
            allChannelVideos.length === 0
                ? "No videos uploaded by this channel"
                : "Channel videos fetched successfully"
        )
    );
});

export { getChannelStats, getChannelVideos };
