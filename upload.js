import express from "express";
import multer from "multer";
import { Client } from "basic-ftp";
import fs from "fs";
import ffmpeg from "fluent-ffmpeg";

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

    const webmPath = req.file.path;
    const mp3Path = webmPath + ".mp3";

    // 🔍 Find correct FTP path (runs once, then logs it)
    const testPaths = [
      "/AIRLOGS",
      "/starbase479.com/AIRLOGS",
      "/public_html/AIRLOGS",
      "/public_html/starbase479.com/AIRLOGS"
    ];

    let workingPath = null;

    for (const p of testPaths) {
      try {
        await client.ensureDir(p);
        console.log("✅ WORKING FTP PATH:", p);
        workingPath = p;
        break;
      } catch (e) {
        console.log("❌ NOT VALID:", p);
      }
    }

    if (!workingPath) {
      throw new Error("No valid FTP path found");
    }

    // 🎧 Convert to MP3
    await new Promise((resolve, reject) => {
      ffmpeg(webmPath)
        .audioBitrate(128)
        .toFormat("mp3")
        .on("end", resolve)
        .on("error", reject)
        .save(mp3Path);
    });

    // ✅ Upload MP3
    const remotePath = `${workingPath}/${req.body.cart}.mp3`;

    console.log("📤 Uploading MP3 to:", remotePath);

    await client.uploadFrom(mp3Path, remotePath);

    // 🧹 cleanup temp files
    fs.unlinkSync(webmPath);
    fs.unlinkSync(mp3Path);

    res.json({ success: true, path: remotePath });

  } catch (err) {
    console.error("FTP upload failed:", err);
    res.status(500).json({ error: "FTP upload failed" });

  } finally {
    client.close();
  }
});

export default router;
