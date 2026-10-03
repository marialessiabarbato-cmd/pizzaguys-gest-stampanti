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
| Seed menu pilota (T6.4) | ✅ | `pnpm db:seed:menu` — menu reale "Travelling Kitchen", 11 cat., 42 articoli (allergeni da validare) |
| Test e2e Playwright (T6.5) | 🔄 | `e2e/` — 11 test: smoke cloud/edge + dettagli Cloud Admin; flussi sala/cassa ancora da coprire |
| Stampa reale (anticipo T7.2) | 🔄 | ESC/POS in rete testata su POS Italia ST30 — vedi `doc/TEST-LOCALE.md` |
| Formazione staff (T6.6) | ⬜ | Checklist on-site — vedi sotto |

## Task

| ID | Task | Stato | Priorità |
|----|------|-------|----------|
| T6.1 | Deploy cloud (Fly.io / Railway EU) | 🔄 | P0 |
| T6.2 | Script install mini PC Caserta | 🔄 | P0 |
| T6.3 | Configurazione 3 tablet Fire + rete LAN | ⬜ | P0 |
| T6.4 | Seed menu Pizza Guys (menu reale, 11 categorie, 42 articoli) | ✅ | P0 |
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
2. Configura sala, stampanti (IP:porta reali con `HARDWARE_BRIDGE_MODE=network`, altrimenti mock), staff con PIN
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
pnpm db:seed:menu                     # menu reale + sede Caserta (skip se il menu esiste già)
```

Catalogo in `packages/db/src/seed-menu-data.ts` — menu reale **"Travelling Kitchen"**
(tovaglietta settembre 2026), **11 categorie, 42 articoli**:

Cocktail Bar · Soft Drink · Beer · Wine · Digestivi · Tapas Fritti Bar · Fries ·
Travelling Kitchen · Storytelling Pizzas · Classic Pizzas · Desserts

- Prezzo **unico** per TABLE / TAKEAWAY / DELIVERY sulla sede **Caserta — Corso Trieste** (coperto € 1,50).
- Varianti: 2 gruppi "Personalizza" (rimozioni ingredienti reali + aggiunte presenti in menu).
- ⚠️ Allergeni: bozza dedotta dagli ingredienti — **da validare con cucina/titolare** (Reg. UE 1169/2011).
- Lo script stampa l'**API token** al primo run — usarlo per il provisioning edge.

## T6.5 — Test e2e

```bash
# Stack avviato (docker + pnpm dev)
cd e2e && pnpm install && pnpm test
```

| File | Copertura attuale |
|------|-------------------|
| `e2e/cloud.spec.ts` | Health, auth validation, dettagli clienti fiscali / fatture / chiusure (API) |
| `e2e/cloud-admin.spec.ts` | Login SuperAdmin, pagine dettaglio (UI) |
| `e2e/edge.spec.ts` | Health, status provisioning |

Copertura API più ampia oggi negli smoke Python: `scripts/smoke-giro-test.py` (112 check) e
`scripts/smoke-feature-richieste.py`.

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
- Checklist stampata: `doc/CHECKLIST-TEST-MANUALI.md` (una dispensa dedicata `FASE-6-FORMAZIONE.md` è ancora da scrivere)

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
| 2026-09-24 | Menu reale "Travelling Kitchen" (11 cat., 42 art.), stampanti di rete, segnala problema, email chiusura |
| 2026-10-03 | Test stampa su POS Italia ST30: CP1252, taglio, note, sezioni Ora/Segue, marcia, copia non fiscale |
