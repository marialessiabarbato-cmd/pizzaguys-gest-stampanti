# Test locale — link e accessi

Ambiente di sviluppo su questo Mac (copia `pizzaguys-gest-stampanti-fix-richieste`, branch `test-stampa`).
Aggiornato: **3 ottobre 2026**.

## Link

| App | Link | Accesso |
|-----|------|---------|
| Cloud Admin (SuperAdmin) | http://localhost:3000/login | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| Cassa — Main Station | http://localhost:5173 | PIN cassiera `5678` (vale anche come PIN manager) |
| Palmare cameriere (sala) | http://localhost:5174 | PIN cameriere `1234` |
| KDS cucina (simulato) | http://localhost:5175 | — |

API (solo per script/debug): Cloud `http://localhost:4000`, Edge `http://localhost:4100`.

## Dati di test (sede Caserta — Corso Trieste)

| Nome | Ruolo | PIN |
|------|-------|-----|
| Mario Cameriere | WAITER | `1234` |
| Lucia Cassiera | CASHIER | `5678` |

- Sala: "Sala Principale" con 12 tavoli (1–12), più Asporto e Delivery.
- Menu: "Travelling Kitchen" — 11 categorie, 42 prodotti, stesso prezzo su sala/asporto/delivery.
- I PIN `1234`/`5678` sono quelli attesi da `scripts/smoke-giro-test.py`.

## Configurazione `.env` attuale

| Variabile | Valore | Effetto |
|-----------|--------|---------|
| `COMPOSE_CONTAINER_PREFIX` | `pizzaguys-fix-richieste` | Container dedicati, non quelli `pizzaguys-*` di altre copie |
| `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` | `5433` / `6380` | `DATABASE_URL` e `REDIS_URL` puntano qui |
| `HARDWARE_BRIDGE_MODE` | `network` | Ticket ESC/POS inviati in rete alle stampanti |
| `RECEIPT_COPY_PRINT` | `true` | Copia non fiscale dello scontrino a ogni incasso |

## Stampante reale (POS Italia ST30)

| | |
|---|---|
| Modello | POS Italia ST30 (Pulse / Orderman), termica 80 mm, ESC/POS, 48 colonne Font A |
| IP | `192.168.123.100:9100` statico, DHCP disabilitato, MAC `00:0A:72:93:60:95` |
| Collegamento | Cavo diretto all'adattatore USB-LAN del Mac (`en9`) |
| Stampanti Edge | Cucina, Pizzeria, Bar, Riepilogo Chef → tutte `192.168.123.100:9100` |

Dopo **ogni riavvio del Mac** (scrivere la password nella scheda del Terminale):

```bash
sudo ifconfig en9 alias 192.168.123.50 255.255.255.0
```

Verifica: `nc -z 192.168.123.100 9100` → `succeeded`; poi `curl -X POST localhost:4100/api/printers/printer-cucina/test`.

| Esce sulla ST30 | Resta simulato (file in `tmp/prints/`) |
|-----------------|-----------------------------------------|
| Comanda (con note e sezioni Ora/Segue), annullo, preconto, marcia, lista prenotazioni, copia non fiscale scontrino | Scontrino fiscale, Z-report, cassetto (RT Micrelec in Fase 7) |

### Stampante simulata (senza ST30)

```bash
node scripts/fake-printer.mjs 9101    # ascolta su 127.0.0.1:9101, salva in tmp/fake-printer/
```

Poi puntare le stampanti al simulatore (Main Station → Stampanti → **Applica a tutte**, oppure via API) e riportarle alla ST30 a fine test:

```bash
for id in printer-cucina printer-pizzeria printer-bar printer-chef; do
  curl -s -X PATCH -H 'content-type: application/json' \
    -d '{"host":"127.0.0.1","port":9101}' localhost:4100/api/printers/$id; done
```

Il simulatore segnala code page errate e righe oltre la larghezza carta.

## Avvio dopo un riavvio

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH   # Node 22 obbligatorio
open -a Docker                                     # attendere che Docker sia pronto
docker compose up -d                               # container pizzaguys-fix-richieste-*
pnpm dev
sudo ifconfig en9 alias 192.168.123.50 255.255.255.0   # solo per la ST30
```

## Test automatici

```bash
pnpm typecheck && pnpm test                 # typecheck + unit (+ e2e se servizi attivi)
pnpm test:e2e                               # Playwright (servizi avviati)
python3 scripts/smoke-feature-richieste.py  # feature richieste cliente
python3 scripts/smoke-giro-test.py          # giro completo API cloud + edge
python3 scripts/smoke-restart.py            # T19: stato operativo dopo riavvio Edge (--crash per kill -9)
```

Lo stato operativo (tavoli aperti, ordini, KDS, split, asporti, incassi del turno) è salvato nella
tabella `runtime_state` di `tmp/edge.sqlite` e ricaricato all'avvio dell'Edge.

> ⚠️ `smoke-giro-test.py` esegue decine di ordini e incassi: con la ST30 collegata stampa decine di
> ticket. Prima di lanciarlo puntare le stampanti al simulatore (vedi sopra).

Checklist manuale: [`CHECKLIST-TEST-MANUALI.md`](CHECKLIST-TEST-MANUALI.md) — sezione **S** per la stampa.
