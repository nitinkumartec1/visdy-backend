import { fileURLToPath } from 'url';
import path from "path";
import dotenv from "dotenv";
import connectDB from "./db/index.js";
import { app } from "./app.js";
import dns from "node:dns";

// 🌐 Force Node.js to use Google DNS to bypass local ISP blocks on SRV records
dns.setServers(['8.8.8.8', '8.8.4.4']);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
    path: path.resolve(__dirname, "../.env")
});

connectDB()
.then(() => {
    if (process.env.NODE_ENV !== "production") {
        const port = process.env.PORT || 8000;
        app.listen(port, () => {
            console.log(`Server is running at port : ${port}`);
        });
    }
})
.catch((err)=>{
    console.error("FAILED to start the server:", err.message);
    process.exit(1);
})