import { Router } from "express";
import { verifyJWT, verifyAdmin } from "../middlewares/auth.middleware.js";
import {
  getPlatformStats,
  getAllUsers,
  deleteUser,
  getAllVideos,
  deleteVideo,
  getAllComments,
  deleteComment,
  getAllTweets,
  deleteTweet,
} from "../controllers/admin.controller.js";

const router = Router();

// Apply auth and admin middleware to all routes in this file
router.use(verifyJWT);
router.use(verifyAdmin);

router.route("/stats").get(getPlatformStats);

router.route("/users").get(getAllUsers);
router.route("/users/:userId").delete(deleteUser);

router.route("/videos").get(getAllVideos);
router.route("/videos/:videoId").delete(deleteVideo);

router.route("/comments").get(getAllComments);
router.route("/comments/:commentId").delete(deleteComment);

router.route("/tweets").get(getAllTweets);
router.route("/tweets/:tweetId").delete(deleteTweet);

export default router;
