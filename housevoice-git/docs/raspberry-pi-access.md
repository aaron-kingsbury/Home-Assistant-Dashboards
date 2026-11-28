# HouseVoice Raspberry Pi Access

Last verified: 2026-11-28

## Identity

- Hostname: `housevoice`
- Hardware: Raspberry Pi 3 Model B Rev 1.2
- Operating system: Debian GNU/Linux 13 (trixie)
- Architecture: `aarch64`
- Address: `192.168.50.20`
- Ethernet MAC: `B8:27:EB:60:6B:C0`
- SSH user: `pi`
- SSH port: `22`

The ER605 has a permanent DHCP assignment for this address.

## OpenCode connection

OpenCode uses a dedicated ED25519 identity stored in persistent add-on storage:

- SSH config: `/data/housevoice-ssh/config`
- Private identity: `/data/housevoice-ssh/housevoice_pi_ed25519`
- Public identity: `/data/housevoice-ssh/housevoice_pi_ed25519.pub`
- Known hosts: `/data/housevoice-ssh/known_hosts`

Connect with:

```bash
ssh -F /data/housevoice-ssh/config housevoice-pi
```

The configuration requires the dedicated identity and strict host-key
verification. Do not copy the private identity into this repository.

## Fingerprints

- Pi ED25519 host key:
  `SHA256:gs+GjaL0LXkWkmCs96XfLV9RdzrGhZN5L5cIts80QUM`
- OpenCode client public key:
  `SHA256:1j/GXVkR3nIvEK/rjXD7iHh3zQ9hZSskSkqOl6UDwP0`

If the Pi host-key fingerprint changes, stop and verify why before updating
`known_hosts`.

## Purpose

This Pi is a HouseVoice kiosk display and the always-on ADB/CDP management host
for the three Echo displays. The graphical session starts
`/home/pi/start-housevoice.sh`, which waits for Home Assistant and keeps Chromium
running in kiosk mode on:

`http://192.168.50.10:8123/housevoice-standby/Standby/?kiosk`

The autostart entry is:

`/home/pi/.config/autostart/housevoice.desktop`

Other identified content includes `/home/pi/dashboard-test` and the
`/home/pi/LCD-show` display-driver repository.

The enabled user service
`/home/pi/.config/systemd/user/housevoice-adb-recovery.service` manages the
three allowlisted Echo ADB transports and loopback-only CDP forwards. See
[`housevoice-pi-adb-management.md`](housevoice-pi-adb-management.md).

## Security constraints

- Keep host-key verification enabled.
- Do not enable SSH root login.
- Do not configure passwordless sudo.
- Do not expose or commit the private key.
- Do not modify Pi services or packages without separate approval.
- `/data/housevoice-ssh` persists across OpenCode add-on restarts.
