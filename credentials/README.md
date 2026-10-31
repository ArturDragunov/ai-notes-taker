# Release signing (sideload)

Local release builds use `ai-notes-release.keystore`.

- Alias: `ai-notes`
- Store/key password (sideload-only, not for Play Store): `ainotes-release`

For Play Store later, generate a new upload key and keep it private. Do not reuse this sideload password in production distribution channels you care about.

`android/keystore.properties` (gitignored) should point at this keystore for `assembleRelease`.
