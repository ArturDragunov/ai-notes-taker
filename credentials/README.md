# Release signing (sideload)

Signing keys are **not** committed. Each maintainer or contributor who builds a release APK generates their own keystore locally.

## Generate a keystore

```bash
keytool -genkeypair -v \
  -keystore credentials/ai-notes-release.keystore \
  -alias ai-notes \
  -keyalg RSA -keysize 2048 -validity 10000
```

Choose your own store and key passwords. Keep the keystore and passwords off git and out of screenshots/posts.

## Wire Gradle (local only)

Create `android/keystore.properties` after `npx expo prebuild` (this file is gitignored):

```properties
storeFile=../credentials/ai-notes-release.keystore
storePassword=YOUR_STORE_PASSWORD
keyAlias=ai-notes
keyPassword=YOUR_KEY_PASSWORD
```

Then:

```bash
cd android && ./gradlew assembleRelease
```

For Play Store, generate a dedicated upload key and never reuse a sideload-only keystore in production channels you care about.
