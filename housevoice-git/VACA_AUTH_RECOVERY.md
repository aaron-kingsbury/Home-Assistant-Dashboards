# HOUSEVOICE VACA Authentication Recovery

This guide covers VACA 0.13.4 external-auth failures without clearing app data,
removing the Home Assistant integration, or losing the paired VACA device.

## Symptoms

Authentication recovery is appropriate when all of the following are true:

- VACA and its Wyoming server start normally.
- The configured Home Assistant HTTPS URL loads in the WebView.
- Home Assistant remains on its initialization or retry page instead of loading
  the dashboard.
- Home Assistant logs reject `/auth/token` requests from the affected VACA
  device. VACA uses a Ktor/OkHttp client for this request.
- A working VACA device on the same origin initializes normally.

`Uncaught (in promise) 1` can accompany this failure. It indicates the failed
external-auth promise; by itself, it does not identify a dashboard or Walkie
JavaScript defect.

Wyoming connectivity and WebView authentication are independent. A connected
voice satellite does not prove that the embedded Home Assistant frontend is
authenticated.

## Safety rules

- Never print, copy, log, or commit token values or passwords.
- Never commit a VACA preferences file or its backup.
- Never use Android **Clear storage**, uninstall VACA, or select **Clear Paired
  Device** for this repair.
- Preserve `paired_device_id` and all non-authentication settings.
- Do not use a relayed or injected access token as the permanent repair.
- Stop if `run-as com.msp1974.vacompanion` is unavailable. Do not escalate to a
  broader data reset.

## Confirm the failure

1. Record the affected device's ADB serial or address and confirm VACA 0.13.4:

   ```bash
   adb -s DEVICE shell dumpsys package com.msp1974.vacompanion \
     | grep -E "versionName=|versionCode="
   ```

2. Confirm app-private access without displaying preferences:

   ```bash
   adb -s DEVICE shell run-as com.msp1974.vacompanion id
   ```

3. Check Home Assistant Core logs for rejected requests from the affected
   device. A rejected `/auth/token` request proves that VACA reached Home
   Assistant and that DNS, TLS, and the native request path worked.

4. Compare the WebView with a working room. The failed device typically has
   `ha-init-page` and no connected HA WebSocket; a working room has a connected
   WebSocket and its dashboard title.

## Auth-only ADB recovery

The preference file used by VACA 0.13.4 is:

```text
shared_prefs/com.msp1974.vacompanion_preferences.xml
```

The recovery removes only these keys:

- `auth_token`
- `refresh_token`
- `token_expiry`

It must preserve `paired_device_id`.

### 1. Stop VACA completely

VACA's foreground service can restart after `am force-stop`. Briefly disable the
package so the preference edit is made while no VACA process is running:

```bash
adb -s DEVICE shell pm disable-user --user 0 com.msp1974.vacompanion
adb -s DEVICE shell pidof com.msp1974.vacompanion
```

The second command must return no PID. Re-enable the package immediately after
the edit; do not leave it disabled.

### 2. Create a private on-device backup

Keep the backup inside VACA's private app directory. Never pull or commit it.

```bash
adb -s DEVICE shell run-as com.msp1974.vacompanion \
  cp shared_prefs/com.msp1974.vacompanion_preferences.xml \
  shared_prefs/com.msp1974.vacompanion_preferences.xml.auth-backup-YYYYMMDD-HHMMSS
```

### 3. Remove only OAuth credentials

```bash
adb -s DEVICE shell \
  "run-as com.msp1974.vacompanion sed -i \
  -e '/auth_token/d' \
  -e '/refresh_token/d' \
  -e '/token_expiry/d' \
  shared_prefs/com.msp1974.vacompanion_preferences.xml"
```

Verify key names only. Do not display the XML or any values:

```bash
adb -s DEVICE shell \
  "run-as com.msp1974.vacompanion grep -o 'name=\"[^\"]*\"' \
  shared_prefs/com.msp1974.vacompanion_preferences.xml"
```

Required result:

- `paired_device_id` is still listed.
- `auth_token`, `refresh_token`, and `token_expiry` are not listed.

### 4. Re-enable VACA and authorize once

```bash
adb -s DEVICE shell pm enable com.msp1974.vacompanion
adb -s DEVICE shell am start \
  -n com.msp1974.vacompanion/.MainActivity
```

Unlock the display if necessary. VACA should open Home Assistant's OAuth login
page and identify the client as `https://vaca.homeassistant`.

On the device itself:

1. Enter the normal Home Assistant username and password.
2. Tap **Log in**.
3. Approve access if prompted.
4. Do not select **Clear Paired Device**.

Successful authorization replaces the invalid OAuth credentials while leaving
the VACA pairing intact.

## Verification

Verify without exposing token values:

- `refresh_token` exists again in VACA's private preferences.
- `paired_device_id` is still present.
- The configured dashboard loads over `https://housevoice.duckdns.org`.
- The Home Assistant WebSocket is connected.
- The expected Walkie resource build is loaded.
- No new invalid `/auth/token` warning appears for that startup.

Then perform three genuine cold starts. Because VACA's foreground service can
restart itself, confirm the old PID is gone before counting a test as cold. Each
start must authenticate without manual token injection and load the dashboard.

After successful verification, delete the private on-device backup by its exact
name. Do not use a wildcard:

```bash
adb -s DEVICE shell run-as com.msp1974.vacompanion \
  rm shared_prefs/com.msp1974.vacompanion_preferences.xml.auth-backup-YYYYMMDD-HHMMSS
```

## Rollback

Rollback is only for an accidental preference edit. It restores the invalid
credential too, so it is not the normal recovery path.

1. Disable VACA and confirm no PID.
2. Copy the exact private backup over the preferences file.
3. Re-enable and launch VACA.

Never restore or move a preference file between different VACA devices.

## Proposed VACA code correction

A code-level improvement is practical, but it must be reviewed, built, and
approved before replacing an APK.

The recommended behavior is:

1. Return a structured refresh result that distinguishes a confirmed rejected
   refresh credential from DNS, TLS, timeout, and server errors.
2. Only enter reauthorization after a confirmed token rejection. Do not delete
   credentials for generic connectivity failures.
3. Notify the Home Assistant frontend through
   `externalAuthSetToken(false)` when refresh fails.
4. Present the normal Home Assistant OAuth page and replace credentials only
   after successful authorization. Never hardcode or inject a token.
5. Preserve `paired_device_id` and every unrelated setting.
6. Remove the existing log statement that prints part of the refresh token.
7. Fix `CustomWebViewClient.shouldOverrideUrlLoading` so it returns `true` only
   for URLs VACA actually handles; ordinary Home Assistant/OAuth navigation
   should return `false`.
8. Correct the two-minute expiry margin from 120 milliseconds to 120,000
   milliseconds.

This proposed change should also include tests for valid refresh, confirmed
rejection, temporary network failure, abandoned login, successful OAuth return,
and preservation of pairing.

## Recurrence assessment

The Parents incident was a stale or revoked credential, not a general HOUSEVOICE
or HTTPS failure. The repaired credential is currently valid, so this is best
classified as a one-time credential incident.

It can recur if Home Assistant revokes that refresh token, the associated user
or refresh-token record is removed, a backup restores mismatched app data, or a
future VACA/HA authentication change invalidates it. VACA 0.13.4 handles that
case poorly, so the documented recovery remains necessary until an approved APK
contains the proposed error handling.
