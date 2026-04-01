import express from "express";
import multer from "multer";
import { Client } from "basic-ftp";

const router = express.Router();
const upload = multer({ dest: "uploads/" });

router.post("/upload", upload.single("file"), async (req, res) => {
  const client = new Client();

  try {
    // connect to your cPanel FTP
    await client.access({
      host: process.env.FTP_HOST,
      user: process.env.FTP_USER,
      password: process.env.FTP_PASS,
      secure: false, // change to true if using FTPS
    });

    const localPath = req.file.path;

    // 👇 THIS is where your file goes on FTP
    const remotePath = `/public_html/voicetracks/${req.body.cart}.webm`;

    await client.uploadFrom(localPath, remotePath);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FTP upload failed" });

  } finally {
    client.close();
  }
});

export default router;
