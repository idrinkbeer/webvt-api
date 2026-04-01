import ftp from "basic-ftp";

const ftpConfig = {
  host: "YOUR_FTP_HOST",
  user: "YOUR_USERNAME",
  password: "YOUR_PASSWORD",
  secure: false
};

import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());

const PORT = process.env.PORT;

// 🔥 USE ABSOLUTE PATH (this fixes your issue)
const uploadDir = process.env.UPLOAD_DIR || "/uploads";

// ensure uploads folder exists
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// storage config
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".wav");
  },
});

const upload = multer({ storage });

// upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ success: true, file: req.file.filename });
});

// serve uploads folder
app.use("/uploads", express.static(uploadDir));

// test route
app.get("/", (req, res) => {
  res.send("API is working");
});

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
