# Checklist test manuali — Pizza Guys Gest

Documento operativo per verificare le feature richieste (sala, cassa, handheld, cloud, chiusure).  
Aggiornato: **3 ottobre 2026** (aggiunta sezione **S — Stampa**).

---

## Ambiente


| Servizio             | URL                                            |
| -------------------- | ---------------------------------------------- |
| Cassa (Main Station) | [http://localhost:5173](http://localhost:5173) |
| Handheld (Sala)      | [http://localhost:5174](http://localhost:5174) |
| Cloud Hub            | [http://localhost:3000](http://localhost:3000) |
| Edge API             | [http://localhost:4100](http://localhost:4100) |
| Cloud API            | [http://localhost:4000](http://localhost:4000) |



| Ruolo            | Credenziali                         |
| ---------------- | ----------------------------------- |
| Cameriere        | PIN `1234`                          |
| Cassiere         | PIN `5678` (ambiente locale attuale — vedi `doc/TEST-LOCALE.md`) |
| SuperAdmin cloud | `admin@pizzaguys.it` / password hub |

I PIN dipendono dall'ambiente (si creano su Main Station → Staff). Gli smoke Python si aspettano `1234` e `5678`.


### Smoke automatici (opzionale, prima del giro UI)

```bash
python3 scripts/smoke-feature-richieste.py
python3 scripts/smoke-giro-test.py
```

Atteso: **0 FAIL**. I WARN su chiusura Z devono essere **0** dopo cleanup turni/tavoli.

> ⚠️ Con `HARDWARE_BRIDGE_MODE=network` e stampante reale collegata, `smoke-giro-test.py` stampa decine
> di ticket: puntare prima le stampanti al simulatore (`doc/TEST-LOCALE.md`).

---

## Come usare questa checklist

Per ogni riga: esegui il passo, spunta se OK, annota eventuali bug.

---

## A — Handheld: coperti e mappa


| #   | Test                       | Passi                                      | Atteso                                                           | ☐   |
| --- | -------------------------- | ------------------------------------------ | ---------------------------------------------------------------- | --- |
| A1  | Coperti partono da 1       | Apri tavolo libero → modal Coperti         | Contatore iniziale = **1** (non i posti del tavolo)              | ok  |
| A2  | Card senza coperti         | Mappa sala, tavoli liberi                  | Solo nome tavolo, **niente** `N cop.`                            | ok  |
| A3  | Coperti dopo scelta        | Imposta es. 3 coperti → Apri               | Sulla card compare `3 cop.`                                      | ok  |
| A4  | Unione: coperti per tavolo | Apri con “Unisci”: es. Tav.1=3, Tav.4=2    | Card/comanda `3+2`; chip con nome+coperti; coperto=somma         | ok  |
| A5  | Modifica coperti unione    | Su gruppo → imposta 9 e 3 → Salva          | Messaggio `9+3 · tot. 12`; in comanda chip `Tav · 9` + `Tav · 3` | ok  |
| A6  | Due SPEDITO, un conto      | Unione: comanda A→Spedisci; poi B→Spedisci | 2 ticket cucina; bozza B resta; preconto unico                   | ok  |


---

## B — Handheld: comanda (Ora / menu / prezzi)


| #   | Test                           | Passi                                                      | Atteso                                          | ☐   |
| --- | ------------------------------ | ---------------------------------------------------------- | ----------------------------------------------- | --- |
| B1  | Default **Ora**                | Entra in tavolo / comanda                                  | Portata attiva = **Ora** (non Segue)            | ok  |
| B2  | Cambio categoria               | Menu → cambia categoria (es. Pizze)                        | Resta su **Ora**; non salta a Segue             | ok  |
| B3  | Ora / Segue indipendenti       | Metti un piatto in Ora e uno in Segue >1                   | Entrambi in comanda; Segue in HOLD se previsto  | ok  |
| B4  | Ricerca piatto                 | Menu → cerca nome                                          | Filtra prodotti correttamente                   | ok  |
| B5  | Prezzo aggiunta in selezione   | Aggiungi pizza → seleziona +aggiunta → **Prezzo aggiunta** | Modifica delta; **totale riga** si aggiorna     | ok  |
| B6  | Due prezzi in comanda          | Riga con aggiunta                                          | Sopra totale (es. €9,00); sotto `€7,00 + €2,00` | ok  |
| B7  | Click sul prezzo               | Tocca il prezzo a destra della riga                        | Apre modifica prezzo aggiunte / riga            | ok  |
| B8  | Override prezzo senza aggiunte | Riga semplice → Prezzo                                     | Campo prezzo unitario; salva OK                 | ok  |
| B9  | Storno qty parziale            | SPEDITO qty≥2 → Storno qty 1                               | Resta 1; ticket annullo                         | ok  |


---

## C — Handheld: delivery / asporto (senza pagamento)


| #   | Test                      | Passi                                                     | Atteso                                                           | ☐   |
| --- | ------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------- | --- |
| C1  | Nuovo delivery + rubrica  | Asporto → **+ Delivery** → **Rubrica** (o manuale) → Apri | Cliente da recenti/rubrica come cassa; nessun pagamento handheld | ok  |
| C2  | Delivery broker + comanda | Delivery con broker → prodotti → Spedisci                 | Ordine in cucina; in lista con broker; resta aperto per cassa    | ok  |
| C4  | Asporto                   | **+ Asporto** → rubrica/cliente → comanda → Spedisci      | Stesso caricamento cliente della cassa; no pagamento handheld    | ok  |
| C5  | Incasso in cassa          | Cassa → Delivery/Asporto → Incassa                        | Pagamento OK; slot chiuso                                        | ok  |


---

## D — Preconto automatico


| #   | Test                  | Passi                                                | Atteso                                          | ☐   |
| --- | --------------------- | ---------------------------------------------------- | ----------------------------------------------- | --- |
| D1  | Richiesta da handheld | Tavolo con comanda spedita → **Preconto** → conferma | Messaggio “cassa notificata”                    | ok  |
| D2  | Notifica cassa        | Guarda cassa                                         | Banner “Pagamento richiesto” + tavolo arancione | ok  |
| D3  | Stampa preconto       | Stampante Bar (ST30) o `tmp/prints` in modalità mock | Ticket PRECONTO (vedi anche **S5**)             | ok  |


---

## E — Cassa: pagamento e split


| #   | Test                | Passi                                    | Atteso                                                   | ☐   |
| --- | ------------------- | ---------------------------------------- | -------------------------------------------------------- | --- |
| E1  | Avvio turno         | Login cassiere → **Avvia turno**         | Turno attivo                                             | ok  |
| E2  | Incasso pieno       | Tavolo con conto → PAGA → POS/Contanti   | Scontrino; tavolo libero                                 | ok  |
| E3  | Split romano        | Conto → **Split romano** (2 quote)       | Quote uguali (arrotondate); paga 1/2 e 2/2               | ok  |
| E3b | Romano + fattura    | Split 2 quote → PAGA → POS → **Fattura** | Fattura sulla quota; poi seconda quota                   | ok  |
| E4  | Split analitico     | Dividi in N conti per riga               | Pagamento per conto                                      | ok  |
| E5  | Pasto completo      | Solo con **Fattura**                     | Bloccato su scontrino / split; OK in fattura intera      | ok  |
| E6  | Arrotondamento 0,05 | Conto con centesimi “strani”             | Totale multiplo di €0,05 (verso l’alto / regola fiscale) | ok  |
| E7  | Timer occupazione   | Tavolo aperto                            | Tempo da apertura visibile sulla card                    | ok  |
| E7b | Aperti + lock       | Cameriere prende tavolo (LOCKED)         | Resta in **Tavoli aperti** (badge In uso) e in mappa     | ok  |
| E8  | Capienza sede       | Imposta max in cloud; supera con coperti | Alert in cassa (non blocco, se così specificato)         | ok  |
| E9  | Coperti da cassa    | Apri / modifica coperti                  | Libero, senza limite posti tavolo                        | ok  |


---

## F — Chiusure


| #   | Test                 | Passi                                                     | Atteso                                                                                          | ☐   |
| --- | -------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --- |
| F1  | Chiusura interna     | Cassa → **Chiusura interna** (pulsante in alto)           | Taccuino: tot/POS auto; prelievo; **+ Aggiungi voce** (broker/spesa/altro); fondo; salva/stampa | ok  |
| F2  | Storico interne      | Storico chiusure → tab Interne                            | Voce salvata consultabile                                                                       | ok  |
| F3  | Pre-check Z          | Chiudi tutti i tavoli/delivery e turni → chiusura fiscale | `canClose` senza blocchi                                                                        | ok  |
| F4  | Chiusura fiscale Z   | Completa Z + riconciliazione                              | Z-report + chiusura giornata                                                                    | ok  |
| F5  | Residui che bloccano | Lascia delivery/turno aperti                              | Pre-check elenca blocchi; dopo cleanup passa                                                    | ok  |


---

## G — Cloud Hub


| #   | Test                  | Passi                                             | Atteso                                                   | ☐   |
| --- | --------------------- | ------------------------------------------------- | -------------------------------------------------------- | --- |
| G1  | Catalogo ricerca      | Menu → Catalogo → cerca prodotto                  | Solo barra ricerca (niente filtri Tutti); lista filtrata | ok  |
| G1b | Nuovo prodotto        | Catalogo → **Nuovo prodotto**                     | Off-canvas laterale con form prodotto                    | ok  |
| G2  | Filtri varianti       | Menu → Varianti → cerca + tipo Aggiunta/Rimozione | Filtri OK                                                | ok  |
| G3  | Import Excel varianti | Varianti → Importa Excel                          | Import accettato / errori chiari                         | ☐   |
| G4  | Capienza sede         | Sedi → max guest capacity                         | Salva; sync verso edge                                   | ok  |
| G5  | Lista utenti          | Utenti → filtro sede Caserta                      | Tutti gli operatori sede (admin/cassiere/cameriere) | ☐   |
| G5b | Crea utente           | Utenti → **Crea utente** → scegli ruolo           | Appare in lista; sync verso staff edge               | ok  |
| G6  | Elimina utente        | Elimina User Admin / cameriere di prova           | Eliminazione OK                                          | ok  |
| G7  | Guardrail self        | Sul proprio Super Admin                           | **Elimina** disabilitato / API rifiuta                   | ok  |
| G8  | Ultimo Super Admin    | (se 2 SA) elimina uno                             | Resta almeno 1 SA attivo                                 | ok  |


---

## S — Stampa (stampante reale ESC/POS, es. POS Italia ST30)

Prerequisiti: `HARDWARE_BRIDGE_MODE=network`, stampanti Edge puntate alla stampante, alias di rete attivo
(`doc/TEST-LOCALE.md`). Test eseguiti su ST30 il 1–3 ottobre 2026.

| #   | Test                     | Passi                                                       | Atteso                                                                 | ☐   |
| --- | ------------------------ | ----------------------------------------------------------- | ---------------------------------------------------------------------- | --- |
| S1  | Test stampante           | Main Station → Stampanti → **Test stampa** (o API `/test`)  | Ticket "TAVOLO TEST" esce; data in fondo **intera** (non tagliata)     | ok  |
| S2  | Accenti ed euro          | Operatore/nota con `à è ì ò ù`, preconto con `€`            | Caratteri corretti, nessun simbolo strano                              | ok  |
| S3  | Varianti e nota          | Pizza con rimozione + aggiunta + nota libera → Spedisci      | `+ NO …`, `+ …` e poi `NOTA: …` sotto il piatto                        | ok  |
| S4  | Ora / Segue in comanda   | Un piatto Ora, uno Segue >1, uno Segue >2 → Spedisci         | Un ticket con sezioni `-- ORA --`, `-- SEGUE >1 (in attesa) --`, `-- SEGUE >2 (in attesa) --` | ok  |
| S5  | Marcia                   | Palmare → Marcia Segue >1, poi Segue >2                      | Ticket `=== MARCIA SEGUE >1 ===` e `=== MARCIA SEGUE >2 ===` con i piatti giusti | ok  |
| S6  | Preconto                 | Cassa/palmare → Preconto                                     | `*** DOCUMENTO NON FISCALE ***` su **una riga**; totale in grande      | ok  |
| S7  | Copia non fiscale        | Incassa un tavolo (`RECEIPT_COPY_PRINT=true`)                 | `*** COPIA NON FISCALE ***` con righe, totale, IVA; nessuna copia per fattura | ☐ layout da confermare |
| S8  | Annullo                  | Storno di un piatto spedito                                  | `=== ANNULLO PIATTO ===` in negativo (sfondo nero)                     | ☐   |
| S9  | Stampante spenta         | Spegni la stampante → Spedisci dal palmare, poi incassa      | Palmare: finestra "Stampa non riuscita"; cassa: banner rosso; incasso riesce comunque | ☐   |
| S12 | IP stampante da cassa    | Main Station → Stampanti → cambia IP → Salva → Stampa di prova | IP non valido rifiutato; IP valido salvato; ticket di prova esce        | ok  |
| S13 | Smistamento reparti      | Routing categorie diverse → comanda, Marcia, X DOLCE         | Ogni piatto (anche in Marcia e dolci) esce sulla stampante del suo reparto | ok (simulatore) |
| S10 | X DOLCE                  | Dolce in coda → sblocca dolci                                | Comanda dolci in Pizzeria (intestazione dedicata da definire)          | ☐   |
| S11 | Prenotazioni             | Prenotazioni → Stampa lista                                  | Lista su stampante Bar                                                 | ☐   |

---

## H — Regressione rapida (smoke UI)


| #   | Test                     | Atteso                                   | ☐   |
| --- | ------------------------ | ---------------------------------------- | --- |
| H1  | Login handheld + cassa   | PIN OK, edge online                      | ok  |
| H2  | Lock tavolo cameriere    | Altro operatore non entra senza override | ok  |
| H3  | SPEDITO → KDS/stampa     | Ticket cucina su stampante (o `tmp/prints` in mock); KDS aggiornato | ok  |
| H4  | Login cloud SuperAdmin   | Dashboard sedi online                    | ok  |


---

## Ordine consigliato del giro

1. **A** (coperti / mappa)
2. **B** (comanda / prezzi)
3. **C** (delivery)
4. **D** (preconto)
5. **E** (cassa / split)
6. **G** (cloud)
7. **S** (stampa, se c'è la stampante reale)
8. **F** (chiusure, a fine giornata di test)
9. **H** se qualcosa è andato storto

---

## Note bug (da compilare in test)


| ID  | Area | Descrizione | Gravità |
| --- | ---- | ----------- | ------- |
|     |      |             |         |
|     |      |             |         |


---

## Riferimenti

- Smoke API esteso: `scripts/smoke-giro-test.py`
- Smoke feature richieste: `scripts/smoke-feature-richieste.py`
- Ambiente, accessi e stampante: `doc/TEST-LOCALE.md`
- Prossimi step da validare: `doc/PROSSIMI-STEP.md`

