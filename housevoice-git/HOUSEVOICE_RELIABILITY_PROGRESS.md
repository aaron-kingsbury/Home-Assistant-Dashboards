# HouseVoice Reliability Project

Last updated: November 27, 2026

## Objective

Resolve startup, authentication, reconnection, and network reliability for the
Parents, Cora, and Graham HouseVoice displays while preserving VACA 0.13.5,
existing pairings, Home Assistant config entries, entities, dashboards, Walkie,
Parents Music v7, and the Parents automatic day/night design.

## Execution Loop

1. Diagnose with bounded evidence.
2. Plan the smallest reversible correction.
3. Implement within the standing authorization.
4. Test the affected failure domain independently.
5. Evaluate against explicit acceptance criteria.
6. Correct failures without broadening scope speculatively.
7. Repeat until automated acceptance passes, then request only unavoidable
   physical confirmation.

## Safety Boundaries

- Keep the VACA integration and application at version 0.13.5.
- Preserve all pairings, config-entry IDs, devices, entities, dashboards,
  automations, and Walkie configuration.
- Do not change the production SSID, router, DHCP, credentials, or unrelated
  devices during the Parents investigation.
- Do not clear application data, uninstall VACA, or replace its APK unless a
  credential-safe backup and restore has been proven and the data-risk boundary
  has been explicitly approved.
- Keep Mac SSH access forced-command-only and CDP forwards loopback-only.
- Never expose Wi-Fi credentials, Home Assistant tokens, private application
  contents, or unrestricted shell access.
- Do not claim unobserved audio, screen, or physical cold-boot results.

## Device Map

| Room | Address | Device ID | Platform | CDP port |
|---|---|---|---|---|
| Parents | `192.168.50.29` | `a2fc97a76` | crown | `9222` |
| Cora | `192.168.50.30` | `c958413a0` | cronos | `9225` |
| Graham | `192.168.50.31` | `96ed4d2c4` | cronos | `9226` |

## Confirmed Evidence

### Parents network

- ADB port 5555 and Wyoming port 10800 fail together during outages, proving
  whole-device Wi-Fi loss rather than an isolated VACA process failure.
- Android repeatedly produces locally generated disconnects with `reason=3`
  while associated to 5 GHz BSSID `06:ec:da:d2:d2:cd`.
- The 2.4 GHz BSSID `02:ec:da:d2:d2:ce` is consistently stronger.
- Android briefly roams to 2.4 GHz, then deliberately returns to 5 GHz because
  its network selector assigns the 5 GHz candidate a higher predicted score.
- The saved `HouseVoice` network is WPA2, network ID 0, with no persisted BSSID
  shown by the supported read-only interfaces.
- `wifi_frequency_band` is unset, scan-always is disabled, and Wi-Fi sleep policy
  is already `never`.
- The comprehensive restricted wrapper was installed and validated. Invalid
  devices and arbitrary shell operations are refused.
- A reversible `wifi_frequency_band=2` test saved and read back successfully but
  did not change association: after a controlled Wi-Fi restart Parents
  immediately rejoined the same 5 GHz BSSID. The setting was rolled back to
  unset, so no inert device configuration remains.
- This ROM does not expose `wpa_cli`. Its supported `cmd wifi` interface can pin
  a BSSID only by rewriting the WPA2 network with its passphrase, which is a
  credential boundary. The user applied that pin locally without exposing the
  passphrase. Android stored BSSID `02:ec:da:d2:d2:ce`, but retained the existing
  5 GHz association until a controlled Wi-Fi restart.
- After that restart, Parents did not reconnect on either ADB or Wyoming. Cora
  confirmed the target 2.4 GHz BSSID was live at -63 dBm with a fresh scan. A
  bounded scan of the local `/24` found only Cora and Graham on ports 5555 and
  10800, ruling out a simple Parents DHCP-address change.
- A five-minute baseline recorded a complete simultaneous ADB/Wyoming outage,
  then a later shorter interval where Wyoming recovered before wireless ADB.

### WebView authentication

- Parents CDP reports the live `Parent's Room - Home Assistant` page at
  `/parents-room/parents-room`, not OAuth, initialization, or retry.
- WebView authentication and device reachability remain separate failure
  domains.

### Wyoming lifecycle

- Parents re-established a persistent Wyoming session after a Wi-Fi outage.
- Cora lost its persistent session and did not replace it while short-lived
  coordinator probes continued.
- VACA 0.13.5 can leave stale client handlers because its watchdog changes the
  run flag without closing the socket that is blocked in a read.
- Captured stale client baselines were Parents 97, Cora 90, and Graham 121.
- Related Home Assistant pipeline cancellation races remain under investigation;
  no speculative watchdog automation or scheduled reload is authorized.

### APK and private-data feasibility

- All displays run official VACA 0.13.5, version code 6304.
- Installed APK SHA-256:
  `e4708acf99ab2b162373708bf8b122e3c387c5062a3e136356ef941df6868d2f`.
- The APK uses a private v2 signing certificate unavailable locally, so a local
  rebuild cannot be installed in place.
- Parents permits `run-as`; `tar` is available and selected private directories
  are archive-readable.
- No private-data backup has been created and no private contents were exposed.

## Backups and Rollback Points

- Home Assistant backups: `7961f881`, `d38deca9`, `adcb5270`.
- Mac wrapper backup:
  `~/.local/libexec/housevoice-adb.backup-20261113T143738Z`.
- The official installed APK has been exported for offline inspection.
- No APK replacement, application-data restore, Wi-Fi credential rewrite, or
  router change has occurred.

## November 27 Recovery Evidence

- ER605 reservations now preserve the historical addressing:
  - Mac `E6:CD:DB:C4:9C:65` → `192.168.50.15`
  - Parents `14:0A:C5:41:68:B4` → `192.168.50.29`
  - Cora `90:A8:22:EC:01:22` → `192.168.50.30`
  - Graham `80:6D:71:7C:0C:BF` → `192.168.50.31`
- The intended management host is `Aarons-MacBook-Air.local`. Its HouseVoice
  private Wi-Fi address mode is **Fixed**, and its address remained
  `E6:CD:DB:C4:9C:65` across restart. No unrelated Wi-Fi privacy setting was
  changed.
- VACA Zeroconf endpoint updates now reload the existing config entry
  automatically. Parents and Cora followed their reserved-address moves without
  deleting entries, devices, entities, pairings, or dashboards.
- Parents and Cora each passed a five-minute, 60-sample acceptance window with
  zero ADB TCP failures, zero Wyoming failures, and zero identity mismatches.
- A later final check found Parents had again dropped ping, ADB, and Wyoming
  together. This reproduces its whole-device Wi-Fi failure after the clean
  acceptance window; the Parents gate is not considered permanently passed.
- Graham was initially visible at `.31` with the correct MAC, then became absent
  from ARP and stopped answering ping, ADB, and Wyoming. This remains a device
  Wi-Fi recovery failure.
- The Mac UniFi Network application auto-started after a delay and exposed its
  controller ports at `.15`. Home Assistant's existing UniFi entry still needs
  its host changed from `.34` to `.15` through the credential-preserving
  reconfigure flow.
- The persistent OpenCode CDP tunnel manager now targets `.15` instead of `.34`
  and retains the pinned SSH identity and loopback-only ports.
- The Mac ADB server kept all three transports offline after restart. The
  restricted wrapper has no reconnect operation, and its SSH `permitopen`
  policy correctly blocks access to ADB port 5037. No policy bypass or duplicate
  ADB installation was introduced.

## Current Work Queue

1. Restore Graham's saved HouseVoice Wi-Fi connection without a factory reset,
   application-data clear, or unnecessary reboot.
2. Add a narrowly audited reconnect command to the existing Mac
   `housevoice-adb` wrapper, or an equivalent launch agent, to run the existing
   ADB server's disconnect/connect sequence and rebuild CDP forwards after
   network or host startup.
3. Reconfigure the existing Home Assistant UniFi entry from `.34` to `.15`
   using its existing local controller credential.
4. Verify the AP, HouseVoice WLAN, client associations, RSSI, and isolation from
   live UniFi data.
5. Capture actual-device CDP evidence for all three expected dashboard routes
   after ADB recovery.
6. Complete bounded reconnect acceptance and the deferred human audio/visual
   gates.
7. Create the final Home Assistant backup and scoped Git checkpoint after the
   remaining blockers pass.

## Acceptance Gates

### Automated per-device gates

- Three successful Android software reboots.
- ADB and Wyoming ports return without manual recovery.
- Correct device clock and automatic time settings.
- VACA process starts once and remains running.
- CDP reaches the expected dashboard URL and Home Assistant connection state.
- Persistent Wyoming session reconnects and remains stable.
- No increasing stale-client baseline attributable to the test.
- No repeated Wi-Fi disconnect/roam cycle during the observation window.

### Deferred human gates

- Physical cold boot for each display.
- Correct visible dashboard and day/night appearance.
- Audible wake, STT, response, music, and Walkie confirmation.

## Current Status

Status: In progress

Next action: Restore Parents and Graham Wi-Fi without resetting either device,
then add a bounded reconnect path to the existing Mac ADB infrastructure. Cora
network/Wyoming stability is currently verified; physical audio and
actual-device CDP validation remain deferred.
