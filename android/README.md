# ScoreAlert — Android app

Native **Kotlin + Jetpack Compose**, dark-first "deal scanner" UI.

## Why Kotlin/Compose (not Expo)

This repository had no existing app when ScoreAlert was created, so there was no Expo
ecosystem to reuse. The app leans on native Android capabilities that are first-class in
Kotlin — the **Share Sheet** target, **notification channels** with per-category sounds,
and **FCM** background delivery — so native Kotlin/Compose is the better fit.

## What's here

```
app/src/main/
  AndroidManifest.xml            Share Sheet + scorealert:// deep link + FCM service
  java/com/scorealert/app/
    ScoreAlertApp.kt             Application; creates the notification channels
    MainActivity.kt              Single-activity host; handles share + deep-link intents
    fcm/ScoreAlertMessagingService.kt   Renders pushes, opens listing detail on tap
    net/ScoreAlertApi.kt         Retrofit client (talks ONLY to the ScoreAlert backend)
    model/Models.kt              Listing / Score / SourceInfo (mirror the backend)
    ui/                          Compose screens: Feed + DealCard, Detail, Source health
    ui/theme/Theme.kt            Dark-first radar palette
```

## Build

Requires the Android SDK + JDK 17.

```bash
# from android/
gradle wrapper            # first time only: generate gradlew + wrapper jar
./gradlew assembleDebug   # -> app/build/outputs/apk/debug/app-debug.apk
./gradlew installDebug    # install on a connected device/emulator
```

Set the backend URL via `gradle.properties` (`scorealert.apiBaseUrl`) or `local.properties`.

## Firebase / FCM setup (required for push)

1. Create a Firebase project and add an Android app with package `com.scorealert.app`.
2. Download `google-services.json` into `android/app/` (git-ignored — never commit it).
3. Uncomment the `com.google.gms.google-services` plugin in `build.gradle.kts` (root +
   `app`).
4. Put the **service account** JSON on the **backend** only (see repo `.env.example`);
   the app never holds server secrets.

Until `google-services.json` is added, the app builds and runs against sample data; FCM
registration is a no-op.

> **Note:** No prebuilt APK is committed. This scaffold was authored in an environment
> without the Android SDK, so it was not compiled here. The steps above produce a debug APK.
