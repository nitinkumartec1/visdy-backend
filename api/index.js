import dotenv from "dotenv";
import connectDB from "../src/db/index.js";
import { app } from "../src/app.js";

dotenv.config();

// Vercel serverless function entry point
export default async function (req, res) {
  try {
    // Ensure database connection is established before handling request
    await connectDB();
    
    // Pass the request to the Express app
    return app(req, res);
  } catch (error) {
    console.error("Error in serverless handler:", error);
    res.status(500).json({ success: false, message: "Internal server error" });
  }
}
