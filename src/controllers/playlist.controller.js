import mongoose, { isValidObjectId } from "mongoose";
import { Playlist } from "../models/playlist.model.js";
import { ApiError } from "../utils/ApiError.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { Video } from "../models/video.model.js";

const createPlaylist = asyncHandler(async (req, res) => {
    const { name, description } = req.body;
    const { videoId } = req.params;

    if (!name || name.trim() === "") {
        throw new ApiError(400, "Name is required");
    }
    if (!description || description.trim() === "") {
        throw new ApiError(400, "Description is required");
    }

    // Validate videoId if provided
    const videos = [];
    if (videoId) {
        if (!isValidObjectId(videoId)) {
            throw new ApiError(400, "Invalid videoId");
        }
        videos.push(videoId);
    }

    const playlist = await Playlist.create({
        name: name.trim(),
        description: description.trim(),
        videos,
        owner: req.user._id,
    });

    return res
        .status(201)
        .json(new ApiResponse(201, { playlist }, "Playlist created successfully"));
});

const getUserPlaylists = asyncHandler(async (req, res) => {
    const { userId } = req.params;

    if (!userId || !isValidObjectId(userId)) {
        throw new ApiError(400, "Valid UserId is required");
    }

    const playlists = await Playlist.find({ owner: userId })
        .populate("videos", "title thumbnail duration")
        .populate("owner", "username email avatar")
        .lean();

    return res.status(200).json(
        new ApiResponse(
            200,
            { count: playlists.length, playlists },
            playlists.length === 0
                ? "No playlists found"
                : "Playlists fetched successfully"
        )
    );
});

const getPlaylistById = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!playlistId || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Valid PlaylistId is required");
    }

    const playlist = await Playlist.findById(playlistId)
        .populate("videos", "title thumbnail duration views")
        .populate("owner", "username email avatar");

    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            { playlist, count: playlist.videos.length },
            "Playlist fetched successfully"
        )
    );
});

/* -------------------------------------------------------
   POST /playlist/:playlistId/videos/:videoId
   FIX: Added ownership check — only the playlist owner
   can add videos to their playlist.
------------------------------------------------------- */
const addVideoToPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;

    if (!playlistId || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Valid PlaylistId is required");
    }
    if (!videoId || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Valid VideoId is required");
    }

    // Verify playlist exists and check ownership
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to modify this playlist");
    }

    // Verify video exists
    const videoExists = await Video.findById(videoId);
    if (!videoExists) {
        throw new ApiError(404, "Video not found");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        { $addToSet: { videos: videoId } },
        { new: true }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            { playlist: updatedPlaylist, count: updatedPlaylist.videos.length },
            "Video added to playlist successfully"
        )
    );
});

/* -------------------------------------------------------
   DELETE /playlist/:playlistId/videos/:videoId
   FIX: Added ownership check.
------------------------------------------------------- */
const removeVideoFromPlaylist = asyncHandler(async (req, res) => {
    const { playlistId, videoId } = req.params;

    if (!playlistId || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Valid PlaylistId is required");
    }
    if (!videoId || !isValidObjectId(videoId)) {
        throw new ApiError(400, "Valid VideoId is required");
    }

    // Verify playlist exists and check ownership
    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to modify this playlist");
    }

    const updatedPlaylist = await Playlist.findByIdAndUpdate(
        playlistId,
        { $pull: { videos: videoId } },
        { new: true }
    );

    return res.status(200).json(
        new ApiResponse(
            200,
            { playlist: updatedPlaylist, count: updatedPlaylist.videos.length },
            "Video removed from playlist successfully"
        )
    );
});

/* -------------------------------------------------------
   DELETE /playlist/:playlistId
   FIX: Added ownership check — only the owner can delete.
------------------------------------------------------- */
const deletePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;

    if (!playlistId || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Valid PlaylistId is required");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    // Ownership check
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to delete this playlist");
    }

    await playlist.deleteOne();

    return res
        .status(200)
        .json(new ApiResponse(200, {}, "Playlist deleted successfully"));
});

/* -------------------------------------------------------
   PATCH /playlist/:playlistId
   FIX: Added ownership check.
------------------------------------------------------- */
const updatePlaylist = asyncHandler(async (req, res) => {
    const { playlistId } = req.params;
    const { name, description } = req.body;

    if (!playlistId || !isValidObjectId(playlistId)) {
        throw new ApiError(400, "Valid PlaylistId is required");
    }
    if (!name || name.trim() === "") {
        throw new ApiError(400, "Name is required");
    }
    if (!description || description.trim() === "") {
        throw new ApiError(400, "Description is required");
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
        throw new ApiError(404, "Playlist not found");
    }

    // Ownership check
    if (playlist.owner.toString() !== req.user._id.toString()) {
        throw new ApiError(403, "You are not authorized to update this playlist");
    }

    playlist.name = name.trim();
    playlist.description = description.trim();
    await playlist.save();

    return res
        .status(200)
        .json(new ApiResponse(200, { playlist }, "Playlist updated successfully"));
});

export {
    createPlaylist,
    getUserPlaylists,
    getPlaylistById,
    addVideoToPlaylist,
    removeVideoFromPlaylist,
    deletePlaylist,
    updatePlaylist,
};
