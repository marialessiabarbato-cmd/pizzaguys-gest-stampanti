#!/usr/bin/env bash
# T6.2 — Installazione Edge su mini PC Ubuntu (pilota Caserta)
set -euo pipefail

REPO_DIR="${PIZZAGUYS_REPO:-/opt/pizzaguys-gest}"
NODE_MAJOR="${NODE_MAJOR:-22}"
EDGE_USER="${EDGE_USER:-pizzaguys}"
CLOUD_API_URL="${CLOUD_API_URL:-https://api.pizzaguys.example}"

echo "==> Pizza Guys Edge — installazione Caserta"
echo "    Repo: $REPO_DIR"
echo "    Cloud: $CLOUD_API_URL"

if [[ $EUID -ne 0 ]]; then
  echo "Eseguire come root: sudo $0"
  exit 1
fi

apt-get update
apt-get install -y curl git build-essential chromium-browser

if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y nodejs
fi

corepack enable
corepack prepare pnpm@9.15.9 --activate

id -u "$EDGE_USER" &>/dev/null || useradd -m -s /bin/bash "$EDGE_USER"

mkdir -p "$REPO_DIR" /var/lib/pizzaguys
chown -R "$EDGE_USER:$EDGE_USER" "$REPO_DIR" /var/lib/pizzaguys

if [[ ! -d "$REPO_DIR/.git" ]]; then
  echo "Clonare il repository in $REPO_DIR prima di continuare."
  exit 1
fi

sudo -u "$EDGE_USER" bash -c "
  cd '$REPO_DIR'
  pnpm install --frozen-lockfile
  pnpm --filter @pizzaguys/edge-db build
  pnpm --filter @pizzaguys/edge-api build
  pnpm --filter edge-web build
"

install -m 644 "$REPO_DIR/scripts/edge/pizzaguys-edge.service" /etc/systemd/system/pizzaguys-edge.service
install -m 644 "$REPO_DIR/scripts/edge/pizzaguys-edge.env.example" /etc/pizzaguys/edge.env

if ! grep -q "CLOUD_API_URL" /etc/pizzaguys/edge.env 2>/dev/null; then
  mkdir -p /etc/pizzaguys
  cat > /etc/pizzaguys/edge.env <<EOF
EDGE_API_PORT=4100
EDGE_API_HOST=0.0.0.0
CLOUD_API_URL=$CLOUD_API_URL
EDGE_DB_PATH=/var/lib/pizzaguys/edge.sqlite
MOCK_PRINT_DIR=/var/lib/pizzaguys/prints
EOF
fi

systemctl daemon-reload
systemctl enable pizzaguys-edge.service

echo ""
echo "✓ Installazione completata."
echo "  1. Configura /etc/pizzaguys/edge.env"
echo "  2. systemctl start pizzaguys-edge"
echo "  3. Apri http://localhost:4100/api/status (o edge-web su :5173 in dev)"
echo "  4. Provisioning con token sede Caserta"
echo "  5. Kiosk Chromium → edge-web (vedi doc/FASE-6.md § T6.3)"
