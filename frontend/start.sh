#!/bin/sh
# Runtime config: point the web app at the Triple i Oman API.
# Set API_URL on the Railway service, e.g. https://api.om.triplei.io  ("/api" is appended if missing).
URL="${API_URL:-$VITE_API_URL}"
if [ -n "$URL" ]; then
  URL="${URL%/}"
  case "$URL" in */api) ;; *) URL="$URL/api" ;; esac
  printf 'window.__API_URL__ = "%s";\n' "$URL" > /app/dist/config.js
  echo "API_URL -> $URL"
else
  echo "WARNING: API_URL is not set; the app will call /api on its own domain."
fi
exec serve -s dist -l "tcp://0.0.0.0:${PORT:-3000}"
