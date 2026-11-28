# HouseVoice Raspberry Pi Backup and Recovery

## Architecture

The Raspberry Pi sends client-side encrypted Restic snapshots directly to the
Dell Home Assistant host. No temporary archive is created on the Pi.

- Receiver app: `43045035_housevoice_rest_server`
- Repository: `/share/housevoice-pi-backups/repository`
- Restic endpoint: `https://192.168.50.10:8443/repo/`
- Read-only status: `https://192.168.50.10:8444/status.json`
- Transport: mutual TLS restricted to the HouseVoice Pi client certificate
- Repository mode: append-only for the Pi
- Repository cap: 30 GiB
- Minimum Home Assistant free space: 100 GiB
- Backup schedule: daily at 03:00 America/New_York
- Retention: all snapshots for 6 months, with at least 14 daily, 8 weekly, and
  6 monthly recovery points
- Verification: weekly metadata check and monthly full-data check

The receiver performs retention and verification locally. The Pi cannot prune
or delete prior recovery points.

## Pi Files

Sensitive live files, excluded from Git:

- `/home/pi/.config/housevoice-backup/client-ca.key`
- `/home/pi/.config/housevoice-backup/client-ca.crt`
- `/home/pi/.config/housevoice-backup/client.key`
- `/home/pi/.config/housevoice-backup/client.crt`
- `/home/pi/.config/housevoice-backup/client.pem`
- `/home/pi/.config/housevoice-backup/server-ca.crt`
- `/home/pi/.config/housevoice-backup/repository-passphrase`

Credential-free files tracked in `infra/housevoice-pi/`:

- `housevoice-backup`
- `housevoice-backup.excludes`
- `housevoice-backup.service`
- `housevoice-backup.timer`

The Restic binary is Debian's signed arm64 package extracted without root under
`/home/pi/.local/opt/restic`, with
`/home/pi/.local/bin/restic` pointing to it.

## Coverage

Each snapshot includes:

- `/home/pi`, including HouseVoice services, monitoring data, SSH material,
  ADB keys, browser profile, and backup client credentials
- Readable `/etc` configuration, excluding root-only password, private host key,
  sudoers, private TLS, and NetworkManager secret files
- `/boot/firmware`
- Generated package, service, mount, block-device, network, OS, and crontab
  manifests under `/home/pi/.local/state/housevoice-backup/manifests`

Caches, browser caches, trash, and volatile X session logs are excluded.

## Operations

```bash
systemctl --user status housevoice-backup.timer
systemctl --user list-timers housevoice-backup.timer --all
systemctl --user start housevoice-backup.service
systemctl --user status housevoice-backup.service
cat ~/.local/state/housevoice-backup/status.json
```

The Pi graphical kiosk session logs in as `pi`, which starts the user manager.
User lingering remains disabled.

## Restore Test

Use a temporary directory on the Pi or another trusted Linux host:

```bash
export RESTIC_REPOSITORY="rest:https://192.168.50.10:8443/repo/"
export RESTIC_PASSWORD_FILE="$HOME/.config/housevoice-backup/repository-passphrase"
export RESTIC_CACERT="$HOME/.config/housevoice-backup/server-ca.crt"
export RESTIC_TLS_CLIENT_CERT="$HOME/.config/housevoice-backup/client.pem"

restore_dir="$(mktemp -d)"
restic restore latest \
  --include "/home/pi/.config/systemd/user/housevoice-adb-recovery.service" \
  --include "/home/pi/.android/adbkey.pub" \
  --target "${restore_dir}"
```

Verify file content, ownership, mode, and timestamps, then securely remove the
temporary restore directory.

## SD Card Recovery

1. Install Debian arm64 and restore the `pi` graphical kiosk login.
2. Restore the Pi address reservation at `192.168.50.20`.
3. Restore the small HouseVoice backup client credential set from approved
   secure recovery storage. Never place it in Git or send it unencrypted.
4. Extract Debian's arm64 `restic` package under
   `/home/pi/.local/opt/restic` and recreate the local binary symlink.
5. Export the four Restic environment variables shown above and run
   `restic snapshots`.
6. Restore the latest snapshot to a staging directory.
7. Reinstall required Debian packages from `packages.tsv`.
8. Restore `/home/pi`, the reviewed `/etc` files, and `/boot/firmware` with
   their recorded ownership and permissions.
9. Restore the credential-free units from Git if needed, run
   `systemctl --user daemon-reload`, and enable the HouseVoice services and
   backup timer.
10. Reboot and validate SSH, all three ADB transports, Wyoming, CDP targets,
    the monitoring service, and the next incremental backup.

The live Pi credential set and the receiver app's private data are the current
recovery-material sources. Exporting an additional independently stored copy is
still required before claiming recovery from simultaneous Pi and Home Assistant
loss; external/family storage is intentionally on hold.
