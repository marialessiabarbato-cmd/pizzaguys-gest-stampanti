# Deploy Cloud — T6.1

Stack target: **Fly.io** o **Railway** (regione EU). Componenti:

| Servizio | Porta | Note |
|----------|-------|------|
| `cloud-api` | 4000 | Fastify + PostgreSQL |
| `cloud-web` | 3000 | Next.js SuperAdmin |
| PostgreSQL | 5432 | Managed (Fly Postgres / Railway) |

## Prerequisiti

```bash
pnpm install
pnpm db:migrate
pnpm --filter @pizzaguys/db seed
pnpm --filter @pizzaguys/db seed:menu
```

## Variabili ambiente (produzione)

| Variabile | Obbligatoria | Esempio |
|-----------|--------------|---------|
| `DATABASE_URL` | sì | `postgresql://...` |
| `JWT_SECRET` | sì | stringa lunga random |
| `SEED_ADMIN_EMAIL` | seed | `admin@pizzaguys.it` |
| `NIGHTLY_REPORT_ENABLED` | no | `true` |
| `EMAIL_MOCK_DIR` | no | `/data/emails` (o provider SMTP futuro) |

Per `cloud-web`:

| Variabile | Esempio |
|-----------|---------|
| `NEXT_PUBLIC_CLOUD_API_URL` | `https://api.pizzaguys.it` |

## Fly.io (consigliato EU)

```bash
# Postgres
fly postgres create --name pizzaguys-db --region fra

# API
cd deploy/cloud
fly launch --config fly.toml --name pizzaguys-api --region fra --no-deploy
fly secrets set DATABASE_URL="..." JWT_SECRET="..." -a pizzaguys-api
fly deploy -a pizzaguys-api

# Web (build separato o monorepo root con dockerfile next)
# fly launch per cloud-web con NEXT_PUBLIC_CLOUD_API_URL
```

## Railway

1. Nuovo progetto → PostgreSQL plugin
2. Servizio `cloud-api` da root repo, build command:
   `pnpm install && pnpm --filter @pizzaguys/cloud-api build`
3. Start: `node apps/cloud-api/dist/index.js`
4. Servizio `cloud-web` con `next start` dopo `pnpm --filter cloud-web build`

## Post-deploy checklist

- [ ] Migrazione DB (`pnpm db:migrate` contro DATABASE_URL prod)
- [ ] Seed admin + menu pilota
- [ ] Creare sede Caserta e salvare API token
- [ ] Health: `GET /health` → `{ ok: true }`
- [ ] Login SuperAdmin su cloud-web
- [ ] Test sync: edge provision + heartbeat

## Dev locale (riferimento)

```bash
docker compose up -d
pnpm dev
```

Cloud API: http://localhost:4000 · Admin: http://localhost:3000
