# Naxster Command - Android WebSocket Step

This step connects the Android app to the Windows Companion server.

## What this adds

- Android WebSocket client using OkHttp
- Connect to Windows Companion from the Android app
- Send test ping from Android to Windows
- Send Remote Mouse demo commands to the Windows Companion
- Dashboard status now shows real connection state

The PC mouse will **not move yet**.  
This step only proves that Android can talk to the Windows Companion.

---

## Files included

```text
MainActivity.kt
gradle_dependency_snippet.txt
android_manifest_changes.txt
```

---

## Step 1 - Add OkHttp dependency

Open:

```text
app/build.gradle.kts
```

Find:

```text
dependencies {
```

Inside that block, add this line:

```kotlin
implementation("com.squareup.okhttp3:okhttp:4.12.0")
```

Then click:

```text
Sync Now
```

---

## Step 2 - Add Android internet permission

Open:

```text
app/src/main/AndroidManifest.xml
```

Add this line above `<application`:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

Then inside the `<application ...>` tag, add:

```xml
android:usesCleartextTraffic="true"
```

Example:

```xml
<application
    android:usesCleartextTraffic="true"
    ...
>
```

This is needed because we are using local development WebSocket:

```text
ws://PC_IP:8787/ws
```

Later, for a production version, we can make the security stricter.

---

## Step 3 - Replace MainActivity.kt

Open:

```text
app/src/main/java/com/naxster/command/MainActivity.kt
```

Replace everything with the included:

```text
MainActivity.kt
```

---

## Step 4 - Start Windows Companion

On your PC, start the Windows Companion app from the previous ZIP:

```text
run-server.bat
```

Keep the black server window open.

---

## Step 5 - Find your PC IPv4 address

On Windows, open Command Prompt and run:

```text
ipconfig
```

Look for your Wi-Fi or Ethernet adapter.

Find:

```text
IPv4 Address
```

It may look like:

```text
192.168.1.50
```

Important:

Do **not** use `localhost` in the Android app.  
On Android, `localhost` means the phone itself, not your PC.

---

## Step 6 - Test in Android

Run the Android app.

Open:

```text
Connection
```

Enter:

```text
PC IPv4 address: your PC IPv4
Port: 8787
```

Tap:

```text
Connect to Companion
```

Then tap:

```text
Send Test Ping
```

The Windows Companion server window should show messages coming from Android.

---

## Expected result

In Android:

```text
Connected
Server replied
```

On Windows server window, you should see received JSON messages.

---

## If it does not connect

Check:

1. Phone and PC are on the same Wi-Fi/network.
2. Windows Companion server is running.
3. You used your PC IPv4 address, not localhost.
4. Windows Firewall allowed Private networks.
5. Port is `8787`.
6. AndroidManifest has INTERNET permission.
7. AndroidManifest has `usesCleartextTraffic="true"`.

---

## Next step after this works

Add real Windows mouse control to the Windows Companion app.
