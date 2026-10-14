#!/usr/bin/env bash
# Build, install and run the 30nama webOS app with LG's CLI (node_modules/.bin/ares-*; run `npm install` first).
#
#   ./deploy.sh setup <tv-ip>   register the TV (Developer Mode app must show "Key Server: ON"), then fetch its SSH key
#   ./deploy.sh package         build dist/<id>_<version>_all.ipk
#   ./deploy.sh deploy          package + install + launch on the TV
#   ./deploy.sh launch          launch the installed app
#   ./deploy.sh inspect         open Chrome DevTools for the running app
#   ./deploy.sh info            print TV model / webOS version
#
# WEBOS_DEVICE selects the ares device name (default: tv).
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BIN="$ROOT/node_modules/.bin"
DEVICE="${WEBOS_DEVICE:-tv}"
APP_ID="$(node -p "require('$ROOT/webos-app/appinfo.json').id")"
[[ -x "$BIN/ares-package" ]] || { echo "webOS CLI missing: run 'npm install' in $ROOT"; exit 1; }

package() {
  rm -rf "$ROOT/build"; mkdir -p "$ROOT/build" "$ROOT/dist"
  cp -R "$ROOT/webos-app" "$ROOT/build/app"
  rm -rf "$ROOT/build/app/tools" "$ROOT/build/app/js/tmdb-token.example.js"
  if [[ ! -f "$ROOT/webos-app/js/tmdb-token.js" ]]; then
    echo "Note: webos-app/js/tmdb-token.js not found -> TMDB features disabled (see tmdb-token.example.js)"
    echo "/* TMDB disabled */" > "$ROOT/build/app/js/tmdb-token.js"
  fi
  rm -f "$ROOT"/dist/*.ipk
  "$BIN/ares-package" -o "$ROOT/dist" "$ROOT/build/app"
  ls "$ROOT"/dist/*.ipk
}

case "${1:-}" in
  setup)
    IP="${2:?usage: deploy.sh setup <tv-ip>}"
    if "$BIN/ares-setup-device" -F 2>/dev/null | grep -q "^$DEVICE "; then
      "$BIN/ares-setup-device" -m "$DEVICE" -i "host=$IP" -i "port=9922" -i "username=prisoner"
    else
      "$BIN/ares-setup-device" -a "$DEVICE" -i "host=$IP" -i "port=9922" -i "username=prisoner"
    fi
    echo "Enter the passphrase shown in the TV's Developer Mode app:"
    "$BIN/ares-novacom" -d "$DEVICE" --getkey
    "$BIN/ares-device" -i -d "$DEVICE"
    ;;
  package) package ;;
  deploy)
    package
    "$BIN/ares-install" -d "$DEVICE" "$ROOT"/dist/*.ipk
    "$BIN/ares-launch" -d "$DEVICE" "$APP_ID"
    ;;
  launch) "$BIN/ares-launch" -d "$DEVICE" "$APP_ID" ;;
  inspect) "$BIN/ares-inspect" -d "$DEVICE" --app "$APP_ID" --open ;;
  info) "$BIN/ares-device" -i -d "$DEVICE" ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
