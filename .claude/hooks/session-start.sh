#!/bin/bash
# Prepare a Claude Code on the web session for this repo.
#
# Two things are not in git and are needed before anything can be run: the npm
# dependencies, and the city data. The data is vendored from iBurn-Data rather
# than committed, and the unit tests hold the geocoder against ~1,400 surveyed
# camp positions from it, so without this step most of the suite fails on a
# missing file rather than a real problem.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

echo "Installing dependencies…"
npm install --no-audit --no-fund

# Idempotent: skip the clone entirely when the data is already in place.
if [ -f public/data/2025/layout.json ] && [ -f public/data/2025/camp.json ]; then
  echo "City data already present."
else
  echo "Fetching city data…"
  npm run fetch-data 2025
fi

# The browser suites drive Chromium. Sandboxes ship a pinned build whose
# version may not match what Playwright would resolve on its own, so point the
# scripts at whatever is actually here and let them fall back if nothing is.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  chrome="$(find /opt/pw-browsers -maxdepth 3 -name chrome -type f 2>/dev/null | head -n 1 || true)"
  if [ -n "$chrome" ]; then
    echo "export CHROME_PATH=\"$chrome\"" >> "$CLAUDE_ENV_FILE"
    echo "Using Chromium at $chrome"
  fi
fi

echo "Ready. Run: npm test · npm run dev · npm run test:smoke <url>"
