# HouseVoice Pi ADB/CDP Management

## Architecture

HouseVoice ADB and Chrome DevTools Protocol management runs on the always-on
Raspberry Pi at `192.168.50.20`. The Mac LaunchAgent is disabled and retained
only for rollback. OpenCode reaches the Pi's loopback-only CDP forwards through
its existing persistent SSH tunnel.

Fixed device assignments:

| Display | ADB serial | Wyoming | Pi CDP port | OpenCode port |
|---|---|---|---|---|
| Parents | `192.168.50.29:5555` | `192.168.50.29:10800` | `9222` | `9223` |
| Cora | `192.168.50.30:5555` | `192.168.50.30:10800` | `9225` | `9225` |
| Graham | `192.168.50.31:5555` | `192.168.50.31:10800` | `9226` | `9226` |

ADB port `5037` and all CDP ports listen only on `127.0.0.1`.

## Pi Files

- ADB launcher: `/home/pi/.local/bin/housevoice-adb`
- Recovery loop: `/home/pi/.local/libexec/housevoice-adb-recovery`
- User service:
  `/home/pi/.config/systemd/user/housevoice-adb-recovery.service`
- State directory: `/home/pi/.local/state/housevoice-adb`
- Existing ADB key: `/home/pi/.android/adbkey`
- Debian package extraction:
  `/home/pi/.local/opt/housevoice-adb-debian`

The ADB key and all credentials are deliberately excluded from Git.

Credential-free copies of the launcher, recovery loop, service unit, OpenCode
tunnel manager, and startup hook are in `infra/housevoice-pi/`.

## Dependencies

The Pi uses Debian 13's signed arm64 ADB package, version
`1:34.0.5-12`, extracted into the user-owned directory above because the Pi
correctly requires an interactive password for `sudo`.

Extracted packages:

- `adb`
- `android-libbase`
- `android-libboringssl`
- `android-libcutils`
- `android-liblog`
- `android-libziparchive`

Runtime libraries supplied by the OS include Brotli, LZ4, protobuf, libusb,
zstd, glibc, libgcc, and libstdc++.

## Startup and Recovery

The service is enabled under the `pi` user's `default.target`:

```bash
systemctl --user enable --now housevoice-adb-recovery.service
```

The Pi's graphical kiosk session logs in as `pi`, which starts the enabled user
service. User lingering remains disabled. The service starts its loopback ADB
server, authenticates only the three fixed serials, preserves healthy
transports and CDP forwards, and checks for recovery every 30 seconds.

Useful commands:

```bash
ssh -F /data/housevoice-ssh/config housevoice-pi
systemctl --user status housevoice-adb-recovery.service
systemctl --user restart housevoice-adb-recovery.service
journalctl --user -u housevoice-adb-recovery.service --no-pager
~/.local/bin/housevoice-adb devices -l
ss -lnt | grep -E ':(5037|9222|9225|9226)\b'
curl -fsS http://127.0.0.1:9222/json/list
```

OpenCode tunnel files:

- Manager: `/data/chrome-devtools-mcp/opencode-browser-tunnel`
- Startup hook:
  `/homeassistant/opencode/startup.d/20-chrome-devtools-tunnel.sh`
- Pi SSH configuration: `/data/housevoice-ssh/config`

Test or inspect the startup hook:

```bash
ha-hooks run 20-chrome-devtools-tunnel.sh
ha-hooks log 20-chrome-devtools-tunnel.sh
```

Keep OpenCode **Startup hooks** enabled. Turning that option off disables every
hook, including the CDP tunnel.

## SD Card Recovery

If the Pi's SD card fails:

1. Reinstall Debian arm64 and restore the `pi` graphical kiosk login.
2. Restore the ER605 reservation for Pi Ethernet MAC
   `B8:27:EB:60:6B:C0` at `192.168.50.20`.
3. Restore the kiosk and monitoring services independently.
4. Download the Debian packages listed above with `apt download`, extract them
   under `/home/pi/.local/opt/housevoice-adb-debian`, and verify:

   ```bash
   LD_LIBRARY_PATH="$HOME/.local/opt/housevoice-adb-debian/root/usr/lib/aarch64-linux-gnu/android" \
     "$HOME/.local/opt/housevoice-adb-debian/root/usr/bin/adb" version
   ```

5. Restore the three credential-free files from `infra/housevoice-pi/` to their
   documented locations and permissions.
6. Securely restore the existing Mac ADB key pair into `/home/pi/.android/`.
   Never send it unencrypted, place it in Git, or generate a replacement.
7. Set directory mode `0700` and key-file modes `0600`.
8. Run `systemctl --user daemon-reload`, then enable and start the service.
9. Verify all three devices, loopback listeners, CDP page targets, and the
   OpenCode tunnel.

The disabled Mac files remain a rollback source. Do not enable the Mac
LaunchAgent while the Pi manager is active because two ADB managers can compete
for the same devices.

## Acceptance Evidence

On 2026-11-28:

- Controlled Pi service restart restored all three CDP targets in 3.1 seconds.
- A 30-minute Pi-only test ran with the Mac lid closed.
- The Pi and each Echo passed 360 of 360 samples.
- Ping, Pi SSH, ADB TCP, Wyoming, Wyoming identity, CDP, and expected dashboard
  targets recorded zero failures and zero transitions.
- Actual-device screenshots showed the Parents, Cora, and Graham dashboards
  rendered correctly after split DNS was restored.

Evidence log:
`/data/v2/cache/opencode/housevoice-pi-final-acceptance-20261128.jsonl`.
