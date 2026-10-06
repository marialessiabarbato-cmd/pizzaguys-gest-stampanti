# Test locale — link e accessi

Ambiente di sviluppo su questo Mac: copia `~/Desktop/✨/Clienti/PizzaGuys/pizzaguys-gest-stampanti`,
branch `fix-comanda-cassa`. Aggiornato: **6 ottobre 2026**.

## Link

| App | Link | Accesso |
|-----|------|---------|
| Cloud Admin (SuperAdmin) | http://localhost:3000/login | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| Cassa — Main Station | http://localhost:5173 | PIN `1234` (Test Admin, vale anche come PIN manager) |
| Palmare cameriere (sala) | http://localhost:5174 | PIN `1111` (Test Cameriere) · `2222` (Marco Rossi) · `1234` |
| KDS cucina (simulato) | http://localhost:5175 | — |

API (solo per script/debug): Cloud `http://localhost:4001`, Edge `http://localhost:4101`
(porte da `.env`: `CLOUD_API_PORT`, `EDGE_API_PORT`; i default senza `.env` sono 4000 / 4100).

Per i test del turno conviene usare due PIN diversi: `1111` sul palmare e `1234` in cassa.

## Dati di test (sede Caserta — Corso Trieste)

| Nome | Ruolo | PIN |
|------|-------|-----|
| Test Admin | USER_ADMIN | `1234` |
| Test Cameriere | WAITER | `1111` |
| Marco Rossi | WAITER | `2222` |

- Sala: "Interna" con un tavolo (**T1**), più Asporto e Delivery.
- Menu: "Travelling Kitchen" — 42 prodotti, stesso prezzo su sala/asporto/delivery.
- Nessun operatore con ruolo CASHIER: la cassa si usa con Test Admin.

> ⚠️ `scripts/smoke-giro-test.py` si aspetta il cameriere con PIN `1234` e un cassiere con PIN `5678`.
> In questo database `1234` è Test Admin e `5678` non esiste: prima di lanciarlo creare un cassiere
> `5678` (Main Station → Staff).

## Configurazione `.env` attuale

| Variabile | Valore | Effetto |
|-----------|--------|---------|
| `COMPOSE_CONTAINER_PREFIX` | `pizzaguys-stampanti` | Container `pizzaguys-stampanti-postgres` / `-redis`, separati da altre copie |
| `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` | `5433` / `6380` | `DATABASE_URL` e `REDIS_URL` puntano qui |
| `CLOUD_API_PORT` / `EDGE_API_PORT` | `4001` / `4101` | Porte delle API (vedi sopra) |
| `HARDWARE_BRIDGE_MODE` | `network` | Ticket ESC/POS inviati in rete alla ST30 (`mock` = file in `tmp/prints/`) |
| `RECEIPT_COPY_PRINT` | non impostata | Nessuna copia non fiscale dello scontrino (`true` per attivarla) |

## Turno di cassa

Senza **almeno un turno cassa aperto** l'Edge blocca invio comande, incassi e ordini al banco
(errore `409 SHIFT_NOT_ACTIVE`): palmare e cassa mostrano il banner "Turno non attivo".
In cassa: **Avvia turno** (banner o barra in alto). Per chiudere il turno la sala deve essere libera.

## Stampante reale (POS Italia ST30)

| | |
|---|---|
| Modello | POS Italia ST30 (Pulse / Orderman), termica 80 mm, ESC/POS, 48 colonne Font A |
| IP | `192.168.123.100:9100` statico, DHCP disabilitato, MAC `00:0A:72:93:60:95` |
| Collegamento | Adattatore "USB 10/100 LAN" del Mac (stessa rete fisica della ST30) |
| Stampanti Edge | Cucina, Pizzeria, Bar, Riepilogo Chef → tutte `192.168.123.100:9100` |

Dopo **ogni riavvio del Mac** o se si ricollega l'adattatore (scrivere la password nella scheda del Terminale):

```bash
sudo ifconfig en12 alias 192.168.123.50 255.255.255.0
```

Il nome dell'interfaccia può cambiare (in passato `en9`, oggi `en12`). Per trovarlo:

```bash
networksetup -listallhardwareports | grep -A1 "USB 10/100 LAN"
```

Verifica: `nc -z 192.168.123.100 9100` → `succeeded`; poi `curl -X POST localhost:4101/api/printers/printer-cucina/test`.

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
    -d '{"host":"127.0.0.1","port":9101}' localhost:4101/api/printers/$id; done
```

Il simulatore segnala code page errate e righe oltre la larghezza carta.

## Avvio dopo un riavvio

```bash
open -a Docker                                         # attendere che Docker sia pronto
docker compose up -d                                   # container pizzaguys-stampanti-*
pnpm dev
sudo ifconfig en12 alias 192.168.123.50 255.255.255.0   # solo per la ST30
```

Il README indica Node 22 (`.nvmrc`); su questo Mac l'ambiente gira anche con Node 25.6.

## Ripartire da zero

Non c'è ancora uno script di reset. Per un ambiente pulito: incassare (o stornare) i tavoli aperti,
poi **Chiudi turno** in cassa. Un tavolo aperto senza piatti non si può ancora liberare dall'app
(vedi `PROSSIMI-STEP.md`, T22).

## Test automatici

```bash
pnpm typecheck && pnpm test                 # typecheck + unit (+ e2e se servizi attivi)
pnpm test:e2e                               # Playwright (servizi avviati)
python3 scripts/smoke-feature-richieste.py  # feature richieste cliente (apre e chiude un turno se serve)
python3 scripts/smoke-giro-test.py          # giro completo API cloud + edge (vedi nota PIN sopra)
python3 scripts/smoke-restart.py            # T19: stato operativo dopo riavvio Edge (--crash per kill -9)
```

Lo stato operativo (tavoli aperti, ordini, KDS, split, asporti, incassi del turno) è salvato nella
tabella `runtime_state` di `tmp/edge.sqlite` e ricaricato all'avvio dell'Edge.

> ⚠️ `smoke-giro-test.py` esegue decine di ordini e incassi: con la ST30 collegata stampa decine di
> ticket. Prima di lanciarlo puntare le stampanti al simulatore (vedi sopra).

Checklist manuale: [`CHECKLIST-TEST-MANUALI.md`](CHECKLIST-TEST-MANUALI.md) — sezione **S** per la stampa,
sezione **T** per turno, comanda palmare/cassa e HOLD.
