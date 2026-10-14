# Pizza Guys Gest

Piattaforma POS multi-sede per Pizza Guys: **Cloud** (SuperAdmin, menu, report), **Edge** nel locale
(cassa, sala, stampanti, funziona anche senza internet) e **app web** per cassa, palmare e cucina.
Pilota: sede di Caserta. Stato del progetto: [`doc/HANDOFF.md`](doc/HANDOFF.md).

## Avvio rapido (sviluppo su Mac)

Requisiti: **Node.js 22 o 24**, **Docker Desktop**. pnpm 9 lo installa lo script se manca.

```bash
./scripts/dev-up.sh              # oppure pnpm dev:up
```

Avvia Docker, Postgres/Redis, installa le dipendenze (solo se il lockfile è cambiato), applica lo
schema, fa il seed al primo avvio, lancia tutte le app e prepara l'Edge con operatori e tavoli di test.
Si rilancia a ogni riavvio: i passi già fatti vengono saltati.

| Opzione | Effetto |
|---------|---------|
| `--log` | Log in streaming, copiati in `tmp/dev.log` |
| `--reset-edge` | Edge da zero (cassa, tavoli, conti) e riprovisioning |
| `--stop` | Ferma l'ambiente, anche se avviato da un altro terminale |

Da Finder: doppio clic su `scripts/PizzaGuys-Dev.command` (trascinabile nel Dock).
Link, PIN di test, uso da smartphone, stampante e reset: [`doc/TEST-LOCALE.md`](doc/TEST-LOCALE.md).

| App | URL locale |
|-----|------------|
| Cloud Admin (SuperAdmin) | http://localhost:3000 |
| Cassa — Main Station | http://localhost:5173 |
| Palmare cameriere | http://localhost:5174 |
| KDS cucina (simulato) | http://localhost:5175 |
| Cloud API · Edge API + WebSocket | http://localhost:4000 · http://localhost:4100 (`/ws`) |

## Struttura

| Cartella | Contenuto |
|----------|-----------|
| `apps/cloud-api`, `apps/cloud-web` | Cloud: API Fastify + Postgres, Cloud Admin Next.js |
| `services/edge-api` | Edge del locale: API Fastify + SQLite, WebSocket, stampa, sync col Cloud |
| `services/hardware-bridge` | Stampa ESC/POS: `mock` (file) o `network` (TCP :9100) |
| `apps/edge-web`, `apps/handheld-web`, `apps/kds-web` | Cassa (Main Station), palmare, KDS — Vite + React |
| `packages/comanda` | **Comanda unica** di palmare e cassa (`useComanda`, `ComandaWorkspace`): senza build, le app leggono `src/` |
| `packages/db`, `packages/edge-db` | Schemi Drizzle Cloud (Postgres) ed Edge (SQLite), seed |
| `packages/types`, `validators`, `ui`, `escpos`, `fiscal`, `i18n` | Tipi e regole condivise, schemi zod, UI, ticket ESC/POS, calcoli fiscali |
| `scripts/` | Avvio sviluppo, provisioning di test, smoke test, stampante simulata, installazione Edge |
| `deploy/cloud/` | Deploy del Cloud (Fly.io / Railway) |
| `e2e/` | Test Playwright |

## Comandi

```bash
pnpm typecheck && pnpm test     # TypeScript + test unitari (Vitest) — quello che fa la CI
pnpm test:e2e                   # Playwright (servizi avviati)
python3 scripts/smoke-giro-test.py           # giro completo API Cloud + Edge
python3 scripts/smoke-feature-richieste.py   # funzionalità richieste dal cliente
python3 scripts/smoke-restart.py             # stato dell'Edge dopo un riavvio
pnpm db:migrate                 # applica lo schema Postgres (legge .env)
```

La CI (GitHub Actions) esegue build, typecheck e test a ogni push su `main` e sulle pull request.

## Documentazione

| Documento | Quando serve |
|-----------|--------------|
| [`doc/HANDOFF.md`](doc/HANDOFF.md) | Stato del progetto, decisioni prese, contesto per una nuova chat |
| [`doc/PROSSIMI-STEP.md`](doc/PROSSIMI-STEP.md) | Decisioni da validare e todo |
| [`doc/TEST-LOCALE.md`](doc/TEST-LOCALE.md) | Ambiente locale: accessi, smartphone, stampante, reset, test |
| [`doc/VARIABILI-AMBIENTE.md`](doc/VARIABILI-AMBIENTE.md) | Tutte le variabili d'ambiente e quali sono segrete |
| [`doc/CHECKLIST-TEST-MANUALI.md`](doc/CHECKLIST-TEST-MANUALI.md) | Giro di test manuale prima di un rilascio |
| [`doc/PIANO-TURNI-CASSA.md`](doc/PIANO-TURNI-CASSA.md) | Sessioni di cassa pranzo/cena e turni operatore |
| [`doc/STAMPANTI-CASERTA.md`](doc/STAMPANTI-CASERTA.md) | Censimento stampanti del locale pilota |
| [`deploy/cloud/README.md`](deploy/cloud/README.md) | Deploy del Cloud |
| [`doc/fasi/`](doc/fasi/) | Fasi 1–6: task, API e scelte di ogni fase (la 6, pilota, è in corso) |
| [`doc/progetto/`](doc/progetto/) | Specifiche v2.0, user story e piano operativo originali |

> Il repository è **pubblico**: niente segreti nei file committati. `.env` e `*.local.md` sono ignorati
> da git; regole in [`doc/VARIABILI-AMBIENTE.md`](doc/VARIABILI-AMBIENTE.md).
