# Ambiente locale — avvio, accessi, test

Aggiornato: **14 ottobre 2026**. Variabili d'ambiente: [`VARIABILI-AMBIENTE.md`](VARIABILI-AMBIENTE.md).

## Avvio

```bash
./scripts/dev-up.sh                 # tutto: Docker, DB, app, provisioning Edge di test
./scripts/dev-up.sh --stop          # ferma le app (Postgres e Redis restano accesi)
./scripts/dev-up.sh --reset-edge    # Edge da zero
```

Alla fine del provisioning arriva una notifica macOS; l'esito è in `tmp/dev-up.log`. Se una porta è
già occupata lo script si ferma e suggerisce `--stop`. I comandi `pnpm` e `gh` stanno in `~/.local/bin`
(nel PATH tramite `~/.zprofile`).

<details>
<summary>Passi manuali equivalenti (senza lo script)</summary>

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm exec turbo build --filter='./packages/*' --filter='./services/hardware-bridge'
pnpm db:migrate
pnpm --filter @pizzaguys/db seed      # brand + SuperAdmin
pnpm db:seed:menu                     # menu "Travelling Kitchen" + sede Caserta
pnpm dev
python3 scripts/dev-provision-edge.py # provisioning Edge, operatori e tavoli di test
```
</details>

**Più copie del progetto sullo stesso Mac:** nel `.env` di ognuna impostare `COMPOSE_PROJECT_NAME`,
`COMPOSE_CONTAINER_PREFIX`, `POSTGRES_HOST_PORT` / `REDIS_HOST_PORT` (con `DATABASE_URL` sulla stessa
porta) e `CLOUD_API_PORT` / `EDGE_API_PORT`. Smoke test e Playwright vanno poi lanciati con
`CLOUD_API_URL` / `EDGE_API_URL`, es. `CLOUD_API_URL=http://localhost:4001 EDGE_API_URL=http://localhost:4101 pnpm test:e2e`.

**Spostare il lavoro su un altro PC** (dati Cloud, Edge, `.env`):

```bash
./scripts/dev-export.sh               # anche ad ambiente acceso → tmp/backup/pizzaguys-backup-<data>.tar.gz
./scripts/dev-import.sh <archivio>    # sul nuovo PC, ad ambiente fermo; poi ./scripts/dev-up.sh senza --reset-edge
```

L'archivio contiene segreti (token sede, hash dei PIN, dati clienti): solo canali privati, mai GitHub.
Lavorare su un PC alla volta: due copie degli stessi dati non si riuniscono.

## Accessi e dati di test

Creati da `scripts/dev-provision-edge.py` (sede **Caserta — Corso Trieste**):

| App | Link | Accesso |
|-----|------|---------|
| Cloud Admin | http://localhost:3000/login | `admin@pizzaguys.it` / `PizzaGuys2026!` |
| Cassa — Main Station | http://localhost:5173 | PIN `5678` — Test Admin (Admin di sede): apre la cassa, PIN manager, **Impostazioni** |
| Palmare | http://localhost:5174 | PIN `1234` Test Cameriere · `1111` Marco Rossi |
| KDS | http://localhost:5175 | — |

- Sala "Interna" con i tavoli **T1–T4**, più Asporto e Delivery. Menu "Travelling Kitchen": 42 prodotti.
- Nessun Cassiere: la cassa si usa con Test Admin. Sono i PIN che si aspetta `smoke-giro-test.py`.
- **Impostazioni** (Sala, Stampanti, Routing, Staff) compare solo all'Admin di sede; le stesse modifiche
  via API richiedono il suo token di sessione.
- Gli operatori si gestiscono anche da Cloud Admin → Utenti: creazioni, modifiche ed eliminazioni
  arrivano all'Edge entro un minuto (un operatore eliminato dal Cloud viene disattivato).

**Cassa pranzo/cena.** Senza sessione di cassa aperta l'Edge blocca comande, incassi e banco
(`409 CASH_SESSION_CLOSED`, banner "Cassa chiusa"). Apre e chiude solo Cassiere o Admin di sede con PIN;
ogni servizio si apre una volta al giorno. Regole: [`PIANO-TURNI-CASSA.md`](PIANO-TURNI-CASSA.md).

## Da smartphone o tablet

1. Mac e telefono sulla **stessa rete Wi-Fi** (quella del personale: la rete ospiti spesso isola i dispositivi).
2. `./scripts/dev-up.sh` stampa gli indirizzi per il telefono, es. `http://192.168.1.16:5174`. L'IP cambia
   con la rete (`ipconfig getifaddr en0`).
3. Sul telefono: indirizzo, PIN `1234`, "Connesso all'edge" sotto il tastierino. Le app usano da sole
   l'IP del Mac per l'Edge: il `.env` non va toccato.

Non si apre? Firewall di macOS (consentire `node`) o rete con isolamento dei dispositivi. Piano B:
hotspot del telefono con il Mac collegato (IP tipo `172.20.10.x`; da provare prima). Senza internet il
locale funziona: si ferma solo la sincronizzazione col Cloud.

Su telefono la mappa sala diventa una griglia di tavoli se non entra nello schermo; su tablet resta 2D.
In HTTP sulla LAN il browser non installa la PWA come app (serve HTTPS): basta il collegamento in Home.

## Stampa

`HARDWARE_BRIDGE_MODE=mock` (default) salva i ticket in `tmp/prints/`; `network` li invia via TCP
all'IP:porta di ogni stampante (Impostazioni → Stampanti). Scontrino fiscale, Z-report e cassetto
restano simulati finché non c'è l'RT Micrelec (Fase 7). `RECEIPT_COPY_PRINT=true` stampa una copia non
fiscale dello scontrino sulla stampante Bar.

### Stampante reale di test — POS Italia ST30

| | |
|---|---|
| Modello | POS Italia ST30 (Pulse / Orderman), termica 80 mm, ESC/POS, 48 colonne Font A |
| IP | `192.168.123.100:9100` statico, DHCP disabilitato, MAC `00:0A:72:93:60:95` |
| Collegamento | Adattatore "USB 10/100 LAN" del Mac, stessa rete fisica della ST30 |

Dopo ogni riavvio del Mac o se si ricollega l'adattatore (chiede la password del Mac):

```bash
sudo ifconfig en12 alias 192.168.123.50 255.255.255.0
```

L'interfaccia cambia nome (era `en9`, oggi `en12`): `networksetup -listallhardwareports | grep -A1 "USB 10/100 LAN"`.
Verifica: `nc -z 192.168.123.100 9100` → `succeeded`, poi la stampa di prova da Impostazioni → Stampanti.

| Esce sulla ST30 | Resta simulato |
|-----------------|----------------|
| Comanda (note, sezioni Ora/Segue), annullo, preconto, marcia, lista prenotazioni, copia non fiscale | Scontrino fiscale, Z-report, cassetto |

### Stampante simulata

```bash
node scripts/fake-printer.mjs 9101    # ascolta su 127.0.0.1:9101, salva in tmp/fake-printer/
```

Segnala code page errate e righe oltre la larghezza carta. Per puntarci le stampanti: Impostazioni →
Stampanti → **Applica a tutte**, oppure via API con il token dell'Admin di sede:

```bash
TOKEN=$(curl -s -X POST -H 'content-type: application/json' -d '{"pin":"5678"}' \
  localhost:4100/api/staff/verify-pin | python3 -c 'import json,sys; print(json.load(sys.stdin)["token"])')
for id in printer-cucina printer-pizzeria printer-bar printer-chef; do
  curl -s -X PATCH -H 'content-type: application/json' -H "authorization: Bearer $TOKEN" \
    -d '{"host":"127.0.0.1","port":9101}' localhost:4100/api/printers/$id; done
```

> ⚠️ `smoke-giro-test.py` fa decine di ordini: con la ST30 in `network` stampa decine di ticket.
> Prima puntare le stampanti al simulatore.

## Ripartire da zero

`./scripts/dev-up.sh --reset-edge` azzera il database dell'Edge (`tmp/edge.sqlite`: cassa, tavoli, conti,
stato operativo) e lo riprovisiona; operatori e menu tornano dal Cloud. Serve anche quando pranzo e cena
di oggi sono già stati usati dagli smoke test. Un tavolo aperto senza piatti non si libera ancora
dall'app (T22 in [`PROSSIMI-STEP.md`](PROSSIMI-STEP.md)): si libera con la chiusura della giornata o col reset.

## Test

```bash
pnpm typecheck && pnpm test                  # come la CI
pnpm test:e2e                                # Playwright, servizi avviati
python3 scripts/smoke-giro-test.py           # giro completo Cloud + Edge
python3 scripts/smoke-feature-richieste.py   # richieste cliente (apre e chiude la cassa se serve)
python3 scripts/smoke-restart.py             # stato dopo riavvio Edge (--crash per kill -9)
```

Playwright la prima volta: `cd e2e && pnpm exec playwright install chromium` (aggiungere `webkit` per
provare Safari). Lo stato operativo dell'Edge (tavoli, ordini, KDS, split, asporti) è salvato in
`runtime_state` di `tmp/edge.sqlite` e ricaricato all'avvio.

Test manuali: [`CHECKLIST-TEST-MANUALI.md`](CHECKLIST-TEST-MANUALI.md) — **S** stampa, **K** cassa, **T** blocchi e turni.
