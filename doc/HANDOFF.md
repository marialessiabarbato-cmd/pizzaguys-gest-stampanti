# Handoff — Continuazione sviluppo Pizza Guys Gest

> Usa questo file come contesto in una **nuova chat** per proseguire senza perdere lo stato del progetto.

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

## Decisioni chiave (non ridiscutere)

- Intero ecosistema web (Cloud + Edge + PWA)
- Pilota: **Caserta**, 3 sedi × 3 tablet
- PWA su Fire Tablet; Edge Node.js + hardware-bridge mock
- Stack: pnpm + Turborepo, React 19, Fastify, Drizzle, PostgreSQL + SQLite edge
- Fase 4–6: **mock fiscale** — RT Micrelec reale solo in Fase 7

## Documentazione

| File | Contenuto |
|------|-----------|
| `doc/PIANO-OPERATIVO.md` | Piano completo |
| `doc/FASE-1.md` … `doc/FASE-5.md` | Fasi completate |
| `doc/FASE-6.md` | **Pilota Caserta (in corso)** |
| `doc/GIRO-TEST-LOCALE.md` | **Checklist test MVP su PC/Mac** |
| `doc/HANDOFF.md` | Questo file |
| `deploy/cloud/README.md` | Deploy cloud T6.1 |

## Avvio dev

```bash
docker compose up -d && npx pnpm@9.15.9 dev
```

Seed pilota:

```bash
pnpm db:migrate
pnpm --filter @pizzaguys/db seed
pnpm db:seed:menu
```

## Credenziali

- **SuperAdmin:** `admin@pizzaguys.it` / `PizzaGuys2026!`
- **Cameriere PIN:** creato su Main Station → Staff (4 cifre)
- **Manager PIN:** staff con ruolo CASHIER o USER_ADMIN

## Porte

| Servizio | URL |
|----------|-----|
| Cloud Admin | http://localhost:3000 |
| Main Station (cassa + admin) | http://localhost:5173 |
| Handheld (cameriere) | http://localhost:5174 |
| KDS simulato | http://localhost:5175 |
| Edge API + WS | http://localhost:4100 / ws://localhost:4100/ws |
| Cloud API | http://localhost:4000 |

## Fase 6 — prossimi step

Vedi `doc/FASE-6.md`:

1. **T6.1** — Deploy cloud EU (Fly/Railway) — scaffold in `deploy/cloud/`
2. **T6.2** — `scripts/edge/install-caserta.sh` su mini PC
3. **T6.3** — Tablet Fire + LAN (on-site)
4. **T6.4** — `pnpm db:seed:menu` (80 articoli ✅ script pronto)
5. **T6.5** — Estendere e2e Playwright (`e2e/`)
6. **T6.6** — Formazione staff Caserta

## Prompt per nuova chat

```
Continua Pizza Guys Gest — Fase 6 Pilota Caserta.
Leggi doc/HANDOFF.md e doc/FASE-6.md.
Prossimo: [deploy cloud / e2e flussi / formazione].
```
