import { Router } from "express";
import {
    getAllVideos,
    publishAVideo,
    publishEditedVideo,
    getVideoById,
    updateVideo,
    deleteVideo,
    togglePublishStatus,
} from "../controllers/video.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";
import { upload, validateFileSizes } from "../middlewares/multer.middleware.js";

const router = Router();

// ✅ Public routes (no JWT required)
router.route("/").get(getAllVideos);

// ✅ Protected routes (JWT required)
router.route("/").post(
    verifyJWT,
    upload.fields([
        { name: "videoFile", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    validateFileSizes,
    publishAVideo
);

// ✅ Upload edited/processed video (protected)
// FIX: Moved ABOVE /:videoId so Express doesn't capture "edited" as a videoId
router.route("/edited").post(
    verifyJWT,
    upload.fields([
        { name: "videoFile", maxCount: 1 },
        { name: "thumbnail", maxCount: 1 },
    ]),
    validateFileSizes,
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
    .patch(verifyJWT, upload.single("thumbnail"), validateFileSizes, updateVideo);

export default router;
