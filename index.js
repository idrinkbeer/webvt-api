import express from "express";
import fs from "fs";
import cors from "cors";
import uploadRoute from "./upload.js";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import NodeID3 from "node-id3";

import { Dropbox } from "dropbox";
import fetch from "node-fetch";

if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads", { recursive: true });
}

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  fetch
});

const app = express();
app.use(cors({
  origin: "*",
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Filename",
    "X-SecTone",
    "X-Intro"
  ]
}));

// 🔥 IMPORTANT: handle preflight
app.options("*", cors());

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

app.post("/upload", auth, async (req, res) => {
  try {
    const filename = req.headers["x-filename"];
    const secTone = parseFloat(req.headers["x-sectone"] || "0");
    const intro = parseFloat(req.headers["x-intro"] || "0");

    if (!filename) {
      return res.status(400).send("Missing filename");
    }

    const chunks = [];

    req.on("data", chunk => chunks.push(chunk));

    req.on("end", async () => {
      try {
        let buffer = Buffer.concat(chunks);

        // ✅ BUILD AIR STRING
        const zeroPad = (n, s) => String(Math.floor(n)).padStart(s, "0");

        const ctAUDs = 0;
        const ctINT  = intro * 1000;
        const ctSEG  = secTone * 1000;

        // ⚠️ For VTs we don’t know duration easily → use secTone or fallback
        const ctAUDe = ctSEG || 0;

        let air = "AIR#"
          + zeroPad(ctAUDs / 100, 6)
          + zeroPad(ctSEG / 100, 6)
          + zeroPad(ctAUDe / 100, 6)
          + zeroPad(((ctINT - ctAUDs) / 100) % 1000, 3);

        // pad rest (required for AIR systems)
        air += "000000000000000000000000"; // dates
        air += "F000000000000000000000000000000000000000000000000000000000000000000000000";

        // ✅ WRITE ONLY AIR TAG (NO CUSTOM TAGS)
        const taggedBuffer = NodeID3.write({
          title: "VO TRACK",
          artist: "JOCK",
          encodedBy: air
        }, buffer);

        // optional local save
        fs.writeFileSync(`uploads/${filename}`, taggedBuffer);

        // ✅ UPLOAD TO DROPBOX
        await dbx.filesUpload({
          path: `/VTX/${filename}`,
          contents: taggedBuffer,
          mode: { ".tag": "overwrite" }
        });

        console.log("✅ VT uploaded with AIR:", filename);

        res.json({ success: true });

      } catch (err) {
        console.error(err);
        res.status(500).send("Processing failed");
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).send("Upload failed");
  }
});

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


// =====================
// STREAM SONG FROM DROPBOX
// =====================
app.get("/audio/song/:filename", async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename).trim();

    console.log("Fetching song:", filename);

    const response = await dbx.filesDownload({
      path: `/MUS/${filename}`
    });

    const fileBinary = response.result.fileBinary;

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(fileBinary);

  } catch (err) {
    console.error("SONG ERROR:", err);
    res.status(404).send("Song not found");
  }
});

app.get("/played", async (req, res) => {
  try {
    const dropboxPath = "/AIR/PLAYED.txt";

    const response = await dbx.filesDownload({
      path: dropboxPath
    });

    const fileData = response.result.fileBinary;

    res.send(fileData.toString());
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load PLAYED.txt");
  }
});


app.get("/music", auth, async (req, res) => {
  try {
    let allFiles = [];

    // 1️⃣ first call
    let response = await dbx.filesListFolder({
      path: "/MUS"
    });

    allFiles.push(...(response.result.entries || []));

    // 2️⃣ keep fetching if more
    while (response.result.has_more) {
      response = await dbx.filesListFolderContinue({
        cursor: response.result.cursor
      });

      allFiles.push(...(response.result.entries || []));
    }

    // 3️⃣ filter files
    const files = allFiles
      .filter(f => f[".tag"] === "file" && f.name)
      .map(f => f.name)
      .sort((a, b) => a.localeCompare(b));

    res.json(files);

  } catch (err) {
    console.error("MUSIC ERROR:", err);
    res.status(500).json({ error: "Failed to load music" });
  }
});

// =====================
// 🎯 SAVE SEC TONE TO MP3
// =====================


import path from "path";

app.post("/sectone", auth, express.json(), async (req, res) => {
  try {
    const { filename, air } = req.body;

    const download = await dbx.filesDownload({
      path: `/MUS/${filename}`
    });

    const buffer = download.result.fileBinary;

    const taggedBuffer = NodeID3.update(
      { encodedBy: air },
      buffer
    );

    await dbx.filesUpload({
      path: `/MUS/${filename}`,
      contents: taggedBuffer,
      mode: { ".tag": "overwrite" }
    });

    console.log("✅ AIR tag written:", filename);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to write AIR tag" });
  }
});



app.get("/music/tag/:filename", auth, async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);

    const download = await dbx.filesDownload({
      path: `/MUS/${filename}`
    });

    const buffer = download.result.fileBinary;

    const tags = NodeID3.read(buffer);

    res.json({
      air: tags.encodedBy || null
    });

  } catch (err) {
    console.error(err);
    res.json({ air: null });
  }
});


app.get("/sweepers", (req, res) => {
  const dir = "/SWP"; // 🔥 IMPORTANT

  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith(".mp3"));

    res.json(files);
  } catch (err) {
    console.error("SWP error:", err);
    res.status(500).json([]);
  }
});
app.get("/audio/sweeper/:file", (req, res) => {
  res.sendFile(path.join("/SWP", req.params.file));
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
