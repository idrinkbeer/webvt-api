import { Dropbox } from "dropbox";
import fetch from "node-fetch";
import NodeID3 from "node-id3";

const dbx = new Dropbox({
  clientId: process.env.DROPBOX_APP_KEY,
  clientSecret: process.env.DROPBOX_APP_SECRET,
  refreshToken: process.env.DROPBOX_REFRESH_TOKEN,
  fetch
});

async function repairMusic() {
  console.log("🔧 Starting repair...");

  const response = await dbx.filesListFolder({
    path: "/MUS"
  });

  const entries = response.result?.entries || [];

  const files = entries.filter(f => f[".tag"] === "file");

  console.log(`Found ${files.length} files`);

  for (const file of files) {
    try {
      console.log(`\n🎵 Fixing: ${file.name}`);

      // 1️⃣ Download
      const download = await dbx.filesDownload({
        path: `/MUS/${file.name}`
      });

      let fileData = download.result.fileBinary;

// 🔥 ensure proper buffer conversion
let buffer;

if (fileData instanceof Buffer) {
  buffer = fileData;
} else if (fileData instanceof ArrayBuffer) {
  buffer = Buffer.from(new Uint8Array(fileData));
} else if (typeof fileData === "string") {
  buffer = Buffer.from(fileData, "binary");
} else {
  // fallback (covers weird cases)
  buffer = Buffer.from(fileData);
}

      // 2️⃣ Read existing tags (try to preserve values)
      const existing = NodeID3.read(buffer);

      let secTone = 0;
      let intro = 0;

      if (existing.userDefinedText) {
        existing.userDefinedText.forEach(t => {
          if (t.description === "Sec Tone") {
            secTone = parseFloat(t.value) || 0;
          }
          if (t.description === "Intro") {
            intro = parseFloat(t.value) || 0;
          }
        });
      }

      // 3️⃣ REMOVE ALL TAGS (THIS FIXES CORRUPTION)
      buffer = NodeID3.removeTags(buffer);

      // 4️⃣ REWRITE CLEAN TAGS
      const cleanTags = {
        userDefinedText: [
          { description: "Sec Tone", value: secTone.toString() },
          { description: "Intro", value: intro.toString() }
        ]
      };

      const cleanBuffer = NodeID3.write(cleanTags, buffer);

      // 5️⃣ Upload back
      await dbx.filesUpload({
        path: `/MUS/${file.name}`,
        contents: cleanBuffer,
        mode: { ".tag": "overwrite" }
      });

      console.log(`✅ Fixed: ${file.name}`);

    } catch (err) {
      console.error(`❌ Failed: ${file.name}`, err.message);
    }
  }

  console.log("\n🎉 Repair complete!");
}

repairMusic();
