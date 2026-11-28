# HouseVoice Pi Management Files

These files are credential-free recovery copies of the live Pi management
configuration:

- `housevoice-adb` → `/home/pi/.local/bin/housevoice-adb` (`0755`)
- `housevoice-adb-recovery` →
  `/home/pi/.local/libexec/housevoice-adb-recovery` (`0755`)
- `housevoice-adb-recovery.service` →
  `/home/pi/.config/systemd/user/housevoice-adb-recovery.service` (`0644`)
- `opencode-browser-tunnel` →
  `/data/chrome-devtools-mcp/opencode-browser-tunnel` (`0755`)
- `20-chrome-devtools-tunnel.sh` →
  `/homeassistant/opencode/startup.d/20-chrome-devtools-tunnel.sh` (`0755`)

They contain no ADB private key, SSH key, password, token, or Wi-Fi credential.
See `docs/housevoice-pi-adb-management.md` for dependencies and restoration.
