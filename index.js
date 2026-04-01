<!DOCTYPE html>
<html>
<head>
  <title>Web VT for AIR</title>

  <style>
    body {
      font-family: Arial;
      background: #0f172a;
      color: #e2e8f0;
      padding: 20px;
    }

    table {
      border-collapse: collapse;
      width: 100%;
      background: #1e293b;
      border-radius: 8px;
      overflow: hidden;
    }

    th {
      background: #020617;
      padding: 10px;
      font-size: 13px;
      color: #94a3b8;
      text-align: left;
    }

    td {
      padding: 10px;
      border-bottom: 1px solid #334155;
    }

    tr:hover { background: #334155; cursor: pointer; }

    .vtx { color: #facc15; font-weight: bold; }
    .active { background: #2563eb !important; }

    .recorder {
      background: #020617;
      padding: 15px;
      border-radius: 6px;
    }

    .vu-container {
      height: 10px;
      background: #334155;
      border-radius: 5px;
      margin-top: 10px;
    }

    #vuBar {
      height: 10px;
      width: 0%;
      background: #22c55e;
      border-radius: 5px;
    }

    button {
      background: #2563eb;
      border: none;
      padding: 8px 14px;
      margin-right: 10px;
      border-radius: 6px;
      color: white;
      cursor: pointer;
    }

    audio { width: 100%; margin-top: 10px; }

    .audio-player {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
}

.audio-player button {
  background: #22c55e;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  color: white;
  cursor: pointer;
  font-size: 14px;
}

.progress {
  flex: 1;
  height: 6px;
  background: #334155;
  border-radius: 3px;
  overflow: hidden;
  cursor: pointer;
}

#progressBar {
  height: 100%;
  width: 0%;
  background: #22c55e;
}

#time {
  font-size: 12px;
  color: #94a3b8;
}
  </style>
</head>

<body>

<h1>🎙️ Web VT for AIR</h1>

<select id="logSelect"></select>
<select id="hourSelect" style="display:none;"></select>

<table id="logTable">
  <thead>
    <tr>
      <th>Time</th>
      <th>Type</th>
      <th>Title</th>
      <th>Artist</th>
      <th>Intro</th>
      <th>End</th>
    </tr>
  </thead>
  <tbody></tbody>
</table>

<script>
let log = [];
let filteredLog = [];
let selectedIndex = null;
let currentHour = null;

let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;

let isRecording = false;
let audioContext, analyser, dataArray, mediaStream;

const tableBody = document.querySelector("#logTable tbody");

// =====================
// UPLOAD VOICETRACK 
// =====================
  async function uploadToAIR() {
  if (!recordedBlob) return;

  const row = filteredLog[selectedIndex];

  const formData = new FormData();
  formData.append("file", recordedBlob, `${row.cart}.wav`);
  formData.append("cart", row.cart);

  const status = document.getElementById("status");
  const btn = document.getElementById("uploadBtn");

  status.textContent = "Uploading...";
  btn.disabled = true;

  try {
    const res = await fetch("https://web-vt-api.miup3p.easypanel.host/upload", {
      method: "POST",
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    status.textContent = "✅ Uploaded to AIR";
    btn.textContent = "Uploaded ✓";

  } catch (err) {
    console.error(err);
    status.textContent = "❌ Upload failed";
    btn.disabled = false;
  }
}
  
// =====================
// LOAD LOGS
// =====================
async function loadLogs() {
  const res = await fetch("https://web-vt-api.miup3p.easypanel.host/logs");
  const files = await res.json();

  const select = document.getElementById("logSelect");
  select.innerHTML = "<option>Select a log...</option>";

  files.forEach(file => {
    const opt = document.createElement("option");
    opt.value = file;
    opt.textContent = file;
    select.appendChild(opt);
  });

  select.onchange = () => {
    if (select.value !== "Select a log...") {
      loadSelectedLog(select.value);
    }
  };
}

async function loadSelectedLog(filename) {
  const res = await fetch(`https://web-vt-api.miup3p.easypanel.host/logs/${filename}`);
  const text = await res.text();

  processASC(text);
  document.getElementById("hourSelect").style.display = "inline-block";
}

// =====================
// ASC PROCESSING
// =====================
function processASC(text) {
  log = text.split("\n")
    .map(line => {
      const parts = line.split("\\");

      if (line.includes("\\MUS\\")) {
        return {
          type: "SONG",
          time: parts[0],
          title: parts[5],
          artist: parts[6],
          intro: parseInt(parts[10]) || 0,
          end: parts[11]
        };
      }

      if (line.includes("\\VTX\\")) {
        return {
          type: "VTX",
          time: parts[0],
          cart: parts[4],
          title: "VOICE TRACK"
        };
      }

      return null;
    })
    .filter(Boolean);

  buildHourDropdown();
  filterByHour(log[0].time.split(":")[0]);
}

// =====================
// HOURS
// =====================
function buildHourDropdown() {
  const hours = [...new Set(log.map(r => r.time.split(":")[0]))].sort();

  const select = document.getElementById("hourSelect");
  select.innerHTML = "";

  hours.forEach(hour => {
    const opt = document.createElement("option");
    opt.value = hour;
    opt.textContent = hour;
    select.appendChild(opt);
  });

  currentHour = hours[0];
  select.value = currentHour;

  select.onchange = () => {
    currentHour = select.value;
    filterByHour(currentHour);
  };
}

// =====================
// TABLE
// =====================
function filterByHour(hour) {
  filteredLog = log.filter(row => row.time.startsWith(hour));
  selectedIndex = null;
  renderTable();
}

function renderTable() {
  tableBody.innerHTML = "";

  filteredLog.forEach((row, i) => {
    const tr = document.createElement("tr");

    if (row.type === "VTX") tr.classList.add("vtx");
    if (i === selectedIndex) tr.classList.add("active");

    tr.innerHTML = `
      <td>${row.time}</td>
      <td>${row.type}</td>
      <td>${row.type === "VTX" ? row.title + " (" + row.cart + ")" : row.title}</td>
      <td>${row.artist || ""}</td>
      <td>${row.intro || ""}</td>
      <td>${row.end || ""}</td>
    `;

    tr.onclick = () => selectRow(i);
    tableBody.appendChild(tr);

    if (i === selectedIndex && row.type === "VTX") {
      const recorderRow = document.createElement("tr");

      recorderRow.innerHTML = `
        <td colspan="6">
          <div class="recorder">
            🎙️ Recording for Cart: ${row.cart}<br><br>

            <button id="recordBtn" onclick="toggleRecording()">Start</button>

            <button id="uploadBtn" onclick="uploadToAIR()" disabled>
              Upload to AIR
            </button>

            <div class="vu-container">
              <div id="vuBar"></div>
            </div>

            <div id="status"></div>
            <div class="audio-player">
  <button id="playBtn">▶</button>
  <div class="progress">
    <div id="progressBar"></div>
  </div>
  <span id="time">0:00</span>
</div>

<audio id="player"></audio>
          </div>
        </td>
      `;

      tableBody.appendChild(recorderRow);
    }
  });
}

function selectRow(i) {
  if (filteredLog[i].type !== "VTX") return;
  selectedIndex = i;
  renderTable();
}

  // TRIM SILENCE ON WAV VT
  function trimSilence(samples, threshold = 0.01, minSilenceSamples = 4410) {
  let start = 0;
  let end = samples.length - 1;

  // find start
  for (let i = 0; i < samples.length; i++) {
    if (Math.abs(samples[i]) > threshold) {
      start = i;
      break;
    }
  }

  // find end
  for (let i = samples.length - 1; i > 0; i--) {
    if (Math.abs(samples[i]) > threshold) {
      end = i;
      break;
    }
  }

  // small padding so it doesn’t cut too tight
  start = Math.max(0, start - minSilenceSamples);
  end = Math.min(samples.length - 1, end + minSilenceSamples);

  return samples.slice(start, end);
}

  
// =====================
// RECORDING
// =====================
async function toggleRecording() {
  if (!isRecording) {
    await startRecording();
  } else {
    stopRecording();
  }
}

  
async function startRecording() {
  mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });

  audioContext = new AudioContext();
  const source = audioContext.createMediaStreamSource(mediaStream);

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  dataArray = new Uint8Array(analyser.frequencyBinCount);

  const processor = audioContext.createScriptProcessor(4096, 1, 1);

  let samples = [];

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    samples.push(new Float32Array(input));
  };

  source.connect(analyser);
  analyser.connect(processor);
  processor.connect(audioContext.destination);

  window._recorder = { samples, processor };

  updateVU();

  isRecording = true;

  document.getElementById("recordBtn").textContent = "Stop";
  document.getElementById("status").textContent = "Recording...";
}

function stopRecording() {
  const { samples, processor } = window._recorder;

  processor.disconnect();

  // flatten samples
  let length = samples.reduce((sum, s) => sum + s.length, 0);
  let flat = new Float32Array(length);

  let offset = 0;
  for (let s of samples) {
    flat.set(s, offset);
    offset += s.length;
  }

  // encode WAV
  const trimmed = trimSilence(flat, 0.01); // lower threshold too
  const wavBuffer = encodeWAV(trimmed, audioContext.sampleRate);
  recordedBlob = new Blob([wavBuffer], { type: "audio/wav" });

  const player = document.getElementById("player");
player.src = URL.createObjectURL(recordedBlob);

// setup custom player AFTER UI exists
setTimeout(() => {
  const playBtn = document.getElementById("playBtn");
  const progressBar = document.getElementById("progressBar");
  const timeLabel = document.getElementById("time");

  playBtn.onclick = () => {
    if (player.paused) {
      player.play();
      playBtn.textContent = "⏸";
    } else {
      player.pause();
      playBtn.textContent = "▶";
    }
  };

  player.ontimeupdate = () => {
    const percent = (player.currentTime / player.duration) * 100;
    progressBar.style.width = percent + "%";

    const minutes = Math.floor(player.currentTime / 60);
    const seconds = Math.floor(player.currentTime % 60)
      .toString()
      .padStart(2, "0");

    timeLabel.textContent = `${minutes}:${seconds}`;
  };

  document.querySelector(".progress").onclick = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    player.currentTime = percent * player.duration;
  };

}, 50);
  
  document.getElementById("uploadBtn").disabled = false;
  document.getElementById("status").textContent = "Ready to upload";

  // cleanup
  mediaStream.getTracks().forEach(track => track.stop());

  if (audioContext) {
    audioContext.close();
    analyser = null;
  }

  isRecording = false;
  document.getElementById("recordBtn").textContent = "Start";
}

// =====================
// VU
// =====================
function updateVU() {
  if (!analyser) return;

  analyser.getByteFrequencyData(dataArray);

  let sum = dataArray.reduce((a,b)=>a+b,0);
  let avg = sum / dataArray.length;

  document.getElementById("vuBar").style.width = (avg/255*100) + "%";

  requestAnimationFrame(updateVU);
}

// =====================
loadLogs();


  // Convert Float32 audio buffer → WAV
function encodeWAV(samples, sampleRate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);

  function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  // RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeString(view, 8, "WAVE");

  // format chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);

  // data chunk
  writeString(view, 36, "data");
  view.setUint32(40, samples.length * 2, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }

  return buffer;
}
  
</script>

</body>
</html>
