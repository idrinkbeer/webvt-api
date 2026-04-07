import express from "express";
import multer from "multer";
import { Client } from "basic-ftp";
import fs from "fs";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/", upload.single("file"), async (req, res) => {
  const client = new Client();

  try {
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false,
    });

    const localPath = req.file.path;

    // ✅ FINAL path (we already confirmed this works)
    const remotePath = `/VTX/${req.body.cart}.mp3`;

    console.log("📤 Uploading MP3 to:", remotePath);

    await client.uploadFrom(localPath, remotePath);

    // 🧹 cleanup temp file
    fs.unlinkSync(localPath);

    res.json({ success: true, path: remotePath });

  } catch (err) {
    console.error("FTP upload failed:", err);
    res.status(500).json({ error: "FTP upload failed" });

  } finally {
    client.close();
  }
});

export default router;
