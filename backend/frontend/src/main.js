let selectedFile = null;

const videoEl = document.getElementById('videoDisplay');
const canvas = document.getElementById('hydraCanvas');

let vidRecorder, chunks = [];

// --------------------
// File input
// --------------------
document.getElementById('videoFile').addEventListener('change', e => {
  selectedFile = e.target.files[0];
  videoEl.src = selectedFile;
  videoEl.style = "display: block";
});

// --------------------
// MediaRecorder setup
// --------------------
function setupRecorder(speedFactor = 10) {
  const canvas = document.getElementById('hydraCanvas');
  const stream = canvas.captureStream(60); // 60 FPS

  vidRecorder = new MediaRecorder(stream, { mimeType: 'video/webm' });
  chunks = [];

  vidRecorder.ondataavailable = e => chunks.push(e.data);

  vidRecorder.onstop = async () => {
    if (!chunks.length) return;

    const blob = new Blob(chunks, { type: 'video/webm' });
    const form = new FormData();
    form.append('video', blob, 'hydra_recording.webm');
    form.append('speedFactor', speedFactor);

    try {
      const resp = await fetch('/upload-hydra', { method: 'POST', body: form });
      if (!resp.ok) throw new Error(await resp.text());

      const mp4Blob = await resp.blob();
      const url = URL.createObjectURL(mp4Blob);

      console.log('Hydra recording slowed down and downloaded successfully');
    } catch (err) {
      console.error('Failed to upload Hydra recording:', err);
    }

    chunks = [];
    vidRecorder = null; // reset
  };
}


function startRecording(speedFactor = 10) {
  if (!vidRecorder) setupRecorder(speedFactor);
  if (vidRecorder.state !== 'recording') {
    vidRecorder.start();
    console.log('Recording started...');
  }
}

function stopRecording() {
  if (vidRecorder && vidRecorder.state !== 'inactive') {
    vidRecorder.stop();
    console.log('Recording stopped, sending to server...');
  }
}

// --------------------
// Main preview
// --------------------
export async function renderClick() {
  if (!selectedFile) return alert('Please choose a video file first');
  const speedVideo = document.getElementById('speedVideo');
  if (!speedVideo) return alert('Missing #speedVideo element in DOM');

  const speedFactor = 10; // match server speed-up

  try {
    console.log('Uploading file to server...');
    const form = new FormData();
    form.append('video', selectedFile, selectedFile.name);

    // Upload video first
    const upResp = await fetch('/upload', { method: 'POST', body: form });
    const upJson = await upResp.json();
    if (!upJson || !upJson.videoFilename) throw new Error('Upload failed');
    console.log('Uploaded as', upJson.videoFilename);

    // Request sped-up version (server returns blob)
    console.log('Requesting server speedup...');
    const spResp = await fetch('/api/speedup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: upJson.videoFilename, factor: speedFactor })
    });

    if (!spResp.ok) {
      const errText = await spResp.text();
      throw new Error(`Speedup failed: ${errText}`);
    }

    const spJson = await spResp.json();
    if (!spJson || !spJson.url) throw new Error(spJson && spJson.error ? spJson.error : 'no url returned');

    const videoURL = spJson.url;

    // Set video src to sped-up version (served by server at /rendered/...)
    speedVideo.src = videoURL;
    speedVideo.load();
    await speedVideo.play().catch(() => { });
    console.log('Sped-up video is now playing');

    // Process with Hydra and record. Pass the video element itself so Hydra can use it as a source.
    processWithHydra(speedVideo, speedFactor);
  } catch (err) {
    console.error('renderClick error', err);
    alert('Error: ' + (err?.message || String(err)));
  }
}

// --------------------
// Button click
// --------------------

// Expose renderClick for inline handlers
window.renderClick = renderClick;

// --------------------
// Hydra processing + recording
// --------------------
function processWithHydra(videoEl, speedFactor = 10) {
  const canvas = document.getElementById('hydraCanvas');
  const hydra = new Hydra({ detectAudio: false, canvas });
  const code = document.getElementById('hydraInput');

  // Init Hydra video
  if (typeof s0 !== 'undefined') s0.initVideo?.(videoEl.src);

  try { new Function(code.value)(); } catch (err) { console.error(err); }

  // Start recording immediately if already playing
  if (!videoEl.paused && !videoEl.ended) {
    startRecording(speedFactor);
  }

  // Otherwise start recording when it starts playing
  const onPlay = () => startRecording(speedFactor);
  const onEnd = () => stopRecording();

  videoEl.addEventListener('playing', onPlay);
  videoEl.addEventListener('ended', onEnd);

  // Optional fallback timeout
  setTimeout(() => {
    stopRecording();
    videoEl.removeEventListener('playing', onPlay);
    videoEl.removeEventListener('ended', onEnd);
  }, videoEl.duration * 1000 + 2000);
}
