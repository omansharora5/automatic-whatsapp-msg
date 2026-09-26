# WhatsApp sender — native Windows setup

This project runs without Docker. It combines a local web form and HTTP API with WAHA running directly under Node.js.

## Fresh clone

Install Git, Node.js 22 or newer, and Corepack, then run in PowerShell:

```powershell
git clone --recurse-submodules https://github.com/omansharora5/automatic-whatsapp-msg.git
cd automatic-whatsapp-msg
powershell -ExecutionPolicy Bypass -File .\setup-native.ps1
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

WAHA is pinned as an upstream Git submodule. Setup applies `patches/waha-native.patch`
for the Windows configuration and dependency pin. Credentials are generated locally;
WhatsApp login sessions, credentials, uploads and logs are not included in this repository.

Verified on this PC: native dependencies installed, WAHA compiled, both servers listening only on localhost, and the paired session reaching `WORKING`. Send speed still needs a controlled recipient test. Automated tests use mocked delivery and do not send messages.

## Start

From PowerShell in this folder:

```powershell
powershell -ExecutionPolicy Bypass -File .\start.ps1
```

Or run `npm.cmd start`. This starts both native services. Keep the terminal open; Ctrl+C stops both. Run only one copy at a time.

1. Open http://127.0.0.1:3210.
2. Enter `APP_API_KEY` from `.env` in the App key box.
3. Click **Connect WhatsApp**, then **Refresh status / QR**. If STARTING, wait briefly and refresh again.
4. On your phone: **WhatsApp → Linked devices → Link a device**. Scan the QR, then refresh until WORKING.
5. Enter a full international recipient number, text, MP4, and/or coordinates. Click **Send to this number**.

The sender does not send automatically. Phone-side pairing is required before a real message can be tested.

## Technical explanation

| Component | Location | What it does |
| --- | --- | --- |
| Browser form | Served by port 3210 | Collects inputs and displays pairing QR/results |
| Node.js integration | `127.0.0.1:3210` | Authenticates requests, validates inputs, calls WAHA |
| WAHA / NestJS | `127.0.0.1:3000` | Manages your WhatsApp session and messaging APIs |
| NOWEB / Baileys | Inside WAHA | Maintains a linked-device connection to WhatsApp |
| FFmpeg | Local executable | Converts video when WAHA requests it |

When you click Send:

1. The browser sends JSON to `POST /api/send`, with `X-App-Key` authentication. The MP4 bytes are encoded as base64.
2. Our backend validates the whole request, normalizes the number to `number@c.us`, and checks that the WhatsApp session is WORKING.
3. It calls WAHA's `/api/sendText`, `/api/sendVideo`, and `/api/sendLocation` sequentially, using the separate private `WAHA_API_KEY`. By default, videos are prepared locally as H.264/AAC MP4 at up to 720p using FFmpeg's veryfast preset, then sent with WAHA conversion disabled to avoid encoding twice. Prepared clips are cached in memory (four clips maximum) until the sender restarts.
4. WAHA sends from the account you paired. NOWEB communicates with WhatsApp without a browser or Docker.
5. WAHA returns message identifiers. The page displays which requests were accepted. Acceptance is not a delivery/read receipt.

QR pairing registers a linked device on your WhatsApp account. The app key only protects the local HTTP API; it does not log you into WhatsApp. Session data is stored under `sessions/` for reuse after restarting. You can revoke the linked device from your phone.

Both servers listen on localhost. Internet is required for WAHA to reach WhatsApp, but incoming internet access to your PC is not needed.

Text, location, and video arrive as separate messages in that order. The form accepts saved MP4, MOV, WebM, MKV and AVI clips up to 60 seconds and 12 MB; it does not record or trim. FFmpeg checks duration during conversion, including when the browser cannot decode the input. Direct MP4 uploads with conversion disabled rely on the browser duration check. Location is a static latitude/longitude pin, not live tracking or address lookup.

## Calling, small TTS, and speed

WAHA's current Calls API exposes incoming-call events and rejection, but cannot initiate a WhatsApp call or stream generated speech into one. Live call playback is **not implemented or enabled**. It requires a separate calling integration such as WhatsApp Business Calling, a provisioned business sender, and the recipient call-permission flow. A normally linked WAHA account is not that integration. See [WAHA calls](https://waha.devlike.pro/docs/how-to/calls/) and [Twilio WhatsApp Business Calling](https://www.twilio.com/docs/voice/whatsapp-business-calling).

The **Short speech preview** section prepares the speech component locally using the installed Windows System.Speech voice. No AI model or cloud TTS subscription is downloaded. It accepts up to 300 characters and returns WAV audio; eight recent phrases are cached in memory. It plays only when you press Play in the browser and does not place a call or send a voice message. `POST /api/tts/preview` accepts `{ "text": "Your short sentence" }` with the same app-key authentication.

Local measurements during setup: the short English sample took about 1.2 seconds to synthesize (about 133 KB WAV), and a repeat hit the cache. The generated 10-second sample video took about 3 seconds on its first preparation and under 1 ms on reuse. These are sample preparation timings, not delivery-speed guarantees.

Send results now report `prepareMs`, `requestMs`, and video `cacheHit`. For an already compatible H.264/AAC MP4, uncheck **Prepare video for faster upload**, or set `video.convert: false`, to skip encoding entirely. Keep preparation enabled for other MP4 codecs; lossy preparation reduces resolution to at most 720p and can change video quality.

A recorded text send took 60.6 seconds inside WAHA, overlapping device-key fetching and initial history synchronization. Local status requests were only about 5–63 ms after warm-up. This suggests WhatsApp synchronization/network work was a contributor; it does not establish that all future sends will be fast. No controlled resend was performed without a designated test recipient. Normal engine logging now defaults to info rather than verbose debug output. Do not shorten timeouts or automatically retry slow sends: they may already have been sent.

## Connect another app

Your local application or automation can call the same HTTP endpoint after a booking, order, or other event. No event source or schedule is configured yet.

PowerShell example — running this sends real messages once paired:

```powershell
$appKey = (Get-Content .env | Where-Object { $_ -like 'APP_API_KEY=*' }) -replace '^APP_API_KEY=', ''
$body = @{
  phone = '+91REPLACE_WITH_REAL_NUMBER'
  text = 'Here is the video and meeting point.'
  video = @{
    filename = 'clip.mp4'
    caption = 'A short clip'
    data = [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $PWD 'clip.mp4')))
  }
  location = @{ latitude = 28.6139; longitude = 77.2090; title = 'Meeting point' }
} | ConvertTo-Json -Depth 5
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:3210/api/send -Headers @{ 'X-App-Key' = $appKey } -ContentType 'application/json' -Body $body
```

Replace the recipient, text, coordinates, and video. Omit any unwanted message type; at least one is required. Hosted apps cannot reach your PC using their own localhost; remote hosting needs separate network configuration.

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/status` | GET | Default session state |
| `/api/connect` | POST | Create/start session or restart a failed session |
| `/api/qr` | GET | Pairing QR as base64 JSON |
| `/api/send` | POST | Send selected message types |

All endpoints require `X-App-Key: <APP_API_KEY>`. WAHA's Swagger documentation is at port 3000; its credentials are in `.env`. Upstream dashboard assets are not included in a plain source clone; use our local sender to pair.

## Native development

`waha/` was cloned from https://github.com/devlikeapro/waha at `55a7d78e3feaf24280fd2a16177ad6187202ea00`. The local source change binds WAHA to `127.0.0.1`, overridable with `WAHA_LISTEN_HOST`.

A fresh install can use `powershell -ExecutionPolicy Bypass -File .\setup-native.ps1`, or these commands:

```powershell
npm.cmd install
node scripts/setup.mjs
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
Set-Location waha
corepack.cmd yarn install
corepack.cmd yarn build
Set-Location ..
npm.cmd start
```

The optional WPP helper `@wppconnect/wa-js` is pinned to published version `4.6.0` in the local WAHA package and lockfile. The Git-built archive failed checksum verification on this machine; using the published package keeps checksum verification enabled. NOWEB remains the selected engine.

WAHA's native dependencies may need additional build prerequisites; see upstream `waha/README.md`. FFmpeg comes from `ffmpeg-static` in the root dependencies. `npm.cmd run start:sender` runs just the form/API if WAHA is already running separately. `examples/demo-10s.mp4` is a generated solid-color 10-second test clip; it has not been sent to anyone.

`compose.yaml` is a legacy optional configuration. Native startup does not use it or Docker.

## Results and troubleshooting

Video encoding starts alongside the other messages. Send order is text, location,
then video; a video conversion failure cannot block earlier text/location sends.
Select a clip and check its preview before sending. Drag-and-drop is also supported.
Uploads accept MP4, MOV, WebM, MKV and AVI up to 12 MB / 60 seconds. Files the
browser cannot preview still use server conversion. A zero-byte file is rejected
before sending: download or save the complete video and choose it from File Explorer.
Other containers are converted to H.264/AAC MP4 before being sent to WAHA.
The queue runs in memory for one request; it does not survive a server restart.

For the isolated browser-to-backend video check, run `node scripts/video-test-server.mjs`
then `playwright-cli run-code --filename=scripts/check-video-end-to-end.js` in another
terminal with a Playwright browser open. This uses the real form, API and FFmpeg
on port 3215 and a mock WAHA on port 3015; no WhatsApp messages are sent.

The location API sends a fixed pin. It is not WhatsApp Live Location; use your
phone's WhatsApp live-location feature for continuously updating location sharing.
Automated calling requires a separate integration such as Twilio WhatsApp Business
Calling, an eligible business sender and recipient call permission. It is not
enabled by this local WAHA setup.

- `accepted` means WAHA returned successfully, not that the recipient received/read the message.
- On failure the sequence stops and reports `accepted`, `failed-or-unknown`, and `not-attempted`. No automatic retries. Check the chat before retrying a timeout; a message may already have sent. There is no persistent deduplication or queue.
- WAHA unavailable: run `start.ps1` and inspect its terminal logs. Background setup logs, if present, are `native.log` and `native-error.log`.
- 401: check APP_API_KEY. A WAHA 401 means its key differs between the processes; restart after changing `.env`.
- FAILED: click Connect to restart the session. Refresh expired QR codes.
- EADDRINUSE: another copy already uses the port. Use or stop that copy first.

`npm.cmd test` checks validation, authentication, message mapping, and partial-send behavior against a mock WAHA. It does not send real messages.

Keep `.env`, `sessions/`, and `media/` private. Sessions grant access to your paired account. This is a local development setup.

Official references: [WAHA source](https://github.com/devlikeapro/waha), [message API](https://waha.devlike.pro/docs/how-to/send-messages/), [engines](https://waha.devlike.pro/docs/how-to/engines/).
