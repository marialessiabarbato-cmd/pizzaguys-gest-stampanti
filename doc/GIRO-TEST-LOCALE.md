# Giro test locale — checklist manuale

> Ultimo giro autonomo: **3 luglio 2026** — tutto verde.  
> Questo documento contiene **solo** i test da fare a mano (UI, stampa fisica, flussi multi-schermo).  
> La parte API è già coperta dagli script automatici (vedi sotto).

## Prerequisiti

```bash
docker compose up -d
pnpm install
cp .env.example .env            # prima volta
pnpm exec turbo build --filter='@pizzaguys/*'
pnpm db:migrate
pnpm --filter @pizzaguys/db seed
pnpm db:seed:menu               # salva il token API stampato!
pnpm dev
```

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Cloud API | http://localhost:4000 |
| Main Station (cassa + admin) | http://localhost:5173 |
| Handheld (cameriere) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API | http://localhost:4100 |

| Ruolo | Credenziali |
|-------|-------------|
| SuperAdmin | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| UserAdmin | `useradmin@pizzaguys.it` / `Pgpg_5a2c05aa3!` |
| Cameriere | PIN staff (es. `1234`) |
| Manager | PIN CASHIER (es. `5678`) |

---

## Già verificato in autonomia (non ripetere)

Esegui solo se vuoi un controllo rapido prima del giro manuale:

```bash
python3 scripts/smoke-giro-test.py   # ~92 check API (cloud + edge, flussi completi)
cd e2e && pnpm test                    # 4 test Playwright
pnpm exec turbo build --filter='@pizzaguys/*'   # build monorepo
```

Ultimo giro autonomo: **92 OK, 0 FAIL, 3 WARN** (vedi avvisi sotto).

| Area | Cosa è stato testato |
|------|----------------------|
| Cloud API | health, login, dashboard, audit, sedi, menu, utenti, fatture, clienti fiscali, report notturno, discount-presets |
| Edge infra | health, status, PIN, staff, menu, routing, stampanti, sale, tavoli, turni, print test |
| Comanda | lock/unlock, ordine, SPEDITO, storno, coperti, preconto |
| Cassa | sconto riga/preset, fattura, pasto completo, buono+contanti, split romano/analitico |
| Tavoli | transfer parziale, merge, incasso post-spostamento |
| Asporto | counter-order + comanda + incasso |
| Prenotazioni | CRUD, confirm, assign, arrive, no-show, restore, stampa lista |
| Documenti fiscali | lista, export CSV, dettaglio, ristampa, cambio pagamento |
| Chiusura | pre-check, report txt/html/json, export CSV, Z-report, riconciliazione, chiusura completa |
| Tavoli aperti | `GET /api/pos/open-tables` |

**Avvisi attuali (non bloccanti):**
- `cloud meal-voucher-presets` → HTTP 500: esegui `pnpm db:migrate` sul DB cloud
- `discountPresets` / `mealVoucherPresets` assenti nello snapshot edge → configura in Cloud → Sedi e ri-provision/heartbeat

---

## Ordine consigliato

```
Cloud (config) → Setup edge → Handheld → KDS → Cassa → Chiusura → Verifica cloud
```

Tempo stimato: **30–60 min** (solo UI, stampa fisica, multi-schermo).

---

## 1. Cloud Admin (UI)

**URL:** http://localhost:3000/login

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 1.1 | Sedi → “Caserta — Via Roma” | Coperto (€) configurabile; sezione **Buoni pasto** con preset | ☐ |
| 1.2 | Sedi → **Sconti rapidi in cassa** | Crea es. `Staff 10%`; dopo sync heartbeat i preset compaiono in cassa | ☐ |
| 1.3 | Dopo provision edge, attendi ~60 s | Sede **ONLINE** in dashboard | ☐ |
| 1.4 | Utenti → elimina User Admin | Modale conferma; utente rimosso | ☐ |
| 1.5 | Chiusure & Report → storico sede | Click riga → pannello dettaglio `dailyReport` | ☐ |
| 1.6 | Fatture (dopo test fattura in cassa) | Riga cliente, totale, stato `PENDING_SEND` | ☐ |
| 1.7 | Clienti fiscali (dopo rubrica in cassa) | Cliente creato in cassa visibile su cloud | ☐ |

---

## 2. Setup Edge (Main Station)

**URL:** http://localhost:5173

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 2.1 | Sala → crea **due sale** con 2+ tavoli ciascuna | Una sala con **Applica coperto**, l’altra senza | ☐ |
| 2.2 | Stampanti → **Test** stampa mock | File leggibile in `tmp/prints/` | ☐ |

---

## 3. Handheld (comanda sala)

**URL:** http://localhost:5174

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 3.1 | Tap tavolo → lock | Tavolo bloccato (cambio colore) | ☐ |
| 3.2 | Comanda 2–3 prodotti + varianti | Carrello e prezzi corretti | ☐ |
| 3.3 | **SPEDITO** | Nessun errore; ticket su KDS | ☐ |
| 3.4 | Storno riga inviata | Riga annullata, stampa mock ANNULLO | ☐ |
| 3.5 | Filtro allergeni (es. Pesce) | Prodotti opacizzati + 🚫, non cliccabili | ☐ |
| 3.6 | Secondo cameriere su tavolo bloccato | Lock rifiutato / messaggio chiaro | ☐ |
| 3.7 | (Opz.) HOLD, CHIAMA PORTATA, X DOLCE | Comportamento atteso + stampa/KDS | ☐ |
| 3.8 | ≡ → **Sposta / unisci tavoli** | Vedi §9 | ☐ |

---

## 4. KDS simulato

**URL:** http://localhost:5175

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 4.1 | Dopo SPEDITO | Ticket visibile in griglia | ☐ |
| 4.2 | Cambio stato ticket | Aggiornamento live senza refresh | ☐ |
| 4.3 | Dopo spostamento tavolo (§9) | Etichetta tavolo aggiornata sul ticket | ☐ |

---

## 5. Cassa e pagamenti (UI)

**URL:** http://localhost:5173 → Cassa

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 5.1 | **Tavoli aperti** (pulsante in header) | Modale con elenco, incassato/da incassare/totale giornata | ☐ |
| 5.2 | **Prenotazioni** → crea, conferma, assegna tavolo, arrivo/no-show | Stati e filtri corretti | ☐ |
| 5.3 | Prenotazioni → **Stampa** lista | File in `tmp/prints/` con elenco prenotazioni | ☐ |
| 5.4 | **Preconto** | Modale conferma → stampa mock | ☐ |
| 5.5 | Tavolo con coperti | Riga **Coperto x N** nel conto | ☐ |
| 5.6 | Pagamento **Fattura** + dati cliente | Mock FATTURA ALLEGATA + XML in `tmp/prints/` | ☐ |
| 5.7 | Checkbox **Pasto completo** | Scontrino con `1 PASTO COMPLETO` + IVA 10% | ☐ |
| 5.8 | **Sconti rapidi sede** (pulsanti preset) | % su tutte le righe; PIN se > soglia | ☐ |
| 5.9 | **Buono pasto** (preset da Cloud) | Pagamento misto buono + saldo contanti/POS; resto corretto | ☐ |
| 5.10 | **Lista documenti** | Filtri, anteprima, ristampa, annullo, modifica pagamento | ☐ |
| 5.11 | Split **romano** / **analitico** (UI drag) | Quote separate, tavolo libero a fine | ☐ |
| 5.12 | Pagamento richiesto da handheld → incasso cassa | Flusso WebSocket completato | ☐ |
| 5.13 | Chiusura **turno cassiere** (conteggio cieco) | Report in `tmp/prints/` | ☐ |
| 5.14 | **SPOSTA / UNISCI TAVOLI** da pannello conto | Vedi §9 | ☐ |

### 5.A — Fattura elettronica (mock)

Dati cliente: `Acme Ristorazione S.r.l.` · P.IVA `12345678901` · SDI `ABCDEFG`

1. Cassa → tavolo con conto → **Paga** → **Fattura** → compila form
2. Verifica modale “FATTURA ALLEGATA” + file `*-fattura-allegata.txt`, `*-invoice-*.json`, `*-invoice-*.xml`
3. Cloud → **Fatture** + **Audit log** (`ELECTRONIC_INVOICE_SYNC`)

### 5.B — Rubrica clienti fiscali

1. **Paga** → **Fattura** → **Intesta documento / Rubrica** → cerca, seleziona, **Intesta**
2. **+ Nuovo** → salva in rubrica → verifica sync su Cloud → **Clienti fiscali**

### 5.C — Asporto / delivery

1. Filtro **Asporto** o **Delivery** → **+ Nuovo ordine** → compila modale
2. Comanda → **SPEDITO** → ticket con `#ASP-xxx` → **Paga** → ordine chiuso

### 5.D — Lista documenti (dettaglio)

1. Emetti ≥2 pagamenti → **Lista documenti** → anteprima
2. **Ristampa** → `*-reprint-*.txt` con `*** RISTAMPA ***`
3. **Annulla e ripristina** / **Cambia metodo pagamento** / **Annulla** (solo void)

---

## 6. Chiusura giornaliera

**URL:** Cassa → Chiusura giornaliera

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 6.1 | Report txt/html/json | Sezioni Tilby: pagamenti, operatori, IVA, sconti, buoni pasto | ☐ |
| 6.2 | Export CSV (`GET /api/closure/export.csv` da browser o curl) | File scaricato | ☐ |
| 6.3 | Dopo chiusura: heartbeat ~60 s | Sede ONLINE; record in Cloud audit / `daily_closures` | ☐ |
| 6.4 | (Opz.) Report notturno manuale SuperAdmin | HTML in `apps/cloud-api/tmp/emails/` | ☐ |
| 6.5 | (Opz.) Cloud down → chiudi giornata | `syncQueued: true`, retry su heartbeat | ☐ |

---

## 7. Spostamento e unione tavoli

Su **Handheld** (≡ → Sposta / unisci) e **Cassa** (pannello conto).

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 7.1 | Sposta conto totale A → B (stessa sala) | Conto su B, A **FREE**; KDS aggiornato | ☐ |
| 7.2 | Bozza non inviata → sposta su B libero | Bozza su B, A libero | ☐ |
| 7.3 | Spostamento **parziale** (1 riga su 3) | Totali corretti su entrambi | ☐ |
| 7.4 | Spostamento **tra sale** (coperto diverso) | Coperto ricalcolato su destinazione | ☐ |
| 7.5 | **Unione** 3+ tavoli occupati | Conti uniti, sorgenti **FREE** | ☐ |
| 7.6 | Blocco **capienza** (es. 8 coperti → max 6) | UI rossa + errore API | ☐ |
| 7.7 | Blocco: split romano attivo / pagamento richiesto pendente | Operazione rifiutata | ☐ |
| 7.8 | Tavolo locked → con PIN manager | Spostamento consentito | ☐ |
| 7.9 | Incassa tavolo destinazione dopo merge/transfer | Pagamento OK, tavolo **FREE** | ☐ |
| 7.10 | Audit edge | Eventi `TABLE_TRANSFER` / `TABLE_MERGE` | ☐ |

---

## Artefatti da controllare

| Percorso | Contenuto |
|----------|-----------|
| `tmp/prints/` | Scontrini, Z-report, comande, prenotazioni, report giornaliero |
| `apps/cloud-api/tmp/emails/` | Report notturno HTML |
| `tmp/edge.sqlite` | DB edge (audit transfer/merge) |

---

## Criterio di successo

Il giro manuale è **superato** se tutte le caselle ☐ sono spuntate senza errori bloccanti e i file mock in `tmp/prints/` sono coerenti con le azioni eseguite.

---

## Problemi comuni

| Sintomo | Soluzione |
|---------|-----------|
| Preset buoni/sconti assenti in cassa | Cloud → Sedi → configura + attendi heartbeat o ri-provision |
| Sede OFFLINE | Attendi ~60 s o verifica `CLOUD_API_URL` |
| Handheld senza menu | Edge non provisionato o token errato |
| `pnpm` non trovato | `npx pnpm@9.15.9 dev` |

---

## Documenti correlati

| File | Contenuto |
|------|-----------|
| `scripts/smoke-giro-test.py` | Smoke API autonomo |
| `doc/HANDOFF.md` | Stato progetto |
| `doc/FASE-6.md` | Pilota Caserta |
