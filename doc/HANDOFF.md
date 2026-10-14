# Handoff — stato del progetto Pizza Guys Gest

> Contesto per riprendere il lavoro (anche in una nuova chat). Aggiornato: **14 ottobre 2026**.
> Avvio e accessi: [`TEST-LOCALE.md`](TEST-LOCALE.md) · todo: [`PROSSIMI-STEP.md`](PROSSIMI-STEP.md).

## Stato

| Fase | Stato | Documento |
|------|-------|-----------|
| 0–5 | ✅ Completate: monorepo, Cloud SuperAdmin, Edge e sala, operatività sala, cassa e pagamenti, chiusura e sync | [`fasi/`](fasi/) |
| 6 — Pilota Caserta | 🔄 In corso: deploy cloud, mini PC, rete/tablet, formazione | [`fasi/FASE-6.md`](fasi/FASE-6.md) |
| 7 — Hardware reale | 🔄 In parte: stampa ESC/POS in rete testata (ST30); RT Micrelec ancora simulato | [`progetto/PIANO-OPERATIVO.md`](progetto/PIANO-OPERATIVO.md) |

## Repository

| | |
|---|---|
| GitHub | `marialessiabarbato-cmd/pizzaguys-gest-stampanti` — **pubblico**, account di lavoro `wearedexin-git` |
| Branch principale | `main` (CI verde dal 14/10: build, typecheck, test) |
| Branch aperti | `feat/sala-modifica-tavolo` (scheda tavolo nel Sala Builder, da unire) · storici: `fix-comanda-cassa`, `unione-branch`, `test-stampa`, `Fix-peppe` |
| Copia di lavoro | `~/IA_PROJECT/HuBbì/pizzaguys-gest-stampanti` |

## Decisioni prese (non ridiscutere senza motivo)

- Tutto web: Cloud + Edge + PWA. Pilota **Caserta**. Stack: pnpm + Turborepo, React 19, Fastify, Drizzle,
  Postgres (Cloud) e SQLite (Edge).
- L'Edge funziona **senza internet**: il Cloud serve per menu, utenti, report e sincronizzazione.
- Fiscale **simulato** fino alla Fase 7 (RT Micrelec Hydra SF20).
- Stampanti termiche: ESC/POS su TCP :9100, code page **WPC1252** (16), 80 mm / 48 colonne.
- **Comanda unica** per palmare e cassa in `packages/comanda`: cambia solo l'impaginazione, mai il flusso.
  Il pacchetto non ha build (le app leggono `src/` e lo includono nella configurazione Tailwind).
- **HOLD dalla portata**: Ora parte subito; Segue >1 / >2 / Dolce aspettano la Marcia (6/10).
- **Sessione di cassa** pranzo/cena obbligatoria per comande, incassi e banco; la aprono e chiudono solo
  Cassiere o Admin di sede con PIN ([`PIANO-TURNI-CASSA.md`](PIANO-TURNI-CASSA.md)).
- **Configurazione del locale** (sala, stampanti, routing, staff) riservata all'**Admin di sede** (USER_ADMIN),
  come da specifica; il SuperAdmin gestisce gli operatori da Cloud Admin → Utenti (14/10).
- **Anagrafica operatori sul Cloud**: un operatore eliminato dal Cloud viene disattivato sull'Edge (14/10).
- Palmare anche da **smartphone** in HTTP sulla LAN: niente API che richiedono HTTPS (es. `crypto.randomUUID`,
  sostituito da `randomId` in `packages/types`); su telefono la mappa sala è una griglia (14/10).

## Cronologia recente

| Data | Cosa |
|------|------|
| 14/10 | `scripts/dev-up.sh` (avvio con un comando, `--reset-edge`, `--stop`) e dati di test; `better-sqlite3` 12 (Edge stabile su Node 24); configurazione riservata all'Admin di sede con token di sessione; staff allineato al Cloud; palmare da smartphone (indirizzo Edge, griglia tavoli, scroll menu, chiusura pannello azioni); CI di nuovo verde; documentazione riorganizzata ([`VARIABILI-AMBIENTE.md`](VARIABILI-AMBIENTE.md)) |
| 13–14/10 | Servizio proposto salta pranzo/cena già usati; smoke test in sequenza; seed che terminano; CI senza e2e |
| 5–6/10 | Sessioni di cassa pranzo/cena e turni operatore; comanda unica palmare/cassa; HOLD dalla portata; testi più grandi |
| 3/10 | Stampa di rete su ST30 (comande, annulli, preconto, marcia, prenotazioni), avviso stampa fallita, IP stampanti da Main Station, stato Edge salvato su disco (T19) |

Il dettaglio di ogni modifica è nei messaggi di commit (`git log`).

## Prompt per una nuova chat

```
Continua Pizza Guys Gest (branch main).
Leggi doc/HANDOFF.md, doc/PROSSIMI-STEP.md e doc/TEST-LOCALE.md.
Avvio ambiente: ./scripts/dev-up.sh. Prossimo: [voce della todo list].
```
