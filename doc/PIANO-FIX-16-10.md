# Piano fix — test in loco del 15/10

> Branch `fix-16ott` (da `main`). Richieste emerse nel servizio di prova del 15/10, decisioni prese il 16/10.
> Legenda: ⬜ da fare · 🔄 in corso · ✅ fatto

## Blocco 1 — conto e cassa (prima del prossimo servizio)

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F1 | **Split analitico: coperti come righe singole** | Ogni coperto è una riga da spostare a mano sul conto di chi paga. Causa del buco di 21 € del 15/10 (coperto = una riga "× N") | ⬜ |
| F2 | **Pagamento misto contanti + POS** | Dividere liberamente il totale (es. 300 € = 100 contanti + 200 POS). L'API accetta già `paymentSplits` | ⬜ |
| F3 | **Tavolo bloccato dopo "indietro" sul palmare** | Android, tasto indietro del telefono. Il blocco va rilasciato sempre all'uscita | ⬜ |
| F4 | **Chiudi tavolo da cassa** (con o senza ordini) | Solo cassa, con PIN responsabile. Gli ordini vengono stornati e stampano il ticket di annullo | ⬜ |
| F5 | **Ristampa scontrino dalla lista documenti** | Oggi scrive solo un file. Deve uscire come copia non fiscale sulla stampante Bar | ⬜ |
| F6 | **Preconto con prezzi, coperto primo, quota a persona** | Riga per riga con prezzi, coperto in cima, sotto il totale "a persona" = totale ÷ coperti | ⬜ |

## Blocco 2 — comanda, varianti, sconti

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F7 | **13 varianti in aggiunta** | +2 € ciascuna, nel gruppo varianti con più prodotti (poi si decide se fare un gruppo generale): Mayo, Mayo paprika, Mayo porcini, Ketchup, Salsa Barbecue, Senza lattosio, Pizza bianca (base bianca + mozzarella), Pomodorini, Patatine; rimozioni No fesa, No Sambal, No salsa teriyaki, No miele | ⬜ |
| F8 | **"Duplica" variante** in Cloud Admin | Sulla singola variante, accanto a Modifica / Elimina | ⬜ |
| F9 | **"+1" sulla riga già spedita** | Crea una nuova riga da spedire con stessa portata e varianti (es. altra acqua) | ⬜ |
| F10 | **Palmare: tavolo già aperto si apre sul menu** | Non più sulla comanda | ⬜ |
| F11 | **Note / aggiunte / rimozioni visibili nella comanda** | Su cassa e palmare, non solo in stampa | ⬜ |
| F12 | **Sconti**: libero in €, % con decimali (es. 0,75%), rimozione coperti | Tutti con PIN responsabile; verificare che il flusso dopo il PIN funzioni | ⬜ |
| F13 | **Coperto al primo posto ovunque** | Cassa, comanda, preconto, scontrino | ⬜ |
| F14 | **Ristampa comanda del tavolo solo per la cassa** | Copia completa sulla stampante Bar, non ai reparti | ⬜ |

## Blocco 3 — delivery, ordinamento, tempi

| # | Task | Decisione | Stato |
|---|------|-----------|-------|
| F15 | **Delivery: piattaforma e n° ordine** | All'inserimento si sceglie la piattaforma (lista del Cloud) e si scrive il n° ordine; in stampa "GLOVO n° 1234" | ⬜ |
| F16 | **Scontrino delivery leggibile** | Al posto del codice alfanumerico: piattaforma + n° ordine | ⬜ |
| F17 | **Tabella delivery** come quella dei tavoli | Stesse colonne (piattaforma, n° ordine, orario, stato, totale), suddivisa per piattaforma | ⬜ |
| F18 | **Tavoli: tempo dall'ultimo invio in cucina** | Nella tabella tavoli; si azzera a ogni invio/sollecito | ⬜ |
| F19 | **Ordinamento a trascinamento** di prodotti e varianti | In Cloud Admin; vale per palmare e cassa | ⬜ |

## Dalla lista del 14/10 (`PROSSIMI-STEP.md`) che si sovrappone
- T22 "Libera tavolo" → assorbito da F4
- T20 annullo al reparto giusto → da verificare insieme a F4 (gli storni stampano l'annullo)
