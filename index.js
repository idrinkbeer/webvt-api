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
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Filename",
    "X-SecTone",
    "X-Intro"
  ]
}));

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


const LIBRARY_FOLDERS = {
  music: "/MUS",
  sweepers: "/SWP"
};

async function listFolder(folderPath) {
  let allFiles = [];

  let response = await dbx.filesListFolder({
    path: folderPath
  });

  allFiles.push(...(response.result.entries || []));

  while (response.result.has_more) {
    response = await dbx.filesListFolderContinue({
      cursor: response.result.cursor
    });

    allFiles.push(...(response.result.entries || []));
  }

  return allFiles
    .filter(f => f[".tag"] === "file" && f.name)
    .map(f => f.name)
    .sort((a, b) => a.localeCompare(b));
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
        const taggedBuffer = NodeID3.update({
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

    const content = Buffer
  .from(file.result.fileBinary)
  .toString("utf-8");

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
    res.send(Buffer.from(fileBinary));

  } catch (err) {
    console.error("SONG ERROR:", err);
    res.status(404).send("Song not found");
  }
});

app.get("/audio/sweeper/:filename", async (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename).trim();

    const response = await dbx.filesDownload({
      path: `/SWP/${filename}`
    });

    res.setHeader("Content-Type", "audio/mpeg");
    res.send(Buffer.from(response.result.fileBinary));

  } catch (err) {
    console.error("SWEEPER ERROR:", err);
    res.status(404).send("Sweeper not found");
  }
});

app.get("/played", async (req, res) => {
  try {
    const dropboxPath = "/AIR/PLAYED.txt";

    const response = await dbx.filesDownload({
      path: dropboxPath
    });

const fileData = Buffer.from(response.result.fileBinary);

res.setHeader("Content-Type", "text/plain");
res.send(fileData.toString("utf-8"));
  } catch (err) {
    console.error(err);
    res.status(500).send("Failed to load PLAYED.txt");
  }
});


app.get("/library", auth, async (req, res) => {
  try {
    const type = req.query.type;

    // 👉 helper to process a folder
    const processFolder = async (folder, typeName) => {
      const files = await listFolder(folder);

      const results = await Promise.all(
        files.map(async (name) => {
          try {
            const download = await dbx.filesDownload({
              path: `${folder}/${name}`
            });

let buffer;

try {
  buffer = Buffer.from(download.result.fileBinary);
} catch (e) {
  console.log("⚠️ Buffer failed:", name);
  return {
    name,
    artist: "",
    title: "",
    type: typeName
  };
}

let tags = {};

try {
  tags = NodeID3.read(buffer);
} catch (e) {
  console.log("⚠️ Bad tag:", name);
}

            return {
              name,
              artist: tags.artist || "",
              title: tags.title || "",
              type: typeName
            };

          } catch (err) {
            console.error("TAG ERROR:", name);
            return {
              name,
              artist: "",
              title: "",
              type: typeName
            };
          }
        })
      );

      return results;
    };

    // 👉 ONE TYPE
    if (type) {
      const folder = LIBRARY_FOLDERS[type];

      if (!folder) {
        return res.status(400).json({ error: "Invalid type" });
      }

      const items = await processFolder(folder, type);

      return res.json({ items });
    }

    // 👉 BOTH TYPES
    const [music, sweepers] = await Promise.all([
      processFolder(LIBRARY_FOLDERS.music, "music"),
      processFolder(LIBRARY_FOLDERS.sweepers, "sweepers")
    ]);

    res.json({
      music,
      sweepers
    });

  } catch (err) {
    console.error("LIBRARY ERROR:", err);
    res.status(500).json({ error: "Failed to load library" });
  }
});

// =====================
// 🎯 SAVE SEC TONE TO MP3
// =====================


import path from "path";

app.post("/sectone", auth, express.json(), async (req, res) => {
  try {
    const { filename, air, type, artist, title } = req.body;

    const folder = LIBRARY_FOLDERS[type || "music"];

    const download = await dbx.filesDownload({
      path: `${folder}/${filename}`
    });

    const buffer = Buffer.from(download.result.fileBinary);

const taggedBuffer = NodeID3.update(
  {
    title: title || "",
    artist: artist || "",
    encodedBy: air // keep AIR here
  },
  buffer
);

    await dbx.filesUpload({
      path: `${folder}/${filename}`, // ✅ FIXED
      contents: taggedBuffer,
      mode: { ".tag": "overwrite" }
    });

    console.log(`✅ AIR tag written (${type || "music"}):`, filename);

    res.json({ success: true });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to write AIR tag" });
  }
});



app.get("/tag/:type/:filename", auth, async (req, res) => {
  try {
    const { type, filename } = req.params;

    const folder = LIBRARY_FOLDERS[type] || "/MUS";

    const download = await dbx.filesDownload({
      path: `${folder}/${decodeURIComponent(filename)}`
    });

    const buffer = Buffer.from(download.result.fileBinary);
    let tags = {};

try {
  tags = NodeID3.read(buffer);
} catch (e) {
  console.log("⚠️ Bad tag:", filename);
}

res.json({
  air: tags.encodedBy || null,
  artist: tags.artist || "",
  title: tags.title || ""
});

  } catch (err) {
    console.error(err);
    res.json({ air: null });
  }
});


async function getFileWithTags(folder, file) {
  try {
    const download = await dbx.filesDownload({
      path: `${folder}/${file.name}`
    });

    const buffer = Buffer.from(download.result.fileBinary);
    let tags = {};

try {
  tags = NodeID3.read(buffer);
} catch (e) {
  console.log("⚠️ Bad tag:", file.name);
}

    return {
      name: file.name,
      artist: tags.artist || "",
      title: tags.title || ""
    };

  } catch (err) {
    console.error("TAG READ ERROR:", file.name);
    return {
      name: file.name,
      artist: "",
      title: ""
    };
  }
}

app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);

  res.setHeader("Access-Control-Allow-Origin", "*");

  res.status(500).json({
    error: "Server error",
    details: err.message
  });
});
