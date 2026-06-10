# Fase 2 — Edge provisioning e sala

> Epic 3 | Milestone M2: Sede provisionata, sala mappata, stampanti routate (mock).

## Obiettivo

Main Station locale: provisioning via token cloud, SQLite edge, sala builder 2D, stampanti mock, routing categorie, staff con PIN, WebSocket LAN.

## Task

| ID | Task | Stato | US |
|----|------|-------|-----|
| T2.1 | Schermata UNPROVISIONED + handshake HTTPS | ✅ | 3.1 |
| T2.2 | SQLite locale + popolamento snapshot | ✅ | 3.1 |
| T2.3 | Sala Builder 2D (Konva): sale, tavoli XY, virtuali | ✅ | 3.2 |
| T2.4 | Censimento stampanti + test mock print | ✅ | 3.3 |
| T2.5 | Routing categorie → centri di lavoro | ✅ | 3.3 |
| T2.6 | Gestione staff locale + PIN + turni | ✅ | 3.6, 3.7 |
| T2.7 | Server WebSocket edge (handshake, broadcast) | ✅ | 6.1 |

## Package `@pizzaguys/edge-db`

SQLite locale (`EDGE_DB_PATH`, default `./tmp/edge.sqlite`):

- `edge_state` — provisioning, token, schema version
- `menu_cache` — snapshot menu dal cloud
- `rooms`, `tables` — mappa sala (+ virtuali ASPORTO/DELIVERY)
- `printers`, `category_routing`
- `staff`, `staff_shifts`

## API Edge

Base URL: `http://localhost:4100` · WebSocket: `ws://localhost:4100/ws`

### Status & provisioning

```
GET  /health
GET  /api/status
GET  /api/menu
POST /api/provision          → body: { apiToken }
```

### Sala

```
GET    /api/rooms
POST   /api/rooms
DELETE /api/rooms/:id
GET    /api/tables?roomId=
POST   /api/tables
PATCH  /api/tables/:id
DELETE /api/tables/:id
```

### Stampanti & routing

```
GET  /api/printers
POST /api/printers
PATCH /api/printers/:id
POST /api/printers/:id/test
POST /api/print/test
GET  /api/category-routing
PUT  /api/category-routing
```

### Staff

```
GET  /api/staff
POST /api/staff
PATCH /api/staff/:id
POST /api/staff/verify-pin
GET  /api/shifts
POST /api/shifts/start
POST /api/shifts/:id/end
```

## UI Edge (`edge-web` :5173)

| Vista | Contenuto |
|-------|-----------|
| UNPROVISIONED | Form token → handshake cloud |
| Sala | Konva 2D, sale tab, tavoli drag, virtuali |
| Stampanti | Lista 4 centri + test mock |
| Routing | Categoria → centro lavoro |
| Staff | CRUD operatori, PIN, turni |

## Flusso provisioning

1. SuperAdmin crea sede su cloud → copia token
2. Edge-web mostra schermata provisioning
3. `POST /api/provision` → cloud handshake → menu in SQLite
4. Heartbeat ogni 60s + delta sync automatico se desync

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Fase 2 completata: edge-db, edge-api refactor, edge-web multi-pagina |
