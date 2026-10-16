# Piano fix — test in loco del 15/10

> Branch `fix-16ott` (da `main`). Richieste emerse nel servizio di prova del 15/10, decisioni prese il 16/10.
> Legenda: ⬜ da fare · 🔄 in corso · ✅ fatto
> **Stato 16/10:** tutti i 19 punti implementati sul branch `fix-16ott` (typecheck, 138 test unitari e build ok). Da provare in sala prima del merge in `main`.

## Blocco 1 — conto e cassa (prima del prossimo servizio)

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F1 | **Split analitico: coperti come righe singole** | Ogni coperto è una riga da spostare a mano sul conto di chi paga. Causa del buco di 21 € del 15/10 (coperto = una riga "× N") | ✅ |
| F2 | **Pagamento misto contanti + POS** | Dividere liberamente il totale (es. 300 € = 100 contanti + 200 POS). L'API accetta già `paymentSplits` | ✅ |
| F3 | **Tavolo bloccato dopo "indietro" sul palmare** | Android, tasto indietro del telefono. Il blocco va rilasciato sempre all'uscita | ✅ |
| F4 | **Chiudi tavolo da cassa** (con o senza ordini) | Solo cassa, con PIN responsabile. Gli ordini vengono stornati e stampano il ticket di annullo | ✅ |
| F5 | **Ristampa scontrino dalla lista documenti** | Oggi scrive solo un file. Deve uscire come copia non fiscale sulla stampante Bar | ✅ |
| F6 | **Preconto con prezzi, coperto primo, quota a persona** | Riga per riga con prezzi, coperto in cima, sotto il totale "a persona" = totale ÷ coperti | ✅ |

## Blocco 2 — comanda, varianti, sconti

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F7 | **13 varianti in aggiunta** | +2 € ciascuna, nel gruppo varianti con più prodotti (poi si decide se fare un gruppo generale): Mayo, Mayo paprika, Mayo porcini, Ketchup, Salsa Barbecue, Senza lattosio, Pizza bianca (base bianca + mozzarella), Pomodorini, Patatine; rimozioni No fesa, No Sambal, No salsa teriyaki, No miele | ✅ |
| F8 | **"Duplica" variante** in Cloud Admin | Sulla singola variante, accanto a Modifica / Elimina | ✅ |
| F9 | **"+1" sulla riga già spedita** | Crea una nuova riga da spedire con stessa portata e varianti (es. altra acqua) | ✅ |
| F10 | **Palmare: tavolo già aperto si apre sul menu** | Non più sulla comanda | ✅ |
| F11 | **Note / aggiunte / rimozioni visibili nella comanda** | Su cassa e palmare, non solo in stampa | ✅ |
| F12 | **Sconti**: libero in €, % con decimali (es. 0,75%), rimozione coperti | Tutti con PIN responsabile; verificare che il flusso dopo il PIN funzioni | ✅ |
| F13 | **Coperto al primo posto ovunque** | Cassa, comanda, preconto, scontrino | ✅ |
| F14 | **Ristampa comanda del tavolo solo per la cassa** | Copia completa sulla stampante Bar, non ai reparti | ✅ |

## Blocco 3 — delivery, ordinamento, tempi

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F15 | **Delivery: piattaforma e n° ordine** | All'inserimento si sceglie la piattaforma (lista del Cloud) e si scrive il n° ordine; in stampa "GLOVO n° 1234" | ✅ |
| F16 | **Scontrino delivery leggibile** | Al posto del codice alfanumerico: piattaforma + n° ordine | ✅ |
| F17 | **Tabella delivery** come quella dei tavoli | Stesse colonne (piattaforma, n° ordine, orario, stato, totale), suddivisa per piattaforma | ✅ |
| F18 | **Tavoli: tempo dall'ultimo invio in cucina** | Nella tabella tavoli; si azzera a ogni invio/sollecito | ✅ |
| F19 | **Ordinamento a trascinamento** di prodotti e varianti | In Cloud Admin; vale per palmare e cassa | ✅ |

## Dalla lista del 14/10 (`PROSSIMI-STEP.md`) che si sovrappone
- T22 "Libera tavolo" → assorbito da F4 ✅
- T20 annullo al reparto giusto → fatto con F4 ✅ (storno singolo e chiusura tavolo)

## Note di implementazione
- **F1** coperto: una riga per persona solo in split analitico (`__cover_charge__#n`); l'ultimo conto non si incassa con righe non assegnate (409).
- **F3** oltre al tasto indietro, il rilascio parte sempre all'uscita (la copia locale del tavolo occupato non sapeva del blocco appena preso).
- **F7** script `pnpm --filter @pizzaguys/db patch:variants:extra` (idempotente), eseguito il 16/10 sul gruppo "Personalizza" (28 prodotti). Le **rimozioni restano a 0 €** (Cloud Admin non ammette prezzo sulle rimozioni): da rivedere se servisse un sovrapprezzo.
- **F12** sconto in € = riga "Sconto" negativa in fondo al conto; % con decimali sullo sconto di riga e sul tavolo; i preset del Cloud restano interi. Corretto anche il PinPad: dopo un PIN errato i pallini restano pieni e il tastierino sembrava bloccato.
- **F15/F16** etichetta `GLOVO n° 1234` per comanda, preconto e scontrino ("Ordine:" al posto di "Tavolo:").
- **F18** "In cucina da": dall'ultimo Spedisci, Marcia/sollecito o rilascio dolci; arancio ≥ 15', rosso ≥ 25' (soglie da confermare).
- **F19** nuova colonna `variants.sort_order` (drizzle push all'avvio); API `POST /api/v2/products/reorder`, `/api/v2/variants/reorder`.
- Ambiente locale riavviato il 16/10 alle 11:19; copia di sicurezza in `tmp/prima-fix-16ott-20261016-1119/`.
