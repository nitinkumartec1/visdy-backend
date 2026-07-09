import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

const app = express();
app.set("trust proxy", 1); // Trust Vercel's proxy for express-rate-limit

/* -----------------------------
   ✅ Core Middlewares
----------------------------- */
app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per `window`
    standardHeaders: true,
    legacyHeaders: false,
});
app.use("/api", limiter);

app.use(
    cors({
        origin: function (origin, callback) {
            // Allow requests with no origin (mobile apps, curl, etc.)
            if (!origin) return callback(null, true);
            // In development, allow any localhost port
            if (origin.match(/^http:\/\/localhost:\d+$/)) {
                return callback(null, true);
            }
            // Otherwise, check against the configured origin(s)
            const allowedOrigins = process.env.CORS_ORIGIN 
                ? process.env.CORS_ORIGIN.split(',').map(o => o.trim()) 
                : [];
            if (process.env.CORS_ORIGIN === '*' || allowedOrigins.includes(origin)) {
                return callback(null, true);
            }
            console.log("CORS blocked request from origin:", origin);
            callback(new Error("Not allowed by CORS"));
        },
        credentials: true,
    })
);

// FIX: Vercel serverless functions pre-parse req.body and consume the
// raw stream. Express's json() then reads an empty stream and sets
// req.body to undefined. This middleware skips body parsing when
// Vercel has already parsed the body.
app.use((req, res, next) => {
    if (req.body !== undefined && req.body !== null && Object.keys(req.body).length > 0) {
        return next(); // Body already parsed by Vercel — skip Express parsers
    }
    next();
});
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true, limit: "5mb" }));
app.use(express.static("public"));
app.use(cookieParser());

/* -----------------------------
   ✅ Routes Import
----------------------------- */
import userRouter from "./routes/user.routes.js";
import videoRouter from "./routes/video.routes.js";
import tweetRouter from "./routes/tweet.routes.js";
import subscriptionRouter from "./routes/subscription.routes.js";
import playlistRouter from "./routes/playlist.routes.js";
import likeRouter from "./routes/like.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import commentRouter from "./routes/comment.routes.js";
import healthcheckRouter from "./routes/healthcheck.routes.js";
import adminRouter from "./routes/admin.routes.js";

/* -----------------------------
   ✅ API Routes
----------------------------- */
app.use("/api/v1/users", userRouter);
app.use("/api/v1/videos", videoRouter);
app.use("/api/v1/tweets", tweetRouter);
app.use("/api/v1/subscriptions", subscriptionRouter);
app.use("/api/v1/playlist", playlistRouter);
app.use("/api/v1/likes", likeRouter);
app.use("/api/v1/dashboard", dashboardRouter);
app.use("/api/v1/comments", commentRouter);
app.use("/api/v1/healthcheck", healthcheckRouter);
app.use("/api/v1/admin", adminRouter);

/* -----------------------------
   ✅ Global Error Middleware
   (MUST BE LAST)
----------------------------- */
import { errorHandler } from "./middlewares/error.middleware.js";

app.use(errorHandler);

export { app };