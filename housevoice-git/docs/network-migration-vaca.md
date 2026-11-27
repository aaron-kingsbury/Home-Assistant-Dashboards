# HouseVoice VACA Network Migration and Recovery

Last verified: November 27, 2026
Environment: Home Assistant 2026.11.0, VACA integration/application 0.13.5,
TP-Link ER605 LAN `192.168.50.0/24`

## Purpose

This is the known-good recovery for VACA devices that become unreachable after
a router replacement, DHCP change, or house move. Start here before deleting an
integration, clearing VACA data, resetting a tablet, or pairing a device again.

This incident was a stale endpoint problem, not a Home Assistant URL,
DuckDNS/TLS, dashboard, authentication, or Walkie failure.

## November 26–27, 2026 reliability incident

After the restored ER605 configuration came online, the displays had no durable
DHCP reservations. The UniFi/ADB Mac's old reservation referenced a retired
private Wi-Fi address, so the Mac occupied the Parents address while VACA and
ADB retained stale endpoints.

The verified reservation map is:

| Role | Fixed address | MAC address |
|---|---|---|
| UniFi/ADB Mac | `192.168.50.15` | `E6:CD:DB:C4:9C:65` |
| Parents | `192.168.50.29` | `14:0A:C5:41:68:B4` |
| Cora | `192.168.50.30` | `90:A8:22:EC:01:22` |
| Graham | `192.168.50.31` | `80:6D:71:7C:0C:BF` |

The Mac is `Aarons-MacBook-Air.local`. For the **HouseVoice** SSID only, macOS
reports **Private Wi-Fi Address: Fixed** and the address above. It remained
unchanged across the coordinated restart and repeatedly received
`192.168.50.15`. Do not disable private addressing or change privacy settings
for unrelated networks.

### VACA endpoint reload fix

Zeroconf already updated an existing VACA config entry's saved endpoint, but
`custom_components/vaca/config_flow.py` passed `reload_on_update=False`.
Consequently, the stored address changed while the loaded integration kept its
old socket until a manual reload or Core restart.

The durable correction is:

```python
self._abort_if_unique_id_configured(
    updates={CONF_HOST: host, CONF_PORT: port},
    reload_on_update=True,
)
```

The original file is retained at
`/homeassistant/backups/vaca-config-flow-before-zeroconf-reload-20261127T020825Z.py`.
Python compilation and full Home Assistant configuration validation passed
before the approved Core restart. Parents and Cora then followed their reserved
address changes automatically without deleting or recreating their entries.

After the restart, Parents and Cora each passed 60 five-second checks with zero
ADB TCP failures, zero Wyoming failures, and the correct VACA identity. Graham
initially appeared at its reserved address but later stopped answering ARP,
ping, ADB, and Wyoming; that is a device Wi-Fi recovery failure, not a stale
Home Assistant endpoint.

### UniFi and ADB/DevTools management

The UniFi Network application on the Mac recovered after a delayed launch and
listened at `192.168.50.15:11443`. Home Assistant's existing UniFi entry still
contained the retired `.34` host and requires local reconfiguration with the
existing controller password; credentials are not recorded here.

The persistent OpenCode SSH/CDP tunnel manager was also still targeting `.34`.
Its target was corrected to `.15` while preserving the pinned SSH host identity,
forced-command key, and loopback-only CDP ports. The Mac's restricted SSH key
intentionally permits only the approved CDP destinations. It does not permit
forwarding to the Mac ADB server on port 5037.

The Mac ADB server retained three offline transports after restart. The
restricted wrapper exposes diagnostics and device operations but no bounded
`adb disconnect`/`adb connect` recovery operation. OpenCode's older direct ADB
binary still exists, but its prior authorization key did not survive and the
devices correctly reject its newly generated key. Permanent unattended ADB/CDP
recovery therefore requires adding an audited reconnect operation to the
existing Mac wrapper or an equivalent Mac launch agent; do not install a second
parallel ADB service.

## October 26, 2026 incident

After the SonicWall TZ205 was replaced by a TP-Link ER605, all three VACA config
entries reported:

```text
Failed setup, will retry: Unable to connect
```

The displays showed `Waiting for connection`. Home Assistant could establish
TCP connections to the current VACA addresses, and each device completed the
full Wyoming handshake, but the existing config entries still contained DHCP
addresses assigned before the router replacement.

| Room | Device ID | Saved old endpoint | Working endpoint |
|---|---|---|---|
| Graham | `96ed4d2c4` | `192.168.50.152:10800` | `192.168.50.31:10800` |
| Cora | `c958413a0` | `192.168.50.176:10800` | `192.168.50.30:10800` |
| Parents | `a2fc97a76` | `192.168.50.146:10800` | `192.168.50.29:10800` |

The three existing Home Assistant config entry IDs were preserved:

| Room | Config entry ID | Original source |
|---|---|---|
| Cora | `01KZYFWBZYVA35KPXVARPGD4BD` | User |
| Graham | `01M12PK46F0BBMGF8HEE97JEVQ` | Zeroconf |
| Parents | `01M499KRWCVCGHFZXFNMX8NX3Z` | Zeroconf |

## Why changing the Home Assistant URL did not help

VACA setup begins in `custom_components/vaca/__init__.py`, where
`async_setup_entry` passes the config entry's saved `host` and `port` to
`VAWyomingService.create`.

`custom_components/vaca/data.py` then performs this raw TCP exchange:

1. Connect to the saved VACA endpoint.
2. Send Wyoming `describe`.
3. Wait for Wyoming `info`.
4. Send the VACA `capabilities` event.
5. Wait for a `capabilities` response.

Timeouts, socket errors, and premature connection closure are collapsed into
the generic `Unable to connect` setup error. The Home Assistant URL is sent to
the display later, after setup and the satellite connection succeed. Therefore,
changing between `http://192.168.50.10:8123` and
`https://housevoice.duckdns.org` cannot repair a failure in this initial TCP
handshake.

The installed 0.13.5 Zeroconf flow recognized the existing device identity but
did not update the existing entry's saved endpoint when its IP changed. The
manual Cora entry also had no Host/Port fields in its Options form.

## Read-only diagnosis

### Basic TCP check

The original Graham check was:

```bash
curl -v http://192.168.50.31:10800/
```

A TCP connection followed by curl's HTTP/0.9 error is expected. Port 10800 is a
Wyoming protocol socket, not an HTTP server.

### Complete Wyoming handshake

Use the complete exchange rather than treating a successful TCP connect as
proof that setup will work:

```bash
python3 - <<'PY'
import json
import socket


def read_exact(stream, length):
    data = b""
    while len(data) < length:
        chunk = stream.read(length - len(data))
        if not chunk:
            raise EOFError("Connection closed during Wyoming frame")
        data += chunk
    return data


def read_event(stream):
    header = json.loads(stream.readline())
    length = int(header.get("data_length", 0) or 0)
    data = json.loads(read_exact(stream, length)) if length else None
    return header, data


devices = {
    "192.168.50.31": "VACA 96ed4d2c4",
    "192.168.50.30": "VACA c958413a0",
    "192.168.50.29": "VACA a2fc97a76",
}

for host, expected_name in devices.items():
    with socket.create_connection((host, 10800), timeout=3) as sock:
        sock.settimeout(3)
        stream = sock.makefile("rb")

        sock.sendall(b'{"type":"describe"}\n')
        header, data = read_event(stream)
        actual_name = ((data or {}).get("satellite") or {}).get("name")
        assert header.get("type") == "info"
        assert actual_name == expected_name

        sock.sendall(b'{"type":"capabilities"}\n')
        header, data = read_event(stream)
        assert header.get("type") == "capabilities"
        assert isinstance(data, dict)

        print(f"{expected_name} {host}:10800: full handshake valid")
PY
```

On October 26, this succeeded for all three current endpoints and returned the
expected VACA device identity from each address.

### Confirm the endpoint saved by Home Assistant

Home Assistant's supported config-entry APIs intentionally omit private entry
data such as `host` and `port`. Do not inspect or edit `.storage` directly.

For this incident, a temporary one-shot warning in
`custom_components/vaca/__init__.py` logged only entry title, entry ID, host, and
port immediately before `VAWyomingService.create`. It revealed the three old
addresses above. The diagnostic was removed after collection, and
`__init__.py` was restored byte-for-byte.

## Recovery implemented

The existing entries were updated in place through
`hass.config_entries.async_update_entry`; nothing was deleted or recreated.
Each replacement endpoint completed the full Wyoming handshake before its entry
was changed.

The following VACA files were changed:

- `custom_components/vaca/config_flow.py`
  - Adds Host and Port to the existing Options flow.
  - Calls `VAWyomingService.create(host, port)` before saving. That method
    requires both valid `info` and `capabilities` responses.
  - Updates entry data through `hass.config_entries.async_update_entry`.
  - Updates an existing Zeroconf entry when its endpoint changes.
  - Adopts a matching legacy manual entry by stable VACA name instead of
    offering a duplicate.
- `custom_components/vaca/strings.json`
  - Adds Host, Port, and connection-error text for the Options form.
- `custom_components/vaca/translations/en.json`
  - Adds the corresponding English labels and error text.

`custom_components/vaca/__init__.py` was used temporarily to apply the three
validated endpoint corrections by exact config entry ID during one controlled
restart. That temporary mapping was removed after all entries loaded, and the
file was restored byte-for-byte. It is not part of the permanent fix.

Before editing, the integration was archived with:

```bash
tar --exclude='__pycache__' -czf \
  /homeassistant/backups/vaca-0.13.5-before-endpoint-fix-20261026-173505.tar.gz \
  -C /homeassistant custom_components/vaca
sha256sum \
  /homeassistant/backups/vaca-0.13.5-before-endpoint-fix-20261026-173505.tar.gz
```

Recorded archive SHA-256:

```text
b9b543e79d5c6d3931a93ca35382fb993d4891a667ff88ee32067c30140484f2
```

The archive is intentionally excluded from Git by the repository's
`backups/` rule.

## Validation and result

Before restart:

- Python source was compiled in memory with `compile(...)`; no `.pyc` was
  written.
- `strings.json` and `translations/en.json` were parsed with `json.loads`.
- The complete Wyoming handshake and device identity passed for every new
  endpoint.
- Home Assistant's full configuration validation returned valid with no
  warnings.
- The diff was reviewed against the archive because the HACS VACA directory was
  untracked by this repository.

After the approved Home Assistant Core restart:

- All three original VACA config entries reported `loaded` with no setup
  reason.
- All three original `assist_satellite.vaca_*` entities reported `idle`.
- No new VACA setup error appeared.
- Graham, Cora, and Parents reconnected without resetting or pairing again.
- Walkie was tested successfully after recovery.

No config entry ID, Home Assistant device, entity, dashboard, automation,
View Assist configuration, or HouseVoice Walkie configuration was replaced.

## Repeat recovery procedure

1. Record the current display IPs and expected device IDs.
2. Run the complete Wyoming handshake against every proposed `host:port`.
3. Confirm the failing config entries are preserving old endpoints. Use a
   temporary non-sensitive one-shot setup log if necessary; never read or edit
   `.storage`.
4. In Home Assistant, open the existing VACA entry's **Configure/Options** form.
5. Enter the validated Host and Port. The patched flow refuses to save if the
   complete VACA handshake fails.
6. Preserve the existing Home Assistant URL option unless there is independent
   evidence that it is wrong.
7. Verify the same entry ID changes to `loaded` and the existing Assist
   Satellite entity becomes `idle`.
8. Test its dashboard, voice pipeline, and Walkie in both directions.
9. Only investigate DNS, HTTPS, callbacks, or authentication if the initial
   Wyoming connection is already successful and the later feature fails.

Do not begin by deleting the VACA integration, clearing Android app storage,
selecting **Clear Paired Device**, reinstalling VACA, or rebuilding dashboards
and automations. Those actions do not repair a stale Home Assistant endpoint and
can destroy otherwise valid pairing and project state.

## New-house migration checklist

### Addressing and DHCP

- Keep the `192.168.50.0/24` LAN if practical.
- Keep Home Assistant at `192.168.50.10` if practical.
- Add ER605 DHCP reservations for:
  - Graham: `192.168.50.31`
  - Cora: `192.168.50.30`
  - Parents: `192.168.50.29`
- Verify each reservation against the actual device identity before relying on
  it. Do not infer identity from an address alone.

### Home Assistant and internet edge

- Verify Home Assistant locally at `192.168.50.10:8123`.
- Verify LAN DNS and the intended split-DNS behavior for
  `housevoice.duckdns.org`.
- Verify DuckDNS resolution, HTTPS certificate behavior, reverse proxying, and
  Home Assistant WebSocket connectivity.
- Verify only the intended ER605 port-forwarding rules.
- Test WAN behavior after removing the RNR corporate network path from the
  topology; do not assume its DNS, NAT, or routing behavior still exists.

### VACA and HouseVoice

- Confirm the saved VACA Host and Port in each existing entry.
- Run the complete Wyoming handshake against all three reserved addresses.
- Verify each original entry is `loaded` and each Assist Satellite is `idle`.
- Load each room dashboard and test its voice pipeline.
- Run Walkie calls in all six room-to-room directions and at least one repeat
  call before declaring the move complete.

## Maintenance risk

VACA is installed through HACS, and a future VACA update may overwrite the
local `config_flow.py`, `strings.json`, and translation changes. After every
VACA update, confirm that its Options flow still exposes Host and Port and that
Zeroconf updates an existing entry rather than creating or ignoring a stale
one. Reapply or upstream the fix if those behaviors disappear.

This documentation records the recovery; it does not include credentials,
tokens, private app preferences, or contents from Home Assistant internal
storage.
