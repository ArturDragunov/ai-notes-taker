# AI Notes

Pocket-like Android notes app: record room audio → assign epic(s) → transcribe + structure → sync Markdown + audio to OneDrive and a Notion page → browse, epic todos, and Ask over your library.

Sideload the release APK on Samsung Galaxy S24 and Xiaomi. No phone-call recording, no live transcript, no speaker diarization.

## Install (sideload)

1. Copy `ai-notes-release.apk` (from a release / CI artifact / `android/app/build/outputs/apk/release/`) to the phone.
2. **Samsung:** Settings → Security / Biometrics → allow Install unknown apps for Files or Chrome → open the APK.
3. **Xiaomi:** Settings → Privacy protection → Special permissions → Install unknown apps → allow for your file manager → open the APK.
4. Open **AI Notes**, grant microphone (and notifications if prompted).

Full phone steps: see the project install guide in the agent Context store (`docs/install-guide.md`) or the copy below under **Secrets Artur must create**.

## Develop

```bash
npm install
npx expo start
```

Native release APK (local):

```bash
export ANDROID_HOME=/path/to/Android/Sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools
npx expo prebuild --platform android --clean
# optional: configure android/keystore.properties for a lasting signing key
cd android && ./gradlew assembleRelease
# APK: android/app/build/outputs/apk/release/app-release.apk
```

Or with EAS: `npx eas-cli build --platform android --profile preview` (APK).

## First-run setup in the app

1. **Settings → AI:** OpenAI-compatible base URL + API key (token router, Groq, Gemini OpenAI bridge, etc.). Defaults: `whisper-1` STT, `gpt-4o-mini` LLM — change to match your gateway.
2. **Settings → OneDrive:** Azure application (client) ID + tenant (`common` is fine for personal Microsoft accounts). Tap **Connect OneDrive**.
3. **Settings → Notion:** Internal integration token + parent page ID (page must be shared with the integration).
4. Create epic names (default epic: **Personal**).

## Secrets / registrations Artur must create

### OpenAI-compatible gateway

- Base URL (e.g. `https://api.openai.com/v1` or your token router)
- API key with speech transcription + chat completions

### Azure app (Microsoft Graph / OneDrive)

1. [Azure Portal](https://portal.azure.com) → Microsoft Entra ID → App registrations → **New registration**.
2. Name: `AI Notes`. Supported accounts: personal + work, or single tenant.
3. Redirect URI (Mobile/native): the value shown in Settings (scheme `ainotes://oauth`, typically `ainotes://oauth`).
4. Certificates & secrets: **not required** for public client + PKCE.
5. API permissions → Microsoft Graph delegated: `User.Read`, `Files.ReadWrite`, `offline_access`, `openid`, `profile`. Grant admin consent if your tenant requires it.
6. Authentication → allow public client flows: **Yes**.
7. Copy **Application (client) ID** into Settings. Tenant ID or `common`.

### Notion

1. [notion.so/my-integrations](https://www.notion.so/my-integrations) → create internal integration.
2. Copy the secret token into Settings.
3. Open (or create) a parent page → **⋯ → Connections** → add the integration.
4. Copy the page ID from the URL (`https://notion.so/Workspace/Name-<PAGE_ID>`) into Settings.

## Features shipped

- Record / pause / stop with Android microphone foreground service (`expo-audio` background recording)
- Offline local queue for STT → LLM structure → OneDrive / Notion sync
- User-created epics + multi-select after Stop
- Structured Markdown (title, about, decisions, action items) + audio file
- OneDrive `Notes/<epic-slug>/` Markdown + audio
- Notion page create/update
- In-app library + search
- Per-epic todos (Markdown-backed, syncs `_todos.md` to OneDrive)
- Ask chat over local note history

## Out of scope (ship-1)

Phone-call / contact-mic recording · live transcript · speaker diarization · iOS
