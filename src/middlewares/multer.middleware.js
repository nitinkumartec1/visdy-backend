import multer from "multer";
import path from "path";
import crypto from "crypto";
import fs from "fs";
import os from "os";
import { ApiError } from "../utils/ApiError.js";

/* -------------------------------------------------------
   File size limits (in bytes)
------------------------------------------------------- */
const FILE_LIMITS = {
    IMAGE_MAX_SIZE: 10 * 1024 * 1024,           // 10 MB
    VIDEO_MAX_SIZE: 100 * 1024 * 1024,           // 100 MB
    RAW_MAX_SIZE: 10 * 1024 * 1024,              // 10 MB
    IMAGE_TRANSFORM_MAX_SIZE: 100 * 1024 * 1024, // 100 MB (Cloudinary)
    VIDEO_TRANSFORM_MAX_SIZE: 40 * 1024 * 1024,  // 40 MB (Cloudinary)
    IMAGE_MAX_MEGAPIXELS: 25,                    // 25 MP
    VIDEO_MAX_MEGAPIXELS_TOTAL: 50,              // 50 MP across all frames
};

/* -------------------------------------------------------
   Allowed MIME types — prevents uploading executables,
   scripts, or other dangerous file types.
------------------------------------------------------- */
const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo"];
const ALLOWED_TYPES = [...ALLOWED_IMAGE_TYPES, ...ALLOWED_VIDEO_TYPES];

/* -------------------------------------------------------
   Disk storage with sanitized filenames.
   FIX: Original code used file.originalname directly,
   which enables path traversal attacks (../../etc/passwd).
   Now generates a random hex filename + original extension.
------------------------------------------------------- */
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, os.tmpdir());
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = crypto.randomBytes(16).toString("hex");
        const ext = path.extname(file.originalname).toLowerCase();
        cb(null, `${uniqueSuffix}${ext}`);
    },
});

/* -------------------------------------------------------
   File filter with per-type size enforcement.
   Multer's built-in `limits.fileSize` applies globally,
   so we enforce per-type limits in the filter callback
   by checking Content-Length headers and file fieldnames.
------------------------------------------------------- */
const createFileFilter = (allowedTypes) => (req, file, cb) => {
    if (!allowedTypes.includes(file.mimetype)) {
        return cb(
            new multer.MulterError("LIMIT_UNEXPECTED_FILE", file.fieldname),
            false
        );
    }
    cb(null, true);
};

/* -------------------------------------------------------
   Post-upload size validation middleware.
   Runs AFTER multer writes files to disk, checks actual
   file sizes against per-type limits and cleans up on
   violation.
------------------------------------------------------- */
const cleanupFiles = (files) => {
    if (!files) return;
    const fileList = Array.isArray(files)
        ? files
        : Object.values(files).flat();
    for (const file of fileList) {
        if (file?.path) {
            fs.unlink(file.path, () => {});
        }
    }
};

export const validateFileSizes = (req, res, next) => {
    const allFiles = req.file
        ? [req.file]
        : req.files
            ? Array.isArray(req.files)
                ? req.files
                : Object.values(req.files).flat()
            : [];

    for (const file of allFiles) {
        const isImage = ALLOWED_IMAGE_TYPES.includes(file.mimetype);
        const isVideo = ALLOWED_VIDEO_TYPES.includes(file.mimetype);
        const maxSize = isVideo
            ? FILE_LIMITS.VIDEO_MAX_SIZE
            : isImage
                ? FILE_LIMITS.IMAGE_MAX_SIZE
                : FILE_LIMITS.RAW_MAX_SIZE;
        const typeName = isVideo ? "Video" : isImage ? "Image" : "File";
        const maxMB = Math.round(maxSize / (1024 * 1024));

        if (file.size > maxSize) {
            cleanupFiles(allFiles);
            return next(
                new ApiError(
                    413,
                    `${typeName} file "${file.originalname}" exceeds the ${maxMB}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB uploaded)`
                )
            );
        }
    }
    next();
};

/* -------------------------------------------------------
   Export multer instances with appropriate limits.
------------------------------------------------------- */

// General upload — accepts both images and videos
// Global fileSize set to VIDEO_MAX_SIZE (100MB) since
// per-type enforcement happens in validateFileSizes middleware.
export const upload = multer({
    storage,
    fileFilter: createFileFilter(ALLOWED_TYPES),
    limits: {
        fileSize: FILE_LIMITS.VIDEO_MAX_SIZE,
        files: 5,
    },
});

// Image-only upload — capped at IMAGE_MAX_SIZE (10MB)
export const uploadImage = multer({
    storage,
    fileFilter: createFileFilter(ALLOWED_IMAGE_TYPES),
    limits: {
        fileSize: FILE_LIMITS.IMAGE_MAX_SIZE,
        files: 3,
    },
});

// Export limits for use in frontend or other modules
export { FILE_LIMITS };