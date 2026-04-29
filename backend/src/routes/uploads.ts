import { Router, Request, Response } from "express";
import multer from "multer";
import { v2 as cloudinary } from "cloudinary";
import { requireAuth } from "../middleware/auth";

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key:    process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

const router = Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        const allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/gif"];
        if (allowed.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only image files are allowed (jpeg, png, webp, gif)"));
        }
    },
});

router.post("/", requireAuth, upload.single("file"), (req: Request, res: Response) => {
    if (!req.file) {
        return res.status(400).json({ error: "No file provided" });
    }

    const stream = cloudinary.uploader.upload_stream(
        { folder: "uevents", resource_type: "image" },
        (err, result) => {
            if (err || !result) {
                return res.status(500).json({ error: "Upload failed" });
            }
            return res.status(201).json({ url: result.secure_url });
        }
    );

    stream.end(req.file.buffer);
});

export default router;
