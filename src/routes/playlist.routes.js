import { Router } from 'express';
import {
    addVideoToPlaylist,
    createPlaylist,
    deletePlaylist,
    getPlaylistById,
    getUserPlaylists,
    removeVideoFromPlaylist,
    updatePlaylist,
} from "../controllers/playlist.controller.js";
import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT); // All routes are protected

// Create & fetch playlists
router.route("/")
    .post(createPlaylist);

// User playlists
router.route("/user/:userId")
    .get(getUserPlaylists);

// Single playlist operations
router.route("/:playlistId")
    .get(getPlaylistById)
    .patch(updatePlaylist)
    .delete(deletePlaylist);

// Manage videos in a playlist
router.route("/:playlistId/videos/:videoId")
    .post(addVideoToPlaylist)      // Add video
    .delete(removeVideoFromPlaylist); // Remove video

export default router;
