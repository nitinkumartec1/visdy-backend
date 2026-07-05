import { Router } from "express";
import {
    getSubscribedChannels,
    getUserChannelSubscribers,
    toggleSubscription,
} from "../controllers/subscription.controller.js";

import { verifyJWT } from "../middlewares/auth.middleware.js";

const router = Router();
router.use(verifyJWT); // All routes need authentication

// ✅ Subscribe/unsubscribe to a channel
router.route("/c/:channelId").post(toggleSubscription);

// ✅ Get subscribers of a channel
router.route("/c/:channelId/subscribers").get(getUserChannelSubscribers);

// ✅ Get channels a user is subscribed to
// FIX: Removed duplicate verifyJWT (already applied globally via router.use)
router.get("/u/:subscriberId/subscriptions", getSubscribedChannels);

export default router;
