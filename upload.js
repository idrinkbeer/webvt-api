import express from "express";
import multer from "multer";
import { Dropbox } from "dropbox";
import fetch from "node-fetch";
import NodeID3 from "node-id3";

const router = express.Router();

// ✅ use memory instead of temp files
const upload = multer({ storage: multer.memoryStorage() });

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  fetch
});

// 🎯 Extract metadata sent from frontend
const { cart, secTone } = req.body;

const tags = {
  title: `VT ${cart}`,
  artist: "VOICETRACK",
  album: "Web VT",

  userDefinedText: [
    {
      description: "Sec Tone",
      value: secTone.toString()
    },
    {
      description: "Category",
      value: "AUDIO"
    },
    {
      description: "No fade",
      value: "0"
    }
  ]
};

// 🧠 Write tags WITHOUT corrupting MP3
const success = NodeID3.write(tags, filePath);

if (!success) {
  console.error("❌ Failed to write ID3 tags");
} else {
  console.log("✅ ID3 tags written (Sec Tone:", secTone, ")");
}

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
