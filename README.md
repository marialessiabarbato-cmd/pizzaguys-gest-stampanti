# Pizza Guys Gest

Piattaforma POS multi-sede per Pizza Guys (Cloud + Edge + PWA).

Documentazione: [`doc/PIANO-OPERATIVO.md`](doc/PIANO-OPERATIVO.md) · [`doc/GIRO-TEST-LOCALE.md`](doc/GIRO-TEST-LOCALE.md) · [`doc/HANDOFF.md`](doc/HANDOFF.md)

**Login dev:** `admin@pizzaguys.it` / `PizzaGuys2026!` → http://localhost:3000/login

## Requisiti

- Node.js 22+
- pnpm 9+
- Docker (PostgreSQL + Redis)

## Avvio rapido (sviluppo Mac)

```bash
# 1. Database
docker compose up -d

# 2. Dipendenze
pnpm install

# 3. Env
cp .env.example .env

# 4. Build package condivisi
pnpm exec turbo build --filter='@pizzaguys/*'

# 5. Database schema + seed (prima volta)
pnpm --filter @pizzaguys/db migrate
pnpm --filter @pizzaguys/db seed

# 6. Avvia tutto
pnpm dev
```

## Servizi locali

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Cloud API | http://localhost:4000 |
| Edge Web (cassa) | http://localhost:5173 |
| Handheld (sala) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API + WS | http://localhost:4100 — `ws://localhost:4100/ws |

## Script utili

```bash
pnpm typecheck    # TypeScript
pnpm test         # Vitest
pnpm build        # Build completa
./scripts/git-flow.sh   # Git interattivo
```
