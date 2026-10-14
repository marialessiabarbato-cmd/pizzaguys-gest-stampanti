# Fase 3 — Operatività sala

> Epic 6–8, 10 lite | Milestone M3: ordine → cucina (mock print) su LAN.

## Obiettivo

PWA cameriere su tablet: PIN, mappa tavoli live, lock concorrenza, comanda con varianti/prezzi, invio cucina mock.

## Task

| ID | Task | Stato | US |
|----|------|-------|-----|
| T3.1 | PWA cameriere: lock screen PIN | ✅ | 6.1 |
| T3.2 | Mappa tavoli live + stati colore + virtuali | ✅ | 3.8 |
| T3.3 | Table locking + broadcast + timeout | ✅ | 6.3 |
| T3.4 | UI comanda: categorie, carrello, canali, prezzi | ✅ | 7.1 |
| T3.5 | Varianti bottom sheet + validazione fiscale | ✅ | 7.2 |
| T3.6 | Ricerca fuzzy + filtri allergeni UE | ✅ | 7.3 |
| T3.7 | Alert uscita + validazione pre-SPIDITO | ✅ | 7.4 |
| T3.8 | Marcia fissa + HOLD + CHIAMA PORTATA | ✅ | 8.1, 8.2 |
| T3.9 | X DOLCE + coda dessert | ✅ | 8.3 |
| T3.10 | Storni con PIN + ticket ANNULLO mock | ✅ | 8.4–8.6 |
| T3.11 | Offline PWA: IndexedDB, disabilita SPEDITO | ✅ | 6.2 |
| T3.12 | KDS simulato: WS, griglia, timer | ✅ | 10.x lite |
| T3.13 | Sblocco tavolo PIN + bozza | ✅ | 6.5 |
| T3.14 | Sconti critici palmare + PIN single-use | ✅ | 7.5 |

## API Edge (estensioni Fase 3)

```
GET  /api/tables/live              → tavoli + stato runtime (FREE/LOCKED/OCCUPIED)
GET  /api/orders?tableId=           → bozza + ordini inviati per tavolo
POST /api/orders                    → crea/aggiorna bozza
POST /api/orders/:id/submit         → SPEDITO → stampa mock per centro
POST /api/orders/:id/storno         → storno riga + ticket ANNULLO
POST /api/orders/call-course        → CHIAMA PORTATA
POST /api/orders/release-dessert    → X DOLCE
POST /api/staff/authorize-discount  → token sconto single-use
GET  /api/kds/tickets               → griglia KDS
```

## WebSocket (handheld ↔ edge)

| Messaggio | Direzione | Uso |
|-----------|-----------|-----|
| `HANDSHAKE` / `HANDSHAKE_ACK` | ↔ | Sessione tablet |
| `REQUEST_TABLE_LOCK` (+ `overridePin`) | → edge | Richiesta lock / sblocco manager |
| `LOCK_GRANTED` / `LOCK_DENIED` | edge → | Risposta lock |
| `TABLE_LOCKED_BROADCAST` | edge → tutti | Sync mappa |
| `RELEASE_TABLE_LOCK` | → edge | Rilascio |
| `TABLE_STATUS_UPDATE` | edge → tutti | Cambio stato |
| `ORDER_SUBMIT` | → edge | Invio comanda → KDS |
| `CALL_COURSE` | → edge | Sblocco portata in hold |
| `REQUEST_STORNO_AUTHORIZATION` | → edge | Autorizzazione storno (WS alt.) |
| `KDS_ORDER_UPDATE` | edge → tutti | Sync griglia KDS |

## UI Handheld (`handheld-web` :5174)

| Schermata | Stato |
|-----------|-------|
| PIN lock (tastierino 3×4) | ✅ |
| Mappa tavoli (colori stato) | ✅ |
| Comanda (categorie + carrello) | ✅ |
| Varianti bottom sheet | ✅ |
| Ricerca + filtri allergeni | ✅ |
| HOLD / portate / X DOLCE | ✅ |
| Storni + sconti PIN | ✅ |
| Banner offline + IndexedDB | ✅ |

## KDS (`kds-web` :5175)

| Funzione | Stato |
|----------|-------|
| WebSocket live | ✅ |
| Griglia ordini attivi | ✅ |
| Sezione HOLD / dolci | ✅ |
| Timer elapsed | ✅ |

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Avvio Fase 3: doc, PIN screen, mappa live, lock WS, comanda base |
| 2026-06-10 | Completamento Fase 3: varianti, offline, KDS, storni, HOLD, X DOLCE, sconti |
