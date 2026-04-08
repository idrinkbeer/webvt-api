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
      margin: 0;
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

#app {
  display: none;
}

#loginContainer {
  position: fixed;   /* 👈 key change */
  top: 0;
  left: 0;
  width: 100%;
  height: 100vh;

  display: flex;
  justify-content: center;
  align-items: center;

  background: #0f172a; /* match your app background */
  z-index: 999;
}

#loginBox {
  background: #020617;
  padding: 25px;
  border-radius: 10px;
  text-align: center;
  box-shadow: 0 10px 25px rgba(0,0,0,0.4);
}

#loginBox input {
  width: 200px;
  padding: 8px;
  border-radius: 6px;
  border: none;
  margin-bottom: 10px;
}

  .loader {
  border: 4px solid #334155;
  border-top: 4px solid #22c55e;
  border-radius: 50%;
  width: 30px;
  height: 30px;
  animation: spin 1s linear infinite;
  margin: 0 auto;
}

#spinner {
  transition: opacity 0.2s ease;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
    
  </style>
</head>

<body>

<div id="loginContainer">
  <div id="loginBox">
    <h2>🔐 Web VT Login</h2>
    <input id="username" placeholder="Username"><br><br>
    <input id="password" type="password" placeholder="Password"><br><br>
    <button onclick="login()">Login</button>
    <div id="spinner" style="display:none; margin-top:10px;">
      <div class="loader"></div>
    </div>
    <div id="loginStatus"></div>
  </div>
</div>

<div id="app" style="display:none;">
<h1>🎙️ Web VT for AIR</h1>
<button onclick="logout()" style="float:right;">Logout</button>
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
</div>

<script src="https://unpkg.com/lamejs@1.2.0/lame.min.js"></script>
<script src="https://unpkg.com/wavesurfer.js"></script>
  
<script>
const STORAGE_KEY = "webvt_token_" + window.location.hostname;
let token = localStorage.getItem(STORAGE_KEY);
const API_URL = "https://web-vt-api.miup3p.easypanel.host";
let log = [];
let filteredLog = [];
let selectedIndex = null;
let currentHour = null;

let mediaRecorder;
let audioChunks = [];
let recordedBlob = null;

let isRecording = false;
let audioContext, analyser, dataArray, mediaStream;

let recordSeconds = 0;
let recordInterval = null;
let recordings = {};
let uploaded = {};
let wavesurfer;
let vtStage = 0;
let wavePrev, waveVT, waveNext;

const tableBody = document.querySelector("#logTable tbody");

// =====================
// LOGIN SYSTEM 
// =====================
if (token) {
  document.getElementById("loginContainer").style.display = "none";
  document.getElementById("app").style.display = "block";
  loadLogs();
}
  
async function login() {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const spinner = document.getElementById("spinner");

  const btn = document.querySelector("#loginBox button");

  // 👉 show spinner + disable button
  spinner.style.display = "block";
  btn.disabled = true;

  const res = await fetch(`${API_URL}/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ username, password })
  });

  if (!res.ok) {
    spinner.style.display = "none";
    btn.disabled = false;
    document.getElementById("loginStatus").textContent = "❌ Login failed";
    return;
  }

  const data = await res.json();
  token = data.token;

  localStorage.setItem(STORAGE_KEY, token);

  document.getElementById("loginContainer").style.display = "none";
  document.getElementById("app").style.display = "block";

  loadLogs();
}

function logout() {
  localStorage.removeItem(STORAGE_KEY);

  // show login UI instead of reload loop
  document.getElementById("app").style.display = "none";
  document.getElementById("loginContainer").style.display = "flex";
}
  
// =====================
// UPLOAD VOICETRACK 
// =====================
  async function uploadToAIR() {
  if (!recordedBlob) return;

  const row = filteredLog[selectedIndex];

  const formData = new FormData();
  formData.append("file", recordedBlob, `${row.cart}.mp3`);
  formData.append("cart", row.cart);

  const status = document.getElementById("status");
  const btn = document.getElementById("uploadBtn");

  status.textContent = "Uploading...";
  btn.disabled = true;

  try {
    const res = await fetch(`${API_URL}/upload`, {
      method: "POST",
      headers: {
        Authorization: "Bearer " + token
      },
      body: formData
    });

    if (!res.ok) throw new Error("Upload failed");

    status.textContent = "✅ VT Uploaded to AIR";
    btn.textContent = "VT Uploaded ✓";
    uploaded[row.cart] = true;

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
  const res = await fetch(`${API_URL}/logs`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });

  if (res.status === 401 || res.status === 403) {
    console.warn("Token expired or invalid");
    logout();
    return;
  }

  const files = await res.json();

  if (!Array.isArray(files)) {
    console.error("Bad response:", files);
    return;
  }

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
  const res = await fetch(`${API_URL}/logs/${filename}`, {
    headers: {
      Authorization: "Bearer " + token
    }
  });
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
          filename: parts[12]?.trim(),
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

            <button id="playBtn">Start VT</button>

            <button id="uploadBtn" onclick="uploadToAIR()" disabled>
              Upload VT to AIR
            </button>

            <div class="vu-container">
              <div id="vuBar"></div>
            </div>

            <div id="status"></div>
            <div id="recordTime">⏱ 0:00</div>
            <div id="wavePrev" style="margin-top:10px;"></div>
            <div id="waveVT" style="margin-top:10px;"></div>
            <div id="waveNext" style="margin-top:10px;"></div>
            <div class="audio-player">
  <button onclick="previewBreak()">▶ Preview Break</button>
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
      // 🎧 Init waveform
setTimeout(() => {
  const prevEl = document.getElementById("wavePrev");
  const vtEl = document.getElementById("waveVT");
  const nextEl = document.getElementById("waveNext");

  if (!prevEl || !vtEl || !nextEl) return;

  // 🎵 Previous song
  wavePrev = WaveSurfer.create({
    container: "#wavePrev",
    waveColor: "#64748b",
    progressColor: "#22c55e",
    height: 60
  });

  // 🎙️ Voicetrack
  waveVT = WaveSurfer.create({
    container: "#waveVT",
    waveColor: "#facc15",
    progressColor: "#22c55e",
    height: 60
  });

  // 🎵 Next song
  waveNext = WaveSurfer.create({
    container: "#waveNext",
    waveColor: "#64748b",
    progressColor: "#22c55e",
    height: 60
  });

  const row = filteredLog[selectedIndex];
  const { prevSong, nextSong } = getPrevNextSongs(selectedIndex);

  // 🎵 PREVIOUS SONG (last 30 seconds)
  if (prevSong?.filename) {
    const url = `${API_URL}/audio/song/${encodeURIComponent(prevSong.filename)}`;

    wavePrev.load(url);

    wavePrev.once("ready", () => {
      const duration = wavePrev.getDuration();
      wavePrev.setTime(Math.max(0, duration - 15)); // 🔥 last 15 sec
    });
  }

  // 🎙️ VOICETRACK
  const vtBlob = recordings[row.cart];

  if (vtBlob) {
    waveVT.load(URL.createObjectURL(vtBlob));
  } else {
    waveVT.load(`${API_URL}/audio/vt/${row.cart}.mp3`);
  }

  // 🎵 NEXT SONG (start)
  if (nextSong?.filename) {
    const url = `${API_URL}/audio/song/${encodeURIComponent(nextSong.filename)}`;
    waveNext.load(url);
  }

}, 50);
setupVTButton();


      // 🔁 Restore previous recording if exists
      const rowData = filteredLog[selectedIndex];
      const saved = recordings[rowData.cart];

      if (saved) {
        const player = document.getElementById("player");

        setupPlayer(player, saved);

        recordedBlob = saved;
        document.getElementById("uploadBtn").disabled = false;
        document.getElementById("status").textContent = "VT Previously recorded";
      }

      // 🔁 Restore upload state
      if (uploaded[rowData.cart]) {
        const btn = document.getElementById("uploadBtn");
        const status = document.getElementById("status");

        btn.textContent = "VT Uploaded ✓";
        btn.disabled = true;
        status.textContent = "✅ Already uploaded";
      }
    }
  });
}

function selectRow(i) {
  if (filteredLog[i].type !== "VTX") return;

  vtStage = 0; // 🔥 reset workflow
  selectedIndex = i;
  renderTable();
}

  // TRIM SILENCE ON WAV VT
function trimSilence(samples, sampleRate, threshold = 0.01, windowSize = 1024) {
  let start = 0;
  let end = samples.length - 1;

  function rms(startIdx) {
    let sum = 0;
    for (let i = 0; i < windowSize; i++) {
      const s = samples[startIdx + i] || 0;
      sum += s * s;
    }
    return Math.sqrt(sum / windowSize);
  }

  // find start
  for (let i = 0; i < samples.length - windowSize; i += windowSize) {
    if (rms(i) > threshold) {
      start = i;
      break;
    }
  }

  // find end
  for (let i = samples.length - windowSize; i > 0; i -= windowSize) {
    if (rms(i) > threshold) {
      end = i;
      break;
    }
  }

  // padding (keeps natural feel)
  const padding = sampleRate * 0.1; // 100ms

  start = Math.max(0, start - padding);
  end = Math.min(samples.length - 1, end + padding);

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
  mediaStream = await navigator.mediaDevices.getUserMedia({
  audio: {
    echoCancellation: false,
    noiseSuppression: false,
    autoGainControl: false
  }
});

  audioContext = new AudioContext();

  const source = audioContext.createMediaStreamSource(mediaStream);

  // 👉 ADD THIS
  const gainNode = audioContext.createGain();
  gainNode.gain.value = 1.2; // adjust as needed

  analyser = audioContext.createAnalyser();
  analyser.fftSize = 256;

  dataArray = new Uint8Array(analyser.frequencyBinCount);

  const processor = audioContext.createScriptProcessor(8192, 1, 1);

  let samples = [];

  processor.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    samples.push(new Float32Array(input));
  };

  source.connect(gainNode);
  gainNode.connect(analyser);
  analyser.connect(processor);
  processor.connect(audioContext.destination);

  window._recorder = { samples, processor };

  updateVU();

  isRecording = true;

  document.getElementById("status").textContent = "Recording...";

  // ⏱ START TIMER
  recordSeconds = 0;

  recordInterval = setInterval(() => {
  recordSeconds++;

    const mins = Math.floor(recordSeconds / 60);
    const secs = (recordSeconds % 60).toString().padStart(2, "0");

    const el = document.getElementById("recordTime");
    if (el) el.textContent = `⏱ ${mins}:${secs}`;
  }, 1000);
}


function setupVTButton() {
  const btn = document.getElementById("playBtn");
  if (!btn) return;

  vtStage = 0;
  btn.textContent = "Start VT";

  btn.onclick = async () => {
    if (!wavePrev || !waveVT || !waveNext) return;

    // 1️⃣ PLAY PREVIOUS SONG
    if (vtStage === 0) {
      const duration = wavePrev.getDuration();

      if (duration > 0) {
        wavePrev.setTime(Math.max(0, duration - 15));
      }

      wavePrev.play();

      btn.textContent = "Start Recording";
      vtStage = 1;
      return;
    }

// 2️⃣ RECORDING STAGE
if (vtStage === 1) {
  await startRecording();

  btn.textContent = "Stop Recording";
  vtStage = 2;
  return;
}

// 3️⃣ STOP RECORDING → START NEXT SONG
if (vtStage === 2) {
  if (isRecording) {
    await stopRecording();
  }

  const row = filteredLog[selectedIndex];
  const { nextSong } = getPrevNextSongs(selectedIndex);

  if (!nextSong?.filename) return;

  const url = `${API_URL}/audio/song/${encodeURIComponent(nextSong.filename)}`;

  waveNext.load(url);
  waveNext.once("ready", () => waveNext.play());

  btn.textContent = "Stop VT";
  vtStage = 3;
  return;
}

    // 4️⃣ STOP EVERYTHING
    if (vtStage === 3) {
      wavePrev.stop();
      waveNext.stop();

      if (isRecording) {
        await stopRecording();
      }

      vtStage = 0;
      btn.textContent = "Start VT";
      return;
    }
  };
}

function setupPlayer(player, blob) {
  player.src = URL.createObjectURL(blob);

  setTimeout(() => {
    const progressBar = document.getElementById("progressBar");
    const timeLabel = document.getElementById("time");
    const progressContainer = document.querySelector(".progress");

    if (!progressBar || !timeLabel) return;


    player.ontimeupdate = () => {
      if (!player.duration) return;

      const percent = (player.currentTime / player.duration) * 100;
      progressBar.style.width = percent + "%";

      const minutes = Math.floor(player.currentTime / 60);
      const seconds = Math.floor(player.currentTime % 60)
        .toString()
        .padStart(2, "0");

      timeLabel.textContent = `${minutes}:${seconds}`;
    };

    if (progressContainer) {
      progressContainer.onclick = (e) => {
        const rect = progressContainer.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        player.currentTime = percent * player.duration;
      };
    }

  }, 50);
}

function encodeMP3(samples, sampleRate) {
  const mp3encoder = new lamejs.Mp3Encoder(1, sampleRate, 128); // mono, 128 kbps
  const blockSize = 1152;

  let mp3Data = [];

  // convert Float32 → Int16
  const samples16 = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    let s = Math.max(-1, Math.min(1, samples[i]));
    samples16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  for (let i = 0; i < samples16.length; i += blockSize) {
    const chunk = samples16.subarray(i, i + blockSize);
    const mp3buf = mp3encoder.encodeBuffer(chunk);
    if (mp3buf.length > 0) {
      mp3Data.push(mp3buf);
    }
  }

  const mp3buf = mp3encoder.flush();
  if (mp3buf.length > 0) {
    mp3Data.push(mp3buf);
  }

  return new Blob(mp3Data, { type: "audio/mpeg" });
}
  
async function stopRecording() {
  await new Promise(r => setTimeout(r, 50));
  // ⏱ STOP TIMER
  if (recordInterval) {
    clearInterval(recordInterval);
    recordInterval = null;
  }

  const { samples, processor } = window._recorder;

  processor.disconnect();

  let length = samples.reduce((sum, s) => sum + s.length, 0);
  let flat = new Float32Array(length);

  let offset = 0;
  for (let s of samples) {
    flat.set(s, offset);
    offset += s.length;
  }

  const trimmed = trimSilence(flat, audioContext.sampleRate, 0.01);

  recordedBlob = encodeMP3(trimmed, audioContext.sampleRate);

  const row = filteredLog[selectedIndex];
  recordings[row.cart] = recordedBlob;

  const player = document.getElementById("player");
  setupPlayer(player, recordedBlob);
  
  if (waveVT) {
    waveVT.load(URL.createObjectURL(recordedBlob));
  }

  document.getElementById("uploadBtn").disabled = false;
  document.getElementById("status").textContent = "Ready to upload";

  mediaStream.getTracks().forEach(track => track.stop());

  if (audioContext) {
    audioContext.close();
    analyser = null;
  }

  isRecording = false;
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


function getPrevNextSongs(index) {
  let prevSong = null;
  let nextSong = null;

  for (let i = index - 1; i >= 0; i--) {
    if (filteredLog[i].type === "SONG") {
      prevSong = filteredLog[i];
      break;
    }
  }

  for (let i = index + 1; i < filteredLog.length; i++) {
    if (filteredLog[i].type === "SONG") {
      nextSong = filteredLog[i];
      break;
    }
  }

  return { prevSong, nextSong };
}


function playTrack(src, startTime = 0) {
  return new Promise(resolve => {
    wavesurfer.load(src);

    wavesurfer.once("ready", () => {
      if (startTime > 0) {
        wavesurfer.setTime(startTime);
      }
      wavesurfer.play();
    });

    wavesurfer.once("finish", () => {
      resolve();
    });
  });
}


async function previewBreak() {
  if (selectedIndex === null) return;

  const { prevSong, nextSong } = getPrevNextSongs(selectedIndex);
  const row = filteredLog[selectedIndex];

  if (!prevSong || !nextSong) {
    alert("Missing surrounding songs");
    return;
  }

  // 🎙️ VT
  const vtBlob = recordings[row.cart];
  const vtUrl = vtBlob
    ? URL.createObjectURL(vtBlob)
    : `${API_URL}/audio/vt/${row.cart}.mp3`;

    const prevUrl = `${API_URL}/audio/song/${encodeURIComponent(prevSong.filename)}`;
    const nextUrl = `${API_URL}/audio/song/${encodeURIComponent(nextSong.filename)}`;

  console.log("Previewing:", prevSong.filename, row.cart, nextSong.filename);

  // 1. play ramp of previous song
  await playTrack(prevUrl, prevSong.intro);

  // 2. play VT
  await playTrack(vtUrl);

  // 3. play next song
  await playTrack(nextUrl);
}
  
// =====================
  
</script>

</body>
</html>
