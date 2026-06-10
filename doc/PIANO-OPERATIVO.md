# Piano Operativo — Pizza Guys Gest

> Documento di riferimento consolidato. Aggiornato prima dell'avvio della **Fase 0**.  
> Fonti: `Documentazione Pizza Guys v2.0.md`, `UserStories .md`, sessioni di discovery.

---

## Indice

1. [Visione e obiettivi](#1-visione-e-obiettivi)
2. [Decisioni consolidate](#2-decisioni-consolidate)
3. [Architettura sistema](#3-architettura-sistema)
4. [Stack tecnologico](#4-stack-tecnologico)
5. [Strategia sviluppo locale (Mac)](#5-strategia-sviluppo-locale-mac)
6. [Produzione (mini PC Caserta)](#6-produzione-mini-pc-caserta)
7. [Perimetro MVP vs Post-MVP](#7-perimetro-mvp-vs-post-mvp)
8. [Modello dati — note chiave](#8-modello-dati--note-chiave)
9. [Piano operativo per fasi e task](#9-piano-operativo-per-fasi-e-task)
10. [Timeline indicativa](#10-timeline-indicativa)
11. [UX pattern di riferimento](#11-ux-pattern-di-riferimento)
12. [Testing](#12-testing)
13. [Mappatura Epic → User Story](#13-mappatura-epic--user-story)
14. [Flussi stampa (requisito core)](#14-flussi-stampa-requisito-core)
15. [Prossimi passi](#15-prossimi-passi)

---

## 1. Visione e obiettivi

### 1.1 Cos'è Pizza Guys Gest

Piattaforma di gestione e automazione per ristorazione multi-punto (benchmark: **Zucchetti Zmenu**), con approccio **cloud-native** e forte **resilienza locale (offline-first)**.

### 1.2 Obiettivi strategici

- **Eliminazione tempi morti in sala:** invio e smistamento comande ottimizzati.
- **Integrità fiscale:** aderenza normativa italiana, riconciliazione automatica.
- **Scalabilità brand:** gestione centralizzata listini con isolamento dati finanziari per sede.

### 1.3 Tre livelli architetturali

| Livello | Ruolo | Connettività |
|---------|-------|--------------|
| **Cloud Hub** | Controllo remoto, menu master, KPI, sync, SDI | Internet |
| **Main Station (Edge)** | DB locale, WebSocket LAN, cassa, bridge hardware | LAN + sync async cloud |
| **Terminali Handheld** | PWA tablet camerieri | WebSocket LAN → Edge |
| **KDS** (opzionale) | Display cucina | WebSocket LAN → Edge |

### 1.4 Ruoli utente

| Ruolo | Ambito | Interfaccia |
|-------|--------|-------------|
| **SuperAdmin** | Brand globale | Cloud Web App |
| **User Admin** (Store Manager) | Singola sede | Main Station Web |
| **Cassiere** | Singola sede | Main Station Web |
| **Cameriere** | Singola sede | PWA Tablet |
| **Operatore cucina** | Singola sede | KDS Web (post-MVP; simulato in MVP) |

### 1.5 Parametri di scala v1

- **Brand:** solo Pizza Guys (Burger Guys = variante prodotto nel catalogo, non tenant separato).
- **Sedi:** 3 (pilota: **Caserta**, il prima possibile).
- **Tablet per sede:** 3.
- **Stampanti:** 1 per centro di lavoro (Cucina, Pizzeria, Bar, Riepilogo Chef) — stessa organizzazione su tutte le sedi.

---

## 2. Decisioni consolidate

Risposte raccolte in fase di discovery (giugno 2026).

### 2.1 Scope e priorità

| # | Domanda | Decisione |
|---|---------|-----------|
| 1 | Scope repository | **Intero ecosistema** (Cloud + Edge + PWA + KDS simulato) |
| 2 | Go-live | **Caserta**, il prima possibile |
| 3 | KDS | **Post-MVP**, ma **simulato nell'MVP** |
| 4 | Multi-brand | **Solo Pizza Guys**; Burger Guys come prodotto |
| 5 | Scala | **3 sedi**, **3 tablet/sede** |

### 2.2 Architettura e UI

| # | Domanda | Decisione |
|---|---------|-----------|
| 6 | Tablet Fire | **PWA in browser** (confermato) |
| 7 | Edge server | **Sì** — Node.js bridge hardware |
| 8 | Hardware produzione | **Mini PC dedicato**; dev su **Mac** con stack replicato |
| 9 | Offline-first | **Confermato** |
| 10 | Multilingua | **Sì**, inclusa gestione prodotti |
| 37 | Tema UI | **Light + Dark** |

### 2.3 Hardware e integrazioni

| # | Domanda | Decisione |
|---|---------|-----------|
| 11 | SDK Micrelec | **Non disponibile** — integrazione in fase successiva |
| 12 | Connessione RT | **Ethernet + seriale** |
| 13 | Stampanti | **ESC/POS standard** come da documentazione |
| 14 | Routing stampa | **1 stampante per centro** di lavoro |
| 15 | POS carte | **Dichiarazione manuale** in riconciliazione |
| 16 | Delivery broker | **Solo canale prezzo** (no import ordini API) |
| 17 | SDI | **Sì**, tramite **intermediario esistente** |
| 44 | Staging hardware | **No** — mock in dev; hardware reale in ultima fase |

### 2.4 Fiscale e contabilità

| # | Domanda | Decisione |
|---|---------|-----------|
| 18 | Aliquote IVA | **4%, 10%, 22%** |
| 19 | P.IVA sedi | **P.IVA propria per sede**; possibilità di più sedi con **stessa P.IVA** |
| 19b | Report P.IVA condivisa | **Opzione B:** sedi trattate separatamente; report **sempre per singola sede** (campo P.IVA condiviso, nessuna aggregazione fiscale per gruppo) |
| 20 | Template commercialista | **Non ancora** — template base da raffinare |
| 21 | Corrispettivi telematici | Cloud **li ritrasmette** |
| 22 | Metodi pagamento | **Sì** — buoni pasto, Satispay, altri (modello estensibile) |
| 28 | Sconti critici | **Solo PIN** Store Manager (single-use) |

### 2.5 Menu e operatività

| # | Domanda | Decisione |
|---|---------|-----------|
| 23 | Dimensione menu | **5–10 categorie**, **3–20 prodotti/categoria** |
| 24 | Import menu esistente | **No** |
| 25 | Marcia portate | **Fisse** per categoria |
| 26 | Allergeni | **14 standard UE** + possibilità integrazione/modifica |
| 27 | Broker delivery | **Personalizzabili** per sede/brand |

### 2.6 Utenti e sicurezza

| # | Domanda | Decisione |
|---|---------|-----------|
| 29 | SuperAdmin | **Più utenti** differenziati; **no SSO** |
| 30 | User Admin | Accesso **solo Main Station** |
| 31 | Cameriere | **Solo PIN** |
| 32 | Privacy | **Anonimizzazione** dati sensibili |
| 33 | Backup cloud | **Sì** |

### 2.7 Brand, infrastruttura, team

| # | Domanda | Decisione |
|---|---------|-----------|
| 34 | Brand book | **Non ancora** — minimal, token-based, modificabile |
| 35 | Riferimento UI | **Migliori UX pattern** selezionati dal team (non replica Zmenu) |
| 36 | Lingua default | **Italiano** + infrastruttura i18n |
| 38 | Budget hosting | **Nessun vincolo** — EU region, free tier iniziale |
| 39 | Dominio/certificati | **Non ancora** |
| 40 | Sviluppo | **Dexin** |
| 41 | Migrazione Zmenu | **No** |
| 42 | Licenze | **Tutto open source** |
| 43 | Testing | **Unit + e2e** subito; **hardware reale** in ultima fase |
| 45 | Formazione | **Sì**, on-site Caserta |

---

## 3. Architettura sistema

### 3.1 Principio guida

> **UI 100% web** (React), **stesso design system** ovunque.  
> **Runtime edge** (Node.js) per WebSocket ad alta frequenza e bridge hardware.  
> Il layer `hardware-bridge` passa da **mock** (MVP) a **driver reale** (post-MVP) senza cambiare la logica di business.

### 3.2 Diagramma — Sviluppo su Mac

```
┌─────────────────────────────────────────────────────────────────┐
│  Mac (sviluppo)                                                 │
│                                                                 │
│  Docker Compose                                                 │
│  ├── PostgreSQL 16                                              │
│  └── Redis 7                                                    │
│                                                                 │
│  apps/cloud-web      :3000   SuperAdmin (Next.js)               │
│  apps/cloud-api      :4000   API REST + WS cloud                │
│  apps/edge-web       :5173   Cassa + User Admin (Vite PWA)      │
│  apps/handheld-web   :5174   Camerieri (Vite PWA)               │
│  apps/kds-web        :5175   KDS simulato (Vite PWA)            │
│  services/edge-api   :4100   Edge API + WebSocket               │
│                                                                 │
│  services/hardware-bridge                                       │
│  ├── MockFiscalDriver    → JSON scontrino fittizio               │
│  └── MockPrinter         → file .escpos in tmp/prints/          │
└─────────────────────────────────────────────────────────────────┘
         │ HTTPS sync (token sede)
         ▼
┌─────────────────────────────────────────────────────────────────┐
│  Cloud (deploy remoto — Fly.io / Railway EU)                    │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 Diagramma — Produzione Caserta (mini PC)

```
┌─────────────────────────────────────────────────────────────────┐
│  Mini PC Ubuntu (Edge Caserta)                                  │
│                                                                 │
│  edge-api + hardware-bridge (systemd)                           │
│  Chromium kiosk → edge-web (fullscreen cassa)                   │
│                                                                 │
│  hardware-bridge (fase 2)                                       │
│  ├── Micrelec Hydra SF20  (Ethernet / seriale)                  │
│  └── Stampanti ESC/POS    (TCP :9100 × 4 centri)              │
└─────────────────────────────────────────────────────────────────┘
         │ HTTPS sync
         ▼
       Cloud Hub

  Tablet Fire (×3)  ──WebSocket LAN──►  edge-api :4100
  KDS monitor       ──WebSocket LAN──►  edge-api :4100  (post-MVP)
```

### 3.4 Canali di vendita

| Canale | Uso | Listino |
|--------|-----|---------|
| **Tavolo** | Sala fisica | Matrice Sede × Tavolo |
| **Asporto** | Ritiro banco | Matrice Sede × Asporto |
| **Delivery** | Rider / broker | Matrice Sede × Delivery (+ maggiorazione broker) |

### 3.5 Sync cloud ↔ edge

| Evento | Direzione | Meccanismo |
|--------|-----------|------------|
| Provisioning iniziale | Cloud → Edge | Full snapshot via `/api/v2/prov/handshake` |
| Modifica menu/prezzi | Cloud → Edge | Delta sync via `Schema_Version` |
| Heartbeat | Edge → Cloud | WebSocket ogni 60s |
| Chiusura giornaliera | Edge → Cloud | POST `/api/v2/sync/daily-closure` (coda retry 15 min) |
| Revoca token/PIN | Cloud → Edge | Push WebSocket realtime |

---

## 4. Stack tecnologico

Tutto **open source**. Monorepo TypeScript unificato.

### 4.1 Struttura repository (target Fase 0)

```
pizzaguys-gest/
├── apps/
│   ├── cloud-web/          # Next.js 15 — SuperAdmin
│   ├── cloud-api/          # Fastify — API cloud
│   ├── edge-web/           # Vite PWA — Cassa + User Admin
│   ├── handheld-web/       # Vite PWA — Camerieri
│   └── kds-web/            # Vite PWA — KDS simulato
├── packages/
│   ├── ui/                 # shadcn/ui + tema light/dark
│   ├── i18n/               # next-intl + i18next shared
│   ├── types/              # DTO WebSocket, entità dominio
│   ├── validators/         # Schemi Zod
│   ├── fiscal/             # IVA, vincoli prezzo, mock receipt
│   └── escpos/             # Layout comande (file in dev)
├── services/
│   ├── edge-api/           # Server edge + WebSocket
│   └── hardware-bridge/    # Interfaccia mock | real
├── docker-compose.yml
├── turbo.json
└── pnpm-workspace.yaml
```

### 4.2 Frontend

| Componente | Tecnologia |
|-----------|------------|
| Cloud admin | Next.js 15 (App Router) |
| Edge / Tablet / KDS | Vite 6 + vite-plugin-pwa |
| UI kit | shadcn/ui + Radix UI |
| Stile | Tailwind CSS v4 |
| Icone | Lucide React |
| State server | TanStack Query v5 |
| State client | Zustand |
| Form | React Hook Form + Zod |
| Tabelle | TanStack Table v8 |
| Grafici | Recharts |
| Drag & Drop | @dnd-kit |
| Sala 2D | Konva.js + react-konva |
| Offline storage | Dexie.js (IndexedDB) |
| Ricerca fuzzy | Fuse.js |
| i18n cloud | next-intl |
| i18n Vite apps | i18next (via packages/i18n) |

### 4.3 Backend

| Componente | Tecnologia |
|-----------|------------|
| Runtime | Node.js 22 LTS |
| Framework API | Fastify |
| ORM | Drizzle |
| DB cloud | PostgreSQL 16 |
| DB edge | SQLite (better-sqlite3) |
| Queue / Cron | BullMQ + Redis |
| WebSocket | @fastify/websocket |
| Auth cloud | JWT + refresh token |
| Token sede | Hash SHA-256 (mai in chiaro dopo provisioning) |
| Email | Provider da definire (Resend / SES) |

### 4.4 DevOps

| Componente | Tecnologia |
|-----------|------------|
| Monorepo | pnpm + Turborepo |
| Container locale | Docker Compose |
| CI | GitHub Actions |
| Test unit | Vitest |
| Test e2e | Playwright |
| Deploy cloud | Fly.io o Railway (EU, free tier iniziale) |
| Deploy edge | Script install systemd su Ubuntu 24.04 |

---

## 5. Strategia sviluppo locale (Mac)

### 5.1 Avvio ambiente

```bash
docker compose up -d          # Postgres + Redis
pnpm install
pnpm dev                    # Avvia tutti i servizi in parallelo (Turborepo)
```

### 5.2 URL e porte

| Servizio | URL | Ruolo simulato |
|----------|-----|----------------|
| cloud-web | http://localhost:3000 | SuperAdmin |
| cloud-api | http://localhost:4000 | API cloud |
| edge-web | http://localhost:5173 | Cassa / User Admin |
| handheld-web | http://localhost:5174 | Cameriere |
| kds-web | http://localhost:5175 | KDS simulato |
| edge-api | ws://localhost:4100 | WebSocket LAN |

### 5.3 Simulazione ruoli

| Ruolo | Metodo |
|-------|--------|
| SuperAdmin | Browser desktop |
| Cassa | Browser fullscreen 1920×1080 (DevTools) |
| Cameriere | DevTools → dimensioni tablet, oppure tablet reale su LAN |
| KDS | Secondo monitor / finestra browser |
| Stampanti | Output file in `tmp/prints/*.escpos` + preview testuale in UI |
| Micrelec RT | MockFiscalDriver → JSON scontrino + ACK simulato |

### 5.4 Test LAN con tablet Fire (pre-deploy)

1. Mac e tablet sulla stessa rete Wi-Fi.
2. Avviare edge-api con `HOST=0.0.0.0`.
3. Su Fire Tablet: Chrome → `http://<IP-Mac>:5174`.
4. Installare come PWA ("Aggiungi a schermata Home").
5. Verificare: WebSocket < 150ms, table locking con 2 dispositivi.

### 5.5 Mock hardware-bridge

```typescript
// Interfaccia unificata — implementazioni intercambiabili
interface HardwareBridge {
  printEscPos(printerId: string, payload: Buffer): Promise<PrintResult>;
  emitReceipt(order: FiscalOrder): Promise<ReceiptResult>;
  emitZReport(): Promise<ZReportResult>;
  openCashDrawer(): Promise<void>;
}

// Dev:  MockHardwareBridge  → file + log
// Prod: RealHardwareBridge   → TCP :9100 + Micrelec driver
```

---

## 6. Produzione (mini PC Caserta)

### 6.1 Specifiche hardware consigliate

| Componente | Specifica |
|-----------|-----------|
| CPU | Intel N100 (o equivalente) |
| RAM | 8 GB |
| Storage | 128 GB SSD |
| Rete | Ethernet Gigabit (obbligatorio) |
| OS | Ubuntu Server 24.04 LTS |

### 6.2 Software

- Node.js 22 LTS + systemd per `edge-api` e `hardware-bridge`
- Chromium in modalità kiosk → `http://localhost:5173` (cassa fullscreen)
- IP statico LAN; stampanti su subnet dedicata se possibile

### 6.3 Periferiche per sede

| Centro | Stampante | Protocollo |
|--------|-----------|------------|
| Cucina | 1× ESC/POS LAN | TCP :9100 |
| Pizzeria | 1× ESC/POS LAN | TCP :9100 |
| Bar | 1× ESC/POS LAN | TCP :9100 |
| Riepilogo Chef | 1× ESC/POS LAN | TCP :9100 |
| Cassa | RT Micrelec Hydra SF20 | Ethernet + seriale (fase 2) |

---

## 7. Perimetro MVP vs Post-MVP

### 7.1 MVP — IN scope (pilota Caserta software)

| ID | Modulo |
|----|--------|
| M1 | Cloud: sedi, token, menu, varianti, matrice prezzi, parametri globali |
| M2 | Cloud: dashboard KPI base, heartbeat |
| M3 | Edge: provisioning token, snapshot menu |
| M4 | Edge: Sala Builder 2D, ASPORTO/DELIVERY virtuali |
| M5 | Edge: routing stampanti (mock print) |
| M6 | PWA cameriere: PIN, mappa tavoli, comanda, varianti, SPEDITO |
| M7 | WebSocket: lock, broadcast, offline parziale, reconnect |
| M8 | Workflow: marcia fissa, HOLD, X DOLCE, storni con PIN |
| M9 | Cassa web: mappa live, carrello, sconti + PIN, preconto (mock) |
| M10 | Pagamenti: contanti, POS, buoni, Satispay, altri; split romano + analitico |
| M11 | Chiusura giornaliera software + riconciliazione + sync cloud |
| M12 | KDS simulato: griglia comande live, stati, timer base |
| M13 | i18n IT + EN (scaffold); allergeni UE standard |
| M14 | Audit log append-only; anonimizzazione PII |

### 7.2 POST-MVP — OUT scope iniziale

| Modulo | Fase |
|--------|------|
| Driver Micrelec reale (Ethernet + seriale) | Fase 7 — Hardware |
| Stampa ESC/POS su hardware reale | Fase 7 — Hardware |
| Fattura elettronica SDI live | Post-MVP |
| Ritrasmissione corrispettivi telematici reali | Con RT collegato |
| Report notturno email HTML | Subito dopo MVP core |
| Export commercialista raffinato | Iterativo |
| KDS produzione (SLA, audio, undo) | Post-MVP |
| Test accettazione hardware reale | Ultima fase |

---

## 8. Modello dati — note chiave

### 8.1 Entità principali

```
Brand (Pizza Guys)
 └── Location (sede)
      ├── piva: string (può essere condivisa tra sedi)
      ├── apiTokenHash: string
      ├── menuVersion: int (Schema_Version)
      ├── Room → Table (x, y, id alfanumerico, coperti default)
      ├── VirtualTable: ASPORTO | DELIVERY
      ├── Printer → WorkCenter → Category routing
      ├── Staff (PIN hash, ruolo, turno)
      └── Order → OrderLine → Variant
           └── Receipt (mock | fiscal)
```

### 8.2 P.IVA condivisa (decisione B)

- Più sedi possono avere lo **stesso valore P.IVA**.
- I report, KPI ed export sono **sempre per singola sede**.
- Nessuna vista aggregata "gruppo fiscale" in v1.

### 8.3 Stati tavolo

| Stato | Colore UI | Descrizione |
|-------|-----------|-------------|
| `FREE` | Verde | Disponibile |
| `OCCUPIED` | Blu | Con ordine attivo |
| `LOCKED` | Rosso | Bloccato da cameriere (table lock) |
| `BILL_REQUESTED` | Giallo lampeggiante | Preconto emesso |
| `SPLIT_IN_PROGRESS` | Badge | Split pagamento in corso |

### 8.4 Metodi di pagamento (estensibile)

- `CASH` — Contanti
- `POS` — Carta (dichiarazione manuale in riconciliazione)
- `MEAL_VOUCHER` — Buoni pasto
- `SATISPAY` — Satispay
- `OTHER` — Altri (configurabili)

### 8.5 Aliquote IVA

- **4%** — alimenti base (se applicabile)
- **10%** — somministrazione / asporto
- **22%** — altre categorie

---

## 9. Piano operativo per fasi e task

### Fase 0 — Fondamenta (2 settimane)

| ID | Task | Output |
|----|------|--------|
| T0.1 | Scaffold monorepo pnpm + Turborepo + Docker Compose | Repo strutturato |
| T0.2 | Design system: shadcn, tema light/dark, token CSS minimal | `packages/ui` |
| T0.3 | Setup i18n (`packages/i18n`, namespace common/menu/pos) | IT + EN scaffold |
| T0.4 | ERD v1 + migrazioni Drizzle iniziali | Schema DB |
| T0.5 | Contratti API `/api/v2/*` + payload WebSocket tipizzati | `packages/types` |
| T0.6 | `hardware-bridge` interfaccia + MockFiscalDriver + MockPrinter | Simulatori HW |
| T0.7 | CI GitHub Actions: lint, typecheck, Vitest | Pipeline verde |

**Gate Fase 0:** `pnpm dev` avvia tutti i servizi; mock stampa su file; tipi WS condivisi.

---

### Fase 1 — Cloud SuperAdmin (3 settimane)

| ID | Task | US |
|----|------|-----|
| T1.1 | Auth SuperAdmin (email/password, no SSO) | — |
| T1.2 | CRUD sedi + campo P.IVA + token API (genera/revoca) | 1.1 |
| T1.3 | Master Menu Builder: categorie DnD, colori HEX, IVA, HOLD, X DOLCE | 1.2 |
| T1.4 | Matrice prezzi Sede × Canale + bulk edit % | 1.3 |
| T1.5 | Gruppi varianti + delta prezzo + vincolo prezzo ≥ 0 | 1.4 |
| T1.6 | Gestione User Admin per sede + PIN | 1.7 |
| T1.7 | Parametri globali (sconto max, lock timeout, broker delivery) | 1.8 |
| T1.8 | Schema versioning + endpoint delta sync | 1.9 |
| T1.9 | Dashboard KPI base + network health panel | 2.1, 2.2 |

**Milestone M1:** SuperAdmin crea sede Caserta, menu completo, prezzi; edge può fare handshake.

---

### Fase 2 — Edge provisioning e sala (2,5 settimane)

| ID | Task | US |
|----|------|-----|
| T2.1 | Schermata UNPROVISIONED + handshake HTTPS | 3.1 |
| T2.2 | SQLite locale + popolamento snapshot | 3.1 |
| T2.3 | Sala Builder 2D (Konva): sale tab, tavoli XY, virtuali | 3.2 |
| T2.4 | Censimento stampanti + test mock print | 3.3 |
| T2.5 | Routing categorie → centri di lavoro | 3.3 |
| T2.6 | Gestione staff locale + PIN + turni | 3.6, 3.7 |
| T2.7 | Server WebSocket edge (handshake, canali broadcast) | 6.1 |

**Milestone M2:** Sede provisionata, sala mappata, stampanti routate (mock).

---

### Fase 3 — Operatività sala (4 settimane)

| ID | Task | US |
|----|------|-----|
| T3.1 | PWA cameriere: lock screen PIN | 6.1 |
| T3.2 | Mappa tavoli live + stati colore + code virtuali | 3.8 |
| T3.3 | Table locking + broadcast + timeout configurabile | 6.3 |
| T3.4 | UI comanda: categorie, carrello, canali, prezzi dinamici | 7.1 |
| T3.5 | Varianti bottom sheet + validazione fiscale riga | 7.2 |
| T3.6 | Ricerca fuzzy + filtri allergeni UE | 7.3 |
| T3.7 | Alert uscita + validazione pre-SPIDITO | 7.4 |
| T3.8 | Marcia fissa per categoria + HOLD + CHIAMA PORTATA | 8.1, 8.2 |
| T3.9 | X DOLCE + coda dessert | 8.3 |
| T3.10 | Storni con PIN + ticket mock ANNULLO invertito | 8.4–8.6 |
| T3.11 | Offline PWA: IndexedDB, disabilita SPEDITO/PAGA | 6.2 |
| T3.12 | KDS simulato: subscribe WS, griglia, timer base | 10.x lite |
| T3.13 | Sblocco tavolo con PIN + recupero bozza | 6.5 |
| T3.14 | Sconti critici da palmare + PIN single-use | 7.5 |

**Milestone M3:** Ciclo completo ordine → cucina (mock print) su LAN.

---

### Fase 4 — Cassa e pagamenti (3 settimane)

| ID | Task | US |
|----|------|-----|
| T4.1 | UI cassa touchscreen + mappa live | 3.8, 4.1 |
| T4.2 | Vendita banco: Tavolo / Asporto / Delivery | 4.1 |
| T4.3 | Sconti + PIN critico single-use | 4.5 |
| T4.4 | Preconto mock + stato Conto Richiesto | 4.3 |
| T4.5 | Pagamento + resto 36pt + mock scontrino | 4.2, 9.1 |
| T4.6 | Split alla romana | 9.2 |
| T4.7 | Split analitico drag-and-drop | 9.3 |
| T4.8 | Metodi estesi: buoni, Satispay, altri | nuovo |
| T4.9 | Pagamento da tablet via WebSocket → edge | 9.4 |
| T4.10 | Chiusura sessione cassiere (cassetto cieco) | 5.6 |
| T4.11 | Override table lock da cassa con PIN | 3.4 |

**Milestone M4:** Incasso completo in software (mock fiscale).

---

### Fase 5 — Chiusura e sync cloud (2 settimane)

> **Stato:** ✅ Completata — audit edge, CSV, retry sync, `daily_closures`, report notturno. Dettaglio: `doc/FASE-5.md`.

| ID | Task | US |
|----|------|-----|
| T5.1 | Validazione sala pre-chiusura (tavoli/conti aperti) | 5.1 |
| T5.2 | Chiusura Z software (mock; interfaccia pronta per RT) | 5.2 |
| T5.3 | Riconciliazione contanti/POS manuale + scostamenti | 5.3 |
| T5.4 | Turni_Chiusi + reset sala + POST sync + coda retry | 5.4 |
| T5.5 | Audit log append-only + anonimizzazione PII | 1.6 |
| T5.6 | Export CSV base commercialista | 2.4 |
| T5.7 | Email report notturno HTML nativo | 2.3 |

**Milestone M5:** Giornata completa locale → cloud.

---

### Fase 6 — Pilota Caserta (2 settimane)

> **Stato:** 🔄 In corso — scaffold deploy, seed menu, script edge, e2e smoke. Dettaglio: `doc/FASE-6.md`.

| ID | Task | Stato |
|----|------|-------|
| T6.1 | Deploy cloud (Fly.io / Railway EU) | 🔄 `deploy/cloud/` |
| T6.2 | Script install mini PC Caserta | 🔄 `scripts/edge/install-caserta.sh` |
| T6.3 | Configurazione 3 tablet Fire + rete LAN | ⬜ runbook in FASE-6 |
| T6.4 | Seed menu Pizza Guys (~80 articoli, 8 categorie) | 🔄 `pnpm db:seed:menu` |
| T6.5 | Test e2e Playwright su flussi critici | 🔄 `e2e/` smoke |
| T6.6 | Formazione on-site staff | ⬜ |

**Milestone M6:** Go-live software Caserta.

---

### Fase 7 — Hardware reale (post-MVP)

| ID | Task |
|----|------|
| T7.1 | Integrazione driver Micrelec (Ethernet + seriale) |
| T7.2 | ESC/POS TCP reale porta 9100 |
| T7.3 | Fattura elettronica via intermediario SDI |
| T7.4 | Ritrasmissione corrispettivi telematici |
| T7.5 | KDS produzione: SLA, audio, undo, stati avanzati |
| T7.6 | Test accettazione su hardware reale |

---

## 10. Timeline indicativa

| Fase | Durata | Cumulativo |
|------|--------|------------|
| Fase 0 — Fondamenta | 2 settimane | 2 sett. |
| Fase 1 — Cloud | 3 settimane | 5 sett. |
| Fase 2 — Edge + Sala | 2,5 settimane | 7,5 sett. |
| Fase 3 — Comanda + KDS sim | 4 settimane | 11,5 sett. |
| Fase 4 — Cassa + Pagamenti | 3 settimane | 14,5 sett. |
| Fase 5 — Chiusura + Sync | 2 settimane | 16,5 sett. |
| Fase 6 — Pilota Caserta | 2 settimane | **18,5 sett.** |
| Fase 7 — Hardware reale | 4+ settimane | post go-live |

**Stima MVP software Caserta: 16–18 settimane** (team 2 dev full-stack).  
Con 3 dev in parallelo su Fasi 3–4: **12–14 settimane**.

---

## 11. UX pattern di riferimento

| Contesto | Pattern |
|----------|---------|
| **Cassa / tablet** | Touch target ≥ 48×48px; numpad fisso per pagamenti; thumb zone per azioni primarie |
| **Mappa sala** | Stati colore + legenda fissa; tap = azione primaria |
| **Comanda** | 2 colonne (categorie \| prodotti); carrello sticky; bottom sheet varianti |
| **PIN** | Tastierino 3×4; mascheramento `****`; auto-submit 4ª cifra; lockout 60s dopo 3 errori |
| **Split analitico** | Due colonne `@dnd-kit`; feedback quota residua in tempo reale |
| **Offline** | Banner giallo non bloccante; SPEDITO/PAGA disabilitati con tooltip |
| **Chiusura** | Wizard step-by-step con checklist bloccanti |
| **Admin cloud** | Sidebar + breadcrumb; tabelle dense con filtri; matrice prezzi inline edit |
| **Dark mode** | Default dark per KDS/cucina; default light per sala; toggle ovunque |
| **Resto** | `RESTO: X.XX €` a ≥ 36pt, full-width, alto contrasto |
| **Storni cucina** | Testo invertito ESC/POS `--- ANNULLO ---` (mock: preview in UI) |

---

## 12. Testing

| Tipo | Quando | Tool |
|------|--------|------|
| Unit | Ogni PR | Vitest |
| Integration API | Fase 1+ | Vitest + supertest |
| e2e flussi critici | Fase 3+ | Playwright |
| WebSocket / latenza | Fase 3 | Test custom (< 150ms target) |
| Offline PWA | Fase 3 | Playwright + service worker |
| Hardware reale | Fase 7 | Manuale + checklist accettazione |

### Flussi e2e prioritari

1. Provisioning sede → snapshot menu
2. Login cameriere PIN → lock tavolo → comanda → SPEDITO
3. Table lock concorrenza (2 client)
4. Split romano → 3 quote → tavolo libero
5. Chiusura giornaliera → sync cloud
6. Sconto critico → PIN → audit log

---

## 13. Mappatura Epic → User Story

### Area 1 — Cloud Hub (SuperAdmin)

| Epic | User Story | MVP |
|------|-----------|-----|
| E1 | 1.1 Onboarding sede + token | ✅ |
| E1 | 1.2 Master Menu Builder | ✅ |
| E1 | 1.3 Matrice prezzi Sede × Canale | ✅ |
| E1 | 1.4 Varianti e vincoli fiscali | ✅ |
| E1 | 1.5 Dashboard analytics | ✅ base |
| E1 | 1.6 Audit log | ✅ |
| E1 | 1.7 User Admin + PIN | ✅ |
| E1 | 1.8 Parametri globali | ✅ |
| E1 | 1.9 Versionamento delta sync | ✅ |
| E2 | 2.1 Dashboard KPI multilivello | ✅ base |
| E2 | 2.2 Heartbeat Main Station | ✅ |
| E2 | 2.3 Report notturno email | ✅ |
| E2 | 2.4 Export commercialista | ✅ base |

### Area 2 — Main Station (Edge)

| Epic | User Story | MVP |
|------|-----------|-----|
| E3 | 3.1 Provisioning token | ✅ |
| E3 | 3.2 Sala Builder 2D | ✅ |
| E3 | 3.3 Device routing stampanti | ✅ mock |
| E3 | 3.4 Override table lock cassa | ✅ |
| E3 | 3.6 Staff + PIN | ✅ |
| E3 | 3.7 Turni operatore | ✅ |
| E3 | 3.8 Mappa live cassa | ✅ |
| E4 | 4.1 UI cassa touchscreen | ✅ |
| E4 | 4.2 RT Micrelec + resto | ✅ mock |
| E4 | 4.3 Preconto | ✅ mock |
| E4 | 4.4 Fattura elettronica SDI | ⏳ post-MVP |
| E4 | 4.5 Sconti critici + PIN | ✅ |
| E5 | 5.1–5.4 Chiusura + riconciliazione + sync | ✅ |
| E5 | 5.6 Chiusura sessione cassiere | ✅ |

### Area 3 — Handheld PWA (Cameriere)

| Epic | User Story | MVP |
|------|-----------|-----|
| E6 | 6.1–6.4 WebSocket, offline, lock, reconnect | ✅ |
| E6 | 6.5 Sblocco tavolo PIN + bozza | ✅ |
| E7 | 7.1–7.4 Comanda, varianti, ricerca, validazione | ✅ |
| E7 | 7.5 Sconti critici palmare | ✅ |
| E8 | 8.1–8.4 Marcia, HOLD, X DOLCE, storni | ✅ |
| E8 | 8.5–8.6 Lucchetto + ticket ANNULLO | ✅ |
| E9 | 9.1–9.4 Pagamenti, split, WS fiscale | ✅ mock |

### Area 4 — KDS

| Epic | User Story | MVP |
|------|-----------|-----|
| E10 | 10.1–10.4 KDS completo | 🔶 simulato in MVP; completo post-MVP |

---

## 14. Flussi stampa (requisito core)

Specifiche da rispettare (mock in MVP, reali in Fase 7).

| Tipo stampa | Requisiti layout |
|-------------|-----------------|
| **Comanda standard** | Centro in alto; tavolo doppia dimensione; varianti con `+` indentate; footer: ospiti, n. articoli, ora, operatore |
| **Comanda in attesa (HOLD)** | Linea tratteggiata `SEGUE → [N]` sotto i piatti in hold |
| **Annullamento** | `--- ANNULLO ---` testo invertito (sfondo nero, testo bianco) |
| **Ristampa** | `*** RISTAMPA ***` in testa e footer |
| **Preconto** | `*** DOCUMENTO NON FISCALE ***` doppia dimensione, testa e coda |
| **Chiama portata** | `=== CHIAMA PORTATA [X] ===` caratteri giganti |
| **Dessert (X DOLCE)** | `*** SERVIZIO DOLCI TAVOLO [ID] ***` |
| **Report giornaliero** | Struttura testuale nativa per parsing email cloud |

---

## 15. Prossimi passi

1. ✅ Documento piano operativo (questo file)
2. ✅ **Fase 0** — Scaffold monorepo (T0.1 → T0.7)
3. ✅ **Fase 1** — Cloud SuperAdmin (vedi `doc/FASE-1.md`)
4. ✅ **Fase 2** — Edge provisioning e sala (vedi `doc/FASE-2.md`)
5. ✅ **Fase 3** — Operatività sala (vedi `doc/FASE-3.md`)
6. ✅ **Fase 4** — Cassa e pagamenti (`doc/FASE-4.md`)
7. ✅ **Fase 5** — Chiusura e sync (`doc/FASE-5.md`)
8. 🔄 **Fase 6** — Pilota Caserta (`doc/FASE-6.md`)
9. 🔄 Seed menu pilota — `pnpm db:seed:menu` (script pronto)
10. 🔄 Deploy cloud EU — `deploy/cloud/README.md`
11. ⬜ Acquisizione hardware Caserta (mini PC + tablet)
12. ⬜ **Fase 7** — Hardware reale Micrelec + ESC/POS

---

## Changelog documento

| Data | Versione | Modifiche |
|------|----------|-----------|
| 2026-06-10 | 1.0 | Creazione iniziale — consolidamento discovery + piano operativo |
| 2026-06-10 | 1.0 | Decisione P.IVA: opzione B (report per sede) |
| 2026-06-10 | 1.1 | Fase 0 completata — scaffold monorepo |
| 2026-06-10 | 1.2 | Fase 1 avviata — auth, DB, sedi; vedi `doc/FASE-1.md` e `doc/HANDOFF.md` |
| 2026-06-10 | 1.3 | Fase 1 completata — menu builder, prezzi, varianti, utenti, audit, delta sync |
| 2026-06-10 | 1.4 | Fase 2 completata — edge-db, provisioning cloud, sala Konva, stampanti, staff, WS |
| 2026-06-10 | 1.5 | Fase 3 completata — handheld PWA, KDS sim, ordini, varianti, offline |
| 2026-06-10 | 1.6 | Fase 4 avviata — doc `FASE-4.md`, cassa e pagamenti |
| 2026-06-10 | 1.7 | Fase 5 completata — chiusura, audit, sync, report notturno |
| 2026-06-10 | 1.8 | Fase 6 avviata — pilota Caserta, seed menu, deploy, e2e |

---

*Documento mantenuto in `doc/PIANO-OPERATIVO.md`. Aggiornare ad ogni milestone o decisione architetturale rilevante.*
