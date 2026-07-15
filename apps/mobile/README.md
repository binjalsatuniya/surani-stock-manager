# Surani and Sons — Mobile (Expo)

## Running on a real phone (Expo Go)

1. Make sure the API server is running (`pnpm --filter @surani/api dev` from the monorepo root) and Postgres is up.
2. Find this machine's LAN IP (`ipconfig`, look for the Wi-Fi adapter's IPv4 address) and set it in `app.json` under `expo.extra.apiBaseUrl`, e.g. `http://192.168.1.23:4000` — **not** `localhost`, since the phone is a separate device on the network.
3. From `apps/mobile`, run `pnpm start` and scan the QR code with the Expo Go app (same Wi-Fi network as this machine).
4. If the phone can't connect, Windows Firewall may be blocking inbound connections on port 4000 — allow it for the Private network profile.

## Running in a browser (`expo start --web`)

Useful for quick UI iteration, but **`expo-secure-store` and `expo-local-authentication` have no web implementation** — Quick Unlock (PIN/biometric persistence) will no-op gracefully in this mode. Use a real device via Expo Go to test Quick Unlock end-to-end.

## Building real binaries (no Mac needed)

See the root project's Phase 6 notes — `eas build --platform android` / `--platform ios` produces real installable binaries via Expo's cloud build service.
