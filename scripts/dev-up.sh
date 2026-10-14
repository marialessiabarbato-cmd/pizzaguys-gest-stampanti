#!/usr/bin/env bash
# Avvia l'intero ambiente di sviluppo locale: Docker, Postgres/Redis, dipendenze,
# package condivisi, schema DB (+ seed al primo avvio), tutte le app (pnpm dev),
# provisioning Edge e operatori di test.
#
#   ./scripts/dev-up.sh               # TUI di turbo (frecce per scegliere l'app)
#   ./scripts/dev-up.sh --log         # log in streaming, copiati anche in tmp/dev.log
#   ./scripts/dev-up.sh --reset-edge  # azzera il DB SQLite dell'Edge (cassa, tavoli, conti)
#                                     # e lo riprovisiona: operatori tornano dal Cloud
#   ./scripts/dev-up.sh --stop        # ferma le app avviate (anche da un altro terminale)
#
# Rilanciabile a ogni riavvio: i passi già fatti vengono saltati. Ctrl-C ferma le app;
# Postgres e Redis restano accesi (docker compose stop per spegnerli).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:$HOME/.docker/bin:/usr/local/bin:$PATH"

LOG=0
RESET_EDGE=0
STOP=0
for arg in "$@"; do
  case "$arg" in
    --log) LOG=1 ;;
    --reset-edge) RESET_EDGE=1 ;;
    --stop) STOP=1 ;;
    *) echo "Opzione sconosciuta: $arg (usa --log, --reset-edge, --stop)" >&2; exit 2 ;;
  esac
done

step() { printf '\n\033[1;34m▸ %s\033[0m\n' "$1"; }
die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }

# ── Strumenti ────────────────────────────────────────────────────────────────
command -v node >/dev/null || die "Node non trovato (serve >= 22)"
if ! command -v pnpm >/dev/null; then
  step "Installo pnpm (corepack, in ~/.local/bin)"
  mkdir -p "$HOME/.local/bin"
  corepack enable --install-directory "$HOME/.local/bin" pnpm
fi

# ── .env ─────────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  step "Creo .env da .env.example"
  cp .env.example .env
fi
set -a; source .env; set +a
CLOUD_PORT="${CLOUD_API_PORT:-4000}"
EDGE_PORT="${EDGE_API_PORT:-4100}"

# ── Già avviato? ─────────────────────────────────────────────────────────────
DEV_PORTS=("$CLOUD_PORT" "$EDGE_PORT" 3000 5173 5174 5175)

# Il processo lavora dentro questa copia del progetto? Confronto per inode: il percorso
# contiene "ì" e i processi lo riportano in un'altra forma Unicode, quindi niente confronto testuale.
ROOT_ID=$(stat -f %d:%i "$ROOT")
in_project() {
  local dir
  # lsof scrive i byte non ASCII come testo (\xcc\x80): printf %b li riconverte
  dir=$(printf '%b' "$(lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p')")
  while [[ -n "$dir" && "$dir" != "/" ]]; do
    [[ "$(stat -f %d:%i "$dir" 2>/dev/null)" == "$ROOT_ID" ]] && return 0
    dir=$(dirname "$dir")
  done
  return 1
}

if [[ "$STOP" == 1 ]]; then
  # turbo ferma da solo le app che ha avviato
  for pid in $(pgrep -f "/bin/turbo( |$)" || true); do
    in_project "$pid" && kill -INT "$pid" 2>/dev/null || true
  done
  sleep 3
  # Rete di sicurezza: gruppo di processi di chi è ancora in ascolto sulle porte
  for attempt in TERM KILL; do
    for port in "${DEV_PORTS[@]}"; do
      for pid in $(lsof -nP -t -iTCP:"$port" -sTCP:LISTEN 2>/dev/null || true); do
        in_project "$pid" || continue
        pgid=$(ps -o pgid= -p "$pid" | tr -d ' ')
        [[ -n "$pgid" ]] && kill -"$attempt" -- "-$pgid" 2>/dev/null || true
      done
    done
    sleep 2
  done
  for port in "${DEV_PORTS[@]}"; do
    if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      die "Porta $port ancora occupata da un altro programma: lsof -iTCP:$port"
    fi
  done
  echo "✓ Ambiente fermato (Postgres e Redis restano accesi: docker compose stop per spegnerli)"
  exit 0
fi

for port in "${DEV_PORTS[@]}"; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Porta $port già in uso: l'ambiente è già avviato? Fermalo con ./scripts/dev-up.sh --stop"
  fi
done

# ── Docker ───────────────────────────────────────────────────────────────────
if ! docker info >/dev/null 2>&1; then
  step "Avvio Docker Desktop"
  open -a Docker
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
  docker info >/dev/null 2>&1 || die "Docker non è partito entro 2 minuti"
fi

step "Postgres + Redis"
docker compose up -d --wait

# ── Dipendenze e build ───────────────────────────────────────────────────────
if [[ ! -f node_modules/.modules.yaml || pnpm-lock.yaml -nt node_modules/.modules.yaml ]]; then
  step "pnpm install"
  pnpm install --frozen-lockfile
fi

step "Build package condivisi"
pnpm exec turbo build --filter='./packages/*' --filter='./services/hardware-bridge' \
  --output-logs=errors-only

# ── Database ─────────────────────────────────────────────────────────────────
step "Schema database"
pnpm --filter @pizzaguys/db migrate </dev/null >/dev/null \
  || die "drizzle-kit push fallito: lancia pnpm db:migrate a mano per vedere le domande"

brands=$(docker compose exec -T postgres psql -U pizzaguys -d pizzaguys_cloud -tAc \
  "select count(*) from brands" 2>/dev/null || echo 0)
if [[ "${brands// /}" == "0" ]]; then
  step "Seed iniziale (brand, SuperAdmin, menu)"
  pnpm --filter @pizzaguys/db seed
  pnpm db:seed:menu
fi

if [[ "$RESET_EDGE" == 1 ]]; then
  step "Reset DB Edge"
  # stesso percorso fissato dallo script dev di services/edge-api
  rm -f tmp/edge.sqlite tmp/edge.sqlite-wal tmp/edge.sqlite-shm
fi

# ── Provisioning Edge in background, appena le API rispondono ────────────────
mkdir -p tmp
(
  for _ in $(seq 1 90); do
    if curl -sf "localhost:$CLOUD_PORT/health" >/dev/null \
      && curl -sf "localhost:$EDGE_PORT/health" >/dev/null; then
      if python3 scripts/dev-provision-edge.py >tmp/dev-up.log 2>&1; then
        osascript -e 'display notification "Cassa provisionata, operatori pronti" with title "Pizza Guys dev"' 2>/dev/null || true
      else
        osascript -e 'display notification "Provisioning Edge fallito: vedi tmp/dev-up.log" with title "Pizza Guys dev"' 2>/dev/null || true
      fi
      exit 0
    fi
    sleep 2
  done
  echo "API non pronte dopo 3 minuti" >tmp/dev-up.log
) &

# IP del Mac sulla rete attuale: i telefoni sullo stesso Wi-Fi aprono il palmare da qui
iface=$(route -n get default 2>/dev/null | awk '/interface:/ {print $2}')
LAN_IP=$(ipconfig getifaddr "${iface:-en0}" 2>/dev/null || true)

cat <<EOF

  Cloud Admin   http://localhost:3000   admin@pizzaguys.it / PizzaGuys2026!
  Cassa         http://localhost:5173   PIN 5678 (Test Admin, apre la cassa)
  Palmare       http://localhost:5174   PIN 1234 / 1111 (camerieri)
  KDS cucina    http://localhost:5175
  Provisioning  tmp/dev-up.log (notifica macOS a fine setup)
EOF
if [[ -n "$LAN_IP" ]]; then
  cat <<EOF

  Da smartphone (stesso Wi-Fi del Mac):
  Palmare       http://$LAN_IP:5174
  Cassa         http://$LAN_IP:5173
EOF
fi
echo

if [[ "$LOG" == 1 ]]; then
  pnpm dev --ui=stream 2>&1 | tee tmp/dev.log
else
  pnpm dev
fi
