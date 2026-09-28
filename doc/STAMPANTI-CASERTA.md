# Stampanti fisiche — Pilota Caserta

> Censimento hardware reale per il test delle stampanti in rete
> (`HARDWARE_BRIDGE_MODE=network`, vedi [FASE-6.md](FASE-6.md) T6.2 e
> [PIANO-OPERATIVO.md](PIANO-OPERATIVO.md#63-periferiche-per-sede)).

## Inventario

| # | Marca / Modello | Interfaccia | Seriale | Centro di lavoro | IP |
|---|---|---|---|---|---|
| 1 | Epson TM-T20II (M267E) | **da verificare** — l'etichetta non indica Ethernet | X39A099376 | **BAR** | ⬜ da rilevare |
| 2 | Bicchetti C300H | RS232 + USB + **LAN** (dichiarata) | C300H-BM2312150429 | **CUCINA + PIZZERIA + CHEF** (riepilogo/sollecito) | ⬜ da rilevare |

Entrambe dichiarano supporto **ESC/POS** standard, compatibile con
`NetworkHardwareBridge` (`services/hardware-bridge/src/network-bridge.ts`),
che instrada i ticket via TCP raw sulla porta **9100** (default ESC/POS).

## Stato attuale

- ⬜ IP di entrambe le stampanti — non ancora acquisiti dalla cliente
- ⬜ Conferma interfaccia LAN sulla Epson TM-T20II (M267E) — se priva di
  scheda Ethernet, non può essere collegata via rete e resta in modalità
  mock finché non si decide un'alternativa (adattatore USB→LAN, cambio
  stampante, o interfaccia seriale con bridge dedicato)
- ⬜ Test di stampa reale (una volta noti gli IP)

## Come rilevare l'IP di una stampante termica

1. **Autotest di rete** (universale, funziona su entrambi i modelli):
   spegnere la stampante, tenere premuto il tasto **FEED** e riaccenderla
   tenendolo premuto qualche secondo — stampa un foglio con IP, subnet
   mask e MAC address, se la scheda Ethernet è presente e attiva.
2. **Pannello del router** (`192.168.1.1` o `192.168.0.1` tipicamente) →
   sezione dispositivi connessi / DHCP client list.
3. **EpsonNet Config** (solo Epson) — utility ufficiale gratuita, rileva
   automaticamente le stampanti Epson in rete via USB o LAN.

## Prossimi passi

1. Cliente rileva i 2 IP con il metodo sopra
2. Registrazione stampanti in Main Station → Stampanti (nome, centro di
   lavoro, IP, porta 9100)
3. `HARDWARE_BRIDGE_MODE=network` in `.env` edge
4. Test di stampa reale su entrambe, per il centro corretto
