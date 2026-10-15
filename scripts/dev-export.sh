#!/usr/bin/env bash
# Esporta i dati dell'ambiente locale in un solo archivio, per riprendere il lavoro su un altro PC:
# database Cloud (Postgres), database Edge (SQLite), .env e VARIABILI-SISTEMA.local.md.
#
#   ./scripts/dev-export.sh                 # → tmp/backup/pizzaguys-backup-AAAAMMGG-HHMM.tar.gz
#   ./scripts/dev-export.sh ~/Desktop       # cartella di destinazione a scelta
#
# Si può lanciare con l'ambiente acceso: pg_dump e il backup online di SQLite leggono senza
# fermare niente. L'archivio contiene segreti (token sede, hash dei PIN, dati clienti):
# trasferirlo solo su canali privati, MAI su GitHub (repository pubblico).
# Ripristino: scripts/dev-import.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.docker/bin:/usr/local/bin:$PATH"

die() { printf '\033[1;31m✗ %s\033[0m\n' "$1" >&2; exit 1; }
ok() { printf '\033[1;32m✓\033[0m %s\n' "$1"; }

DEST_DIR="${1:-$ROOT/tmp/backup}"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="pizzaguys-backup-$STAMP"
mkdir -p "$DEST_DIR"
WORK="$(mktemp -d)"
trap 'rm -rf "${WORK:?}"' EXIT
mkdir -p "$WORK/$NAME"
OUT="$WORK/$NAME"

docker info >/dev/null 2>&1 || die "Docker non è avviato"
docker compose exec -T postgres pg_isready -U pizzaguys -d pizzaguys_cloud >/dev/null 2>&1 \
  || die "Postgres non risponde: avviarlo con docker compose up -d"

# Cloud: formato custom di pg_dump (compresso, ripristinabile con pg_restore)
docker compose exec -T postgres pg_dump -U pizzaguys -Fc pizzaguys_cloud > "$OUT/cloud.dump"
[[ -s "$OUT/cloud.dump" ]] || die "pg_dump non ha prodotto dati"
ok "Cloud (Postgres): $(du -h "$OUT/cloud.dump" | cut -f1)"

# Edge: .backup di sqlite3 copia anche quanto ancora nel WAL, a Edge accesa
EDGE_DB="$ROOT/tmp/edge.sqlite"
if [[ -f "$EDGE_DB" ]]; then
  sqlite3 "$EDGE_DB" ".timeout 5000" ".backup '$OUT/edge.sqlite'"
  ok "Edge (SQLite): $(du -h "$OUT/edge.sqlite" | cut -f1) — $(sqlite3 "$OUT/edge.sqlite" 'select count(*) from staff') operatori, $(sqlite3 "$OUT/edge.sqlite" 'select count(*) from tables where is_virtual = 0') tavoli"
else
  printf '⚠ %s non esiste: archivio senza Edge\n' "$EDGE_DB"
fi

for f in .env VARIABILI-SISTEMA.local.md; do
  if [[ -f "$ROOT/$f" ]]; then cp "$ROOT/$f" "$OUT/$f"; ok "$f"; fi
done

cat > "$OUT/MANIFEST.txt" <<EOF
Backup Pizza Guys Gest — $(date '+%d/%m/%Y %H:%M')
Mac: $(scutil --get ComputerName 2>/dev/null || hostname)
Codice: branch $(git branch --show-current), commit $(git rev-parse --short HEAD)$( [[ -n "$(git status --porcelain)" ]] && echo " (con modifiche non committate)")
Contenuto: cloud.dump (pg_dump -Fc), edge.sqlite, .env, VARIABILI-SISTEMA.local.md
Ripristino: ./scripts/dev-import.sh <questo archivio>   (ambiente fermo)
Contiene segreti: non metterlo su GitHub.
EOF

tar -czf "$DEST_DIR/$NAME.tar.gz" -C "$WORK" "$NAME"
chmod 600 "$DEST_DIR/$NAME.tar.gz"
ok "Archivio: $DEST_DIR/$NAME.tar.gz ($(du -h "$DEST_DIR/$NAME.tar.gz" | cut -f1))"
echo "  Trasferirlo su un canale privato (chiavetta, AirDrop): contiene segreti."
