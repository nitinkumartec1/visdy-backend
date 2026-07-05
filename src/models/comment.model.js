import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const commentSchema = new Schema(
    {
        content: {
            type: String,
            required: true, // FIX: was `require: true` (Mongoose ignores that)
        },
        video: {
            type: Schema.Types.ObjectId,
            ref: "Video",
            index: true,
        },
        tweet: {
            type: Schema.Types.ObjectId,
            ref: "Tweet",
            index: true,
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Compound index for paginated comment queries by video or tweet
commentSchema.index({ video: 1, createdAt: -1 });
commentSchema.index({ tweet: 1, createdAt: -1 });

commentSchema.plugin(mongooseAggregatePaginate);

export const Comment = mongoose.model("Comment", commentSchema);