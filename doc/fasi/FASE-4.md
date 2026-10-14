# Fase 4 — Cassa e pagamenti

> Epic 3 (cassa), 4, 5, 9 | Milestone M4: incasso completo in software (mock fiscale).

## Obiettivo

Main Station (`edge-web` :5173) operativa come **cassa touchscreen**: mappa live, vendita banco, preconto, pagamenti multi-metodo, split romano/analitico, chiusura sessione cassiere — tutto con **mock fiscale** (`hardware-bridge`).

## Stato — ✅ Completata (2026-06-10)

| Area | Stato | Note |
|------|-------|------|
| `CassaPage` fullscreen | ✅ | Entry point predefinito Main Station |
| API `/api/pos/*` | ✅ | bill, prebill, pay, split, counter-sale |
| Stati `BILL_REQUESTED`, `SPLIT_IN_PROGRESS` | ✅ | Runtime + WS broadcast |
| Pagamenti multi-metodo | ✅ | CASH, POS, MEAL_VOUCHER, SATISPAY, OTHER |
| Split romano + analitico | ✅ | `@dnd-kit` drag-and-drop |
| Pagamento remoto handheld | ✅ | `REQUEST_PAYMENT` → cassa |
| Chiusura turno cassiere | ✅ | Cassetto cieco + shift ledger |
| Mock fiscale | ✅ | `hardware-bridge` + JSON in `tmp/prints/` |

## Task

| ID | Task | Stato | US |
|----|------|-------|-----|
| T4.1 | UI cassa touchscreen + mappa live | ✅ | 3.8, 4.1 |
| T4.2 | Vendita banco: Tavolo / Asporto / Delivery | ✅ | 4.1 |
| T4.3 | Sconti + PIN critico single-use | ✅ | 4.5 |
| T4.4 | Preconto mock + stato `BILL_REQUESTED` | ✅ | 4.3 |
| T4.5 | Pagamento + resto 36pt + mock scontrino | ✅ | 4.2, 9.1 |
| T4.6 | Split alla romana | ✅ | 9.2 |
| T4.7 | Split analitico drag-and-drop (`@dnd-kit`) | ✅ | 9.3 |
| T4.8 | Metodi estesi: buoni, Satispay, altri | ✅ | nuovo |
| T4.9 | Pagamento da tablet via WebSocket → edge | ✅ | 9.4 |
| T4.10 | Chiusura sessione cassiere (cassetto cieco) | ✅ | 5.6 |
| T4.11 | Override table lock da cassa con PIN | ✅ | 3.4 |

## API Edge (implementate)

```
GET  /api/pos/payment-requests
GET  /api/pos/tables/:id/bill
POST /api/pos/tables/:id/discount
POST /api/pos/tables/:id/split/roman
POST /api/pos/tables/:id/split/analytic
POST /api/pos/tables/:id/prebill
POST /api/pos/tables/:id/pay
POST /api/pos/counter-sale
POST /api/pos/payment-requests/:id/reject
GET  /api/shifts/:id/summary
POST /api/shifts/:id/close-blind
```

## WebSocket Fase 4

| Messaggio | Stato |
|-----------|-------|
| `REQUEST_PAYMENT` | ✅ |
| `PAYMENT_PENDING` | ✅ |
| `CONFIRM_PAYMENT` | ✅ |
| `PAYMENT_COMPLETE` | ✅ |
| `PAYMENT_REJECTED` | ✅ |
| `TRIGGER_FISCAL_RECEIPT` | ✅ (righe reali) |
| `TABLE_STATUS_UPDATE` | ✅ (`BILL_REQUESTED`, `SPLIT_IN_PROGRESS`, `FREE`) |

## File chiave

| Area | Path |
|------|------|
| UI cassa | `apps/edge-web/src/pages/CassaPage.tsx` |
| Split analitico | `apps/edge-web/src/components/AnalyticSplitPanel.tsx` |
| Chiusura turno | `apps/edge-web/src/components/ShiftCloseModal.tsx` |
| API POS | `services/edge-api/src/routes/pos.ts` |
| Pagamenti | `services/edge-api/src/lib/payment.ts` |
| Shift ledger | `services/edge-api/src/lib/shift-ledger.ts` |
| Runtime split | `services/edge-api/src/lib/runtime.ts` |

## Flusso test

1. Handheld → ordine → SPEDITO
2. Cassa → preconto → `BILL_REQUESTED`
3. Paga contanti → resto 36pt → tavolo `FREE`
4. Split romano €90 / 3 quote
5. Split analitico drag-and-drop → paga per conto
6. Handheld → RICHIEDI PAGAMENTO → cassa incassa
7. Chiusura turno → conteggio cieco → report `tmp/prints/`

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Creazione doc Fase 4 |
| 2026-06-10 | Sprint 4A–4C completati — M4 raggiunta |
