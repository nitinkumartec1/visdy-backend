import mongoose, { Schema } from "mongoose";
import mongooseAggregatePaginate from "mongoose-aggregate-paginate-v2";

const videoSchema = new Schema(
    {
        videoFile: {
            type: String,
            required: true,
        },
        videoFilePublicId: {
            type: String,
        },
        thumbnail: {
            type: String, // cloudinary url
            required: true,
        },
        thumbnailPublicId: {
            type: String,
        },
        title: {
            type: String,
            required: true,
            index: true, // FIX: Added index for search queries
        },
        description: {
            type: String,
            required: true,
        },
        duration: {
            type: Number,
            required: true,
        },
        views: {
            type: Number,
            default: 0,
        },
        isPublished: {
            type: Boolean,
            default: true,
            index: true, // FIX: Added index — most queries filter on this
        },
        isEdited: {
            type: Boolean,
            default: false,
        },
        editMetadata: {
            clipCount: { type: Number, default: 1 },
            appliedFilters: [{ type: String }],
            originalClips: [
                {
                    name: String,
                    duration: Number,
                    trimStart: Number,
                    trimEnd: Number,
                    speed: { type: Number, default: 1 },
                    filter: String,
                },
            ],
        },
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true, // FIX: Added index for channel video lookups
        },
    },
    {
        timestamps: true,
    }
);

// Compound indexes for common query patterns
videoSchema.index({ owner: 1, createdAt: -1 });
videoSchema.index({ isPublished: 1, createdAt: -1 });

videoSchema.plugin(mongooseAggregatePaginate);

export const Video = mongoose.model("Video", videoSchema);