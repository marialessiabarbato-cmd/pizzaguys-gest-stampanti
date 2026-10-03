# Prossimi step — checklist di validazione e todo

> Da rivedere insieme. Aggiornato: **3 ottobre 2026** (T1–T3 completati) — branch `test-stampa`.
> Legenda priorità: **P0** prima del pilota · **P1** consigliato per il pilota · **P2** dopo il pilota / Fase 7.

---

## 1. Checklist di validazione (decisioni e verifiche da confermare)

### Formati di stampa — scostamenti dalla specifica v2.0

| # | Punto | Specifica originale | Oggi | Decisione |
|---|-------|--------------------|------|-----------|
| V1 | Sezioni portata in comanda | Linea `SEGUE → [N]` | `-- ORA --` / `-- SEGUE >1 (in attesa) --` | ☐ confermare con cucina |
| V2 | Ticket di chiamata | `=== CHIAMA PORTATA [X] ===` | `=== MARCIA SEGUE >n ===` (nomi del palmare) | ☐ confermare con cucina |
| V3 | Intestazione preconto | Doppia dimensione | Dimensione normale (in doppia va a capo) | ✅ deciso 1/10 |
| V4 | Ticket dolci (X DOLCE) | `*** SERVIZIO DOLCI TAVOLO [ID] ***` | Comanda normale con operatore "X DOLCE" | ☐ implementare? (T5) |
| V5 | Annullo | `--- ANNULLO ---` invertito | `=== ANNULLO PIATTO ===` invertito | ☐ va bene così? |

### Verifiche sulla stampante reale (ST30) — `CHECKLIST-TEST-MANUALI.md` sezione S

- [x] S1 test stampa e taglio · S2 accenti/euro · S3 varianti + nota · S4 Ora/Segue · S5 Marcia · S6 preconto
- [ ] S7 layout copia non fiscale scontrino
- [ ] S8 annullo (testo in negativo leggibile sulla ST30?)
- [ ] S9 stampante spenta durante comanda e incasso
- [ ] S10 X DOLCE · S11 lista prenotazioni

### Configurazione e contenuti

- [ ] **Allergeni** del menu "Travelling Kitchen": bozza dedotta dagli ingredienti → validare con cucina/titolare (obbligo Reg. UE 1169/2011)
- [ ] **Smistamento reparti**: oggi tutte le categorie vanno in Pizzeria → definire quali categorie vanno a Cucina / Bar / Chef
- [ ] **Copia non fiscale** (`RECEIPT_COPY_PRINT`): solo per i test o anche in produzione finché il fiscale è mock?
- [ ] **Stampanti del pilota**: quante, quali modelli, IP previsti (piano rete FASE-6 usa `192.168.10.x`)
- [ ] **Repository**: `test-stampa` va unito a un branch principale? In quale repo (`marialessiabarbato-cmd/...` o `wearedexin-git/...`)?

---

## 2. Todo list consigliata

### P0 — prima del pilota

| # | Attività | Perché | Stima |
|---|----------|--------|-------|
| T1 | ✅ ~~**Avviso in cassa/palmare se una stampa fallisce**~~ — fatto 3/10: finestra bloccante sul palmare, banner rosso in cassa (evento `PRINT_FAILED`) | Oggi un errore di stampa della comanda non viene mostrato: il piatto risulta "spedito" ma in cucina non arriva nulla | 0,5–1 g |
| T2 | ✅ ~~**Modifica IP/porta stampanti dalla Main Station**~~ — fatto 3/10: pagina Stampanti con IP/porta, Applica a tutte, Attiva/Disattiva, validazione IP | Oggi solo via API (`PATCH /api/printers/:id`); la pagina Stampanti li mostra soltanto | 0,5 g |
| T3 | ✅ ~~**Marcia e dolci rispettano lo smistamento reparti**~~ — fatto 3/10: marcia e dolci smistati per categoria come la comanda | `call-course.ts` e `release-dessert` mandano sempre in Pizzeria, ignorando il routing delle categorie | 0,5 g |
| T4 | **Fix `install-caserta.sh`** | Su un mini PC nuovo la copia di `edge.env` fallisce (`/etc/pizzaguys` viene creata dopo); inoltre copia l'example sopra `/etc/pizzaguys/edge.env`, quindi `CLOUD_API_URL` passato allo script viene ignorato e ogni reinstallazione sovrascrive la configurazione | 0,25 g |
| T5 | Configurare smistamento reparti Caserta (dopo decisione) | Comande al reparto giusto | 0,25 g |
| T6 | Validare allergeni e aggiornare `seed-menu-data.ts` / Cloud Admin | Obbligo normativo | dipende dal cliente |
| T19 | **Ordini aperti salvati su disco** | Ordini aperti, ticket KDS e stato tavoli sono solo in memoria (`runtime.ts`): un riavvio dell'Edge (crash, aggiornamento, mini PC spento) perde i tavoli aperti. Emerso nei test del 3/10 | 2–3 g |

### P1 — consigliato per il pilota

| # | Attività | Perché | Stima |
|---|----------|--------|-------|
| T7 | Intestazione dedicata ticket dolci (se confermato V4) | Allineamento a specifica | 0,25 g |
| T8 | A capo ordinato per nomi/note lunghi (48 colonne, rientro sotto il piatto) | Oggi va a capo la stampante, senza rientro | 0,5 g |
| T9 | e2e Playwright sui flussi critici (comanda → stampa → incasso → chiusura) | T6.5 ancora parziale: oggi 11 test smoke | 1–2 g |
| T10 | `smoke-giro-test.py` che usa da solo il simulatore di stampa | Evitare decine di ticket sulla stampante reale | 0,25 g |
| T11 | Stampante del pilota con IP sulla rete del locale (prenotazione DHCP o IP statico corretto) | Eliminare l'alias manuale `ifconfig` usato nei test | on-site |
| T12 | Formazione staff (T6.6) con la nuova comanda Ora/Segue e Marcia | — | ½ giornata |

### P2 — pulizia tecnica e Fase 7

| # | Attività | Perché |
|---|----------|--------|
| T13 | Seed `pnpm --filter @pizzaguys/db seed` resta appeso a fine esecuzione | Connessione DB non chiusa |
| T14 | `drizzle.config.ts` non legge `.env` | Serve `source .env` prima di `pnpm db:migrate` |
| T15 | `*.tsbuildinfo` tracciati in git ma in `.gitignore` | Rumore nei diff → `git rm --cached` |
| T16 | Redis avviato da Docker ma non usato dal codice | Rimuovere o pianificarne l'uso |
| T17 | Integrazione RT Micrelec Hydra SF20 (T7.1) | Scontrino fiscale e Z reali |
| T18 | Stato stampante (carta finita, coperchio aperto) via comandi ESC/POS di stato | Diagnostica in cassa |

---

## 3. Ordine proposto

1. Giro di validazione della sezione 1 (30–45 min insieme, con la ST30 collegata)
2. P0: ✅ T1, T2, T3 · da fare T4 e **T19**, poi T5/T6 appena arrivano le decisioni
3. Commit + push su `test-stampa`, aggiornamento di `CHECKLIST-TEST-MANUALI.md`
4. P1 in base alla data del pilota
