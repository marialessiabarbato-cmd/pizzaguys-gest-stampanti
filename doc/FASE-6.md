# Fase 6 — Pilota Caserta

> Milestone M6: go-live software sede pilota Caserta (mock fiscale, hardware reale in Fase 7).

## Obiettivo

Portare l'ecosistema completo (cloud + edge + tablet) in produzione pilota a **Caserta**: deploy cloud EU, installazione mini PC edge, configurazione rete/tablet, catalogo menu reale, test e2e e formazione staff.

## Stato attuale

| Area | Stato | Note |
|------|-------|------|
| Deploy cloud (T6.1) | 🔄 | `deploy/cloud/` — Fly.io + Railway, Dockerfile |
| Script install edge (T6.2) | 🔄 | `scripts/edge/install-caserta.sh` + systemd |
| Tablet + LAN (T6.3) | ⬜ | Runbook documentato — hardware on-site |
| Seed menu pilota (T6.4) | 🔄 | `pnpm db:seed:menu` — 8 cat., 80 articoli |
| Test e2e Playwright (T6.5) | 🔄 | `e2e/` smoke cloud + edge |
| Formazione staff (T6.6) | ⬜ | Checklist on-site — vedi sotto |

## Task

| ID | Task | Stato | Priorità |
|----|------|-------|----------|
| T6.1 | Deploy cloud (Fly.io / Railway EU) | 🔄 | P0 |
| T6.2 | Script install mini PC Caserta | 🔄 | P0 |
| T6.3 | Configurazione 3 tablet Fire + rete LAN | ⬜ | P0 |
| T6.4 | Seed menu Pizza Guys (~80 articoli, 8 categorie) | 🔄 | P0 |
| T6.5 | Test e2e Playwright su flussi critici | 🔄 | P1 |
| T6.6 | Formazione on-site staff | ⬜ | P1 |

## T6.1 — Deploy cloud

Vedi [`deploy/cloud/README.md`](../deploy/cloud/README.md).

```bash
docker compose up -d
pnpm db:migrate
pnpm --filter @pizzaguys/db seed
pnpm db:seed:menu
# Deploy fly/railway con DATABASE_URL + JWT_SECRET
```

Checklist post-deploy:

- `GET https://api.<dominio>/health` → `ok: true`
- Login SuperAdmin su cloud-web
- Sede Caserta visibile con token API

## T6.2 — Installazione Edge (mini PC)

Script: [`scripts/edge/install-caserta.sh`](../scripts/edge/install-caserta.sh)

```bash
sudo CLOUD_API_URL=https://api.pizzaguys.example ./scripts/edge/install-caserta.sh
sudo systemctl start pizzaguys-edge
```

File di servizio: `scripts/edge/pizzaguys-edge.service`  
Config: `/etc/pizzaguys/edge.env` (da `pizzaguys-edge.env.example`)

Dopo l'avvio:

1. Main Station → **Provision** → incolla API token sede Caserta
2. Configura sala, stampanti mock, staff con PIN
3. Verifica heartbeat su Cloud Admin → sede ONLINE

## T6.3 — Tablet Fire + rete LAN

### Rete consigliata

| Dispositivo | IP statico (es.) | Porta |
|-------------|------------------|-------|
| Mini PC Edge | `192.168.10.10` | 4100 (API+WS), 5173 (cassa dev) |
| Tablet cameriere ×3 | DHCP riservato | — |
| KDS (opz.) | `192.168.10.20` | 5175 |

### Tablet Amazon Fire

1. Abilita **Opzioni sviluppatore** → installa **Silk/Fully Kiosk** o browser predefinito
2. Aggiungi a Home le PWA:
   - Cameriere: `http://192.168.10.10:5174` (handheld-web)
   - Cassa: solo sul mini PC in kiosk (`http://localhost:5173` o build statica)
3. Verifica WebSocket: banner offline assente su comanda test
4. Wi-Fi dedicato sala (SSID isolato dalla rete ospiti)

### Kiosk cassa (Chromium)

```bash
chromium-browser --kiosk --app=http://localhost:5173 --noerrdialogs
```

Autostart via `~pizzaguys/.config/autostart/pizzaguys-cassa.desktop`.

## T6.4 — Seed menu pilota

```bash
pnpm --filter @pizzaguys/db seed      # brand + SuperAdmin (se assente)
pnpm db:seed:menu                     # 8 categorie, 80 prodotti, sede Caserta
```

Catalogo in `packages/db/src/seed-menu-data.ts`:

| Categoria | Articoli | IVA |
|-----------|----------|-----|
| Pizze Classiche | 12 | 10% |
| Pizze Speciali | 12 | 10% |
| Focacce e Calzoni | 8 | 10% |
| Antipasti | 10 | 10% |
| Insalate | 8 | 10% |
| Dolci | 8 | 10% |
| Bevande | 12 | 22% |
| Birre e Vini | 10 | 22% |

Prezzi per canale TABLE / TAKEAWAY / DELIVERY sulla sede **Caserta — Via Roma**.  
Lo script stampa l'**API token** al primo run — usarlo per il provisioning edge.

## T6.5 — Test e2e

```bash
# Stack avviato (docker + pnpm dev)
cd e2e && pnpm install && pnpm test
```

| File | Copertura attuale |
|------|-------------------|
| `e2e/cloud.spec.ts` | Health, auth validation |
| `e2e/edge.spec.ts` | Health, status provisioning |

Flussi e2e prioritari (da estendere):

1. Provisioning sede → snapshot menu
2. Login cameriere PIN → lock tavolo → comanda → SPEDITO
3. Pagamento cassa → mock scontrino
4. Chiusura giornaliera → sync cloud → `daily_closures`

## T6.6 — Formazione on-site

Agenda suggerita (½ giornata, 4 h):

| Blocco | Durata | Contenuto |
|--------|--------|-----------|
| Intro | 30 min | Ruoli, PIN, stati tavolo |
| Sala | 60 min | Lock, comanda, varianti, HOLD, X DOLCE |
| Cassa | 60 min | Preconto, pagamenti, split, sconti PIN |
| Chiusura | 45 min | Turno cassiere, chiusura Z mock, riconciliazione |
| Q&A | 45 min | Scenari offline, escalation |

Materiali:

- Credenziali SuperAdmin (solo manager sede)
- PIN staff creati in anteprima
- Checklist stampata: `doc/FASE-6-FORMAZIONE.md` (opzionale)

## Dipendenze Fase 5 ✅

Prerequisiti completati:

- Chiusura giornaliera + sync cloud + retry
- Audit log edge + export CSV
- `daily_closures` PostgreSQL + report notturno email

## File chiave

| File | Ruolo |
|------|--------|
| `deploy/cloud/` | Deploy cloud-api (T6.1) |
| `scripts/edge/install-caserta.sh` | Install edge Ubuntu (T6.2) |
| `packages/db/src/seed-menu.ts` | Seed catalogo pilota (T6.4) |
| `e2e/` | Smoke Playwright (T6.5) |
| `doc/FASE-6.md` | Questo documento |

## Flusso go-live Caserta

1. Deploy cloud EU + migrazione DB + seed admin + seed menu
2. Annotare API token sede Caserta
3. Install edge su mini PC → provision → sala/staff/stampanti
4. Configurare 3 tablet sulla LAN
5. Giornata di prova: ordine → incasso → chiusura → verifica cloud
6. `e2e` verde + formazione staff
7. **Go-live** (mock fiscale — RT reale in Fase 7)

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Avvio Fase 6 — doc, seed menu, deploy, script edge, e2e smoke |
