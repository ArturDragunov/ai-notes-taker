# AI Notes

Pocket-like Android notes app: record room audio → assign epic(s) → transcribe + structure locally → browse, todos, Ask, and optionally export an Obsidian-friendly Markdown vault.

Sideload the release APK on Samsung Galaxy S24 and Xiaomi. No phone-call recording, no live transcript, no speaker diarization.

## Install (sideload)

1. Copy `ai-notes-release.apk` (from a release / CI artifact / `android/app/build/outputs/apk/release/`) to the phone.
2. **Samsung:** Settings → Security / Biometrics → allow Install unknown apps for Files or Chrome → open the APK.
3. **Xiaomi:** Settings → Privacy protection → Special permissions → Install unknown apps → allow for your file manager → open the APK.
4. Open **AI Notes**, grant microphone (and notifications if prompted).

## Develop

```bash
npm install --legacy-peer-deps
npx expo start
```

Native release APK (local):

```bash
export ANDROID_HOME=/path/to/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
npx expo prebuild --platform android --clean
# configure android/keystore.properties for a lasting signing key (see credentials/)
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Or with EAS: `npx eas-cli build --platform android --profile preview` (APK).

## First-run setup in the app

1. **Settings → Speech-to-text:** OpenAI-compatible base URL + API key + STT model. Fields start empty; grey text is placeholder only.
2. **Settings → Language model:** Same provider by default, or enable **Use different provider for LLM** (e.g. TokenRouter + DeepSeek) with separate URL/key/model.
3. Create epic names (default epic: **Personal**).
4. **Export / Sync notes:** Write a local vault, **Export to folder…** (SAF / Documents), or share the Markdown index — Process does not require OneDrive/Notion.
5. OneDrive / Notion remain optional under an advanced toggle.

## Secrets / registrations Artur must create

### STT (required for Process)

- Base URL (e.g. OpenRouter) + API key with speech transcription
- STT model name matching your gateway

### LLM (required for structuring / Ask)

- Same as STT by default, or a separate TokenRouter (or other) base URL + key + chat model

### Optional: Azure app (Microsoft Graph / OneDrive)

1. [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations → **New registration**.
2. Redirect URI (Mobile/native): `ainotes://oauth`.
3. Graph delegated: `User.Read`, `Files.ReadWrite`, `offline_access`, `openid`, `profile`.
4. Allow public client flows. Paste Application (client) ID into Settings.

### Optional: Notion

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → create internal integration.
2. Share a parent page with the integration; paste token + page ID.

## Features

- Record / pause / stop with Android microphone foreground service
- Offline local queue for STT → LLM structure (cloud sync optional)
- Dual AI providers (STT vs LLM) with shared default
- Usage / cost Stats screen
- User-created epics + multi-select after Stop
- Structured Markdown + audio file kept on device
- Export/Sync Obsidian vault (folder pick + share sheet)
- Library search + multi-select **Transcribe selected** / **Delete selected** / **Transcribe pending/error**
- Import phone audio / zip into Process
- Calm processing UI (“Working on your note…”); small edge Re-transcribe; ← Back on detail
- Review/edit/merge proposed actions before **Add to Todos**
- Todos page filters by epic in-list
- Top-level Todos + home shortcut
- Ask chat over local note history
- Settings control for app-wide text and button size (persisted)

## Out of scope

Phone-call / contact-mic recording · live transcript · speaker diarization · iOS
