
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

      // 1️⃣ Get temp link
      const linkRes = await dbx.filesGetTemporaryLink({
        path: `/MUS/${file.name}`
      });

      const tempLink = linkRes.result.link;

      // 2️⃣ Fetch binary
      const res = await fetch(tempLink);
      const arrayBuffer = await res.arrayBuffer();

      let buffer = Buffer.from(arrayBuffer);

      // 🔥 STRIP BROKEN ID3 HEADERS MANUALLY

      let audioStart = 0;

      if (buffer.slice(0, 3).toString() === "ID3") {
        const sizeBytes = buffer.slice(6, 10);

        const tagSize =
          (sizeBytes[0] << 21) |
          (sizeBytes[1] << 14) |
          (sizeBytes[2] << 7) |
          sizeBytes[3];

        audioStart = 10 + tagSize;
      }

      buffer = buffer.slice(audioStart);

      // remove ID3v1 footer if present
      if (buffer.slice(-128, -125).toString() === "TAG") {
        buffer = buffer.slice(0, -128);
      }

      // 🔥 WRITE CLEAN TAGS (reset to 0)
      const cleanTags = {
        userDefinedText: [
          { description: "Sec Tone", value: "0" },
          { description: "Intro", value: "0" }
        ]
      };

      const cleanBuffer = NodeID3.write(cleanTags, buffer);

      // 3️⃣ Upload back
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
