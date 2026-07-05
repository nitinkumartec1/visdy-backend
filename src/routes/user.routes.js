import { Router } from "express";
import {
  registerUser,
  loginUser,
  logoutUser,
  refreshAccessToken,
  changeCurrentPassword,
  getCurrentUser,
  updateAccountDetails,
  updateUserAvatar,
  updateUserCoverImage,
  getUserChannelProfile,
  getWatchHistory,
  toggleWatchLater,
  getWatchLaterVideos,
  firebaseLogin,
  deleteAccount,
} from "../controllers/user.controller.js";
import { uploadImage, validateFileSizes } from "../middlewares/multer.middleware.js";
import { verifyJWT, verifyJWTOptional } from "../middlewares/auth.middleware.js";

const router = Router();

router.route("/register").post(
  uploadImage.fields([
    { name: "avatar", maxCount: 1 },
    { name: "coverImage", maxCount: 1 },
  ]),
  validateFileSizes,
  registerUser
);

router.route("/login").post(loginUser);
router.route("/firebase-login").post(firebaseLogin);

// Secured routes
router.route("/logout").post(verifyJWT, logoutUser);
router.route("/refresh-token").post(refreshAccessToken);
router.route("/change-password").post(verifyJWT, changeCurrentPassword);
router.route("/current-user").get(verifyJWT, getCurrentUser);
router.route("/update-account").patch(verifyJWT, updateAccountDetails);

router
  .route("/avatar")
  .patch(verifyJWT, uploadImage.single("avatar"), validateFileSizes, updateUserAvatar);
router
  .route("/cover-image")
  .patch(verifyJWT, uploadImage.single("coverImage"), validateFileSizes, updateUserCoverImage);

router.route("/c/:username").get(verifyJWTOptional, getUserChannelProfile);
router.route("/history").get(verifyJWT, getWatchHistory);
router.route("/watch-later/:videoId").post(verifyJWT, toggleWatchLater);
router.route("/watch-later").get(verifyJWT, getWatchLaterVideos);

router.route("/account").delete(verifyJWT, deleteAccount);

export default router;