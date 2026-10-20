# App Windows (Pizza Guys Desktop)

Contenitore Electron che mette in un solo programma l'Edge, la cassa (:5173), il palmare (:5174) e il KDS (:5175).
Non modifica il codice di Edge e web app: le impacchetta così come sono (`apps/desktop`).

## Cosa fa
- Avvia l'Edge come processo separato e lo riavvia se si blocca (log in `%APPDATA%\Pizza Guys\logs`).
- Serve cassa/palmare/KDS in rete locale: i tablet aprono `http://<IP-PC>:5174` (palmare) e `:5175` (KDS).
- Configurazione in `%APPDATA%\Pizza Guys\edge.env` (creata dal template, mai sovrascritta). `KIOSK=true` = schermo intero.
- Backup del database ad ogni avvio e alle 4 di notte (ultimi 14) in `%APPDATA%\Pizza Guys\backup`.
- Avvio automatico al login di Windows.

## Costruire
Prerequisito: build di packages, edge-api e delle tre web app (`pnpm turbo build`).

    pnpm install
    pnpm --filter @pizzaguys/desktop dist:win     # installatore NSIS in apps/desktop/release (da eseguire sul Mac/Windows)

Per una cartella senza installatore (prova): `node scripts/stage.mjs` e poi
`npx electron-builder --config electron-builder.yml --win dir --x64 --projectDir .` (copiare anche `extras/`).

L'installatore NSIS imposta le regole firewall (porte 4100, 5173-5175); nella versione ZIP si usa `extras/Apri-porte-firewall.bat`.

## Da verificare sul PC reale (Windows 10 LTSC 1809)
- L'app parte e il modulo SQLite si carica.
- Stampanti di rete (porta 9100) raggiungibili; i tablet aprono il palmare.
- Il fiscale resta mock finché non c'è l'RT.
- Installatore non firmato: SmartScreen chiede "Esegui comunque".
