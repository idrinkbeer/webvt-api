import express from "express";
import fs from "fs";
import cors from "cors";
import ftp from "basic-ftp";
import uploadRoute from "./upload.js";

const app = express();
app.use(cors());

// ✅ Upload route (handles FTP)
app.use("/upload", uploadRoute);

const PORT = process.env.PORT === "80" ? 3000 : (process.env.PORT || 3000);

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
app.get("/logs", async (req, res) => {
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
// FETCH LOG CONTENT
// =====================
app.get("/logs/:filename", async (req, res) => {
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

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
