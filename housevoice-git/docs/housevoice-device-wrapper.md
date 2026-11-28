# HouseVoice Restricted Device Wrapper

## Purpose

`housevoice-adb` is the forced-command boundary between OpenCode and the three
HouseVoice Android displays. It provides bounded, auditable operations without
granting an interactive shell, arbitrary ADB commands, unrestricted Mac
commands, credential access, or private application-data access.

## Current Architecture

This Mac wrapper and its disabled LaunchAgent are retained for rollback only.
Active ADB/CDP management moved to the always-on HouseVoice Pi at
`192.168.50.20` on 2026-11-28. Do not enable the Mac LaunchAgent while the Pi
service is active. See
[`housevoice-pi-adb-management.md`](housevoice-pi-adb-management.md).

## Security Model

- Devices are selected only by `parents`, `cora`, or `graham` and map to fixed
  serials, addresses, and loopback-only CDP ports.
- Every operation validates its argument count, type, range, and fixed choices.
- Commands execute with bounded timeouts and append result metadata to a
  mode-0600 operations log.
- Wi-Fi passwords, PSKs, tokens, authorization headers, private preferences,
  databases, WebView storage, and arbitrary files are never returned.
- Diagnostic log output omits lines that may contain credentials or tokens.
- CDP output is limited to target identity, title, URL, readiness, and connection
  state. It never returns storage, cookies, headers, or token values.
- Reversible settings changes save prior values under the wrapper's private
  state directory before applying. A matching rollback operation is required.
- Application-data backup and APK replacement are intentionally not exposed.
  Their feasibility can be checked without reading private contents.

## Command Groups

### Inventory and diagnostics

- `help`
- `status DEVICE|all`
- `baseline DEVICE|all`
- `android-info DEVICE`
- `settings DEVICE`
- `process DEVICE`
- `diagnostics DEVICE [100-5000]`
- `collect DEVICE [100-5000]`

### Network and Wi-Fi

- `wifi DEVICE`
- `wifi-preflight DEVICE`
- `wifi-scan DEVICE`
- `wifi-monitor DEVICE [30-1800] [2-60]`
- `reachability-monitor DEVICE [30-1800] [2-60]`
- `wyoming-handshake DEVICE`
- `wifi-cycle DEVICE [5-30]`
- `wifi-band DEVICE auto|2.4|5 preview|apply`
- `wifi-band-rollback DEVICE apply`
- `wifi-pin DEVICE BSSID|any preview|apply`
- `wifi-pin-rollback DEVICE apply`

`wifi-pin` is available only when the ROM exposes a working `wpa_cli` control
interface. It never accepts or reads a PSK. Unsupported controls fail closed.

### VACA, WebView, ADB, and CDP

- `vaca-state DEVICE`
- `vaca-restart DEVICE`
- `webview-state DEVICE`
- `webview-recover DEVICE`
- `cdp DEVICE`
- `apk-info DEVICE`
- `apk-export DEVICE`
- `data-preflight DEVICE`

### Controlled testing

- `reboot DEVICE`
- `reboot-test DEVICE [30-900]`
- `acceptance DEVICE [30-1800]`

Acceptance output reports only remotely observable facts. Physical display,
audio, and cold-boot results remain explicit human gates.

## Rollback

Each wrapper installation creates a timestamped adjacent backup before replacing
the active file. Syntax is checked before the atomic replacement. On failure,
the installer restores the backup automatically.

Device setting changes are never inferred from a failed SSH result. Read-back is
required. `wifi-band-rollback` and `wifi-pin-rollback` use the prior value stored
before apply; missing or ambiguous rollback state fails closed.
