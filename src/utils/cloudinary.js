import { v2 as cloudinary } from "cloudinary";
import fs from "fs";
import { ApiError } from "./ApiError.js";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

/**
 * Upload a local file to Cloudinary.
 * Automatically deletes the local temp file after upload (or on failure).
 * @param {string} localFilePath - Absolute path to the file on disk
 * @returns {object|null} Cloudinary response object, or null on failure
 */
const uploadOnCloudinary = async (localFilePath) => {
    try {
        if (!localFilePath) return null;

        const response = await cloudinary.uploader.upload(localFilePath, {
            resource_type: "auto",
        });

        // Clean up local temp file after successful upload
        fs.unlinkSync(localFilePath);
        return response;
    } catch (error) {
        // Clean up local temp file even if upload fails
        if (fs.existsSync(localFilePath)) {
            fs.unlinkSync(localFilePath);
        }

        // Handle specific Cloudinary limit errors
        const errMsg = error.message?.toLowerCase() || "";
        if (errMsg.includes("file size too large")) {
            throw new ApiError(413, `Cloudinary limit exceeded: File size too large.`);
        }
        if (errMsg.includes("megapixel")) {
            throw new ApiError(413, `Cloudinary limit exceeded: Megapixel limit reached (Max 25MP for images, 50MP total across all frames for videos).`);
        }
        if (errMsg.includes("transformation")) {
            throw new ApiError(413, `Cloudinary limit exceeded: Transformation size limit reached.`);
        }

        console.error("Cloudinary upload failed:", error.message);
        return null;
    }
};

/**
 * Delete an asset from Cloudinary.
 * @param {string} publicIdOrUrl - Cloudinary public_id or full URL
 * @param {string} resourceType - "image" | "video" | "raw" (default: "image")
 * @returns {object|null} Cloudinary deletion response
 */
const deleteFromCloudinary = async (publicIdOrUrl, resourceType = "image") => {
    try {
        if (!publicIdOrUrl) return null;

        let publicId = publicIdOrUrl;
        if (publicIdOrUrl.startsWith("http")) {
            // Extract public_id from URL as fallback
            const urlParts = publicIdOrUrl.split("/");
            const fileWithExt = urlParts[urlParts.length - 1]; // "filename.ext"
            publicId = fileWithExt.split(".")[0]; // "filename"
        }

        const result = await cloudinary.uploader.destroy(publicId, {
            resource_type: resourceType,
        });

        if (result.result !== "ok" && result.result !== "not found") {
            throw new Error(`Cloudinary deletion failed with result: ${result.result}`);
        }

        return result;
    } catch (error) {
        console.error("Cloudinary deletion failed:", error.message);
        throw new Error(error.message); // Throw to trigger MongoDB Transaction abort
    }
};

/**
 * Generate a secure upload signature for direct-to-cloud uploads.
 * This allows the frontend to upload directly to Cloudinary without exposing the API secret.
 * @returns {object} Signature payload containing timestamp, signature, cloudName, and apiKey
 */
const generateUploadSignature = () => {
    const timestamp = Math.round((new Date).getTime() / 1000);
    const signature = cloudinary.utils.api_sign_request(
        { timestamp: timestamp },
        process.env.CLOUDINARY_API_SECRET
    );

    return {
        timestamp,
        signature,
        cloudName: process.env.CLOUDINARY_CLOUD_NAME,
        apiKey: process.env.CLOUDINARY_API_KEY,
    };
};

export { uploadOnCloudinary, deleteFromCloudinary, generateUploadSignature };