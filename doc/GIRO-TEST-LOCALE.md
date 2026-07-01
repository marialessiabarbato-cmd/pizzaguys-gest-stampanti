# Giro test locale — MVP software

> Checklist per validare l’intero flusso operativo su **Mac/PC** (mock fiscale, dati seed).  
> Obiettivo: confermare che l’MVP software (Fasi 0–5) funziona prima del go-live Caserta (Fase 6).

## Prerequisiti

```bash
docker compose up -d
pnpm install                    # oppure: npx pnpm@9.15.9 install
cp .env.example .env            # prima volta
pnpm exec turbo build --filter='@pizzaguys/*'
pnpm db:migrate
pnpm --filter @pizzaguys/db seed
pnpm db:seed:menu               # salva il token API stampato!
pnpm dev                        # oppure: npx pnpm@9.15.9 dev
```

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Cloud API | http://localhost:4000 |
| Main Station (cassa + admin) | http://localhost:5173 |
| Handheld (cameriere) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API | http://localhost:4100 |

## Credenziali di test

| Ruolo | Valore | Note |
|-------|--------|------|
| SuperAdmin | `admin@pizzaguys.it` / `PizzaGuys2026!` | Cloud Admin |
| UserAdmin | `useradmin@pizzaguys.it` / `Pgpg_5a2c05aa3!` |


| API token sede | Output di `pnpm db:seed:menu` | Provision edge — **salvare subito** |
| Cameriere | PIN creato in Staff (es. `1234`) | Handheld |
| Manager | PIN staff CASHIER o USER_ADMIN (es. `5678`) | Sconti, storni, cassa, chiusura |

## Ordine consigliato

```
Cloud → Setup edge → Comanda (handheld) → KDS → Cassa → Chiusura giornaliera → Verifica cloud
```

Tempo stimato prima esecuzione: **1–2 ore**.

---

## 1. Cloud SuperAdmin

**URL:** http://localhost:3000/login

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 1.1 | Login SuperAdmin | Dashboard visibile | ✓ |
| 1.2 | Sedi → “Caserta — Via Roma” | Sede pilota presente; **Coperto (€)** configurabile | ☐ |
| 1.3 | Menu → categorie e prodotti | 8 categorie, ~80 articoli | ✓ |
| 1.4 | Matrice prezzi sede Caserta | Prezzi TABLE / TAKEAWAY / DELIVERY | ✓ |
| 1.5 | Dopo provision edge, attendi ~60 s | Sede **ONLINE** in dashboard | ☐ |
| 1.6 | Audit log | Eventi recenti visibili | ✓ |
| 1.7 | Utenti → elimina User Admin (SuperAdmin) | Modale conferma; utente rimosso dal DB | ☐ |

---

## 2. Setup Edge (Main Station)

**URL:** http://localhost:5173

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 2.1 | Schermata Provision → incolla API token | Stato **ACTIVE**, menu caricato | ✓ |
| 2.2 | Sala → crea sala + 3–4 tavoli | Tavoli sulla mappa; flag **Applica coperto** | ☐ |
| 2.3 | Staff → cameriere (ruolo WAITER) + PIN | Operatore attivo | ✓ |
| 2.4 | Staff → manager (CASHIER o USER_ADMIN) + PIN | Manager attivo | ✓ |
| 2.5 | Stampanti → aggiungi stampante mock + **Test** | File in `tmp/prints/` | ✓ |
| 2.6 | Routing → assegna categorie ai centri lavoro | Routing salvato | ✓ |
| 2.7 | Avvia turno cassa (se richiesto dalla UI) | Turno aperto | ✓ |

---

## 3. Operatività sala (Handheld)

**URL:** http://localhost:5174

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 3.1 | Login PIN cameriere | Mappa tavoli visibile | ✓ |
| 3.2 | Tap tavolo → lock | Tavolo bloccato (cambio colore) | ☐ |
| 3.3 | Comanda 2–3 prodotti dal menu seed | Carrello aggiornato, prezzi corretti | ☐ |
| 3.4 | Aggiungi varianti su una riga | Varianti applicate | ☐ |
| 3.5 | **SPEDITO** | Ordine inviato, nessun errore | ☐ |
| 3.6 | Storno riga inviata (senza PIN) | Riga annullata, stampa mock ANNULLO | ☐ |
| 3.7 | (Opz.) HOLD su un piatto | Comanda parziale in attesa | ☐ |
| 3.8 | (Opz.) CHIAMA PORTATA | Stampa sollecito in `tmp/prints/` + highlight KDS | ☐ |
| 3.11 | Filtro allergeni (es. Pesce) | Prodotti opacizzati 30% + 🚫, non cliccabili | ☐ |
| 3.9 | (Opz.) X DOLCE | Dessert in coda | ☐ |
| 3.10 | Secondo cameriere su stesso tavolo bloccato | Lock rifiutato / messaggio chiaro | ☐ |

---

## 4. KDS simulato

**URL:** http://localhost:5175

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 4.1 | Dopo SPEDITO da handheld | Ticket visibile in griglia | ☐ |
| 4.2 | Cambio stato ticket | Aggiornamento live senza refresh | ☐ |

---

## 5. Cassa e pagamenti

**URL:** http://localhost:5173 (schermata Cassa)

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 5.1 | Mappa live → tavolo con ordine | Stato sincronizzato via WebSocket | ✓ |
| 5.2 | **Preconto** su tavolo con conto | Modale conferma → stampa mock | ☐ |
| 5.10 | Tavolo sala con coperti | Riga **Coperto x N** nel conto | ☐ |
| 5.3 | Pagamento **contanti** (importo ≥ totale) | Scontrino mock in `tmp/prints/`, resto visibile | ✓ |
| 5.3b | Selettore documento: **Scontrino / Fattura / Addestramento** | Tipo passato a edge-api e nel report giornaliero | ☐ |
| 5.4 | Pagamento **POS** su altro tavolo | Tavolo **FREE** dopo pagamento | ✓ |
| 5.5 | Sconto riga + PIN manager | Sconto applicato al conto | ☐ |
| 5.6 | (Opz.) Split **romano** (3 quote) | 3 pagamenti, tavolo libero a fine | ✓ |
| 5.7 | (Opz.) Split **analitico** drag-and-drop | Conti separati pagabili | ✓ |
| 5.8 | (Opz.) Pagamento richiesto da handheld → incasso cassa | Flusso WS completato | ☐ |
| 5.9 | Chiusura **turno cassiere** (conteggio cieco) | Report JSON in `tmp/prints/` | ☐ |

---

## 6. Chiusura giornaliera

**URL:** http://localhost:5173 → Cassa → Chiusura giornaliera

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 6.1 | Pre-check con tavolo ancora aperto | **Blocco** con elenco motivi | ✓ |
| 6.2 | Chiudi tutti i tavoli e turni cassa aperti | Pre-check **OK** | ✓ |
| 6.3 | Emetti **Z mock** | File Z in `tmp/prints/` | ✓ |
| 6.4 | Riconciliazione cieca contanti + POS | Scostamento calcolato e mostrato | ✓ |
| 6.5 | **Chiudi giornata** | Sala resettata, tavoli FREE | ✓ |
| 6.5b | Report giornaliero locale (txt/html/json) | Sezioni Tilby: pagamenti, operatori, IVA scontrini/fatture, documenti fiscali | ☐ |
| 6.6 | Export CSV: `GET /api/closure/export.csv` | File CSV scaricato | ☐ |

---

## 7. Sync e report cloud

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 7.1 | Heartbeat edge (~60 s dopo chiusura) | Sede ONLINE su cloud | ☐ |
| 7.2 | Cloud → chiusura in `daily_closures` / audit | Record `DAILY_CLOSURE_SYNC` | ☐ |
| 7.3 | (Opz.) Report notturno manuale (SuperAdmin) | File HTML in `apps/cloud-api/tmp/emails/` con **dettaglio per sede** | ☐ |
| 7.3b | Cloud → **Chiusure & Report** → storico sede | Click riga → pannello dettaglio `dailyReport` | ☐ |
| 7.4 | (Opz.) Simula cloud down → chiudi giornata | `syncQueued: true`, retry su heartbeat | ☐ |

---

## 8. Test automatici (smoke)

Con lo stack avviato:

```bash
cd e2e && pnpm install && pnpm test
```

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 8.1 | `cloud.spec.ts` — health | `{"ok":true,"service":"cloud-api"}` | ☐ |
| 8.2 | `cloud.spec.ts` — login validation | 400 su credenziali vuote | ☐ |
| 8.3 | `edge.spec.ts` — health | Risposta 200 | ☐ |
| 8.4 | `edge.spec.ts` — status | `UNPROVISIONED` o `ACTIVE` | ☐ |

---

## Artefatti da verificare

| Percorso | Contenuto |
|----------|-----------|
| `tmp/prints/` | Scontrini mock, Z-report, chiusure, comande, report giornaliero |
| `apps/cloud-api/tmp/emails/` | Report notturno HTML (mock email) |
| `tmp/edge.sqlite` | DB edge locale (provision, staff, audit) |

---

## Criterio di successo

Il giro è **superato** se:

1. Provision → comanda → incasso → chiusura giornaliera completano senza errori bloccanti
2. I file mock compaiono in `tmp/prints/`
3. La chiusura compare su cloud (audit / `daily_closures`)
4. (Opz.) Smoke e2e verdi

---

## Problemi comuni

| Sintomo | Soluzione |
|---------|-----------|
| `command not found: pnpm` | `npx pnpm@9.15.9 dev` oppure `npm install -g pnpm@9.15.9` |
| `command not found: docker` | Avvia Docker Desktop |
| Cloud API: `DATABASE_URL non configurato` | File `.env` in root; riavvia `pnpm dev` |
| Edge API: errore SQLite / tmp | Cartella `tmp/` deve esistere; riavvia dev |
| Handheld senza menu | Edge non provisionato o token errato |
| Sede OFFLINE su cloud | Attendi heartbeat (~60 s) o verifica `CLOUD_API_URL` |

---

## 9. Spostamento e unione tavoli

Funzionalità su **Handheld** (≡ → Sposta / unisci tavoli) e **Cassa** (pannello conto → SPOSTA / UNISCI TAVOLI).

**Setup consigliato:** in Admin → Sala crea **due sale** con almeno 2 tavoli ciascuna; una con **Applica coperto** attivo e l’altra disattivato.

| # | Test | Esito atteso | ✓ |
|---|------|--------------|---|
| 9.1 | Handheld: tavolo A — 2 piatti, **SPEDITO** | A **OCCUPIED**, ticket KDS visibile | ☐ |
| 9.2 | Handheld: A — sposta conto totale su tavolo B (stessa sala) | Conto su B, A **FREE** | ☐ |
| 9.3 | KDS dopo spostamento | Ticket con etichetta tavolo **B** | ☐ |
| 9.4 | Cassa: apri tavolo B | Righe spostate + coperto se previsto | ☐ |
| 9.5 | A con bozza non inviata — sposta totale su B libero | Bozza su B, A libero | ☐ |
| 9.6 | Spostamento **parziale** (1 riga su 3) | Sorgente e destinazione con totali corretti | ☐ |
| 9.7 | Spostamento **tra sale** (coperto diverso) | Coperto ricalcolato sulla sala destinazione | ☐ |
| 9.8 | **Unione**: seleziona **3+ tavoli** occupati, destinazione su uno di essi o tavolo libero | Conti uniti, sorgenti **FREE** | ☐ |
| 9.8b | Blocco **capienza**: 4+4 coperti → tavolo max 6 posti | UI rossa + errore API, operazione bloccata | ☐ |
| 9.9 | Cassa: unione da pannello conto | Mappa e conto aggiornati via WS | ☐ |
| 9.10 | Blocco: split romano attivo | Errore, spostamento rifiutato | ☐ |
| 9.11 | Blocco: pagamento richiesto pendente | Errore, spostamento rifiutato | ☐ |
| 9.12 | Tavolo locked da altro operatore | Errore; con PIN manager → OK | ☐ |
| 9.13 | Dopo spostamento: incassa destinazione | Pagamento OK, tavolo **FREE** | ☐ |
| 9.14 | Audit edge | Eventi `TABLE_TRANSFER` / `TABLE_MERGE` | ☐ |

---

## Documenti correlati

| File | Contenuto |
|------|-----------|
| `doc/HANDOFF.md` | Stato progetto e avvio rapido |
| `doc/FASE-6.md` | Pilota Caserta (dati reali) |
| `doc/PIANO-OPERATIVO.md` §12 | Strategia testing |
| `README.md` | Comandi installazione |

## Changelog

| Data | Note |
|------|------|
| 2026-06-17 | §9: spostamento/unione tavoli (transfer, merge, parziale, cross-sala) |
| 2026-06-17 | Fase B: documenti fiscali, IVA separata, dettaglio report cloud/email |
| 2026-06-10 | Creazione checklist giro test locale MVP |
