# Fase 5 — Chiusura e sync cloud

> Epic 5, 1, 2 | Milestone M5: giornata completa locale → cloud. **✅ Completata (2026-06-10)**

## Obiettivo

Chiusura giornaliera guidata sulla Main Station: validazione sala, chiusura Z mock, riconciliazione contanti/POS, sync corrispettivi al cloud, audit e export.

## Stato attuale codebase

| Area | Stato | Note |
|------|-------|------|
| Pre-check chiusura (T5.1) | ✅ | `GET /api/closure/pre-check` |
| Chiusura Z mock (T5.2) | ✅ | `POST /api/closure/z-report` + file `tmp/prints/` |
| Riconciliazione giornaliera (T5.3) | ✅ | `POST /api/closure/reconcile` — conteggio cieco |
| Reset sala + sync cloud + retry (T5.4) | ✅ | Coda `sync_queue`, retry ogni 15 min su heartbeat |
| Day ledger | ✅ | `shift-ledger.ts` — aggregato per giornata |
| Wizard chiusura UI | ✅ | `ClosureWizard.tsx` — pulsante in CassaPage |
| Cloud `POST /api/v2/sync/daily-closure` | ✅ | `daily_closures` + audit `DAILY_CLOSURE_SYNC` |
| Chiusura turno cassiere (T4.10) | ✅ | Distinta dalla chiusura giornaliera |
| Coda retry sync (T5.4) | ✅ | `lib/sync-queue.ts` |
| Audit log edge (T5.5) | ✅ | SQLite `audit_log` append-only + PII redacted |
| Export CSV (T5.6) | ✅ | `GET /api/closure/export.csv` |
| Email report notturno (T5.7) | ✅ | Worker cron + HTML mock email |
| Tabella `daily_closures` cloud | ✅ | PostgreSQL + `GET /locations/:id/closures` |

## Task

| ID | Task | Stato | US | Priorità |
|----|------|-------|-----|----------|
| T5.1 | Validazione sala pre-chiusura | ✅ | 5.1 | P0 |
| T5.2 | Chiusura Z software (mock RT) | ✅ | 5.2 | P0 |
| T5.3 | Riconciliazione contanti/POS + scostamenti | ✅ | 5.3 | P0 |
| T5.4 | Turni chiusi + reset sala + POST sync + retry | ✅ | 5.4 | P0 |
| T5.5 | Audit log edge append-only + anonimizzazione PII | ✅ | 1.6 | P1 |
| T5.6 | Export CSV base commercialista | ✅ | 2.4 | P1 |
| T5.7 | Email report notturno HTML nativo | ✅ | 2.3 | P2 |

## Sotto-fasi

### Sprint 5A — Chiusura giornaliera core ✅

- Pre-check, Z mock, riconciliazione, complete, wizard UI, day ledger, sync cloud audit

### Sprint 5B — Audit + export ✅

- `audit_log` SQLite edge
- `GET /api/closure/export.csv`
- Coda retry sync su heartbeat

### Sprint 5C — Report cloud ✅

- Worker/email HTML report notturno (`lib/nightly-worker.ts`)
- `daily_closures` PostgreSQL + storico API
- `POST/GET /api/v2/reports/nightly/*`

## API Edge

```
GET  /api/closure/pre-check
POST /api/closure/z-report
POST /api/closure/reconcile
POST /api/closure/complete
GET  /api/closure/last
GET  /api/closure/export.csv
```

## API Cloud

```
POST /api/v2/sync/daily-closure
GET  /api/v2/locations/:id/closures
POST /api/v2/reports/nightly/send
GET  /api/v2/reports/nightly/preview
```

## File chiave

| File | Ruolo |
|------|--------|
| `services/edge-api/src/routes/closure.ts` | Route chiusura |
| `services/edge-api/src/lib/audit.ts` | Audit edge |
| `services/edge-api/src/lib/sync-queue.ts` | Retry sync |
| `services/edge-api/src/lib/closure-archive.ts` | Archivio + CSV |
| `apps/cloud-api/src/routes/sync.ts` | Persistenza `daily_closures` |
| `apps/cloud-api/src/lib/nightly-report.ts` | Report HTML |
| `packages/db/src/schema/daily-closures.ts` | Schema PostgreSQL |

## Flusso test Fase 5

1. Giornata operativa + chiudi turni cassa
2. Cassa → Chiusura giornaliera → pre-check OK
3. Emetti Z mock → riconcilia → chiudi giornata
4. Verifica `daily_closures` e audit cloud
5. Simula cloud down → `syncQueued` → retry su heartbeat
6. `GET /api/closure/export.csv` + audit `CLOSURE_CSV_EXPORT`
7. `POST /api/v2/reports/nightly/send` → file in `tmp/emails/`

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Creazione doc Fase 5 |
| 2026-06-10 | Sprint 5A — closure core |
| 2026-06-10 | Sprint 5B — audit, CSV, retry queue |
| 2026-06-10 | Sprint 5C — daily_closures, report notturno — **M5 completata** |
