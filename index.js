import express from "express";
import fs from "fs";
import cors from "cors";
import uploadRoute from "./upload.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

import { Dropbox } from "dropbox";
import fetch from "node-fetch";

const dbx = new Dropbox({
  accessToken: process.env.DROPBOX_TOKEN,
  fetch
});

const app = express();
app.use(cors({
  origin: "*",
  allowedHeaders: ["Content-Type", "Authorization"]
}));

const PORT = process.env.PORT;

const JWT_SECRET = process.env.JWT_SECRET || "supersecretkey";

const users = [
  {
    username: "admin",
    password: "$2a$10$VcDJxi.dYue09sBQwdFth.aMLDjy.svYVQyIJWmRueWVHAoVOCc2G" // bcrypt hash
  }
];

app.post("/login", express.json(), async (req, res) => {
  const { username, password } = req.body;

  const user = users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) return res.status(401).json({ error: "Invalid credentials" });

  const token = jwt.sign(
    { username },
    JWT_SECRET,
    { expiresIn: "12h" }
  );

  res.json({ token });
});

function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) return res.sendStatus(401);

  const token = header.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch {
    res.sendStatus(403);
  }
}

// ✅ Upload route (handles FTP)
app.use("/upload", auth, uploadRoute);

const ftpConfig = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASS,
  secure: false
};

const uploadDir = process.env.UPLOAD_DIR || "/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// optional static folder
app.use("/uploads", express.static(uploadDir));

// =====================
// LOG LIST
// =====================
app.get("/logs", auth, async (req, res) => {
  try {
    const response = await dbx.filesListFolder({
      path: "/LOGS"
    });

    // 🔥 FIX: support both formats
    const entries = response.result?.entries || response.entries;

    const files = entries
      .filter(f => f.name.toLowerCase().endsWith(".asc"))
      .map(f => f.name);

    res.json(files);

  } catch (err) {
    console.error("DROPBOX ERROR:", err);
    res.status(500).json({ error: err.message });
  }
});

// =====================
// FETCH LOG CONTENT
// =====================
app.get("/logs/:filename", auth, async (req, res) => {
  try {
    const file = await dbx.filesDownload({
      path: `/LOGS/${req.params.filename}`
    });

    const content = file.result.fileBinary.toString("utf-8");

    res.send(content);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching file");
  }
});

app.get("/audio/song/:filename", async (req, res) => {
  try {
    const file = await dbx.filesDownload({
      path: `/MUS/${req.params.filename}`
    });

    const data = file.result?.fileBinary || file.fileBinary;

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(data));

  } catch (err) {
    console.error("SONG ERROR:", err);
    res.status(500).send("Error fetching song");
  }
});

// =====================
// TEST
// =====================
app.get("/", (req, res) => {
  res.send("API is working");
});

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
