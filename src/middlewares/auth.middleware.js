import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import jwt from "jsonwebtoken";
import { User } from "../models/user.model.js";

/**
 * Mandatory JWT verification middleware.
 * Extracts token from cookies (priority) or Authorization header.
 * Attaches authenticated user to req.user.
 */
export const verifyJWT = asyncHandler(async (req, res, next) => {
    try {
        /* -------------------------------------------------------
           STEP 1: Extract Token (cookie first, then header)
           FIX: Wrapped ternary in parentheses to fix operator
           precedence bug where cookieToken || ternary evaluated
           incorrectly, ignoring the cookie value entirely.
        ------------------------------------------------------- */
        const cookieToken = req.cookies?.accessToken;
        const authHeader = req.headers.authorization;

        const token =
            cookieToken ||
            (authHeader?.startsWith("Bearer ")
                ? authHeader.replace("Bearer ", "")
                : null);

        if (!token) {
            throw new ApiError(401, "Unauthorized request - No token");
        }

        /* -------------------------------------------------------
           STEP 2: Verify JWT signature and expiration
        ------------------------------------------------------- */
        const decodedToken = jwt.verify(
            token,
            process.env.ACCESS_TOKEN_SECRET
        );

        /* -------------------------------------------------------
           STEP 3: Fetch user from DB (exclude sensitive fields)
        ------------------------------------------------------- */
        const user = await User.findById(decodedToken._id)
            .select("-password -refreshToken");

        if (!user) {
            throw new ApiError(401, "Invalid access token (user missing)");
        }

        /* -------------------------------------------------------
           STEP 4: Attach user to request object
        ------------------------------------------------------- */
        req.user = user;
        next();

    } catch (error) {
        // Pass error to global error handler instead of masking it
        next(
            error instanceof ApiError
                ? error
                : new ApiError(401, "Invalid or expired access token")
        );
    }
});

/**
 * Optional JWT verification middleware.
 * If a valid token is present, attaches req.user.
 * If no token or invalid token, continues without authentication.
 */
export const verifyJWTOptional = asyncHandler(async (req, _, next) => {
    try {
        const token =
            req.cookies?.accessToken ||
            (req.headers.authorization?.startsWith("Bearer ")
                ? req.headers.authorization.replace("Bearer ", "")
                : null);

        if (!token) {
            return next();
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);
        const user = await User.findById(decodedToken?._id).select("-password -refreshToken");

        if (user) {
            req.user = user;
        }
        next();
    } catch (error) {
        // If token is invalid (expired, etc), just proceed as unauthenticated
        next();
    }
});

/**
 * Admin verification middleware.
 * MUST be run AFTER verifyJWT.
 * Checks if the authenticated user has the 'admin' role.
 */
export const verifyAdmin = asyncHandler(async (req, res, next) => {
    // Ensure req.user exists (verifyJWT should have run)
    if (!req.user) {
        throw new ApiError(401, "Unauthorized request - user not authenticated");
    }

    if (req.user.role !== "admin") {
        throw new ApiError(403, "Access denied. Admin privileges required.");
    }

    next();
});

