# Fase 1 — Cloud SuperAdmin

> Epic 1–2 | Milestone M1: SuperAdmin crea sede, menu, prezzi; edge può fare handshake.

## Obiettivo

Backoffice cloud per il SuperAdmin: autenticazione, gestione sedi con token API, menu master, parametri brand, dashboard base.

## Task

| ID | Task | Stato | US |
|----|------|-------|-----|
| T1.1 | Auth SuperAdmin (email/password, JWT) | ✅ | — |
| T1.2 | CRUD sedi + token API (genera/revoca) | ✅ | 1.1 |
| T1.3 | Master Menu Builder (categorie, prodotti) | ✅ | 1.2 |
| T1.4 | Matrice prezzi Sede × Canale | ✅ | 1.3 |
| T1.5 | Gruppi varianti + vincoli prezzo | ✅ | 1.4 |
| T1.6 | User Admin per sede + PIN | ✅ | 1.7 |
| T1.7 | Parametri globali brand | ✅ | 1.8 |
| T1.8 | Schema versioning + delta sync | ✅ | 1.9 |
| T1.9 | Dashboard KPI + network health | ✅ | 2.1, 2.2 |

## API Cloud (Fase 1)

Base URL: `http://localhost:4000`

### Auth

```
POST /api/v2/auth/login
Body: { "email": "...", "password": "..." }
→ { token, user: { id, email, firstName, lastName, role } }

GET /api/v2/auth/me
Header: Authorization: Bearer <token>
```

### Sedi

```
GET    /api/v2/locations
POST   /api/v2/locations
POST   /api/v2/locations/:id/regenerate-token  → apiToken mostrato una sola volta
DELETE /api/v2/locations/:id/token             → revoca
```

### Menu

```
GET    /api/v2/categories
POST   /api/v2/categories
POST   /api/v2/categories/reorder              → body: { ids: string[] }
PATCH  /api/v2/categories/:id
DELETE /api/v2/categories/:id

GET    /api/v2/products
POST   /api/v2/products
PATCH  /api/v2/products/:id
DELETE /api/v2/products/:id
```

### Varianti

```
GET    /api/v2/variant-groups
POST   /api/v2/variant-groups
PATCH  /api/v2/variant-groups/:id
DELETE /api/v2/variant-groups/:id

POST   /api/v2/variants
PATCH  /api/v2/variants/:id
DELETE /api/v2/variants/:id
```

### Prezzi

```
GET    /api/v2/product-prices?locationId=
PUT    /api/v2/product-prices                  → upsert singolo
POST   /api/v2/product-prices/bulk-percent     → bulk edit %
```

### Utenti

```
GET    /api/v2/users?locationId=
POST   /api/v2/users                           → crea USER_ADMIN (+ password one-shot)
PATCH  /api/v2/users/:id
```

### Settings & Dashboard

```
GET   /api/v2/settings
PATCH /api/v2/settings
GET   /api/v2/dashboard
GET   /api/v2/audit-logs?limit=&offset=
```

### Edge (pubblico con token sede)

```
POST /api/v2/prov/handshake
POST /api/v2/sync/heartbeat
POST /api/v2/sync/daily-closure
GET  /api/v2/sync/delta?locationId=&sinceVersion=&apiToken=
```

## Schema DB

Vedi `packages/db/src/schema/`. Tabelle principali: `brands`, `locations`, `users`, `categories`, `products`, `variant_groups`, `variants`, `product_prices`, `brand_settings`, `audit_logs`.

## Seed

```bash
npx pnpm@9.15.9 --filter @pizzaguys/db seed
```

Crea brand `Pizza Guys` e SuperAdmin `admin@pizzaguys.it`.

## UI Cloud (pagine)

| Route | Stato |
|-------|-------|
| `/login` | ✅ |
| `/` (dashboard) | ✅ KPI + network health + audit |
| `/locations` | ✅ + rigenera/revoca token |
| `/menu` | ✅ catalogo DnD + varianti + matrice prezzi |
| `/settings` | ✅ |
| `/users` | ✅ |

## Changelog

| Data | Note |
|------|------|
| 2026-06-10 | Avvio Fase 1: auth, DB, sedi, API menu/settings, UI login+dashboard+locations |
| 2026-06-10 | Completamento Fase 1: menu builder UI, prezzi, varianti, utenti, audit, delta sync, heartbeat |
