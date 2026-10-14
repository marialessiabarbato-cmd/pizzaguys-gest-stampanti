# Variabili d'ambiente

Elenco ricavato dal codice (`process.env`, `import.meta.env`, script e `docker-compose.yml`), verificato
il **14 ottobre 2026**. Qui ci sono nomi, default e regole: **nessun valore reale**. I valori veri stanno
in `.env` (sviluppo), nei secret di Fly/Railway (Cloud) e in `/etc/pizzaguys/edge.env` (Edge): per averli
sotto mano c'è il file locale `VARIABILI-SISTEMA.local.md`, ignorato da git (vedi in fondo).

> ⚠️ Il repository GitHub è **pubblico**: tutto ciò che è committato è leggibile da chiunque, storia
> compresa. Un segreto finito in un commit va considerato compromesso e **ruotato**, non solo cancellato.

**Legenda** — 🔒 segreta (mai in git, mai in chat/screenshot) · 🌐 finisce nel bundle del browser
(pubblica per definizione) · ⚙️ configurazione, non segreta.

## Dove si impostano

| Ambiente | File / luogo | In git |
|----------|--------------|--------|
| Sviluppo (Mac) | `.env` nella radice, copiato da `.env.example` (lo fa `scripts/dev-up.sh`) | ❌ ignorato |
| Cloud (produzione) | Secret di Fly.io (`fly secrets set …`) o variabili del servizio Railway | ❌ |
| Edge (mini PC) | `/etc/pizzaguys/edge.env`, modello `scripts/edge/pizzaguys-edge.env.example` | ❌ |
| App web Vite e Next | Variabili lette **in fase di build** (`VITE_*`, `NEXT_PUBLIC_*`) | ❌ ma il valore finisce nel JS servito |

## Cloud API — `apps/cloud-api`

| Variabile | | Default nel codice | Note |
|-----------|---|--------------------|------|
| `DATABASE_URL` | 🔒 | nessuno: senza, l'API non parte | Contiene la password di Postgres. `drizzle.config.ts` (migrazioni) ha un default locale `…@localhost:5432/pizzaguys_cloud` |
| `JWT_SECRET` | 🔒 | ⚠️ `dev-secret-change-me` | Firma i token di login del Cloud Admin. **In produzione deve essere impostata** (stringa casuale lunga): col default chiunque abbia letto il codice può firmare token validi |
| `CLOUD_API_PORT` | ⚙️ | `4000` | |
| `SEED_ADMIN_EMAIL` | ⚙️ | `admin@pizzaguys.it` | Usata dal seed e come destinatario di riserva del report notturno |
| `SEED_ADMIN_PASSWORD` | 🔒 | ⚠️ `PizzaGuys2026!` | Password del SuperAdmin creato dal seed. Il default è pubblico (README, seed): **in produzione lanciare il seed con una password propria** e cambiarla al primo accesso |
| `RESEND_API_KEY` | 🔒 | — | Invio email reale. Senza (o senza `EMAIL_FROM`) le email vanno in `EMAIL_MOCK_DIR` |
| `EMAIL_FROM` | ⚙️ | — | Mittente, es. `Pizza Guys <noreply@dominio>` |
| `EMAIL_MOCK_DIR` | ⚙️ | `./tmp/emails` | |
| `DEV_REPORT_EMAIL` | ⚙️ | — | Destinatario di "Segnala problema" dalla cassa; senza → errore 503 controllato |
| `NIGHTLY_REPORT_ENABLED` | ⚙️ | attivo | Solo il valore `false` lo disattiva |
| `NIGHTLY_REPORT_HOUR` / `NIGHTLY_REPORT_MINUTE` | ⚙️ | `4` / `30` | Ora del report notturno |

## Cloud Admin — `apps/cloud-web` (Next.js)

| Variabile | | Default | Note |
|-----------|---|---------|------|
| `NEXT_PUBLIC_CLOUD_API_URL` | 🌐 | `http://localhost:4000` | URL pubblico della Cloud API. Mai metterci segreti: finisce nel browser |

## Edge API — `services/edge-api` (+ `services/hardware-bridge`)

| Variabile | | Default nel codice | Note |
|-----------|---|--------------------|------|
| `CLOUD_API_URL` | ⚙️ | `http://localhost:4000` | Cloud per provisioning, heartbeat e sync |
| `EDGE_API_PORT` | ⚙️ | `4100` | API e WebSocket (`/ws`) |
| `EDGE_API_HOST` | ⚙️ | `0.0.0.0` | Interfaccia di ascolto: `0.0.0.0` serve per palmari e telefoni in LAN |
| `EDGE_DB_PATH` | ⚙️ | `./tmp/edge.sqlite` | In sviluppo lo script `dev` la fissa a `tmp/edge.sqlite` nella radice; mini PC: `/var/lib/pizzaguys/edge.sqlite` |
| `MOCK_PRINT_DIR` | ⚙️ | `./tmp/prints` | Ticket simulati e scontrino fiscale mock |
| `HARDWARE_BRIDGE_MODE` | ⚙️ | `mock` | `network` = ticket ESC/POS via TCP all'IP:porta di ogni stampante. Fiscale, Z e cassetto restano mock |
| `RECEIPT_COPY_PRINT` | ⚙️ | `false` | `true` = copia non fiscale dello scontrino sulla stampante Bar a ogni incasso |

Il **token API della sede** non è una variabile: lo genera il Cloud (Sedi → Rigenera token), si incolla
una volta nel provisioning e l'Edge lo salva in SQLite (`edge_state`). È 🔒 a tutti gli effetti: con quel
token si parla col Cloud a nome della sede. Se esce, rigenerarlo dal Cloud e riprovisionare l'Edge.

## App del locale — `apps/edge-web`, `apps/handheld-web`, `apps/kds-web` (Vite)

| Variabile | | Default | Note |
|-----------|---|---------|------|
| `VITE_EDGE_API_URL` | 🌐 | `http://localhost:4100` | Se punta a `localhost` ma la pagina è aperta da un altro dispositivo, le app usano l'host della pagina (`resolveEdgeUrl`) |
| `VITE_EDGE_WS_URL` | 🌐 | `ws://localhost:4100/ws` | Come sopra |

## Docker Compose (solo sviluppo)

| Variabile | Default | Note |
|-----------|---------|------|
| `COMPOSE_PROJECT_NAME` | nome cartella | Variabile di Docker: separa i volumi di più copie del progetto |
| `COMPOSE_CONTAINER_PREFIX` | `pizzaguys` | Nomi container `<prefisso>-postgres` / `-redis` |
| `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` | `5432` / `6379` | Porte sul Mac; `DATABASE_URL` deve usare la stessa porta |

Utente e password di Postgres in sviluppo sono fissi in `docker-compose.yml` (`pizzaguys`/`pizzaguys`):
vanno bene solo in locale.

`REDIS_URL` è in `.env.example` ma **nessun componente la legge**: Redis parte con Docker e non è usato
(todo T16 in [`PROSSIMI-STEP.md`](PROSSIMI-STEP.md)).

## Script e test

| Variabile | Default | Usata da |
|-----------|---------|----------|
| `CLOUD_API_URL` / `EDGE_API_URL` | `localhost:4000` / `localhost:4100` | Smoke test Python, `dev-provision-edge.py`, Playwright |
| `CLOUD_WEB_URL` | `http://localhost:3000` | Playwright (`e2e/`) |
| `CI` | — | Playwright: 1 retry se impostata (GitHub Actions la imposta da sé) |

## Altri segreti (non variabili)

| Cosa | Dove sta | Se esce |
|------|----------|---------|
| Token API sede | SQLite Edge (`edge_state`), mostrato una volta dal Cloud | Rigenerare dal Cloud, riprovisionare |
| Password SuperAdmin e utenti Cloud | Hash in Postgres | Cambiarla da Cloud Admin |
| PIN staff | Hash bcrypt in Postgres e SQLite Edge | Cambiarlo da Profilo o Impostazioni → Staff |
| Credenziali GitHub | Portachiavi macOS (login fatto con `gh auth login`) | `gh auth logout`, revocare il token su GitHub |
| Accesso Fly.io / Railway | Account del fornitore | Revocare le sessioni dal fornitore |

## Controlli rapidi

```bash
git check-ignore -v .env VARIABILI-SISTEMA.local.md   # entrambi devono risultare ignorati
git ls-files | grep -E '(^|/)\.env$'                   # deve essere vuoto
# segreti in tutta la storia git (Resend, token sede, token GitHub, chiavi private)
git log --all -p | grep -E '^\+' | grep -E 're_[A-Za-z0-9_]{20,}|pg_[a-f0-9]{40,}|gh[pousr]_[A-Za-z0-9]{30,}|BEGIN [A-Z ]*PRIVATE KEY'
```

Ultimo controllo (14/10/2026): nessun `.env` mai committato, nessun segreto reale nella storia; in git
solo segnaposto (`change-me-in-production`, `re_xxxxxxxx`).

## File locale con i valori — `VARIABILI-SISTEMA.local.md`

Nella radice del progetto, **ignorato da git** (regola `*.local.md` in `.gitignore`). Contiene i valori
reali per ambiente e dove recuperarli. Non va condiviso in chat, ticket o screenshot. Su un altro Mac
non esiste: va ricreato (o copiato da un canale sicuro, es. password manager).
