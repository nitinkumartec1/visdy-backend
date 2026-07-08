import { Router } from "express";
import {
    getAllVideos,
    publishAVideo,
    publishEditedVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
    generateSignature,
} from "../controllers/video.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();

// ✅ Signature route (protected)
// MUST BE ABOVE /:videoId
router.route("/generate-signature").get(verifyJWT, generateSignature);

// ✅ Public routes (no JWT required)
router.route("/").get(getAllVideos);

// ✅ Protected routes (JWT required)
router.route("/").post(
    verifyJWT,
    publishAVideo
);

// ✅ Upload edited/processed video (protected)
// FIX: Moved ABOVE /:videoId so Express doesn't capture "edited" as a videoId
router.route("/edited").post(
    verifyJWT,
    publishEditedVideo
);

// ✅ Toggle publish status (protected)
// FIX: Moved ABOVE /:videoId so "toggle" isn't captured as a videoId
router.route("/toggle/publish/:videoId").patch(verifyJWT, togglePublishStatus);

// ✅ Get video by ID (public), Delete & Update (protected)
// MUST be LAST — /:videoId is a catch-all pattern
router
    .route("/:videoId")
    .get(getVideoById)
    .delete(verifyJWT, deleteVideo)
    .patch(verifyJWT, updateVideo);

export default router;
