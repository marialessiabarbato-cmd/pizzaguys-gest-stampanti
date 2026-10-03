# Pizza Guys Gest

Piattaforma POS multi-sede per Pizza Guys (Cloud + Edge + PWA).

Documentazione: [`doc/HANDOFF.md`](doc/HANDOFF.md) (stato e contesto) · [`doc/TEST-LOCALE.md`](doc/TEST-LOCALE.md) (link, accessi, stampante) · [`doc/CHECKLIST-TEST-MANUALI.md`](doc/CHECKLIST-TEST-MANUALI.md) · [`doc/PROSSIMI-STEP.md`](doc/PROSSIMI-STEP.md) · [`doc/PIANO-OPERATIVO.md`](doc/PIANO-OPERATIVO.md)

**Login dev:** `admin@pizzaguys.it` / `PizzaGuys2026!` → http://localhost:3000/login

## Requisiti

- **Node.js 22** (vedi `.nvmrc`). Node 23+ non compila `better-sqlite3`: su Mac con Homebrew usare
  `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`
- pnpm 9 (`npm i -g pnpm@9.15.9` oppure `npx pnpm@9.15.9`)
- Docker (PostgreSQL + Redis)

## Avvio rapido (sviluppo Mac)

```bash
# 1. Env (contiene anche nome container e porte Docker)
cp .env.example .env

# 2. Database
docker compose up -d

# 3. Dipendenze
pnpm install

# 4. Build package condivisi
pnpm exec turbo build --filter='./packages/*' --filter='./services/hardware-bridge'

# 5. Database schema + seed (prima volta)
set -a; source .env; set +a          # drizzle-kit non legge .env da solo
pnpm --filter @pizzaguys/db migrate
pnpm --filter @pizzaguys/db seed      # brand + SuperAdmin
pnpm db:seed:menu                     # menu "Travelling Kitchen" + sede Caserta

# 6. Avvia tutto
pnpm dev
```

Primo avvio Edge: provisioning con il token della sede (Cloud Admin → Sedi → Rigenera token,
poi `POST /api/provision` sull'Edge o dalla Main Station), quindi sala, staff con PIN e stampanti.

### Più copie del progetto sullo stesso Mac

`docker-compose.yml` legge da `.env` nome container e porte:

```dotenv
COMPOSE_PROJECT_NAME=pizzaguys-fix-richieste
COMPOSE_CONTAINER_PREFIX=pizzaguys-fix-richieste
POSTGRES_HOST_PORT=5433
REDIS_HOST_PORT=6380
DATABASE_URL=postgresql://pizzaguys:pizzaguys@localhost:5433/pizzaguys_cloud
```

Senza queste variabili valgono i default (`pizzaguys-postgres` / `pizzaguys-redis`, porte 5432 / 6379).

## Servizi locali

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Cloud API | http://localhost:4000 |
| Edge Web (cassa) | http://localhost:5173 |
| Handheld (sala) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API + WS | http://localhost:4100 — `ws://localhost:4100/ws` |

## Stampa

| `HARDWARE_BRIDGE_MODE` | Comportamento |
|------------------------|---------------|
| `mock` (default) | Ticket ESC/POS scritti in `tmp/prints/` |
| `network` | Comande, annulli, preconti, marcia, prenotazioni via TCP raw all'IP:porta di ogni stampante (`/api/printers`) |

Scontrino fiscale, Z-report e cassetto restano **mock** in entrambi i casi (RT Micrelec in Fase 7).
`RECEIPT_COPY_PRINT=true` stampa una copia **non fiscale** dello scontrino sulla stampante Bar a ogni incasso.
Stampante simulata per i test: `node scripts/fake-printer.mjs [porta]`. Dettagli in [`doc/TEST-LOCALE.md`](doc/TEST-LOCALE.md).

## Script utili

```bash
pnpm typecheck    # TypeScript
pnpm test         # Vitest (+ Playwright e2e se i servizi sono avviati)
pnpm test:e2e     # Solo Playwright
pnpm build        # Build completa
python3 scripts/smoke-giro-test.py          # Giro API cloud + edge
python3 scripts/smoke-feature-richieste.py  # Feature richieste cliente
./scripts/git-flow.sh   # Git interattivo
```
