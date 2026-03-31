import express from "express";
import multer from "multer";
import fs from "fs";

const app = express();
const PORT = process.env.PORT;

// ensure uploads folder exists
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + ".wav");
  },
});

const upload = multer({ storage });

app.post("/upload", upload.single("file"), (req, res) => {
  res.json({ success: true, file: req.file.filename });
});

app.use("/uploads", express.static("uploads"));

app.listen(PORT, () => {
  console.log("API running on port 3001");
});

//TEST API
app.get("/", (req, res) => {
  res.send("API is working");
});
