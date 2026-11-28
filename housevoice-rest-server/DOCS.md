# HouseVoice Restic Receiver

This app is a dedicated receiver for the HouseVoice Raspberry Pi disaster
recovery repository.

## Security

- The app can access only Home Assistant's `/share` directory.
- Restic traffic requires the pinned HouseVoice Pi client certificate.
- The network receiver is append-only.
- Restic encrypts all backup contents before they leave the Pi.
- The repository is capped at 30 GiB by default.
- Backups stop when Home Assistant free space falls below 100 GiB.
- No shell, SFTP, Samba, Docker API, host devices, or Supervisor API is exposed.

Port `8443` accepts mutual-TLS Restic traffic. Port `8444` provides only the
server certificate, health response, and non-sensitive backup status.

The app stores its generated TLS key and Restic passphrase in its private app
data. The passphrase must also be exported to independent secure storage.

## Maintenance

The app performs retention and metadata verification each Sunday at 04:00.
Full repository data verification runs on the first day of each month at 05:00.

Retention:

- All snapshots from the most recent 6 months as append-only safety history
- 14 daily snapshots
- 8 weekly snapshots
- 6 monthly snapshots
