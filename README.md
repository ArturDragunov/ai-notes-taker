# AI Notes

Android app for meeting and voice notes: record (or import) audio, assign epic(s), transcribe and structure with your own STT + LLM keys, then browse notes, todos, Ask over history, and export an Obsidian-friendly Markdown vault.

Local-first — notes and audio stay on the device unless you opt into optional cloud sync. Sideload the release APK (Samsung Galaxy S24, Xiaomi, and other Android phones). No phone-call recording, no live transcript, no speaker diarization.

**Clone:** `https://github.com/ArturDragunov/ai-notes-taker`

## Features

- **Record / import** — one-tap mic recording with Android foreground service, or import audio / zip from the phone
- **Epics** — user-created topics (jobs/projects); multi-select after stop when a meeting spans more than one
- **STT + LLM (BYOK)** — OpenAI-compatible speech-to-text and chat; default OpenRouter, or separate providers (e.g. TokenRouter for LLM)
- **Offline queue** — process when online; retry / batch re-transcribe from Library
- **Structured notes** — title, about, takeaways, optional action items, full transcript + Markdown on device
- **Long recordings** — STT audio chunking when uploads exceed ~45MB; overlapping LLM windows + merge for long transcripts
- **Obsidian export** — write a local vault, export to a folder (SAF), or share the Markdown index
- **Ask (RAG-style)** — chat over local note history
- **Todos with review** — edit / merge proposed actions before adding to Todos; filter by epic
- **UI scale** — Settings control for app-wide text and button size
- **Stats** — rough usage / cost visibility for your providers

Optional OneDrive / Notion sync remains behind an advanced Settings toggle; Process does not require them.

## Install (sideload APK)

1. Get `ai-notes-release.apk` from a [GitHub Release](https://github.com/ArturDragunov/ai-notes-taker/releases) (or build from source — see below).
2. Copy the APK to the phone (USB, Drive, Messages, etc.).
3. **Samsung:** Settings → Security / Biometrics → allow **Install unknown apps** for Files or Chrome → open the APK.
4. **Xiaomi:** Settings → Privacy protection → Special permissions → **Install unknown apps** → allow for your file manager → open the APK. If Play Protect blocks it, choose Install anyway.
5. Open **AI Notes**, grant **Microphone** (and notifications if prompted so the recording service can show “Recording audio”).

## Settings (first run)

1. Open **Settings**.
2. **Speech-to-text**
   - Base URL: `https://openrouter.ai/api/v1`
   - API key: your OpenRouter (or other OpenAI-compatible) key
   - STT model: e.g. `openai/whisper-large-v3-turbo`
3. **Language model** — same provider by default, or enable **Use different provider for LLM** with a separate base URL / key / model.
4. Create epic names (default: **Personal**).
5. Optionally adjust **Text & button size**.
6. **Export / Sync notes** — Export to folder… or share the vault index when you want Markdown on a PC. OneDrive / Notion are optional under **Show optional OneDrive / Notion**.

Grey placeholder text in Settings is example-only; fields start empty and nothing is hardcoded into requests until you save values.

## Privacy

- Recordings, transcripts, and structured notes are stored **on the device**.
- When you tap Process (or re-transcribe), **audio leaves the device** and is sent to **your** configured STT endpoint; transcript/summary text is sent to **your** LLM endpoint. The app does not route audio through a proprietary AI Notes backend.
- Optional OneDrive / Notion sync (if you enable and connect them) uploads Markdown / audio or pages using credentials you paste in Settings.
- API keys are stored in the OS secure store on the phone.

## Build from source

Requirements: Node.js 20+, JDK 17+, Android SDK.

```bash
git clone https://github.com/ArturDragunov/ai-notes-taker.git
cd ai-notes-taker
npm install --legacy-peer-deps
```

Dev server (Expo):

```bash
npx expo start
```

Native release APK:

```bash
export ANDROID_HOME=/path/to/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

npx expo prebuild --platform android --clean
# generate a local keystore — see credentials/README.md
# create android/keystore.properties (gitignored) pointing at your keystore

cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Or with EAS: `npx eas-cli@latest build --platform android --profile preview` (APK).

```bash
npm run typecheck
```

## Contributing

Issues and pull requests are welcome.

1. Fork the repo and create a feature branch.
2. Prefer focused changes; keep secrets and keystores out of commits.
3. Run `npm run typecheck` before opening a PR.
4. Describe the user-visible change and how you tested (device or emulator).

Please do not open PRs that add API keys, keystore passwords, personal emails, or private Azure/Notion IDs.

## License

MIT — see [LICENSE](LICENSE).
