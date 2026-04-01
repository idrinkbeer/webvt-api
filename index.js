import express from "express";
import multer from "multer";
import fs from "fs";
import cors from "cors";
import ftp from "basic-ftp";

const app = express();
app.use(cors());

const PORT = process.env.PORT || 3001;

const ftpConfig = {
  host: "ftp.starbase479.com",
  user: "AIRLOGS",
  password: "AirStudio@8990",
  secure: false
};

const uploadDir = process.env.UPLOAD_DIR || "/uploads";

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, file.originalname)
});

const upload = multer({ storage });

// upload endpoint
app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ success: true, file: req.file.filename });
});

// serve uploads folder
app.use("/uploads", express.static(uploadDir));

app.get("/logs", async (req, res) => {
  const client = new ftp.Client();

  try {
    await client.access(ftpConfig);

    const list = await client.list("/"); // or your folder

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

// test route
app.get("/", (req, res) => {
  res.send("API is working");
});

app.listen(PORT, () => {
  console.log("API running on port", PORT);
});
