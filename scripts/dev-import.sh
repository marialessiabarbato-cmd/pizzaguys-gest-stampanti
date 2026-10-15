#!/usr/bin/env bash
# Ripristina un archivio creato da scripts/dev-export.sh: database Cloud, database Edge,
# .env e VARIABILI-SISTEMA.local.md. Per riprendere il lavoro su un altro PC.
#
#   ./scripts/dev-import.sh pizzaguys-backup-AAAAMMGG-HHMM.tar.gz
#
# Va lanciato con l'ambiente FERMO (./scripts/dev-up.sh --stop): sostituisce i dati attuali.
# I file sostituiti (.env, edge.sqlite) vengono prima salvati con suffisso .prima-import-<data>.
# Dopo: ./scripts/dev-up.sh (SENZA --reset-edge, che cancellerebbe l'Edge appena ripristinata).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.docker/bin:/usr/local/bin:$PATH"

die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$1"; }

ARCHIVE="${1:-}"
[[ -n "$ARCHIVE" && -f "$ARCHIVE" ]] || die "Uso: ./scripts/dev-import.sh <archivio .tar.gz di dev-export.sh>"

# Mai sotto un ambiente acceso: Edge e Cloud terrebbero aperti i database
for port in 4000 4100; do
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    die "Porta $port in uso: l'ambiente è acceso. Fermarlo prima con ./scripts/dev-up.sh --stop"
  fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "${WORK:?}"' EXIT
tar -xzf "$ARCHIVE" -C "$WORK"
SRC="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d -name 'pizzaguys-backup-*' | head -1)"
[[ -n "$SRC" && -f "$SRC/cloud.dump" ]] || die "Archivio non valido: manca cloud.dump"
sed -n '1,3p' "$SRC/MANIFEST.txt" 2>/dev/null | sed 's/^/  /'

STAMP="$(date +%Y%m%d-%H%M)"
printf 'Sostituisce Cloud, Edge e .env di questa copia. Continuare? [s/N] '
read -r answer
[[ "$answer" == "s" || "$answer" == "S" ]] || die "Annullato"

# .env e file locale (le versioni attuali restano salvate)
for f in .env VARIABILI-SISTEMA.local.md; do
  if [[ -f "$SRC/$f" ]]; then
    [[ -f "$ROOT/$f" ]] && cp "$ROOT/$f" "$ROOT/$f.prima-import-$STAMP"
    cp "$SRC/$f" "$ROOT/$f"
    ok "$f"
  fi
done

# Cloud: Postgres del docker-compose (nomi e porte dal .env appena ripristinato)
docker info >/dev/null 2>&1 || { open -a Docker; for _ in $(seq 1 60); do docker info >/dev/null 2>&1 && break; sleep 2; done; }
docker info >/dev/null 2>&1 || die "Docker non è partito"
docker compose up -d --wait postgres >/dev/null
docker compose exec -T postgres pg_restore -U pizzaguys -d pizzaguys_cloud \
  --clean --if-exists --no-owner --single-transaction < "$SRC/cloud.dump"
ok "Cloud ripristinato ($(docker compose exec -T postgres psql -U pizzaguys -d pizzaguys_cloud -tAc 'select count(*) from users' | tr -d ' ') utenti)"

# Edge: il file ripristinato sostituisce quello attuale (WAL e SHM vecchi vanno tolti)
if [[ -f "$SRC/edge.sqlite" ]]; then
  mkdir -p "$ROOT/tmp"
  [[ -f "$ROOT/tmp/edge.sqlite" ]] && cp "$ROOT/tmp/edge.sqlite" "$ROOT/tmp/edge.sqlite.prima-import-$STAMP"
  rm -f "$ROOT/tmp/edge.sqlite-wal" "$ROOT/tmp/edge.sqlite-shm"
  cp "$SRC/edge.sqlite" "$ROOT/tmp/edge.sqlite"
  ok "Edge ripristinata ($(sqlite3 "$ROOT/tmp/edge.sqlite" 'select location_name from edge_state where id = 1'))"
fi

cat <<EOF

Fatto. Prossimi passi:
  ./scripts/dev-up.sh                  (senza --reset-edge)
  Stampante ST30: sudo ifconfig <interfaccia USB-LAN> alias 192.168.123.50 255.255.255.0
                  (interfaccia: networksetup -listallhardwareports | grep -A1 "USB 10/100 LAN")
EOF
