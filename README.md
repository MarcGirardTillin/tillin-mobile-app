# Tillin Printer (React Native)

Mobile app that wraps the webapp and prints ESC/POS receipts via the SGPR 200 II SDK (Android + iOS).

## Requirements

- Node.js 20+
- Java 17 (Android)
- Android SDK + platform-tools (adb)
- Xcode + CocoaPods (iOS)

## Setup

```sh
npm install
```

### Android SDK path

Create `android/local.properties`:

```
sdk.dir=/Users/<you>/Library/Android/sdk
```

### iOS pods

```sh
cd ios
bundle install
bundle exec pod install
cd ..
```

## Run

### Android

```sh
npm start
npm run android
```

### iOS

```sh
npm start
npm run ios
```

> Note: iOS printing should be tested on a real device.

## Web app wrapper

The app loads the webapp in a WebView.

Default URL in `App.tsx`:
```
https://app.tillin.fr
```

If the URL uses HTTP Basic Auth, enter it in the **Printer** tab:
- Web URL
- Basic auth user
- Basic auth password

## Printing flow (Bubble -> Xano -> App)

Bubble should navigate to a special URL:

```
https://app.tillin.fr/print?job_id=123
```

The app intercepts this URL, calls Xano, then prints.

Xano endpoint (no auth):
```
https://api.tillin.fr/api:nOth4UPY/print_receipt?job_id=123
```

Expected JSON response:
```json
{ "payloadBase64": "..." }
```

## ESC/POS base64

The app expects raw ESC/POS bytes in base64. This is the most reliable format for special characters.

## Bluetooth / USB / Network

Use the **Printer** tab to connect:
- Bluetooth (paired devices)
- USB (Android only)
- Network (IP + port, default 9100)

## Troubleshooting

- **Android build fails**: ensure Java 17 is active and SDK path is set.
- **HTTP Response Code Failure**: Basic Auth incorrect or server rejects auth header. Use the Printer tab auth fields.
- **No print**: ensure a connection is established before printing.

