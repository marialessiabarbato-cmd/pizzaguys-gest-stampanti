# Test locale — link e accessi

Ambiente di sviluppo su questo Mac: `~/IA_PROJECT/HuBbì/pizzaguys-gest-stampanti`.
Aggiornato: **14 ottobre 2026**. Avvio: `./scripts/dev-up.sh` (dati di test creati da
`scripts/dev-provision-edge.py`).

## Link

| App | Link | Accesso |
|-----|------|---------|
| Cloud Admin (SuperAdmin) | http://localhost:3000/login | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| Cassa — Main Station | http://localhost:5173 | PIN `5678` (Test Admin: apre la cassa, PIN manager, Impostazioni) |
| Palmare cameriere (sala) | http://localhost:5174 | PIN `1234` (Test Cameriere) · `1111` (Marco Rossi) |
| KDS cucina (simulato) | http://localhost:5175 | — |

API (solo per script/debug): Cloud `http://localhost:4000`, Edge `http://localhost:4100`
(porte da `.env`: `CLOUD_API_PORT`, `EDGE_API_PORT`).

Per i test della cassa conviene usare due PIN diversi: `1234` sul palmare (cameriere: non può aprire
la cassa né vedere le Impostazioni) e `5678` in cassa (Admin di sede).

## Da smartphone (test in sede con il Mac)

1. Mac e telefono sulla **stessa rete Wi-Fi** (la rete ospiti spesso isola i dispositivi tra loro:
   usare quella del personale).
2. `./scripts/dev-up.sh`: all'avvio stampa gli indirizzi da aprire sul telefono, es.
   `http://192.168.1.69:5174` (palmare). L'IP del Mac cambia con la rete: si legge anche con
   `ipconfig getifaddr en0`.
3. Sul telefono aprire l'indirizzo, PIN `1234`. "Connesso all'edge" sotto il tastierino = ok.
   Le app usano da sole l'IP del Mac per parlare con l'Edge: il `.env` non va toccato.

Se il telefono non apre la pagina: firewall di macOS (Impostazioni di Sistema → Rete → Firewall:
consentire `node`), oppure rete con isolamento client. Piano B (da provare prima di andare):
hotspot del telefono, con il Mac collegato a quell'hotspot e l'indirizzo stampato da `dev-up.sh`
(su iPhone l'IP è del tipo `172.20.10.x`).
Senza internet il locale funziona lo stesso: si ferma solo la sincronizzazione con il Cloud.

## Dati di test (sede Caserta — Corso Trieste)

| Nome | Ruolo | PIN |
|------|-------|-----|
| Test Admin | USER_ADMIN | `5678` |
| Test Cameriere | WAITER | `1234` |
| Marco Rossi | WAITER | `1111` |

- Sala: "Interna" con i tavoli **T1–T4**, più Asporto e Delivery.
- Menu: "Travelling Kitchen" — 42 prodotti, stesso prezzo su sala/asporto/delivery.
- Nessun operatore con ruolo CASHIER: la cassa si usa con Test Admin.
- Sono i PIN che si aspetta `scripts/smoke-giro-test.py`.

## Configurazione `.env` attuale

| Variabile | Valore | Effetto |
|-----------|--------|---------|
| `COMPOSE_CONTAINER_PREFIX` | non impostata | Container `pizzaguys-postgres` / `-redis` |
| `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` | `5432` / `6379` (default) | `DATABASE_URL` e `REDIS_URL` puntano qui |
| `CLOUD_API_PORT` / `EDGE_API_PORT` | `4000` / `4100` | Porte delle API (vedi sopra) |
| `HARDWARE_BRIDGE_MODE` | `mock` | Ticket salvati in `tmp/prints/`; `network` = inviati in rete alla ST30 |
| `RECEIPT_COPY_PRINT` | non impostata | Nessuna copia non fiscale dello scontrino (`true` per attivarla) |

## Cassa (pranzo / cena)

Senza una **sessione di cassa aperta** l'Edge blocca invio comande, incassi e ordini al banco
(errore `409 CASH_SESSION_CLOSED`): palmare e cassa mostrano il banner "Cassa chiusa".
Solo l'operatore cassa (Cassiere o Admin di sede) apre la cassa: **Apri cassa** → servizio, fondo
iniziale, PIN. **Chiudi cassa**: prelievi, conteggio contanti, strisciata POS, scostamenti, fondo
lasciato, PIN; il report esce sulla stampante Bar. I conti in attesa bloccano la chiusura, i tavoli
aperti no. I turni degli operatori partono all'accesso con PIN e sono solo presenze (Account →
**Operatori in turno**). Regole complete: [`PIANO-TURNI-CASSA.md`](PIANO-TURNI-CASSA.md).

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
# le modifiche a stampanti, routing, sala e staff richiedono la sessione dell'Admin di sede
TOKEN=$(curl -s -X POST -H 'content-type: application/json' -d '{"pin":"5678"}' \
  localhost:4100/api/staff/verify-pin | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
for id in printer-cucina printer-pizzeria printer-bar printer-chef; do
  curl -s -X PATCH -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"host":"127.0.0.1","port":9101}' localhost:4100/api/printers/$id; done
```

**Impostazioni** (Sala, Stampanti, Routing, Staff) compare nel menu Account della cassa solo all'Admin
di sede. Gli operatori si gestiscono anche da Cloud Admin → Utenti: creazioni, modifiche ed
eliminazioni arrivano all'Edge entro un minuto (un operatore eliminato dal Cloud viene disattivato).

Il simulatore segnala code page errate e righe oltre la larghezza carta.

## Avvio dopo un riavvio

```bash
open -a Docker                                         # attendere che Docker sia pronto
docker compose up -d                                   # container pizzaguys-stampanti-*
pnpm dev
sudo ifconfig en12 alias 192.168.123.50 255.255.255.0   # solo per la ST30
```

In alternativa `./scripts/dev-up.sh` fa tutto (Docker, DB, `pnpm dev`, provisioning Edge).
Node 22 o 24: da `better-sqlite3` 12 l'Edge regge anche i riavvii di `tsx watch` su Node 24.

## Ripartire da zero

`./scripts/dev-up.sh --reset-edge` azzera il DB SQLite dell'Edge (`tmp/edge.sqlite`: cassa, tavoli,
conti) e lo riprovisiona; operatori e menu tornano dal Cloud. Serve anche quando pranzo e cena di oggi
sono già stati usati dagli smoke test. Senza reset: incassare (o stornare) i tavoli aperti,
poi **Chiudi cassa** in cassa. Un tavolo aperto senza piatti non si può ancora liberare dall'app
(vedi `PROSSIMI-STEP.md`, T22).

## Test automatici

```bash
pnpm typecheck && pnpm test                 # typecheck + unit (+ e2e se servizi attivi)
pnpm test:e2e                               # Playwright (servizi avviati)
python3 scripts/smoke-feature-richieste.py  # feature richieste cliente (apre e chiude la cassa se serve)
python3 scripts/smoke-giro-test.py          # giro completo API cloud + edge (PIN di test sopra)
python3 scripts/smoke-restart.py            # T19: stato operativo dopo riavvio Edge (--crash per kill -9)
```

Con porte diverse dai default (altra copia del progetto) passare `CLOUD_API_URL` / `EDGE_API_URL`,
ad esempio `CLOUD_API_URL=http://localhost:4001 EDGE_API_URL=http://localhost:4101 pnpm test:e2e`.

I test dell'interfaccia Cloud con Playwright richiedono il browser: `npx playwright install chromium`
(da lanciare una volta).

`pnpm db:migrate` legge il `.env` della copia (porta Postgres 5433): prima del 13/10 usava sempre la
5432, cioè il database dell'altra copia.

Lo stato operativo (tavoli aperti, ordini, KDS, split, asporti) è salvato nella
tabella `runtime_state` di `tmp/edge.sqlite` e ricaricato all'avvio dell'Edge.

> ⚠️ `smoke-giro-test.py` esegue decine di ordini e incassi: con la ST30 collegata stampa decine di
> ticket. Prima di lanciarlo puntare le stampanti al simulatore (vedi sopra).

Checklist manuale: [`CHECKLIST-TEST-MANUALI.md`](CHECKLIST-TEST-MANUALI.md) — sezione **S** per la stampa,
sezione **K** per la cassa (apertura, prelievi, chiusura), **T** per blocchi, turni operatore e comanda.
