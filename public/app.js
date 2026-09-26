const $ = id => document.getElementById(id);
async function api(path, method = 'GET', body) {
  const response = await fetch(path, { method, headers: { 'Content-Type': 'application/json', 'X-App-Key': $('key').value.trim() }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok && !data.results) { const error = new Error(data.error || 'Request failed.'); error.beforeSend = response.status === 400; throw error; }
  return data;
}
async function refresh() {
  $('qr').hidden = true;
  const session = await api('/api/status');
  $('status').textContent = `WhatsApp: ${session.status}`;
  if (session.status === 'SCAN_QR_CODE') {
    const qr = await api('/api/qr');
    $('qr').src = `data:image/png;base64,${qr.data}`;
    $('qr').hidden = false;
  }
}
for (const id of ['connect', 'refresh']) {
  $(id).addEventListener('click', async () => {
    $(id).disabled = true;
    $('status').textContent = 'Checking WhatsApp…';
    try {
      if (id === 'connect') await api('/api/connect', 'POST', {});
      await refresh();
    } catch (error) { $('status').textContent = error.message; }
    finally { $(id).disabled = false; }
  });
}
$('include-location').addEventListener('change', () => {
  $('location-fields').hidden = !$('include-location').checked;
  $('latitude').required = $('longitude').required = $('include-location').checked;
});
let selectedVideo;
let videoUrl;
let videoCheck;
let selectionVersion = 0;
async function selectVideo(file) {
  const version = ++selectionVersion;
  selectedVideo = undefined;
  if (videoUrl) URL.revokeObjectURL(videoUrl);
  $('video-preview').hidden = true;
  $('video-preview').removeAttribute('src');
  $('video-preview').load();
  $('remove-video').hidden = !file;
  $('video-status').textContent = file ? 'Checking video…' : 'No video selected.';
  if (!file) return;
  try {
    const { data, needsConversion } = await videoData(file);
    if (version !== selectionVersion) return;
    selectedVideo = { file, data, needsConversion };
    videoUrl = URL.createObjectURL(file);
    $('video-preview').src = videoUrl;
    $('video-preview').hidden = false;
    if (needsConversion) $('prepare-video').checked = true;
    $('video-status').textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB · ${needsConversion ? 'Selected. The server will check and convert this video when you send.' : 'Ready to send. Nothing has been sent yet.'}`;
  } catch (error) {
    if (version === selectionVersion) $('video-status').textContent = error.message;
  }
}
$('video').addEventListener('change', () => { videoCheck = selectVideo($('video').files[0]); });
$('remove-video').addEventListener('click', () => { $('video').value = ''; videoCheck = selectVideo(); });
for (const type of ['dragover', 'drop']) {
  $('video-drop').addEventListener(type, event => {
    event.preventDefault();
    if ($('fields').disabled) return;
    if (type === 'drop') {
      $('video').value = '';
      if (event.dataTransfer.files.length !== 1) { $('video-status').textContent = 'Drop one MP4 at a time.'; return; }
      videoCheck = selectVideo(event.dataTransfer.files[0]);
    }
  });
}
async function videoData(file) {
  if (!file.size) throw new Error('This file is empty (0 bytes). Save or download the complete video, then choose it from File Explorer. Nothing was sent.');
  if (!/\.(mp4|mov|webm|mkv|avi)$/i.test(file.name)) throw new Error('Choose an MP4, MOV, WebM, MKV, or AVI video file.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Choose a video under 12 MB.');
  const url = URL.createObjectURL(file);
  let needsConversion = false;
  try {
    needsConversion = await new Promise((resolve, reject) => {
      const video = document.createElement('video');
      const timer = setTimeout(() => resolve(true), 3000);
      video.preload = 'metadata';
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        if (!Number.isFinite(video.duration)) resolve(true);
        else if (video.duration > 60) reject(new Error('Choose a clip up to 60 seconds. Trim a longer video first.'));
        else resolve(false);
      };
      video.onerror = () => { clearTimeout(timer); resolve(true); };
      video.src = url;
    });
  } finally { URL.revokeObjectURL(url); }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = String(reader.result).split(',')[1];
      if (!data) return reject(new Error('No video bytes could be read. Save the video locally and select it again.'));
      resolve({ data, needsConversion: needsConversion || !/\.mp4$/i.test(file.name) });
    };
    reader.onerror = () => reject(new Error('Could not read video file.'));
    reader.readAsDataURL(file);
  });
}
$('send-form').addEventListener('submit', async event => {
  event.preventDefault();
  $('fields').disabled = true;
  $('result').textContent = 'Sending text and location first. Video prepares in parallel and sends last. Please wait.';
  const started = performance.now();
  const ticker = setInterval(() => { $('result').textContent = `Waiting for WhatsApp… ${Math.floor((performance.now() - started) / 1000)}s. Order: text → location → video. Video prepares in parallel. Do not resubmit; the request is still in progress.`; }, 1000);
  let submitted = false;
  try {
    const body = { phone: $('phone').value, text: $('text').value };
    await videoCheck;
    // Browsers can restore a file input after navigation without firing change.
    if (!selectedVideo && $('video').files[0]) await selectVideo($('video').files[0]);
    if (!$('remove-video').hidden && !selectedVideo) throw new Error($('video-status').textContent);
    if (selectedVideo) body.video = { filename: `video.${selectedVideo.file.name.split('.').pop().toLowerCase()}`, data: selectedVideo.data, caption: $('caption').value, convert: selectedVideo.needsConversion || $('prepare-video').checked };
    if ($('include-location').checked) body.location = { latitude: Number($('latitude').value), longitude: Number($('longitude').value), title: $('title').value };
    submitted = true;
    const result = await api('/api/send', 'POST', body);
    $('result').textContent = JSON.stringify(result, null, 2);
  } catch (error) { $('result').textContent = `${error.message}\n${!submitted || error.beforeSend ? 'Nothing was sent.' : 'Check the chat before retrying to avoid duplicates.'}`; }
  finally { clearInterval(ticker); $('fields').disabled = false; }
});

let speechUrl;
$('preview-speech').addEventListener('click', async () => {
  $('preview-speech').disabled = true;
  $('speech-status').textContent = 'Generating local audio…';
  try {
    const result = await api('/api/tts/preview', 'POST', { text: $('speech').value });
    const bytes = Uint8Array.from(atob(result.data), c => c.charCodeAt(0));
    if (speechUrl) URL.revokeObjectURL(speechUrl);
    speechUrl = URL.createObjectURL(new Blob([bytes], { type: result.mimetype }));
    $('speech-audio').src = speechUrl;
    $('speech-audio').hidden = false;
    $('speech-status').textContent = `${result.cacheHit ? 'Reused cached audio' : `Generated in ${result.generationMs} ms`} · ${Math.round(result.bytes / 1024)} KB. Press Play to listen. No call is placed.`;
  } catch (error) { $('speech-status').textContent = error.message; }
  finally { $('preview-speech').disabled = false; }
});
