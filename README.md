# Roundly

Route and customer manager for round-based small businesses (starting with window cleaning).
Local-first: all data lives on-device in localStorage, nothing sent to a server.

## What's here (v1 scaffold)

- `www/` — the actual app (plain HTML/CSS/JS, no build step needed)
  - `js/data.js` — storage layer: customers, visits, weekly backup
  - `js/app.js` — UI: today's round, customer list, add/edit, mark visited
  - `css/styles.css` — Roundly branding (blue route line, amber for money due)
- `capacitor.config.json` — wraps the web app as an Android app
- `.github/workflows/build-android.yml` — builds a debug APK on GitHub's servers (no local Android SDK needed on your tablet)

## What's built so far (v1 scope)

- Add / edit / archive customers (name, address, phone, price, frequency, notes)
- Today's round: shows customers due based on last-visit + frequency, in route order
- Mark a stop visited and paid
- Weekly local backup — downloads a JSON snapshot of everything, triggered automatically once 7+ days have passed since the last one

## Deliberately not in v1 yet

- Geocoding / map / route optimization (OpenRouteService + Leaflet — next step)
- Drag-to-reorder route (currently just uses the order customers were added in)
- Expenses & mileage tracker with Excel export
- Cloud backup (OneDrive/Google Drive)
- Encrypting the backup file
- Multi-trade generalization

## Notes for next session

- Storage is currently plain localStorage/JSON — fine for testing, but the backup file is unencrypted. Worth fixing before this holds real customer data long-term.
- `isDueToday()` in `app.js` is the frequency logic — worth double-checking this matches how you actually think about "due" (e.g. should a paused customer's due date keep advancing, or freeze?).
