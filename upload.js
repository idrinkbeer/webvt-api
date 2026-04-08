import express from "express";
import multer from "multer";
import { Dropbox } from "dropbox";
import fetch from "node-fetch";

const router = express.Router();

// ✅ use memory instead of temp files
const upload = multer({ storage: multer.memoryStorage() });

const dbx = new Dropbox({
  accessToken: process.env.DROPBOX_TOKEN,
  fetch
});

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const cart = req.body.cart;

    const dropboxPath = `/VTX/${cart}.mp3`;

    console.log("📤 Uploading to Dropbox:", dropboxPath);

    await dbx.filesUpload({
      path: dropboxPath,
      contents: file.buffer,
      mode: "overwrite"
    });

    res.json({ success: true, path: dropboxPath });

  } catch (err) {
    console.error("Dropbox upload failed:", err);
    res.status(500).json({ error: "Dropbox upload failed" });
  }
});

export default router;
