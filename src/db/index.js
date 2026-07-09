import mongoose from "mongoose";
import {DB_NAME} from "../constants.js";


const connectDB = async () => {
    try {
        if (mongoose.connection.readyState >= 1) {
            console.log("MongoDB is already connected.");
            return;
        }
        const connectionInstance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
        console.log(`\n MongoDB connected !! DB HOST: ${connectionInstance.connection.host}`);
    } catch (error) {
        console.error("CRITICAL: MongoDB connection error", error.message);
        console.error("Full Error Details:", error);
        throw new Error("MongoDB connection failed: " + error.message);
    }
}

export default connectDB