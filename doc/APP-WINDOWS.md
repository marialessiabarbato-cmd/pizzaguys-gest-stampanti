# App Windows (Pizza Guys Desktop)

Contenitore Electron che mette in un solo programma l'Edge, la cassa (:5173), il palmare (:5174) e il KDS (:5175).
Non modifica il codice di Edge e web app: le impacchetta così come sono (`apps/desktop`).

## Cosa fa
- Avvia l'Edge come processo separato e lo riavvia se si blocca. Log in un file al giorno (`app-AAAA-MM-GG.log`, `edge-AAAA-MM-GG.log`), tenuti 7 giorni.
- Serve cassa/palmare/KDS in rete locale: i tablet aprono `http://pizzaguys-cassa.local:5174` (palmare) e `:5175` (KDS), o l'IP del PC. Il nome resta valido anche se il router cambia l'IP (mDNS, UDP 5353).
- Configurazione in `edge.env` (versione ZIP: accanto all'exe; installata: `%APPDATA%\Pizza Guys`), creata dal template e mai sovrascritta. `KIOSK=true` = schermo intero.
- Backup del database ad ogni avvio e alle 4 di notte, tenuti 7 giorni (sempre almeno gli ultimi 3).
- In cassa il pulsante "Rete" apre lo Stato rete (stampanti, palmari, KDS, Cloud) con cosa fare.
- Avvio automatico al login di Windows.

## Costruire
Prerequisito: build di packages, edge-api e delle tre web app (`pnpm turbo build`).

    pnpm install
    pnpm --filter @pizzaguys/desktop dist:win     # installatore NSIS in apps/desktop/release (da eseguire sul Mac/Windows)

**Versione ZIP (quella usata nel locale)**, dal Mac: `pnpm --filter @pizzaguys/desktop zip:win`
(dopo `pnpm turbo build`). Crea `apps/desktop/release/PizzaGuys-<versione>-win-x64.zip` con l'app,
`extras/` (LEGGIMI, firewall, edge.env di esempio) e la cartella `dati` vuota. Aggiornamento sul PC:
vedi `extras/LEGGIMI.txt` (cartella vecchia rinominata, si ricopiano `dati` ed `edge.env`).

Firewall: nella versione ZIP `extras/Apri-porte-firewall.bat` (come amministratore) apre TCP 4100, 5173-5175 e UDP 5353 (nome in rete). L'installatore NSIS usa `build/installer.nsh` (non in git): va aggiunta anche lì la regola UDP 5353 se si torna all'installatore.

## Da verificare sul PC reale (Windows 10 LTSC 1809)
- L'app parte e il modulo SQLite si carica.
- Stampanti di rete (porta 9100) raggiungibili; i tablet aprono il palmare.
- Il fiscale resta mock finché non c'è l'RT.
- Installatore non firmato: SmartScreen chiede "Esegui comunque".
