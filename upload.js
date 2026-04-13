import express from "express";
import multer from "multer";
import { Dropbox } from "dropbox";
import fetch from "node-fetch";
import NodeID3 from "node-id3";

const router = express.Router();

// ✅ memory upload
const upload = multer({ storage: multer.memoryStorage() });

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  fetch
});

router.post("/", upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const cart = req.body.cart;
    const secTone = req.body.secTone || 0;

    if (!file || !cart) {
      return res.status(400).json({ error: "Missing file or cart" });
    }

    // 🎯 ID3 TAGS
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

    // 🧠 Write tags directly to buffer
    const taggedBuffer = NodeID3.write(tags, file.buffer);

    console.log("✅ ID3 tags written (Sec Tone:", secTone, ")");

    const dropboxPath = `/VTX/${cart}.mp3`;

    console.log("📤 Uploading to Dropbox:", dropboxPath);

    await dbx.filesUpload({
      path: dropboxPath,
      contents: taggedBuffer,
      mode: "overwrite"
    });

    res.json({ success: true, path: dropboxPath });

  } catch (err) {
    console.error("❌ Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
