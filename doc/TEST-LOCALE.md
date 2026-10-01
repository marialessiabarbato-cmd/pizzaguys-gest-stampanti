# Test locale — link e accessi

Ambiente di sviluppo su questo Mac (copia `pizzaguys-gest-stampanti-fix-richieste`).

## Link

| App | Link | Accesso |
|-----|------|---------|
| Cloud Admin (SuperAdmin) | http://localhost:3000/login | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| Cassa — Main Station | http://localhost:5173 | PIN cassiera `5678` (vale anche come PIN manager) |
| Palmare cameriere (sala) | http://localhost:5174 | PIN cameriere `1234` |
| KDS cucina (simulato) | http://localhost:5175 | — |

API (solo per script/debug): Cloud `http://localhost:4000`, Edge `http://localhost:4100`.

## Operatori di test (Edge, sede Caserta — Corso Trieste)

| Nome | Ruolo | PIN |
|------|-------|-----|
| Mario Cameriere | WAITER | `1234` |
| Lucia Cassiera | CASHIER | `5678` |

Sala: "Sala Principale" con 12 tavoli (1–12), più Asporto e Delivery.

## Stampante reale (POS Italia ST30)

- Tutte le stampanti dell'Edge (Cucina, Pizzeria, Bar, Riepilogo Chef) puntano a `192.168.123.100:9100`.
- Collegata via adattatore USB-LAN (`en9`). Dopo ogni riavvio del Mac rieseguire:

  ```bash
  sudo ifconfig en9 alias 192.168.123.50 255.255.255.0
  ```

- Escono su carta: comande, annulli, preconto, chiama portata, lista prenotazioni.
- Scontrino fiscale, Z-report e cassetto restano simulati: file in `tmp/prints/` (RT reale in Fase 7).
- Senza ST30: `node scripts/fake-printer.mjs` simula una stampante su `127.0.0.1:9100` (ripuntare le stampanti a `127.0.0.1`).

## Avvio dopo un riavvio

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH   # Node 22 obbligatorio
docker compose up -d                               # container pizzaguys-fix-richieste-* (5433/6380)
pnpm dev
```

## Test automatici

```bash
pnpm typecheck && pnpm test                 # typecheck + unit
pnpm test:e2e                               # Playwright (servizi avviati)
python3 scripts/smoke-giro-test.py          # giro completo API cloud + edge
python3 scripts/smoke-feature-richieste.py  # feature richieste cliente
```

Checklist manuale: [`CHECKLIST-TEST-MANUALI.md`](CHECKLIST-TEST-MANUALI.md).
