import {asyncHandler} from "../utils/asyncHandler.js"
import {ApiResponse} from "../utils/ApiResponse.js"
import {ApiError} from "../utils/ApiError.js"

const healthcheck = asyncHandler(async (req, res) => {
    try {
 
        return res.status(200).json(
            new ApiResponse(
                200,
                { status: "OK", timestamp: new Date().toISOString() },
                "Server is healthy 🚀"
            )
        );
    } catch (error) {
        throw new ApiError(500, "Healthcheck failed: " + error.message);
    }
});

export{
    healthcheck
}