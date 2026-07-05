import { Router } from 'express';
import {
    getLikedVideos,
    toggleCommentLike,
    toggleVideoLike,
    toggleTweetLike,
    getVideoLikeStats,
} from "../controllers/like.controller.js"
import {verifyJWT, verifyJWTOptional} from "../middlewares/auth.middleware.js"

const router = Router();

router.route("/toggle/v/:videoId").post(verifyJWT, toggleVideoLike);
router.route("/toggle/c/:commentId").post(verifyJWT, toggleCommentLike);
router.route("/toggle/t/:tweetId").post(verifyJWT, toggleTweetLike);
router.route("/v/:videoId").get(verifyJWTOptional, getVideoLikeStats);
router.route("/videos").get(verifyJWT, getLikedVideos);

export default router