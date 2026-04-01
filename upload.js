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

    // 🔍 Try possible FTP base paths automatically
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

    // ❌ If no valid path found
    if (!workingPath) {
      throw new Error("No valid FTP path found");
    }

    // ✅ Final upload path
    const remotePath = `${workingPath}/${req.body.cart}.webm`;

    console.log("📤 Uploading to:", remotePath);

    await client.uploadFrom(localPath, remotePath);

    // cleanup temp file
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
