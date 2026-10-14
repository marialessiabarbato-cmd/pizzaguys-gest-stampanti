# Piano — Sessioni di cassa (pranzo/cena) e turni operatore

Piano del 13 ottobre 2026 · **implementato** sul branch `feat-sessioni-cassa` (stato in fondo).
Decisioni D1–D7 confermate come da proposta.

## 1. Obiettivo

Separare due concetti che oggi coincidono in `staff_shifts`:

| Concetto | Cosa rappresenta | Chi lo apre/chiude | Effetto sul sistema |
|---|---|---|---|
| **Sessione di cassa** (Pranzo o Cena) | Il cassetto: fondo iniziale, incassi, prelievi, conteggio finale, ammanchi/eccedenze | **Solo l'operatore cassa** (vedi decisione D1) | Sblocca o blocca il locale: comande, incassi, banco |
| **Turno operatore** | La presenza di una persona (cameriere, cassiere, admin) | L'operatore stesso | Nessun blocco: serve per attribuire ordini e incassi e per lo storico presenze |

Regola chiave: il locale è operativo **se e solo se esiste una sessione di cassa aperta**.
I turni degli operatori non sbloccano più niente.

## 2. Situazione attuale (cosa c'è oggi nel codice)

| Area | Oggi | Problema |
|---|---|---|
| Turno | `staff_shifts` (staffId, startedAt, endedAt), `POST /api/shifts/start` e `/:id/end` | Chiunque lo apre, compreso un cameriere loggato in cassa; nessun fondo cassa |
| Blocco locale | `shift-guard.ts`: blocca se non c'è **nessun** turno aperto di **nessun** operatore | Un turno dimenticato di un altro operatore tiene sbloccato il locale (caso del turno di Test Cameriere dell'8/10) |
| Indicatore in cassa | `CassaPage.loadActiveShift` mostra solo il turno **dell'operatore collegato** | La UI dice "Nessun turno" mentre il locale è sbloccato; non si può chiudere il turno di un altro |
| Incassi del turno | `shift-ledger.ts`: mappa in memoria, salvata in `runtime_state`, **cancellata alla chiusura** | Lo storico per turno non esiste; il pagamento è attribuito al turno solo se il client manda `shiftId` (pagamenti da palmare esclusi) |
| Chiusura turno | `ShiftCloseModal` + `/api/shifts/:id/close-blind`: contanti e POS dichiarati, scostamento | Nessun fondo iniziale, nessun prelievo; il report va solo su file JSON |
| Chiusura giornata | `ClosureWizard`: pre-check → Z (RT mock) → riconciliazione contanti/POS del giorno → `closure_archive` → sync Cloud `daily_closures` | Riconciliazione solo giornaliera; chiude d'ufficio tutti i turni aperti |
| Chiusura interna | `InternalClosureWizard`: `cashFund`, `cashWithdrawal`, spese, broker, inseriti a mano | Fondo e prelievi scollegati dai dati di cassa |
| Autorizzazioni Edge | Nessuna autenticazione sulle API: l'operatore arriva nel body; `verifyManagerPin` esiste già | I controlli di ruolo oggi sono solo nella UI |
| Data contabile | `todayKey()` usa `toISOString()` (UTC) | Una chiusura dopo l'una di notte d'inverno finisce sul giorno dopo |

Requisiti già scritti in `progetto/USER-STORIES.md` (US 5.3–5.4) e coerenti con questo piano: conteggio
contanti per tagli "al netto del fondo cassa iniziale", totale POS da strisciata, scostamento in
rosso se negativo e in arancione se positivo, record di chiusura immutabile.

## 3. Modello proposto

### 3.1 Sessione di cassa — nuova tabella Edge `cash_sessions`

| Campo | Note |
|---|---|
| `id` | uuid |
| `business_date` | Data contabile `YYYY-MM-DD` in ora locale, fissata all'apertura (non ricalcolata alla chiusura) |
| `service` | `LUNCH` \| `DINNER` — una sola sessione per servizio per giorno (indice unico) |
| `status` | `OPEN` → `CLOSED` (immutabile dopo la chiusura) |
| `opened_by` / `opened_at` | Operatore cassa che ha aperto (verificato con PIN) |
| `opening_fund` + `opening_fund_breakdown` | Fondo iniziale, con conteggio per tagli opzionale (JSON) |
| `closed_by` / `closed_at` | Operatore cassa che ha chiuso |
| `counted_cash` + `counted_cash_breakdown` | Contanti contati a fine servizio |
| `pos_declared` | Totale della strisciata POS |
| `closing_fund_left` | Fondo lasciato in cassa per il servizio successivo |
| `theoretical_json` | Fotografia alla chiusura: incassi per metodo, prelievi, atteso |
| `discrepancy_cash` / `discrepancy_pos` | Scostamenti calcolati |
| `notes`, `report_path`, `synced_at` | Nota obbligatoria se lo scostamento supera la soglia (D5) |

### 3.2 Movimenti di cassa — nuova tabella `cash_movements`

`id, session_id, type (WITHDRAWAL | DEPOSIT | EXPENSE), amount, reason, staff_id, created_at`.
I prelievi si registrano **in chiusura** (come richiesto) e, se si decide così (D2), anche durante
il servizio dal menu cassa. Ogni movimento va nel log di audit.

### 3.3 Incassi collegati alla sessione

Ogni incasso (`fiscal_documents` e `day_report_transactions`) riceve `cash_session_id`, assegnato
**dall'Edge** alla sessione aperta in quel momento, non dal client. In questo modo:

- vengono contati anche gli incassi confermati dal palmare e le vendite al banco;
- i totali si calcolano da SQLite e non dalla mappa in memoria: sopravvivono a riavvio e chiusura;
- `shift-ledger.ts` si può eliminare, e con lui una parte del problema T19.

### 3.4 Calcoli di chiusura

```
contanti attesi  = fondo iniziale + incassi contanti − prelievi − spese pagate in contanti + versamenti
scostamento cont = contanti contati − contanti attesi      (< 0 ammanco · > 0 eccedenza)
scostamento POS  = POS dichiarato − incassi POS teorici
```

Gli altri metodi (buoni pasto, bonifici, broker delivery) restano nel report ma non entrano nel
conteggio del cassetto.

### 3.5 Turno operatore — `staff_shifts` riusata come presenza

- Si apre quando l'operatore entra con il PIN (palmare o cassa), se non ne ha già uno aperto (D6).
- Si chiude con "Fine turno" dal menu Account, oppure in automatico alla chiusura della giornata.
- Non ha fondo, non ha incassi propri, **non sblocca il locale**.
- In cassa compare un pannello "Operatori in turno", con la possibilità per l'operatore cassa di chiudere il turno di un altro.

### 3.6 Regole di autorizzazione (applicate dall'Edge, non solo dalla UI)

| Azione | Chi | Controllo lato Edge |
|---|---|---|
| Apri sessione di cassa | Operatore cassa (D1) | PIN nel body, verificato con `verifyPin` + ruolo; rifiuto 403 `CASH_ROLE_REQUIRED` |
| Registra prelievo/spesa | Operatore cassa | Come sopra |
| Chiudi sessione di cassa | Operatore cassa | Come sopra + nessun pagamento in attesa (D3 per i tavoli) |
| Comande, incassi, banco | Tutti | `409 CASH_SESSION_CLOSED` se nessuna sessione è aperta (sostituisce `SHIFT_NOT_ACTIVE`) |
| Chiusura giornata (Z) | Operatore cassa | Nessuna sessione aperta |

## 4. Flussi

### Apertura (cassa)
1. In cassa, banner "Cassa chiusa" con pulsante **Apri cassa** (visibile solo all'operatore cassa).
2. Si sceglie il servizio: proposto in base all'orario configurato nel Cloud (oggi `shiftReminderSchedule`).
3. Fondo iniziale: precompilato con il `closing_fund_left` della sessione precedente; conteggio per tagli opzionale. Se diverso dal fondo lasciato, avviso giallo.
4. Conferma con PIN → evento WebSocket `CASH_SESSION_STATUS` → palmari e cassa si sbloccano subito.

### Durante il servizio
- In testata: "Cassa aperta · Pranzo · dalle 11:32 · Anna".
- Menu cassa → **Prelievo** (se D2 = anche durante il servizio).

### Chiusura (cassa) — procedura guidata
1. **Verifica**: tavoli aperti, pagamenti in attesa, asporti non incassati (comportamento secondo D3).
2. **Prelievi e spese**: elenco di quelli registrati + aggiunta.
3. **Conteggio contanti** per tagli, con totale in tempo reale.
4. **POS**: totale della strisciata.
5. **Riepilogo**: teorico, atteso, contato, scostamenti in rosso/arancione; nota obbligatoria sopra soglia.
6. **Fondo lasciato** per il servizio successivo.
7. **Conferma** con PIN → record immutabile, stampa del report sulla stampante Bar, sync al Cloud, locale bloccato.

### Chiusura giornata
- La Z fiscale resta **giornaliera** (RT Micrelec, Fase 7): si emette solo con entrambe le sessioni chiuse.
- La riconciliazione giornaliera non si ridichiara più: somma le sessioni del giorno e mostra gli scostamenti per servizio.
- La chiusura interna prende fondo, prelievi e spese dalle sessioni (ancora modificabili prima dell'invio).

## 5. Impatto

### Edge — database (`packages/edge-db`)
- Nuove tabelle `cash_sessions`, `cash_movements`; colonna `cash_session_id` su `fiscal_documents` e `day_report_transactions`; nuova migrazione in `client.ts`.
- Migrazione dati: i turni `staff_shifts` ancora aperti restano come presenze. Dopo l'aggiornamento **il locale è bloccato finché la cassa non apre la prima sessione**: va comunicato al personale.

### Edge — API (`services/edge-api`)
| File | Modifica |
|---|---|
| `lib/shift-guard.ts` → `lib/cash-session-guard.ts` | Blocco basato sulla sessione aperta; nuovo evento WebSocket |
| nuovo `routes/cash-sessions.ts` | `GET /api/cash-sessions/current`, `POST /open`, `POST /:id/movements`, `GET /:id/summary`, `POST /:id/close`, `GET /history` |
| `routes/staff.ts` | `/api/shifts/*` diventano presenze; eliminare `close-blind` |
| `lib/payment.ts`, `routes/pos.ts`, `routes/orders.ts` | Assegnazione di `cash_session_id` lato server; eliminare `shiftId` dal body |
| `lib/shift-ledger.ts` | Eliminato (calcoli da SQLite) |
| `routes/closure.ts` | Pre-check su sessioni aperte; riconciliazione aggregata; niente chiusura d'ufficio dei turni di cassa |
| `lib/internal-closure.ts` | Bozza precompilata dalle sessioni |
| `lib/runtime-persistence.ts` | Togliere il ledger dal salvataggio |
| `todayKey()` (più file) | Data contabile in ora locale, presa dalla sessione |
| stampa (`packages/escpos`) | Nuovo ticket "CHIUSURA CASSA — PRANZO/CENA" |

### Cassa (`apps/edge-web`)
- `CassaHeader`: stato della sessione al posto di "Turno attivo/Nessun turno"; pulsanti Apri/Chiudi cassa solo per l'operatore cassa.
- Nuovi componenti: `CashOpenModal`, `CashMovementModal`, `CashCloseWizard`, `DenominationCounter` (riusabile anche nella Z), `OperatorsOnShiftPanel`.
- Da eliminare: `ShiftCloseModal`, `loadActiveShift`, il passaggio di `shiftId` agli incassi.
- `ClosureWizard` e `InternalClosureWizard` da adattare.

### Palmare (`apps/handheld-web`) e comanda condivisa (`packages/comanda`)
- Testo del banner ("Cassa chiusa — attendere l'apertura") ed evento WebSocket rinominato.
- Avvio automatico del turno operatore al login con PIN; "Fine turno" nel menu.

### Cloud (`packages/db`, `apps/cloud-api`, `apps/cloud-web`)
- Nuova tabella `cash_sessions` + `POST /api/v2/sync/cash-session` (coda di sync esistente, retry ogni 15 minuti).
- `daily_closures`: dettaglio per servizio.
- Cloud Admin → Chiusure & Report: vista per servizio con ammanchi/eccedenze; impostazioni sede: orari pranzo/cena, fondo cassa standard, soglia di scostamento.

### Test e documentazione
- Unitari: calcoli di chiusura, guard, autorizzazioni per ruolo, assegnazione della sessione agli incassi, ripristino dopo riavvio.
- Da aggiornare: `shift-guard.test.ts`, `smoke-feature-richieste.py`, `smoke-giro-test.py`, `smoke-restart.py` (aprono la cassa con PIN cassiere), Playwright.
- Checklist: riscrivere la sezione **T** e aggiungere una sezione **K — Cassa** (apertura, prelievo, chiusura con ammanco ed eccedenza, passaggio pranzo→cena, cameriere che prova ad aprire).
- Aggiornare `README.md`, `TEST-LOCALE.md`, `HANDOFF.md`.

## 6. Fasi e stima

| Fase | Contenuto | Stima |
|---|---|---|
| 1 | Modello dati Edge, API sessioni e movimenti, nuovo blocco, incassi collegati alla sessione, test unitari | 2,5–3 g |
| 2 | Cassa: apertura, prelievo, procedura di chiusura con conteggio per tagli, stampa report | 2,5–3 g |
| 3 | Turni operatore come presenze (login, fine turno, pannello in cassa) | 1–1,5 g |
| 4 | Chiusura giornata e chiusura interna sulle sessioni; data contabile locale | 1–1,5 g |
| 5 | Cloud: sync, report per servizio, impostazioni sede | 2 g |
| 6 | Smoke, e2e, checklist, documentazione, giro di prova sulla ST30 | 1–1,5 g |
| | **Totale** | **10–12,5 giorni** |

Le fasi 1 e 2 sono il minimo rilasciabile: danno già la regola "solo l'operatore cassa apre e chiude"
e la quadratura per servizio. Le fasi 3–5 si possono rilasciare dopo.

## 7. Rischi

- **Cambio operativo**: dopo l'aggiornamento il locale resta bloccato finché la cassa non apre la sessione. Serve un avviso al personale e una prova sul posto.
- **Tavoli a cavallo tra pranzo e cena**: dipende da D3. Se la chiusura del pranzo è bloccata dai tavoli aperti, servizi lunghi possono ritardarla.
- **Scontrino fiscale e Z ancora simulati** (RT Micrelec in Fase 7): la quadratura è verificabile solo sui dati dell'Edge, non sull'RT.
- **Offline**: le sessioni si chiudono anche senza Cloud; la sync recupera dopo. Il Cloud deve accettare invii ripetuti senza duplicare (chiave: `id` della sessione).
- **API Edge senza autenticazione**: il PIN nel body copre apertura e chiusura, ma chiunque sulla rete locale può chiamare le API. Una sessione autenticata per dispositivo è un intervento a parte.

## 8. Decisioni da prendere prima di iniziare

| # | Domanda | Proposta |
|---|---|---|
| D1 | Chi è "operatore cassa": solo il ruolo Cassiere o anche l'Admin di sede? | Cassiere **e** Admin di sede (l'Admin come supervisore); camerieri mai |
| D2 | I prelievi si registrano solo in chiusura o anche durante il servizio? | Anche durante, con riepilogo modificabile in chiusura |
| D3 | Si può chiudere il pranzo con tavoli ancora aperti? | No per i conti in attesa di pagamento; sì per i tavoli aperti, che verranno incassati nella sessione di cena |
| D4 | Conteggio per tagli obbligatorio o facoltativo? | Facoltativo (si può inserire il totale), come previsto nelle User Stories |
| D5 | Soglia oltre la quale la nota sullo scostamento è obbligatoria? | €5, configurabile dal Cloud |
| D6 | Il turno operatore parte da solo al login con PIN? | Sì; chiusura manuale o automatica a fine giornata |
| D7 | Servizi fissi Pranzo/Cena o configurabili (es. secondo turno cena, brunch)? | Fissi Pranzo/Cena, con l'enum predisposto per estenderli |

## 9. Stato dell'implementazione (13 ottobre 2026)

Tutte le fasi 1–6 sono implementate. Scostamenti dal piano:

- **Data contabile**: gli incassi prendono la data della sessione aperta; la chiusura giornata usa
  quella dell'ultima sessione non ancora chiusa con la Z (anche dopo mezzanotte).
- **Soglia della nota** (D5): `locations.cash_discrepancy_threshold` nel Cloud (default €5), arriva
  all'Edge con le impostazioni della sede.
- **Turni operatore**: partono all'accesso con PIN (`verify-pin` con `startShift`), si chiudono con
  **Fine turno** (palmare: Esci → Fine turno; cassa: Account → Operatori in turno) o alla chiusura giornata.
- **Chiusura giornata**: non chiede più contanti e POS; la quadratura somma le sessioni del giorno.

Limiti noti:

- Un documento **annullato dopo la chiusura** della sua sessione non corregge la sessione chiusa
  (i totali sono congelati): il rimborso in contanti esce dal cassetto della sessione corrente e va
  registrato come prelievo/spesa.
- Il cambio del metodo di pagamento di un documento con **pagamento misto** aggiorna solo il metodo
  principale: la ripartizione resta quella originale.
- Le API dell'Edge restano senza autenticazione per dispositivo (vedi §7).

Verifiche fatte: `pnpm typecheck` e `pnpm test` (edge-api 30 test, di cui 23 sulla cassa; escpos 28);
giro API completo su un Edge isolato (30/30: blocchi, ruoli, apertura, incassi contanti/POS, prelievi,
nota obbligatoria, chiusura con ammanco, report, sync Cloud, chiusura giornata);
`smoke-feature-richieste.py` 35/35; Playwright API 7/7; controllo visivo di cassa, palmare e Cloud.
