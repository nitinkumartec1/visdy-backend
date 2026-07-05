import mongoose from "mongoose";
import { User } from "../models/user.model.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";

/* -------------------------------------------------------
   Utility: Safe ObjectId validator
------------------------------------------------------- */
const validateObjectId = (id, fieldName = "Id") => {
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ApiError(400, `Invalid ${fieldName}: ${id}`);
    }
    return new mongoose.Types.ObjectId(id);
};

/* -------------------------------------------------------
   POST /subscriptions/c/:channelId — Subscribe/Unsubscribe Toggle
------------------------------------------------------- */
const toggleSubscription = asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const userId = req.user?._id;

    if (!userId) {
        throw new ApiError(401, "Unauthorized request");
    }

    const channelObjectId = validateObjectId(channelId, "Channel Id");

    // Prevent self subscription
    if (channelObjectId.toString() === userId.toString()) {
        throw new ApiError(400, "You cannot subscribe to your own channel");
    }

    const existingSubscription = await Subscription.findOne({
        channel: channelObjectId,
        subscriber: userId,
    });

    // Unsubscribe
    if (existingSubscription) {
        await existingSubscription.deleteOne();

        return res
            .status(200)
            .json(
                new ApiResponse(200, { subscribed: false }, "Unsubscribed successfully")
            );
    }

    // Subscribe
    const newSubscription = await Subscription.create({
        channel: channelObjectId,
        subscriber: userId,
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            { subscribed: true, id: newSubscription._id },
            "Subscribed successfully"
        )
    );
});

/* -------------------------------------------------------
   GET /subscriptions/c/:channelId/subscribers
------------------------------------------------------- */
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
    const { channelId } = req.params;
    const channelObjectId = validateObjectId(channelId, "Channel Id");

    const subscribers = await Subscription.aggregate([
        {
            $match: { channel: channelObjectId },
        },
        {
            $lookup: {
                from: "users",
                localField: "subscriber",
                foreignField: "_id",
                as: "subscriber",
                pipeline: [
                    {
                        $project: {
                            username: 1,
                            fullName: 1,
                            avatar: 1,
                        },
                    },
                ],
            },
        },
        {
            $unwind: {
                path: "$subscriber",
                preserveNullAndEmptyArrays: true,
            },
        },
        {
            $project: {
                _id: 1,
                subscriber: 1,
                createdAt: 1,
            },
        },
    ]);

    return res
        .status(200)
        .json(
            new ApiResponse(200, subscribers, "Subscribers fetched successfully")
        );
});

/* -------------------------------------------------------
   GET /subscriptions/u/:subscriberId/subscriptions
------------------------------------------------------- */
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { subscriberId } = req.params;

    /* -------------------------------------------------------
       Resolve user: use param if valid ObjectId, else fall
       back to authenticated user
    ------------------------------------------------------- */
    const rawUserId =
        subscriberId && mongoose.Types.ObjectId.isValid(subscriberId)
            ? subscriberId
            : req.user?._id;

    if (!rawUserId) {
        throw new ApiError(400, "Subscriber identity is missing");
    }

    const targetUserId = new mongoose.Types.ObjectId(rawUserId);

    const subscribedChannels = await Subscription.aggregate([
        {
            $match: {
                subscriber: targetUserId,
            },
        },
        {
            $lookup: {
                from: "users",
                localField: "channel",
                foreignField: "_id",
                as: "subscribedChannel",
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
            $unwind: {
                path: "$subscribedChannel",
                preserveNullAndEmptyArrays: true,
            },
        },
        // Count subscribers of each channel
        {
            $lookup: {
                from: "subscriptions",
                localField: "channel",
                foreignField: "channel",
                as: "subscribers",
            },
        },
        {
            $addFields: {
                "subscribedChannel.subscribersCount": {
                    $size: {
                        $ifNull: ["$subscribers", []],
                    },
                },
            },
        },
        {
            $project: {
                _id: 1,
                subscribedChannel: 1,
            },
        },
    ]);

    return res.status(200).json(
        new ApiResponse(
            200,
            subscribedChannels,
            "Subscribed channels fetched successfully"
        )
    );
});

export {
    toggleSubscription,
    getUserChannelSubscribers,
    getSubscribedChannels,
};