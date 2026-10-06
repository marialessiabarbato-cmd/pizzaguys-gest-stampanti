# Handoff — Continuazione sviluppo Pizza Guys Gest

> Usa questo file come contesto in una **nuova chat** per proseguire senza perdere lo stato del progetto.
> Aggiornato: **6 ottobre 2026**.

## Stato attuale

| Fase | Stato | Note |
|------|-------|------|
| **Fase 0** | ✅ Completata | Monorepo, mock hardware, CI |
| **Fase 1** | ✅ Completata | Cloud SuperAdmin |
| **Fase 2** | ✅ Completata | Edge provisioning, sala, stampanti, staff |
| **Fase 3** | ✅ Completata | Operatività sala cameriere — `doc/FASE-3.md` |
| **Fase 4** | ✅ Completata | Cassa e pagamenti — `doc/FASE-4.md` |
| **Fase 5** | ✅ Completata | Chiusura, sync, audit, report — `doc/FASE-5.md` |
| **Fase 6** | 🔄 In corso | Pilota Caserta — `doc/FASE-6.md` |
| **Fase 7** | 🔄 Anticipata in parte | Stampa ESC/POS su rete reale testata (POS Italia ST30); RT Micrelec ancora mock |

## Repository

| | |
|---|---|
| Repo | `https://github.com/marialessiabarbato-cmd/pizzaguys-gest-stampanti` |
| Branch di lavoro | `fix-comanda-cassa` = `unione-branch` (che include `test-stampa`) + lavoro UX 5–6/10 |
| Altri branch | `Fix-peppe` (primi 3 commit UX, su GitHub), `unione-branch`, `test-stampa`, `main` |
| Copia locale | `~/Desktop/✨/Clienti/PizzaGuys/pizzaguys-gest-stampanti` (container `pizzaguys-stampanti-*`, porte 5433/6380, API 4001/4101) |

## Decisioni chiave (non ridiscutere)

- Intero ecosistema web (Cloud + Edge + PWA)
- Pilota: **Caserta**, 3 sedi × 3 tablet
- PWA su Fire Tablet; Edge Node.js + hardware-bridge (`mock` | `network`)
- Stack: pnpm + Turborepo, React 19, Fastify, Drizzle, PostgreSQL + SQLite edge
- Fase 4–6: **mock fiscale** — RT Micrelec reale solo in Fase 7
- Stampanti termiche: ESC/POS su TCP :9100, code page **WPC1252** (16), carta 80 mm / 48 colonne
- **Comanda unica** per palmare e cassa (`packages/comanda`): cambia solo l'impaginazione, mai il flusso
- **HOLD dalla portata**: Ora parte subito, Segue >1 / >2 / Dolce aspettano la Marcia (deciso 6/10)
- Senza turno cassa aperto niente invio comande, incassi e banco

## Novità 5–6 ottobre (branch `fix-comanda-cassa`)

| Area | Modifica |
|------|----------|
| Architettura | Nuovo pacchetto **`packages/comanda`** (sorgenti letti direttamente dalle app, nessuna build): `useComanda` (logica), `ComandaWorkspace` (schermata, layout `handheld` / `cassa`), pannelli condivisi (`BottomSheet` dal basso o laterale con `SheetLayoutProvider`), menu, portate, unioni tavoli. Il vecchio `ComandaPanel` della cassa è stato rimosso |
| Cassa | Comanda identica al palmare: già inviati con storno/prezzo, barra azioni sulla riga, bozza per portata, Spedisci, Marcia, X DOLCE, sconto con PIN, sposta conto, coperti, filtro allergeni. Preconto solo nel pannello Conto |
| Edge | Turno: `409 SHIFT_NOT_ACTIVE` su invio, incasso (REST e WS), banco; `/api/status` → `shift`; evento WS `SHIFT_STATUS` (`lib/shift-guard.ts`) |
| Edge | HOLD calcolato dalla portata (`isHeldCourse` in `packages/types`), il valore del client è ignorato |
| Palmare | Piatto aggiunto evidente, nota in un passaggio con note rapide (`QUICK_NOTES` in `packages/types`), pannelli sopra la tastiera, tavolo rilasciato anche dopo Spedisci |
| UI | Testi più grandi su palmare e cassa (`packages/ui/type-scale.ts`); animazioni comuni in `packages/ui/src/styles.css` |
| Test | `lib/shift-guard.test.ts`; `smoke-feature-richieste.py` apre/chiude un turno; checklist sezione **T** |

## Novità precedenti (branch `test-stampa`)

| Area | Modifica |
|------|----------|
| Stampa di rete | `HARDWARE_BRIDGE_MODE=network`: comande, annulli, **preconto, marcia, lista prenotazioni** su stampante LAN |
| ESC/POS | Testo in CP1252 + `ESC t 16` (accenti ed euro corretti); avanzamento 5 righe prima del taglio |
| Comanda | Nota libera del cameriere stampata (`NOTA: ...`) e visibile su KDS |
| Comanda | Sezioni per portata `-- ORA --`, `-- SEGUE >1 (in attesa) --`, …; chiamata `=== MARCIA SEGUE >n ===` |
| Preconto | Intestazione `*** DOCUMENTO NON FISCALE ***` in dimensione normale (entra in 48 colonne) |
| Cassa | `RECEIPT_COPY_PRINT=true`: copia non fiscale dello scontrino a ogni incasso (stampante Bar) |
| Stampa | Avviso se una stampa fallisce: finestra sul palmare + banner rosso in cassa (WS `PRINT_FAILED`) |
| Stampa | Main Station → Stampanti: IP/porta modificabili, Applica a tutte, Attiva/Disattiva (IP validato) |
| Stampa | Marcia e dolci smistati al reparto della categoria (prima sempre Pizzeria) |
| Edge | **T19**: stato operativo salvato su SQLite (`runtime_state`) e ripristinato all'avvio — tavoli, ordini, KDS, split, richieste pagamento, asporti, incassi turno, Z; blocchi rilasciati; banner in cassa |
| Test | `scripts/fake-printer.mjs` (stampante simulata), test unitari ESC/POS, PIN manager nel giro-test |
| Dev | `docker-compose.yml` con nome container e porte da `.env` |
| Cliente | Segnala problema, email chiusura, promemoria turno, capienza sede, menu "Travelling Kitchen" |

## Documentazione

| File | Contenuto |
|------|-----------|
| `doc/PIANO-OPERATIVO.md` | Piano completo (§14 flussi stampa aggiornati) |
| `doc/FASE-1.md` … `doc/FASE-5.md` | Fasi completate |
| `doc/FASE-6.md` | **Pilota Caserta (in corso)** |
| `doc/STAMPANTI-CASERTA.md` | **Censimento hardware stampanti reali (in corso)** |
| `doc/TEST-LOCALE.md` | **Link, accessi, stampante ST30, avvio e test locali** |
| `doc/CHECKLIST-TEST-MANUALI.md` | Checklist test manuali (sezione **S — Stampa**, **T — Turno, comanda palmare/cassa, HOLD**) |
| `doc/PROSSIMI-STEP.md` | **Checklist di validazione + todo prossimi step** |
| `doc/HANDOFF.md` | Questo file |
| `deploy/cloud/README.md` | Deploy cloud T6.1 |

## Avvio dev

```bash
open -a Docker && docker compose up -d && pnpm dev
```

Dettagli (ST30, PIN, porte di questa copia): `doc/TEST-LOCALE.md`.

Seed (database vuoto):

```bash
set -a; source .env; set +a
pnpm db:migrate
pnpm --filter @pizzaguys/db seed   # termina dopo "✓ Password": se resta appeso, Ctrl+C
pnpm db:seed:menu
```

## Credenziali

- **SuperAdmin:** `admin@pizzaguys.it` / `PizzaGuys2026!`
- **PIN staff:** creati su Main Station → Staff (4 cifre). Ambiente locale attuale: `1234` Test Admin, `1111` / `2222` camerieri (vedi `doc/TEST-LOCALE.md`)
- **Manager PIN:** staff con ruolo CASHIER o USER_ADMIN (i WAITER non possono autorizzare override)

## Porte

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Main Station (cassa + admin) | http://localhost:5173 |
| Handheld (cameriere) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API + WS | http://localhost:4100 / ws://localhost:4100/ws (questa copia: **4101**) |
| Cloud API | http://localhost:4000 (questa copia: **4001**) |

## Prossimi step

Vedi `doc/PROSSIMI-STEP.md` (da validare insieme) e `doc/FASE-6.md`.

## Prompt per nuova chat

```
Continua Pizza Guys Gest — branch fix-comanda-cassa.
Leggi doc/HANDOFF.md, doc/PROSSIMI-STEP.md e doc/TEST-LOCALE.md.
Prossimo: [voce della todo list].
```
