#!/usr/bin/env bash
# ساختِ شهرِ لوکو و گذاشتنش داخلِ بیلدِ سایتِ اصلی، زیرِ /city/
#
#   bash scripts/deploy-into-luko.sh [مسیرِ پروژه‌ی New LUKO]
#
# nginxِ سایتِ اصلی (deploy/nginx.conf.template) کلِ frontend/dist را سرو می‌کند، پس
# frontend/dist/city/ بی هیچ تغییری در nginx روی https://<دامنه>/city/ باز می‌شود:
#   - API همان /api/v1 است (هم‌ریشه، بی CORS)
#   - بازی‌ها همان /games/ِ سایتِ اصلی با لینکِ امضاشده‌ی سرورند
#   - بچه‌ای که در سایتِ اصلی وارد شده این‌جا هم وارد است (همان کلیدهای توکن)
#
# بیلدِ سایتِ اصلی (vite build) پوشه‌ی dist را خالی می‌کند؛ این اسکریپت را **بعد از** آن اجرا کنید.
set -euo pipefail
cd "$(dirname "$0")/.."

LUKO="${1:-../../New LUKO}"
DIST="$LUKO/frontend/dist"
[ -f "$DIST/index.html" ] || { echo "✗ $DIST/index.html نیست — اول سایتِ اصلی را بیلد کنید (cd frontend && npm ci && npm run build)"; exit 1; }

echo "── بیلدِ شهر ──"
# SKIP_INSTALL=1: وابستگی‌ها از قبل نصب‌اند (بیلدِ دوباره روی همان ماشین)
[ "${SKIP_INSTALL:-0}" = "1" ] || npm ci --no-audit --no-fund
npm run build

echo "── کپی به $DIST/city ──"
rm -rf "$DIST/city"
mkdir -p "$DIST/city"
cp -R dist/. "$DIST/city/"
[ -f "$DIST/city/index.html" ] && echo "✓ شهر آماده است: https://<دامنه>/city/"
