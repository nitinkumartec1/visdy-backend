import mongoose, { Schema } from "mongoose";

const likeSchema = new mongoose.Schema(
    {
        comment: {
            type: Schema.Types.ObjectId,
            ref: "Comment",
        },
        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
        },
        likedBy: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        tweet: {
            type: Schema.Types.ObjectId,
            ref: "Tweet",
        },
    },
    {
        timestamps: true,
    }
);

// FIX: Added compound indexes for fast like lookups and toggle operations
likeSchema.index({ video: 1, likedBy: 1 });
likeSchema.index({ comment: 1, likedBy: 1 });
likeSchema.index({ tweet: 1, likedBy: 1 });

export const Like = mongoose.model("Like", likeSchema);