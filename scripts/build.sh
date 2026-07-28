#!/usr/bin/env bash
#
# Regenerate everything the site generates, in the order that matters.
#
# The order is not arbitrary: each step reads what the one before it wrote.
# Running a single generator on its own can silently drop another's output —
# regenerating the city pages, for instance, rewrites files that build-seo.py
# and wire-tracking.py had already touched. Run this instead.
#
#   npm run build
#
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Local landing pages (composes chrome from locations.html)"
python3 scripts/build-local-pages.py

echo
echo "==> Shared scripts into every page"
python3 scripts/wire-scripts.py

echo
echo "==> Click tracking on the CTAs"
python3 scripts/wire-tracking.py

echo
echo "==> Canonicals, OG/Twitter, robots.txt, sitemap.xml"
python3 scripts/build-seo.py

echo
echo "==> JSON-LD (reads prices from kisala-config.js)"
node scripts/build-jsonld.mjs

echo
echo "Done. Run 'npm test' to check the result."
