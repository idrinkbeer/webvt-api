import express from "express";
import fs from "fs";
import cors from "cors";
import ftp from "basic-ftp";
import uploadRoute from "./upload.js";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(express.json());

// =====================
// USERS (simple auth)
// =====================
const USERS = {
  admin: "yourpassword123" // 🔥 CHANGE THIS
};

// =====================
// LOGIN
// =====================
app.post("/login", (req, res) => {
  const { username, password } = req.body;

  if (USERS[username] !== password) {
    return res.status(401).json({ error: "Invalid login" });
  }

  const token = jwt.sign(
    { username },
    process.env.JWT_SECRET || "secret123",
    { expiresIn: "7d" }
  );

  res.json({ token });
});

// =====================
// AUTH MIDDLEWARE
// =====================
function auth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) return res.sendStatus(401);

  const token = header.split(" ")[1];

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET || "secret123");
    next();
  } catch {
    res.sendStatus(403);
  }
}

// =====================
// FTP CONFIG
// =====================
const ftpConfig = {
  host: process.env.FTP_HOST,
  user: process.env.FTP_USER,
  password: process.env.FTP_PASS,
  secure: false
};

// =====================
// UPLOAD ROUTE (PROTECTED)
// =====================
app.use("/upload", auth, uploadRoute);

// =====================
// OPTIONAL STATIC
// =====================
const uploadDir = process.env.UPLOAD_DIR || "/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use("/uploads", express.static(uploadDir));

// =====================
// LOG LIST (PROTECTED)
// =====================
app.get("/logs", auth, async (req, res) => {
  const client = new ftp.Client();

  try {
    await client.access(ftpConfig);

    const list = await client.list("/");

    const ascFiles = list
      .filter(file => file.name.endsWith(".ASC"))
      .map(file => file.name);

    res.json(ascFiles);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "FTP error" });
  }

  client.close();
});

// =====================
// FETCH LOG CONTENT (PROTECTED)
// =====================
app.get("/logs/:filename", auth, async (req, res) => {
  const client = new ftp.Client();

  try {
    await client.access(ftpConfig);

    const tempPath = `/tmp/${req.params.filename}`;

    await client.downloadTo(tempPath, req.params.filename);

    const content = fs.readFileSync(tempPath, "utf-8");

    res.send(content);

  } catch (err) {
    console.error(err);
    res.status(500).send("Error fetching file");
  }

  client.close();
});

// =====================
// TEST
// =====================
app.get("/", (req, res) => {
  res.send("API is working");
});

// =====================
// START SERVER
// =====================
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
