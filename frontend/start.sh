#!/bin/sh
# Inject runtime API URL into the built index.html
if [ -n "$VITE_API_URL" ] && [ "$VITE_API_URL" != "/api" ]; then
  sed -i "s|</head>|<script>window.__API_URL__='${VITE_API_URL}';</script></head>|" /app/dist/index.html
  echo "Injected API URL: $VITE_API_URL"
fi

PORT="${PORT:-3000}"
echo "Starting frontend on port $PORT"
exec serve dist -s -l "$PORT"
