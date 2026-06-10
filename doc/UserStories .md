# **SuperAdmin**

# **Area 1**

## **Area 1: Cloud Hub (Web App \- SuperAdmin Scope)**

### **Epic 1: Controllo Globale, Master Menu & Listini Dinamici**

* **Focus:** Centralizzazione dell'anagrafica aziendale sul Cloud Hub.  
* **Funzionalità Core:** Onboarding delle sedi fisiche con generazione di token API crittografati; *Master Menu Builder* con tassonomie rigide (Categorie, varianti fiscali); Matrice dei prezzi dinamici bidimensionale per Sede x Canale di vendita (Tavolo, Asporto, Delivery).

### **Epic 2: Analytics Consolidati, Monitoraggio & Report Notturni**

* **Focus:** Business Intelligence e monitoraggio dello stato della rete.  
* **Funzionalità Core:** Dashboard con KPI aggregati in tempo reale (Fatturato, scontrino medio, piatti top); monitoraggio degli *heartbeat* delle Main Station; motore di messaggistica asincrona per l'invio automatico del report notturno in formato HTML nativo via email a fine servizio.

# **Epic 1**

### **User Story 1.1: Onboarding Nuova Sede e Generazione Token API**

* **Come:** SuperAdmin  
* **Voglio:** registrare una nuova sede fisica con un token crittografato  
* **Al fine di:** permettere alla Main Station locale di quella specifica sede di autenticarsi in modo sicuro e sincronizzare i dati.

#### **Criteri di Accettazione (AC):**

* **AC 1.1.1:** L'interfaccia deve presentare un form per inserire i dati anagrafici obbligatori della sede: Nome Sede, Indirizzo Civico, Partita IVA/Codice Fiscale specifico (per la gestione di eventuali franchisee) ed email dello Store Manager di riferimento.  
* **AC 1.1.2:** Al salvataggio dei dati, il sistema deve generare un token API univoco, cifrato (JWT a lunga scadenza o stringa alfanumerica protetta da cifratura AES-256).  
* **AC 1.1.3:** Il token generato deve essere mostrato a schermo *una sola volta* in chiaro con un pulsante dedicato "Copia negli appunti" e un avviso visivo di sicurezza. Successivamente, nel database Cloud deve essere archiviato esclusivamente l'hash crittografato (SHA-256).  
* **AC 1.1.4:** La UI deve consentire la revoca immediata o la rigenerazione del token. Al trigger di revoca, il Cloud Hub deve invalidare istantaneamente l'accesso della Main Station remota, bloccando qualsiasi chiamata API o sessione WebSocket pendente.

### **User Story 1.2: Master Menu Builder e Tassonomia Categorie**

* **Come:** SuperAdmin  
* **Voglio:** definire la struttura gerarchica globale del menu (Categorie, Sottocategorie e Articoli) e i relativi flag hardware predefiniti  
* **Al fine di:** garantire che l'offerta culinaria e i comportamenti di stampa siano standardizzati su tutti i punti vendita del brand.

#### **Criteri di Accettazione (AC):**

* **AC 1.2.1:** L'interfaccia deve disporre di un sistema drag-and-drop per creare e ordinare Categorie (es. Pizze, Bibite, Fritti, Dessert). A ciascuna categoria deve essere associato un nome, una descrizione opzionale e un codice colore esadecimale (HEX) per la UI dei tablet di sala.  
* **AC 1.2.2:** Ogni categoria deve obbligatoriamente richiedere l'associazione con un'Aliquota IVA di default (es. 10% per somministrazione/asporto), ereditata automaticamente da tutti gli articoli interni.  
* **AC 1.2.3:** In fase di creazione del singolo articolo, la UI deve esporre i flag hardware predefiniti per indirizzare i flussi di stampa in sala: HOLD (per piatti che richiedono la chiamata del cameriere) e X DOLCE (per l'isolamento automatico dei dessert a fine pasto).

### **User Story 1.3: Matrice dei Prezzi Dinamici (Sede x Canale)**

* **Come:** SuperAdmin  
* **Voglio:** associare a ogni articolo del menu prezzi differenziati in base alla sede geografica e al canale di vendita utilizzato  
* **Al fine di:** adattare i listini ai costi fissi del locale e assorbire le commissioni dei broker di delivery (Glovo, Deliveroo).

#### **Criteri di Accettazione (AC):**

* **AC 1.3.1:** Selezionando un articolo dal Master Menu, la UI deve mostrare una tabella bidimensionale dove le righe rappresentano le Sedi attive e le colonne rappresentano i canali di vendita commerciali (Tavolo, Asporto, Delivery).  
* **AC 1.3.2:** Ogni cella della matrice deve accettare un valore numerico decimale (Prezzo). Se una cella viene lasciata vuota, il sistema deve applicare per fallback automatico il "Prezzo Base" di listino impostato sull'articolo.  
* **AC 1.3.3:** L'interfaccia deve includere una funzione di modifica massiva per applicare variazioni percentuali o flat (es. "+15% su tutti i prezzi del canale Delivery per la Sede Milano").  
* **AC 1.3.4:** Il salvataggio di una modifica nella matrice deve impostare lo stato del menu della sede specifica come Stale (Obsoleto), mettendo in coda un payload di aggiornamento incrementale (Delta) da spingere alla Main Station periferica via WebSocket.

### **User Story 1.4: Configurazione Varianti, Modifiche e Vincoli Fiscali**

* **Come:** SuperAdmin  
* **Voglio:** creare un database centralizzato di ingredienti, varianti in aggiunta e rimozioni con i relativi delta prezzo  
* **Al fine di:** consentire la personalizzazione delle comande mantenendo l'assoluta conformità con i requisiti del Registratore Telematico hardware.

#### **Criteri di Accettazione (AC):**

* **AC 1.4.1:** Il sistema deve permettere di strutturare Gruppi di Varianti (es. "Tipi di Impasto", "Aggiunte Pizze") e associarli a singole categorie del menu tramite relazioni molti-a-molti.  
* **AC 1.4.2:** Ogni variante contrassegnata come "Aggiunta" deve supportare un delta prezzo positivo (es. \+1.50€). Il sistema deve validare che questo delta venga inviato al driver del Registratore Telematico come riga descrittiva concatenata all'articolo principale, sommandosi al valore fiscale dell'elemento.  
* **AC 1.4.3:** Ogni variante contrassegnata come "Rimozione" (es. \- MOZZARELLA) deve poter essere configurata con un delta prezzo neutro (0.00€) o negativo. Il sistema deve includere un controllo logico a livello di backend per impedire che la somma delle rimozioni porti il prezzo finale dell'articolo a un valore inferiore o uguale a zero.

### **User Story 1.5: Dashboard Analytics Consolidata e Report Notturno HTML Nativo**

* **Come:** SuperAdmin  
* **Voglio:** visualizzare i KPI economici aggregati in tempo reale e ricevere un riepilogo via email a fine servizio  
* **Al fine di:** monitorare le performance commerciali del brand senza dover accedere fisicamente ai server delle singole sedi.

#### **Criteri di Accettazione (AC):**

* **AC 1.5.1:** La dashboard principale del Cloud Hub deve mostrare grafici e tabelle con i KPI consolidati e filtrabili (per range temporale e per singola sede/totale globale): Fatturato Lordo, Numero di Scontrini Emessi, Numero Coperti, Scontrino Medio, e Classifica Top 10 Articoli venduti.  
* **AC 1.5.2:** La UI deve esporre lo stato di connettività di rete di tutte le sedi, mostrando il timestamp dell'ultimo heartbeat registrato via WebSocket da ciascuna Main Station.  
* **AC 1.5.3:** Il backend del Cloud Hub deve includere un worker asincrono (Cron Job) programmabile (es. ogni notte alle ore 04:00 AM) che interroga il database consolidato delle vendite della giornata.  
* **AC 1.5.4:** Il sistema deve generare e inviare un'email automatica al SuperAdmin. Il layout dell'email deve essere tassativamente in formato HTML testuale nativo (senza dipendenze da fogli di stile esterni o script JavaScript), ottimizzato per la visualizzazione da client mobile leggeri, e contenere la tabella riepilogativa delle metriche di chiusura di ciascun locale.

### **User Story 1.6: Registro delle Operazioni e Monitoraggio Sessioni (Audit Log)**

* **Come:** SuperAdmin  
* **Voglio:** accedere a un log immutabile delle attività e monitorare le sessioni di rete delle Main Station operative  
* **Al fine di:** garantire la totale tracciabilità delle azioni amministrative e contrastare frodi interne o anomalie di sicurezza.

#### **Criteri di Accettazione (AC):**

* **AC 1.6.1:** L'applicazione deve implementare un registro eventi di sicurezza (Audit Log) configurato in modalità *Append-Only* (Sola scrittura). Le API del Cloud Hub non devono esporre alcuna funzione di modifica o cancellazione (UPDATE o DELETE) su questa tabella.  
* **AC 1.6.2:** Il sistema deve intercettare e registrare ogni azione critica effettuata dagli Store Manager o dagli operatori sulle macchine locali che impatta sui flussi cloud (es. modifiche a scontrini chiusi, storni massivi, riaperture forzate di turni).  
* **AC 1.6.3:** Ogni record del registro deve memorizzare obbligatoriamente: Timestamp (UTC), ID Sede, ID Utente Operatore, Tipo Operazione, Payload Stato Precedente (JSON), Payload Stato Successivo (JSON).  
* **AC 1.6.4:** La UI del SuperAdmin deve INCLUDEre una schermata di visualizzazione del log dotata di filtri di ricerca per range di date, identificativo del locale e livello di severità dell'evento (INFO, WARNING, CRITICAL).

### **User Story 1.7: Anagrafica e Gestione Profili User Admin (Store Manager)**

* **Come:** SuperAdmin  
* **Voglio:** creare, configurare e disattivare le utenze amministrative degli Store Manager assegnandole alle rispettive sedi fisiche  
* **Al fine di:** delegare il controllo operativo locale esclusivamente al personale autorizzato.

#### **Criteri di Accettazione (AC):**

* **AC 1.7.1:** La UI deve presentare un pannello di gestione delle utenze dello staff di livello "User Admin". Ciascun profilo creato deve essere associato a uno specifico ambito geografico (Scope di Sede).  
* **AC 1.7.2:** Il sistema deve verificare l'univocità globale dell'indirizzo email dell'utente e richiedere l'assegnazione obbligatoria di un **PIN numerico a 4 cifre** univoco all'interno della sede assegnata. Il PIN verrà utilizzato per validare le operazioni autoritative sui terminali di cassa e sui tablet di sala.  
* **AC 1.7.3:** Al click sul comando di disattivazione immediata di un profilo utente, il Cloud Hub deve invalidare la sessione web corrente e inviare in tempo reale un comando via WebSocket alla Main Station della sede interessata per rimuovere il PIN locale entro un tempo massimo di 2 secondi.

### **User Story 1.8: Override delle Configurazioni di Business Globali**

* **Come:** SuperAdmin  
* **Voglio:** definire a livello centralizzato i parametri operativi, le restrizioni e le logiche UX che le Main Station devono adottare  
* **Al fine di:** uniformare le politiche commerciali e l'esperienza utente in tutta la rete di pizzerie.

#### **Criteri di Accettazione (AC):**

* **AC 1.8.1:** Il modulo deve includere un input numerico per impostare la percentuale massima di sconto manuale (es. max 20%) che un utente Store Manager può applicare in cassa sul singolo conto senza richiedere un token di sblocco o un PIN di livello superiore.  
* **AC 1.8.2:** L'interfaccia deve includere il parametro di configurazione Table\_Lock\_Timeout (espresso in minuti) per istruire i server locali su dopo quanti minuti di inattività un tavolo bloccato da un tablet deve essere liberato d'ufficio a livello di database.  
* **AC 1.8.3:** Deve essere presente un selettore booleano (true/false) per abilitare globalmente la trasmissione automatica della Fatturazione Elettronica diretta dal punto cassa tramite SDI.  
* **AC 1.8.4:** Il salvataggio di questi parametri deve memorizzare i dati nella tabella delle impostazioni del Cloud Hub e notificare le Main Station per aggiornare le variabili d'ambiente locali.

### **User Story 1.9: Versionamento Incrementale del Database e Sincronizzazione Delta**

* **Come:** SuperAdmin  
* **Voglio:** implementare un sistema di versionamento incrementale per le tabelle di configurazione del menu e del catalogo  
* **Al fine di:** garantire la consistenza dei dati in architetture offline-first e ottimizzare il consumo di banda di rete.

#### **Criteri di Accettazione (AC):**

* **AC 1.9.1:** Qualsiasi modifica apportata dal SuperAdmin su entità catalogate (menu, prezzi, varianti, ingredienti) deve incrementare un contatore di versione sequenziale a livello di database Cloud (Schema\_Version, es. da v2.101 a v2.102).  
* **AC 1.9.2:** Al momento dell'allineamento con una Main Station remota, il Cloud Hub deve confrontare la versione dichiarata dal client con l'ultima disponibile sul server e inviare esclusivamente il payload JSON contenente la differenza (*Delta Sincrono*: righe inserite, modificate o rimosse).  
* **AC 1.9.3:** Nel caso in cui la Main Station si riconnetta dichiarando una build del database obsoleta o non compatibile (es. scarto maggiore di 50 build rispetto all'ambiente Cloud), il backend del Cloud Hub deve rigettare la sincronizzazione delta e forzare l'invio di un'istantanea completa del database (Full\_Snapshot\_Sync).

# **Epic 2**

### **User Story 2.1: Dashboard Multilivello e Aggregazione KPI Finanziari**

* **Come:** SuperAdmin  
* **Voglio:** visualizzare le metriche economiche e operative aggregate, con possibilità di filtrarle per singola sede o per specifici canali di vendita  
* **Al fine di:** monitorare l'andamento del fatturato complessivo del brand e valutare le performance commerciali dei punti vendita.

#### **Criteri di Accettazione (AC):**

* **AC 2.1.1:** La schermata principale dell'Epic 2 deve mostrare 4 KPI Card macro-metriche: Fatturato Lordo Totale, Numero Scontrini Emessi, Scontrino Medio e Totale Coperti.  
* **AC 2.1.2:** L'interfaccia deve includere un filtro temporale preimpostato (Oggi, Ieri, Ultimi 7 giorni, Mese Corrente) e un selettore di data personalizzato (Datepicker per Range).  
* **AC 2.1.3:** Deve essere presente un menu a tendina per isolare i dati di una singola sede fisica o mostrare la vista aggregata del brand ("Tutte le sedi").  
* **AC 2.1.4:** La UI deve includere una tabella e un grafico a barre che mostra la ripartizione del fatturato in base ai tre canali di vendita definiti a sistema: Tavolo, Asporto, Delivery.  
* **AC 2.1.5:** Sotto i grafici principali deve comparire una classifica *Top 10 Articoli più venduti* dell'intero brand (o della sede selezionata), che mostra: Nome Articolo, Quantità Venduta, Ricavo Lordo Generato.


### **User Story 2.2: Monitoraggio Heartbeat e Stato di Salute delle Main Station (Edge)**

* **Come:** SuperAdmin  
* **Voglio:** monitorare in tempo reale lo stato della connessione di rete e di sincronizzazione di tutte le Main Station installate nei locali  
* **Al fine di:** individuare tempestivamente guasti all'infrastruttura Internet locale o disallineamenti di versione del database.

#### **Criteri di Accettazione (AC):**

* **AC 2.2.1:** La UI deve presentare una tabella di monitoraggio dell'infrastruttura (Network Health Panel). Ogni riga rappresenta una sede e deve esporre: Nome Sede, Indirizzo IP Pubblico Rilevato, Versione Database Attiva (es. v2.103), e un Badge di Stato Visivo (ONLINE / OFFLINE / DESYNC).  
* **AC 2.2.2:** La Main Station locale deve inviare un pacchetto ping (Heartbeat) al Cloud Hub ogni 60 secondi. Se l'intervallo dall'ultimo ping ricevuto supera i 180 secondi (3 cicli vuoti), il Cloud Hub deve commutare automaticamente il Badge di Stato della sede in OFFLINE (colore rosso).  
* **AC 2.2.3:** Se l'heartbeat dichiara una Schema\_Version inferiore rispetto all'ultima build del menu pubblicata sul Cloud Hub, il badge deve mostrare lo stato DESYNC (colore arancione), indicando il numero di build di scarto.  
* **AC 2.2.4:** Al passaggio del mouse sul badge OFFLINE, la UI deve mostrare un tooltip con il timestamp esatto dell'ultima comunicazione utile registrata a sistema (Ultimo contatto: DD/MM/YYYY HH:MM:SS).

### **User Story 2.3: Worker Asincrono e Invio Notturno Email Report in HTML Nativo**

* **Come:** SuperAdmin  
* **Voglio:** ricevere un'email di riepilogo automatico al termine della giornata lavorativa di tutte le pizzerie  
* **Al fine di:** analizzare le metriche di chiusura e i corrispettivi fiscali direttamente dal mio smartphone senza dover accedere al backoffice web.

#### **Criteri di Accettazione (AC):**

* **AC 2.3.1:** Il backend del Cloud Hub deve implementare un worker asincrono (Cron Job) configurabile tramite interfaccia (es. esecuzione automatica ogni notte alle ore 04:30 AM UTC+1).  
* **AC 2.3.2:** Il worker deve processare i dati consolidati inviati dalle Main Station che hanno eseguito la Chiusura Z fiscale (Epic 5\) durante la giornata.  
* **AC 2.3.3:** Il sistema deve comporre e inviare un'email all'indirizzo del SuperAdmin. Il codice dell'email deve essere tassativamente in formato **HTML testuale nativo**, privo di script JS o fogli di stile esterni, ottimizzato per layout mobile responsivi.  
* **AC 2.3.4:** L'email deve contenere una struttura tabellare riepilogativa con le colonne: Nome Sede, Fatturato Lordo, Quota Contanti, Quota POS/Carte, Status Chiusura Z (Inviata / Mancante).  
* **AC 2.3.5:** Se una o più sedi non hanno inviato il report di chiusura entro l'orario del cron, l'email deve evidenziare la riga della sede in rosso inserendo la dicitura ATTENZIONE: Chiusura Fiscale non rilevata.

 

### **User Story 2.4: Estrazione Dati e Reportistica Fiscale per il Commercialista**

* **Come:** SuperAdmin  
* **Voglio:** esportare i dati delle vendite, dei corrispettivi divisionali e dei volumi IVA in formati standard (CSV / JSON)  
* **Al fine di:** trasmettere la contabilità mensile o trimestrale al consulente fiscale del brand senza margini di errore manuale.

#### **Criteri di Accettazione (AC):**

* **AC 2.4.1:** L'interfaccia deve includere una sezione "Esportazione Fiscale" dotata di filtri per Anno, Mese e Sede Selezionata.  
* **AC 2.4.2:** Il sistema deve generare file scaricabili in due formati alternativi tramite pulsanti dedicati: Scarica CSV (ottimizzato per Microsoft Excel) e Scarica JSON Structured (ottimizzato per software gestionali esterni).  
* **AC 2.4.3:** Il file esportato deve mappare in modo granulare i corrispettivi divisi per aliquota d'imposta (es. Imponibile 10%, Imposta 10%, Totale) e per metodo di pagamento utilizzato in cassa.  
* **AC 2.4.4:** Il download deve essere protetto da una ri-autenticazione di sicurezza del SuperAdmin o dalla convalida della sessione corrente, registrando l'evento di download nell'Audit Log (US 1.6).

# **Area 2**

## **Area 2: Main Station (Edge Core Server / Cassiere Scope)**

### **Epic 3: Configurazione Locale, Sala Builder 2D & Device Routing**

* **Focus:** Inizializzazione della singola sede sulla Main Station locale.  
* **Funzionalità Core:** Inserimento del Token Cloud per il primo provisioning dei dati; Tool grafico *Sala Builder 2D* per mappare tavoli alfanumerici e coperti di default; pannello di routing hardware per associare gli IP/Porte delle stampanti termiche LAN ai rispettivi centri di lavoro (Cucina, Pizzeria, Bar, Chef).

### **Epic 4: Modulo Cassa Centrale & Interfaccia Fiscale (RT)**

* **Focus:** Gestione delle transazioni commerciali e della conformità fiscale italiana.  
* **Funzionalità Core:** UI ottimizzata per monitor Touchscreen; integrazione nativa tramite protocollo seriale/rete con il Registratore Telematico **Micrelec Hydra SF20**; emissione di Documenti Commerciali (Scontrini), Fatture Elettroniche e Proforma (Preconti); gestione del calcolo del resto a caratteri giganti e trigger di apertura del cassetto porta-contanti hardware.

### **Epic 5: Chiusura di Cassa, Report Z & Riconciliazione**

* **Focus:** Procedure di fine giornata e auditing finanziario locale.  
* **Funzionalità Core:** Interfaccia guidata per la chiusura fiscale (invio comando di Chiusura Z all'RT Micrelec); modulo di riconciliazione contanti (Contante reale inserito dallo Store Manager vs Contante teorico calcolato dal software); generazione del report di chiusura locale specchiato sul Cloud Hub.

# **Epic 3**

### **User Story 3.1: Primo Provisioning Locale tramite Token API**

* **Come:** User Admin (Store Manager)  
* **Voglio:** inserire il token crittografato generato dal Cloud Hub nella Main Station locale vuota  
* **Al fine di:** autenticare il server edge ed eseguire lo scaricamento completo (Full Snapshot) del menu, dei listini e delle politiche di business del brand.

#### **Criteri di Accettazione (AC):**

* **AC 3.1.1:** Al primo avvio della Main Station (stato UNPROVISIONED), la UI deve mostrare una schermata bloccante che richiede unicamente l'inserimento del Token API della sede.  
* **AC 3.1.2:** Inviato il token, la Main Station deve effettuare una chiamata HTTPS cifrata verso l'endpoint /api/v2/prov/handshake del Cloud Hub. Se il token è valido, memorizza localmente l'hash di sessione ed estrae i dati aziendali.  
* **AC 3.1.3:** Il sistema deve creare localmente il database relazionale (Postgres o SQLite di produzione locale) e popolarlo con lo snapshot completo inviato dal Cloud: alberatura del menu, prezzi per i canali Tavolo/Asporto/Delivery, varianti fiscali e configurazioni globali ereditate.  
* **AC 3.1.4:** Al termine del provisioning, lo stato della Main Station passa a ACTIVE e l'applicazione reindirizza l'utente alla dashboard locale abilitando il server WebSocket locale per i tablet dei camerieri.

### **User Story 3.2: Sala Builder 2D e Configurazione Topologia della Sala**

* **Come:** User Admin (Store Manager)  
* **Voglio:** mappare graficamente la disposizione fisica del locale creando sale, tavoli alfanumerici e inserendo i coperti di default  
* **Al fine di:** fornire allo staff di sala una mappa interattiva sui tablet fedele alla realtà per la presa delle comande.

#### **Criteri di Accettazione (AC):**

* **AC 3.2.1:** La UI sulla Main Station deve includere una griglia interattiva bidimensionale (Drag-and-Drop) per posizionare oggetti visivi che rappresentano i tavoli del locale.  
* **AC 1.2.2:** Lo Store Manager deve poter definire più ambienti (es. "Sala Interna", "Terrazza") tramite un sistema a schede (Tab).  
* **AC 3.2.3:** Per ogni tavolo posizionato sulla griglia, l'interfaccia deve richiedere obbligatoriamente un Identificativo Alfanumerico univoco (es. T1, B12, P1) e il numero di Coperti di Default (utilizzato per popolare in automatico il conto iniziale). Il sistema deve salvare a DB locale le coordinate spaziali X e Y di ogni tavolo.  
* **AC 3.2.4:** Deve essere prevista la creazione di due macro-tavoli virtuali persistenti, non soggetti a coordinate spaziali ma accessibili da liste dedicate, denominati ASPORTO e DELIVERY.


### **User Story 3.3: Hardware Device Routing per Centri di Lavoro**

* **Come:** User Admin (Store Manager)  
* **Voglio:** censire gli indirizzi IP e le porte di rete delle stampanti termiche LAN presenti nel locale e associarle ai singoli centri di produzione culinaria  
* **Al fine di** garantire il corretto instradamento (Routing) dei comandi di stampa delle comande inviate dai camerieri.

#### **Criteri di Accettazione (AC):**

* **AC 3.3.1:** La UI deve esporre un pannello di configurazione hardware in cui aggiungere, modificare o rimuovere stampanti termiche di rete con protocollo ESC/POS standard. Per ogni stampante vanno definiti: Nome logico (es. "Printer Cucina"), Indirizzo IP statico LAN e Porta logica (default 9100).  
* **AC 3.3.2:** L'interfaccia deve implementare un pulsante "Stampa di Prova" che invia un pacchetto di byte RAW TCP alla stampante selezionata per verificarne lo stato di pronto. In caso di mancata risposta entro 3 secondi, mostra un alert visivo di errore di rete.  
* **AC 3.3.3:** Lo Store Manager deve poter creare la mappa di routing associando le categorie del menu ai "Centri di Lavoro" (es. Categoria Pizze ➔ Centro "Pizzeria", Categoria Bibite ➔ Centro "Bar", Categoria Primi ➔ Centro "Cucina").  
* **AC 3.3.4:** Ciascun Centro di Lavoro deve poter essere associato a una o più stampanti fisiche registrate (es. la comanda del Centro Pizzeria viene stampata sulla stampante fisica "Printer Pizzeria" e, per conoscenza, sulla stampante "Riepilogo Chef").

### **User Story 3.4: Logica di Override del Table Locking in Cassa**

* **Come:** User Admin (Store Manager)  
* **Voglio:** forzare lo sblocco manuale di un tavolo rimasto bloccato in stato Locked sulla Main Station di cassa  
* **Al fine di** ripristinare immediatamente l'operatività di quel tavolo se il tablet di un cameriere ha subito un crash o si è spento improvvisamente durante una comanda.

#### **Criteri di Accettazione (AC):**

* **AC 3.4.1:** Se un tavolo si trova nello stato Locked (ovvero un cameriere lo ha aperto sul tablet e non ha ancora inviato l'ordine), sulla mappa tavoli della Main Station deve comparire un badge rosso indicante il nome dell'operatore bloccante.  
* **AC 3.4.2:** Facendo clic su un tavolo bloccato, la Main Station deve inibire l'apertura standard del conto ma mostrare un popup contestuale con l'azione "Forza Sblocco Tavolo".  
* **AC 3.4.3:** L'attivazione del comando deve richiedere obbligatoriamente l'inserimento del PIN a 4 cifre dello Store Manager.  
* **AC 3.4.4:** A PIN corretto, la Main Station deve modificare a database locale lo stato del tavolo da Locked a Occupied (se c'era già un conto aperto) o Free (se era vuoto), e inviare contemporaneamente una notifica broadcast via WebSocket a tutti i tablet collegati per aggiornare lo stato visivo della sala ed eliminare il badge rosso entro meno di 500 millisecondi.

# **Epic 4**

### **User Story 4.1: Interfaccia Cassa Touchscreen e Sincronizzazione Carrello Locale**

* **Come:** Cassiere / Store Manager  
* **Voglio:** richiamare lo stato di un tavolo o di un canale di vendita (Tavolo, Asporto, Delivery) sul monitor della cassa centrale  
* **Al fine di:** visualizzare il riepilogo in tempo reale degli articoli ordinati, applicare sconti autorizzati e preparare il conto per la chiusura.

#### **Criteri di Accettazione (AC):**

* **AC 4.1.1:** La UI della cassa centrale deve essere ottimizzata per schermi Touchscreen industriali (Risoluzione minima target: 1920x1080), con target di puntamento dei pulsanti non inferiori a 48x48px.  
* **AC 4.1.2:** Selezionando un tavolo occupato dalla mappa o dalle liste d'attesa (Asporto/Delivery), la cassa deve caricare istantaneamente il carrello dal DB relazionale locale (Edge Server), mostrando l'elenco degli articoli, le varianti associate, i coperti e il totale parziale.  
* **AC 4.1.3:** L'interfaccia deve includere un tastierino numerico contestuale per l'applicazione di sconti percentuali o a valore sul totale del conto.  
* **AC 4.1.4:** In conformità con i vincoli di business ereditati dal Cloud Hub (US 1.8), se lo sconto manuale inserito supera la soglia massima definita dal SuperAdmin (es. \>20%), l'interfaccia deve bloccare l'azione e richiedere esplicitamente l'inserimento del PIN visivo a 4 cifre dello Store Manager per effettuare l'override.


### **User Story 4.2: Integrazione Driver Hardware RT Micrelec Hydra SF20 e Calcolo Resto**

* **Come:** Cassiere  
* **Voglio:** chiudere un conto emettendo un Documento Commerciale (Scontrino Fiscale) tramite il Registratore Telematico Micrelec  
* **Al fine di:** registrare fiscalmente il corrispettivo, calcolare il resto a caratteri giganti e comandare l'apertura fisica del cassetto rendiresto hardware.

#### **Criteri di Accettazione (AC):**

* **AC 4.2.1:** Al click sul comando "EMETTI SCONTRINO", il sistema deve calcolare il totale matematico. Se il pagamento avviene in contanti, la UI deve esporre una griglia di banconote rapide. All'inserimento della cifra ricevuta, il software deve mostrare a schermo l'indicazione RESTO: X.XX € con un font di dimensione minima pari a 36pt.  
* **AC 4.2.2:** Il software deve compilare il payload XML/RAW secondo le specifiche del driver **Micrelec Hydra SF20**, mappando l'aliquota IVA standard ereditata (10%).  
* **AC 4.2.3:** Le varianti in aggiunta (es. \+BUFALA \+1.50€) devono essere inviate al driver dell'RT come righe descrittive collegate che incrementano matematicamente il valore fiscale del blocco dell'articolo principale, evitando di spezzare la riga fiscale in modo errato.  
* **AC 4.2.4:** Il driver deve inviare il comando di apertura impulsi (Drawer Kick-Out 24V) sulla porta RJ12 dell'RT/Stampante per aprire il cassetto cassa solo in caso di pagamento accettato.  
* **AC 4.2.5:** Se l'RT restituisce un codice di errore hardware (es. "Carta esaurita", "Dispositivo disconnesso"), la Main Station deve bloccare la transazione a DB, mantenere il tavolo in stato Occupied e mostrare un alert bloccante bloccando l'operatività fino alla risoluzione del problema.

### **User Story 4.3: Gestione ed Emissione del Preconto (Proforma / Stampa di Cortesia)**

* **Come:** Cassiere / Cameriere  
* **Voglio:** stampare un documento non fiscale di riepilogo del conto (Preconto / Proforma) da consegnare al tavolo prima del saldo definitivo  
* **Al fine di:** consentire al cliente di verificare l'esattezza dei piatti ordinati senza generare un invio fiscale preventivo all'Agenzia delle Entrate.

#### **Criteri di Accettazione (AC):**

* **AC 4.3.1:** La UI della cassa centrale (e i tablet di sala abilitati) deve esporre un pulsante prioritario "STAMPA PRECONTO".  
* **AC 4.3.2:** Al trigger del comando, il sistema deve inviare il flusso di stampa direttamente alla stampante termica LAN configurata come principale per il punto cassa (Epic 3), bypassando l'RT fiscale.  
* **AC 4.3.3:** Il layout del preconto deve tassativamente includere in testa e in coda (footer) la dicitura ben visibile ed evidenziata \*\*\* DOCUMENTO NON FISCALE \*\*\* a caratteri doppi.  
* **AC 4.3.4:** Il documento deve riepilogare: Numero Tavolo, Numero Coperti, Elenco analitico di articoli e varianti con prezzi singoli, subtotale lordo e Timestamp di stampa. L'emissione del preconto deve mutare lo stato visivo del tavolo sulla mappa in Conto Richiesto (colore giallo intermittente).

### **User Story 4.4: Modulo Fatturazione Elettronica Diretta (Integrazione SDI)**

* **Come:** Cassiere / Store Manager  
* **Voglio:** emettere una Fattura Elettronica direttamente dal punto cassa legandola a un tavolo o a un cliente censito al volo  
* **Al fine di:** assolvere agli obblighi fiscali per i clienti aziendali senza dover utilizzare software di terze parti a fine mese.

#### **Criteri di Accettazione (AC):**

* **AC 4.4.1:** Selezionando l'opzione di pagamento "FATTURA", la UI deve aprire un form per la ricerca o l'inserimento immediato dei dati fiscali del cliente: Ragione Sociale/Nome, Partita IVA o Codice Fiscale, e un campo obbligatorio alternativo tra Codice Destinatario (SDI) a 7 caratteri o Indirizzo PEC.  
* **AC 4.4.2:** Il sistema deve validare la sintassi del Codice SDI (7 caratteri alfanumerici) e della Partita IVA/CF tramite espressioni regolari (RegEx) prima di abilitare l'invio.  
* **AC 4.4.3:** Al click su conferma, la Main Station locale deve ordinare al Registratore Telematico Micrelec l'emissione di uno scontrino con dicitura specifica "FATTURA ALLEGATA" (che azzera il calcolo dei corrispettivi giornalieri dell'RT per non raddoppiare l'imposta).  
* **AC 4.4.4:** Il payload della fattura (XML conforme alle specifiche dell'Agenzia delle Entrate) viene generato localmente dalla Main Station, marcato con stato Pending\_Send e salvato in coda di sincronizzazione. Non appena la connessione Internet è attiva, il file viene spinto al Cloud Hub, che si farà carico della trasmissione formale al Sistema di Interscambio (SDI) entro i termini di legge.

# **Epic 5**

### **User Story 5.1: Controllo di Stato della Sala e Inibizione della Chiusura**

* **Come:** User Admin (Store Manager)  
* **Voglio:** avviare la procedura di chiusura di fine giornata ottenendo una verifica automatica dello stato della sala  
* **Al fine di:** impedire la chiusura fiscale del punto cassa in presenza di tavoli ancora attivi, comande non salvate o conti in sospeso.

#### **Criteri di Accettazione (AC):**

* **AC 5.1.1:** Al click sul pulsante "AVVIA CHIUSURA GIORNALIERA", il sistema deve lanciare una query di validazione sincrona sul database relazionale locale per verificare che non vi siano entità con stati bloccanti.  
* **AC 5.1.2:** Se nel database locale sono presenti tavoli in stato Occupied, Locked o Conto Richiesto, o se vi sono ordini nei canali Asporto e Delivery contrassegnati come non saldati, la Main Station deve bloccare la procedura.  
* **AC 5.1.3:** In caso di blocco, la UI deve mostrare un alert imperativo a tutto schermo contenente l'elenco analitico dei tavoli o dei canali ancora aperti (es. *"Impossibile procedere: Tavolo T3 ancora occupato; Canale Delivery: 2 ordini pendenti"*).  
* **AC 5.1.4:** Se la sala è completamente vuota e tutti i conti risultano saldati, il sistema deve mutare lo stato operativo della Main Station in Closing e disabilitare istantaneamente la presa di nuove comande da tutti i tablet handheld collegati alla rete LAN, inviando un payload WebSocket bloccante.

### **User Story 5.2: Trigger Esecuzione Chiusura Fiscale Giornaliera (Report Z) via Hardware**

* **Come:** User Admin (Store Manager)  
* **Voglio:** comandare l'emissione della Chiusura Fiscale Z direttamente dal software di cassa  
* **Al fine di:** istruire il Registratore Telematico hardware a consolidare la memoria fiscale del giorno, stampare il report cartaceo ufficiale e trasmettere i corrispettivi telematici all'Agenzia delle Entrate.

#### **Criteri di Accettazione (AC):**

* **AC 5.2.1:** Superata la validazione dello stato della sala (US 5.1), la UI deve mostrare un bottone ad alto contrasto denominato "ESEGUI CHIUSURA Z FISCALE".  
* **AC 5.2.2:** Al click, il sistema deve compilare il comando sequenziale nativo per il driver del Registratore Telematico **Micrelec Hydra SF20** (es. stringa di comando di chiusura giornaliera tramite protocollo TCP/IP o seriale).  
* **AC 5.2.3:** Durante l'elaborazione hardware, la UI della Main Station deve mostrare un overlay di caricamento bloccante con la dicitura *"Comunicazione con il Registratore Telematico in corso... Non spegnere la macchina"*.  
* **AC 5.2.4:** Ricevuto l'ACK (codice di successo) dal driver Micrelec, che attesta l'avvenuta stampa fisica del Report Z e la corretta generazione del file dei corrispettivi, il software deve archiviare localmente nel DB l'evento assegnandogli lo stato Fiscally\_Closed, associando il numero progressivo di chiusura restituito dall'hardware.  
* **AC 5.2.5:** Se l'RT restituisce un errore bloccante (es. *"Memoria fiscale piena"* o *"Nessun transato del giorno"*), la Main Station deve catturare l'eccezione, salvare il log d'errore nell'Audit Log locale e mostrare allo Store Manager le opzioni di risoluzione o la possibilità di forzare una chiusura solo software tramite PIN di emergenza.

### **User Story 5.3: Modulo di Riconciliazione Cassa e Calcolo Discrepanze (Scostamento)**

* **Come:** User Admin (Store Manager)  
* **Voglio:** dichiarare il contante reale contato fisicamente nel cassetto cassa e verificare le transazioni POS  
* **Al fine di:** consentire al software di calcolare automaticamente eventuali discrepanze finanziarie tra il venduto teorico e l'incasso reale.

#### **Criteri di Accettazione (AC):**

* **AC 5.3.1:** Il sistema deve presentare una schermata di conteggio divisa in due sezioni macro: Contanti e Carte/POS.  
* **AC 5.3.2:** Nella sezione Contanti, la UI deve esporre un form strutturato per il calcolo del fondo cassa e del denaro reale, dove lo Store Manager inserisce la quantità fisica per ogni taglio di banconota e moneta (es. N banconote da 50€, M da 20€, ecc.). Il sistema calcola il totale matematico in tempo reale.  
* **AC 5.3.3:** Nella sezione Carte/POS, lo Store Manager deve inserire il totale estratto dalla strisciata di chiusura (Report Totale) del terminale POS hardware fisico.  
* **AC 5.3.4:** Al click su "CONFERMA RICONCILIAZIONE", il software deve confrontare i dati inseriti dall'utente con i totali teorici registrati a database locale durante il turno. Il sistema deve generare a schermo uno specchietto riepilogativo che evidenzia lo scostamento (Discrepanza \= Incassato Reale \- Venduto Teorico a DB). Qualsiasi discrepanza diversa da 0.00€ deve essere evidenziata in rosso se negativa (mancanco soldi) o in arancione se positiva (eccedenza).


### **User Story 5.4: Generazione Report di Chiusura Locale e Sincronizzazione Cloud Notturna**

* **Come:** User Admin (Store Manager)  
* **Voglio:** confermare il report di chiusura locale del punto vendita  
* **Al fine di:** salvare la sessione finanziaria del giorno, resettare i contatori della sala e spingere in modo asincrono l'intero set di dati al Cloud Hub per l'aggregazione aziendale.

#### **Criteri di Accettazione (AC):**

* **AC 5.4.1:** Al salvataggio finale della riconciliazione (US 5.3), la Main Station deve generare un record immutabile nella tabella Turni\_Chiusi del DB locale. Il record deve accorpare: Totale Fiscale RT, Totale Teorico DB suddiviso per canali (Tavolo/Asporto/Delivery), dati di riconciliazione inseriti e valore dello scostamento contabile.  
* **AC 5.4.2:** Il sistema deve resettare lo stato logico di tutti i tavoli della mappa 2D riportandoli a Free ed eliminando qualsiasi carrello residuo in cache. La Main Station passa in stato di standby Turno\_Chiuso.  
* **AC 5.4.3:** L'edge server deve avviare un worker di sincronizzazione in background che impacchetta in un payload JSON cifrato l'intero transato analitico del giorno (tutti gli scontrini, le fatture e i dettagli dei piatti venduti).  
* **AC 5.4.4:** Il worker effettua una chiamata API POST verso l'endpoint /api/v2/sync/daily-closure del Cloud Hub, autenticandosi con il Token API di sede. Se la connessione Internet è assente, il sistema mantiene il pacchetto in coda locale contrassegnato come Pending\_Sync e tenta l'invio a intervalli regolari di 15 minuti fino alla ricezione dell'ACK di avvenuta ricezione da parte del Cloud Hub.

# **Area 3**

## **\\Area 3: Handheld App (Tablet Fire OS \- Staff Scope)**

### **Epic 6: Engine di Rete, Sincronizzazione LAN & Table Locking**

* **Focus:** Stabilità dell'infrastruttura locale offline-first a bassissima latenza.  
* **Funzionalità Core:** Gestione dello stato dell'applicazione tramite WebSocket persistenti tra Tablet e Main Station; logica imperativa di **Table Locking** per impedire la sovrascrittura di una comanda da parte di due operatori contemporanei; meccanismi di sblocco forzato (Timeout o override dell'User Admin dalla cassa) per gestire i crash hardware dei dispositivi mobili.

### **Epic 7: Presa Comanda, Interfaccia Operativa & Modulo Varianti**

* **Focus:** Velocità d'esecuzione e precisione dell'ordinazione al tavolo.  
* **Funzionalità Core:** Visualizzazione grafica della mappa tavoli dinamica (colori per stato: Libero, Occupato, Conto Richiesto, In Modifica); griglia articoli filtrabile per categorie colorate; pop-up contestuale per l'applicazione di varianti in aggiunta (\+Ingrediente, con sovrapprezzo) o rimozione (\-Ingrediente), gestendo i vincoli di non-negatività del prezzo della riga.

### **Epic 8: Workflow del Servizio, Gestione Uscite & Stampe di Comanda**

* **Focus:** Coordinamento tra la sala e i centri di produzione culinaria (Cucina/Pizzeria).  
* **Funzionalità Core:** Gestione delle portate a Step sequenziali (*Marcia*, es. Antipasti, Primi) con possibilità di override manuale del cameriere; gestione dello stato *HOLD* (Piatto congelato in attesa del comando di "Chiama"); flag *X DOLCE* per l'isolamento automatico dei dessert a fine pasto; formattazione e routing delle stringhe di testo verso le stampanti termiche (gestione layout storni \--- ANNULLO \--- e note operative).

### **Epic 9: Modulo Pagamenti Avanzato, Split & Conti Separati**

* **Focus:** Flessibilità UX nella fase di saldo del conto, eseguibile sia da cassa che da tablet.  
* **Funzionalità Core:** Gestione del pagamento singolo o di gruppo; funzioni di **Split alla Romana** (divisione matematica del totale per il numero di coperti) e **Split Analitico** (selezione drag-and-drop dei singoli articoli da associare a un sub-conto); invio del comando di stampa scontrino/fattura dal tablet direttamente alla Main Station connessa all'RT.

# **Epic 6**

### **User Story 6.1: Connessione Persistente via WebSocket LAN e Handshake Iniziale**

* **Come:** Cameriere / Operatore di Sala  
* **Voglio:** che il tablet handheld stabilisca una connessione bidirezionale permanente con la Main Station locale non appena l'applicazione viene avviata  
* **Al fine di:** ricevere e trasmettere gli aggiornamenti sullo stato delle sale e dei tavoli istantaneamente e a bassissima latenza, senza dover effettuare polling HTTP continuo.

#### **Criteri di Accettazione (AC):**

* **AC 6.1.1:** All'avvio dell'applicazione su tablet (Fire OS), il client deve inizializzare un'istanza WebSocket persistente puntando all'IP statico e alla porta logica dedicata della Main Station nella rete LAN locale.  
* **AC 6.1.2:** Il client deve inviare un payload di handshake iniziale contenente il Device\_ID del tablet e il token crittografato della sessione dell'operatore loggato. La Main Station deve validare il pacchetto e rispondere con un ACK di avvenuta registrazione del nodo.  
* **AC 6.1.3:** Una volta stabilita la connessione, il tablet deve iscriversi ai canali di broadcast globali della sala (es. /topic/sala/stato-tavoli). Ogni cambio di stato di un tavolo sul server locale (es. da Libero a Occupato) deve riflettersi sulla UI del tablet entro un tempo massimo di 150ms.  
* **AC 6.1.4:** L'interfaccia deve esporre un indicatore visivo persistente nell'header dell'applicazione (es. un'icona Wi-Fi/Plug) di colore verde per indicare lo stato CONNECTED via WebSocket.

### **User Story 6.2: State Management Locale e Gestione del Fallback Offline**

* **Come:** Cameriere  
* **Voglio:** poter continuare a scorrere il menu, aggiungere piatti al carrello di una comanda avviata e muovermi nell'app anche se il tablet perde temporaneamente la connessione Wi-Fi  
* **Al fine di:** evitare interruzioni distruttive nel flusso di lavoro davanti al cliente e prevenire la perdita dei dati inseriti prima dell'invio in cucina.

#### **Criteri di Accettazione (AC):**

* **AC 6.2.1:** L'applicazione deve implementare un pattern di State Management locale (es. Redux Toolkit o Zustand) che memorizza in tempo reale lo stato dell'ordine corrente nel LocalStorage o in un DB indicizzato interno (IndexedDB/SQLite locale del tablet).  
* **AC 6.2.2:** Al rilevamento della caduta della connessione WebSocket, l'indicatore visivo nell'header deve mutare in colore giallo lampeggiante con la dicitura OFFLINE \- MODALITÀ LOCALE, senza mostrare popup bloccanti o interrompere l'interazione della UI.  
* **AC 6.2.3:** In stato offline, il software deve disabilitare esclusivamente i pulsanti di invio definitivo ("SPEDITO") e di saldo del conto ("PAGAMENTO"). Tutte le altre funzioni (modifica carrello, aggiunta varianti, navigazione categorie) devono rimanere attive al 100% lavorando sulla cache locale.  
* **AC 6.2.4:** All'interno del carrello offline, il sistema deve mostrare un badge informativo: *"X articoli salvati localmente sul dispositivo \- In attesa di rete"*.

### **User Story 6.3: Logica Imperativa di Table Locking (Gestione della Concorrenza)**

* **Come:** Cameriere  
* **Voglio:** che il tavolo su cui faccio tap per inserire un ordine venga istantaneamente bloccato per tutti gli altri tablet e per la cassa centrale  
* **Al fine di:** impedire che un altro collega possa aprire lo stesso tavolo contemporaneamente, inserendo modifiche in conflitto che corromperebbero l'integrità dei dati sul database della Main Station.

#### **Criteri di Accettazione (AC):**

* **AC 6.3.1:** Al tap su un tavolo della mappa (es. Tavolo T5), prima di effettuare il rendering della schermata del menu, l'app deve inviare un messaggio WebSocket prioritario di tipo REQUEST\_TABLE\_LOCK contenente l'ID del tavolo e l'ID dell'operatore.  
* **AC 6.3.2:** Se la Main Station risponde con un payload LOCK\_GRANTED, il tavolo cambia stato a DB in Locked, l'handheld carica la griglia degli articoli e invia in broadcast a tutti gli altri dispositivi della LAN un evento TABLE\_LOCKED\_BROADCAST.  
* **AC 6.3.3:** Tutti gli altri tablet e la cassa centrale, alla ricezione del broadcast, devono contrassegnare istantaneamente il tavolo T5 sulla mappa visiva con un overlay rosso semitrasparente e disabilitarne il click, mostrando l'etichetta *"In uso da: \[Nome Cameriere\]"*.  
* **AC 6.3.4:** Il lock sul tavolo deve decadere, inviando un comando RELEASE\_TABLE\_LOCK alla Main Station, solo quando si verifica uno dei seguenti scenari: il cameriere clicca su "SPEDITO" inviando l'ordine, clicca sul pulsante "INDIETRO/ANNULLA" chiudendo esplicitamente la sessione, oppure scatta il timeout automatico di inattività configurato dal SuperAdmin (Table\_Lock\_Timeout).


### **User Story 6.4: Meccanismo di Heartbeat e Riconnessione Automatica con Allineamento Delta**

* **Come:** Sviluppatore / Architetto del Sistema  
* **Voglio:** che l'applicazione handheld implementi un ciclo continuo di verifica dello stato del socket e una logica di riconnessione automatica intelligente  
* **Al fine di:** sanare i micro-distacchi della rete Wi-Fi (es. zone d'ombra del locale) e riallineare i dati locali con il server centrale senza richiedere il riavvio manuale dell'app da parte dello staff.

#### **Criteri di Accettazione (AC):**

* **AC 6.4.1:** Il client handheld deve inviare un pacchetto di controllo (PING) alla Main Station ogni 5 secondi. Se la Main Station non risponde con un PONG entro 2 secondi, il client deve dichiarare interrotto il canale e avviare la procedura di riconnessione.  
* **AC 6.4.2:** La riconnessione deve implementare un algoritmo di *Exponential Backoff* (tentativi a intervalli crescenti: 1s, 2s, 4s, 8s, fino a un tetto massimo stabile di 5s) per non sovraccaricare il server edge in caso di blackout di rete generale.  
* **AC 6.4.3:** Al momento del ripristino della connessione WebSocket (onOpen), il tablet deve inviare un messaggio di sincronizzazione contenente il timestamp del suo ultimo allineamento riuscito e lo stato attuale dei tavoli memorizzati in cache.  
* **AC 6.4.4:** La Main Station confronta i dati, acquisisce eventuali comande locali create in stato offline (US 6.2), valida che non vi siano conflitti di sovrascrittura e invia al tablet il payload *Delta* contenente esclusivamente gli aggiornamenti di sala avvenuti durante il periodo di buio del dispositivo. La UI si aggiorna tornando in stato verde CONNECTED in meno di 500ms.

# **Epic 7**

### **User Story 7.1: UI Presa Comanda Reattiva e Gestione Canale Multi-Listino**

* **Come:** Cameriere  
* **Voglio:** visualizzare il catalogo del menu suddiviso per categorie colorate e vedere i prezzi aggiornati all'istante in base al canale del tavolo corrente  
* **Al fine di:** operare con la massima rapidità visiva e proporre al cliente la tariffazione corretta senza dover effettuare calcoli mentali.

#### **Criteri di Accettazione (AC):**

* **AC 7.1.1:** La schermata di ordinazione deve presentare un layout a due colonne: a sinistra un menu di navigazione verticale fisso contenente le Categorie del menu (es. Pizze, Bibite, Fritti), formattate con il rispettivo colore HEX assegnato dal SuperAdmin (Epic 1); a destra, la griglia a scorrimento (Grid View) degli articoli associati.  
* **AC 7.1.2:** Al caricamento del modulo, il software deve intercettare il tipo di canale legato al tavolo (es. se è un tavolo della mappa sala ➔ canale Tavolo; se fa parte delle liste speciali ➔ canale Asporto o Delivery).  
* **AC 7.1.3:** Il motore dei prezzi interno all'app deve sovrascrivere istantaneamente i valori della griglia articoli applicando la matrice dei prezzi dinamici della sede corrente scaricata dal Cloud Hub. Se la cella Sede x Canale è vuota, l'app applica il "Prezzo Base" come fallback.  
* **AC 7.1.4:** L'interfaccia non deve subire ricaricamenti (Zero sfarfallio UI) durante il cambio di categoria. Il tempo di rendering della griglia articoli al tap sulla categoria deve essere inferiore a 60ms.


### **User Story 7.2: Motore Pop-up Varianti e Validazione Fiscale della Riga**

* **Come:** Cameriere  
* **Voglio:** personalizzare un articolo inserito nel carrello aggiungendo o rimuovendo ingredienti tramite un menu contestuale rapido  
* **Al fine di:** trasmettere le varianti graficamente indentate in cucina e garantire che le modifiche di prezzo siano conformi ai tracciati del Registratore Telematico.

#### **Criteri di Accettazione (AC):**

* **AC 7.2.1:** Un tap prolungato (Long Press, \>400ms) o un doppio tap su un articolo presente nel carrello deve aprire un foglio modale inferiore (Bottom Sheet) contenente i Gruppi di Varianti associati (es. "Aggiunte Pizze").  
* **AC 7.2.2:** Le varianti di tipo "Aggiunta" (es. \+ BUFALA) devono esporre chiaramente il sovrapprezzo (es. \+1.50 €). La selezione di un'aggiunta deve incrementare matematicamente il costo della riga articolo a DB e memorizzare il metatesto che istruirà il driver dell'RT **Micrelec Hydra SF20** a stamparla come riga descrittiva collegata.  
* **AC 7.2.3:** Le varianti di tipo "Rimozione" (es. \- MOZZARELLA) devono essere evidenziate visivamente in colore rosso. Il sistema deve permettere l'associazione di un delta prezzo neutro (0.00 €) o negativo (sconto per rimozione).  
* **AC 7.2.4:** **Vincolo di Integrità Fiscale:** L'algoritmo di validazione del carrello deve impedire il salvataggio della variante se la somma algebrica delle rimozioni porta il prezzo finale di quella specifica riga articolo a un valore inferiore o uguale a 0.00 €. In tale scenario, l'app inibisce il tasto "Salva" e mostra la nota di errore: *"Il prezzo dell'articolo modificato non può essere zero o inferiore"*.

### **User Story 7.3: Ricerca Rapida Predittiva ed Esclusione Allergeni**

* **Come:** Cameriere / Store Manager  
* **Voglio:** cercare un articolo digitando i caratteri iniziali su una barra di ricerca o filtrando per tag allergenici  
* **Al fine di:** trovare istantaneamente un piatto all'interno di menu complessi (es. oltre 150 articoli) riducendo il tempo di interazione davanti al cliente.

#### **Criteri di Accettazione (AC):**

* **AC 7.3.1:** Nella parte superiore della griglia articoli deve essere sempre accessibile un campo di input "Cerca piatto...". Al focus, l'app deve mostrare la tastiera virtuale nativa di Fire OS.  
* **AC 7.3.2:** Il motore di ricerca deve lavorare in locale sulla cache del tablet effettuando un filtro predittivo di tipo *Fuzzy Search* (corrispondenza flessibile dei caratteri) sul nome dell'articolo e sulle parole chiave correlate. La griglia deve aggiornarsi in tempo reale ad ogni carattere digitato (Debounce impostato a 150ms).  
* **AC 7.3.3:** Accanto alla barra di ricerca deve essere presente un pulsante "Filtri". Al click, si apre un menu con i filtri rapidi di esclusione basati sugli allergeni principali configurati a sistema (es. "Senza Glutine", "Senza Lattosio").  
* **AC 7.3.4:** L'attivazione di un filtro di esclusione deve opacizzare al 30% e disabilitare il click su tutti gli articoli che contengono quell'allergene nel loro tracciato ingredienti, mostrando un'icona visiva di divieto.

### **User Story 7.4: Gestione Avanzata del Carrello e Validazione Pre-Invio (Prevenzione Perdita Dati)**

* **Come:** Cameriere  
* **Voglio:** visualizzare il riepilogo grafico della comanda corrente e disporre di controlli preventivi prima dell'invio definitivo  
* **Al fine di:** verificare la precisione dell'ordine ed evitare la chiusura accidentale dell'app con la conseguente perdita della comanda non salvata.

#### **Criteri di Accettazione (AC):**

* **AC 7.4.1:** La sezione carrello (posizionata sul lato destro nei tablet in modalità orizzontale) deve elencare gli articoli in ordine cronologico di inserimento. Ogni riga deve mostrare chiaramente: Quantità, Nome Articolo, Elenco varianti indentate con carattere \+ o \-, Prezzo parziale di riga e pulsanti rapidi \[+\] e \[-\] per variare la quantità.  
* **AC 7.4.2:** Se il cameriere tenta di uscire dalla schermata d'ordine (es. premendo il tasto hardware "Back" del tablet o il pulsante "Home" della UI) mentre ci sono articoli nel carrello non ancora trasmessi, l'applicazione deve bloccare l'azione e mostrare un **Alert Imperativo e Distruttivo**.  
* **AC 7.4.3:** L'alert deve recitare: *"Attenzione\! Ci sono modifiche non salvate nel carrello. Se esci adesso, la comanda andrà persa permanentemente"*, esponendo due sole opzioni: Annulla ed Esci (cancella la cache del carrello e rilascia il Table Lock) e Continua Ordine.  
* **AC 7.4.4:** Prima di sbloccare il pulsante "SPEDITO", l'app esegue una validazione di consistenza logica: verifica che il numero di coperti sia maggiore di zero (se il canale è Tavolo) e che sia presente almeno un articolo nel carrello. Se i controlli falliscono, il pulsante rimane disabilitato.

# **Epic 8**

### **User Story 8.1: Smistamento Automatico in Step di Marcia e Override Manuale**

* **Come:** Cameriere  
* **Voglio:** che i piatti inseriti nel carrello vengano assegnati automaticamente a una sequenza di uscita predefinita basata sulla categoria, con la possibilità di modificarla manualmente al tavolo  
* **Al fine di:** velocizzare la presa della comanda garantendo che la cucina riceva l'ordine diviso correttamente per portate (Antipasti, Primi/Pizze, Secondi).

#### **Criteri di Accettazione (AC):**

* **AC 8.1.1:** Al momento dell'inserimento di un articolo nel carrello, il software deve assegnarlo a uno Step (Passo di Portata) numerico incrementale basato sulla Categoria ereditata dal Cloud Hub (es. Categoria Antipasti ➔ Step 0; Categoria Pizze/Primi ➔ Step 1; Categoria Secondi ➔ Step 2).  
* **AC 8.1.2:** All'interno della UI del carrello sul tablet, accanto a ogni riga articolo, deve comparire un selettore numerico rapido o un selettore a carosello (es. \[Antipasto\] \[Primo\] \[Secondo\]) che evidenzia lo Step corrente.  
* **AC 8.1.3:** Il cameriere deve poter fare tap sul selettore per sovrascrivere manualmente la sequenza (Override). Il sistema deve permettere, ad esempio, di spostare una Pizza nello Step 0 se il cliente desidera mangiarla insieme agli antipasti.  
* **AC 8.1.4:** Gli articoli modificati e spostati nello stesso Step devono essere raggruppati visivamente all'interno del carrello sotto un'unica testata divisoria (es. \--- PORTATA 1 \---).


### **User Story 8.2: Gestione dello Stato di HOLD (Sospensione) e Comando di "Chiama"**

* **Come:** Cameriere  
* **Voglio:** contrassegnare uno Step o un singolo piatto in stato di sospensione (HOLD) durante l'invio della comanda e inviare il comando di sblocco ("Chiama") successivamente  
* **Al fine di:** notificare la cucina della presenza di piatti successivi senza che i cuochi inizino a prepararli prima del tempo.

#### **Criteri di Accettazione (AC):**

* **AC 8.2.1:** Nella UI del carrello, ogni blocco di portata/step deve presentare un interruttore (Toggle Switch) denominato HOLD. Di default, gli Step superiori allo 0 (es. Primi, Secondi) nascono con il flag HOLD \= true se configurato nelle regole globali (Epic 1).  
* **AC 8.2.2:** Al click su "SPEDITO", se lo Step è contrassegnato in HOLD, la Main Station deve memorizzare a database lo stato del piatto come Suspended ed emettere sulla stampante del centro di lavoro una comanda cartacea contenente la dicitura fissa: \*\*\* IN ATTESA / HOLD \*\*\* prima dell'elenco dei piatti.  
* **AC 8.2.3:** Quando il tavolo termina la prima portata, il cameriere seleziona il tavolo dalla mappa e clicca sul pulsante prioritario CHIAMA PORTATA \[X\].  
* **AC 8.2.4:** Il trigger invia un payload WebSocket alla Main Station che muta lo stato a DB in In Preparation e comanda la stampa sulla termica LAN di produzione di un ticket di sollecito formattato a caratteri giganti: \=== CHIAMA PORTATA \[X\] \===, seguito dalla dicitura SEGUE \-\> \[Elenco Articoli dello Step sbloccato\].

### **User Story 8.3: Isolamento Automatico dei Dessert tramite Flag "X DOLCE"**

* **Come:** Cameriere / Store Manager  
* **Voglio:** che tutti gli articoli appartenenti alla categoria Dessert inseriti durante il servizio vengano isolati dal flusso di stampa principale  
* **Al fine di:** evitare che la stampante della cucina o della pasticceria produca il ticket dei dolci all'inizio del pasto, mantenendo la comanda congelata fino al momento del fine pasto.

#### **Criteri di Accettazione (AC):**

* **AC 8.3.1:** L'applicazione handheld deve intercettare gli articoli che possiedono il flag hardware X DOLCE \= true ereditato dalla tassonomia del Master Menu (Epic 1).  
* **AC 8.3.2:** All'invio della comanda generale ("SPEDITO"), il software deve estrapolare questi articoli dal payload delle portate standard e archiviarli in una tabella locale dedicata Coda\_Dessert legata al tavolo, contrassegnandoli con lo stato logico Frozen.  
* **AC 8.3.3:** Le stampanti dei centri di lavoro (es. Cucina o Pasticceria) non devono produrre alcuna strisciata cartacea per i dessert durante l'invio iniziale dell'ordine del tavolo.  
* **AC 8.3.4:** A fine pasto, accedendo alla gestione del tavolo, l'app mostra un pulsante dedicato INVIA DOLCI (X DOLCE). Al tap, il sistema sblocca la coda, cambia lo stato a DB in Sent e indirizza la stampa esclusivamente alla stampante termica LAN configurata per il centro di produzione dei dessert, inserendo l'intestazione: \*\*\* SERVIZIO DOLCI TAVOLO \[ID\] \*\*\*.

### **User Story 8.4: Gestione delle Modifiche, Layout Storni e Stringhe di Annullamento**

* **Come:** Cameriere / Cuoco in Cucina  
* **Voglio:** eliminare o diminuire la quantità di un piatto già inviato in precedenza tramite il tablet di sala  
* **Al fine di:** aggiornare il conto economico a database e inviare istantaneamente una stampa termica di storno visivamente allarmante per fermare la linea di produzione in cucina.

#### **Criteri di Accettazione (AC):**

* **AC 8.4.1:** Se un cameriere rientra in un tavolo occupato per modificare una comanda già spedita, gli articoli già consolidati a DB devono mostrare un'icona a forma di lucchetto. Il click sul pulsante \[-\] o l'eliminazione della riga deve richiedere obbligatoriamente l'inserimento del PIN a 4 cifre dello Store Manager (User Admin).  
* **AC 8.4.2:** Al salvataggio dello storno, la Main Station decrementa la quantità o elimina l'articolo dalla persistenza locale del conto ed elabora una stringa di stampa speciale per il centro di produzione di competenza.  
* **AC 8.4.3:** **Vincolo di Layout ESC/POS (Hardware):** Il ticket inviato alla stampante termica LAN deve adottare la formattazione a caratteri doppi con modalità testo invertito (sfondo nero, testo bianco) per la testata e la riga modificata, stampando in modo preminente la dicitura: \--- ANNULLO PIATTO \---.  
* **AC 8.4.4:** Sotto l'intestazione di annullo, il ticket deve riportare metadati precisi di tracciabilità estratti dal footer: Quantità Stornata, Nome Articolo, Ora Storno, Operatore che ha autorizzato lo storno via PIN, e la dicitura finale: \*\*\* VERIFICARE CON LA SALA \*\*\*.

# **Epic 9**

### **User Story 9.1: Modulo Chiusura Conto Singolo, Selezione Metodo e Calcolo Resto Giga**

* **Come:** Cameriere / Cassiere  
* **Voglio:** selezionare un tavolo occupato, accedere alla schermata di saldo e inserire la cifra ricevuta in contanti  
* **Al fine di:** visualizzare istantaneamente il resto calcolato a caratteri giganti, comandare l'apertura del cassetto e chiudere la transazione economica.

#### **Criteri di Accettazione (AC):**

* **AC 9.1.1:** Accedendo alla sezione di pagamento del tavolo, la UI deve mostrare in preminenza il Totale Lordo da Saldare e tre pulsanti macro per i metodi di pagamento: Contanti, POS/Carta, Buono/Sospeso.  
* **AC 9.1.2:** Selezionando Contanti, l'interfaccia deve aprire una tastiera numerica rapida affiancata da pulsanti con tagli di banconote standard (es. 10€, 20€, 50€) per l'inserimento rapido dell'importo ricevuto dal cliente.  
* **AC 9.1.3:** All'inserimento dell'importo, se questo è superiore al totale del conto, l'applicazione deve calcolare in tempo reale il delta e visualizzare a tutto schermo la stringa RESTO: X.XX € con un font di dimensione non inferiore a **36pt** per garantire l'immediata leggibilità visiva.  
* **AC 9.1.4:** Al click su "CONFERMA ED EMETTI", il sistema invia il payload alla Main Station, la quale interroga l'RT Micrelec, apre il cassetto cassa hardware via impulso a 24V, archivia la transazione a DB locale e muta lo stato del tavolo in Free (Verde) sulla mappa sale.


### **User Story 9.2: Gestione dello Split alla Romana (Divisione Matematica)**

* **Come:** Cameriere / Cassiere  
* **Voglio:** suddividere il totale del conto del tavolo in parti eque impostando il numero di pagatori  
* **Al fine di:** riscuotere le singole quote in successione emettendo scontrini parziali coordinati fino all'azzeramento del debito del tavolo.

#### **Criteri di Accettazione (AC):**

* **AC 9.2.1:** L'interfaccia deve consentire di attivare la modalità "Split alla Romana". Di default, il sistema deve proporre come divisore il numero di coperti effettivi inseriti all'apertura del tavolo.  
* **AC 9.2.2:** La UI deve permettere di incrementare o decrementare manualmente il numero di quote tramite selettori \[+\] e \[-\]. Il sistema ricalcola dinamicamente il valore della singola quota in tempo reale (Quota \= Totale / N).  
* **AC 9.2.3:** Al momento del saldo di una quota, l'operatore seleziona il metodo di pagamento (es. POS o Contanti) e clicca su "PAGA QUOTA". La Main Station comanda all'RT Micrelec l'emissione di uno scontrino parziale pari al valore esatto della quota.  
* **AC 9.2.4:** Il tavolo deve rimanere in stato Occupied (contrassegnato con un badge "Split in corso") e il sistema deve scalare il valore pagato dal totale complessivo, mostrando il conteggio progressivo (es. *"Pagato: 2 di 5 quote \- Residuo: XX.XX€"*). Il tavolo torna libero solo al saldo dell'ultima quota disponibile.

### **User Story 9.3: Gestione dello Split Analitico tramite Selezione Articoli (Drag-and-Drop)**

* **Come:** Cameriere / Cassiere  
* **Voglio:** separare analiticamente gli articoli consumati al tavolo associandoli a un sub-conto indipendente per singolo cliente  
* **Al fine di:** permettere a ciascun ospite di pagare esclusivamente ciò che ha ordinato, aggiornando la persistenza del carrello residuo sul server di sala.

#### **Criteri di Accettazione (AC):**

* **AC 9.3.1:** Selezionando lo "Split Analitico", la UI deve dividersi in due pannelli macro adiacenti: a sinistra viene renderizzato l'elenco dei articoli e delle varianti ancora da pagare per il tavolo; a destra un pannello vuoto denominato "Sub-Conto Corrente".  
* **AC 9.3.2:** L'interfaccia deve permettere lo spostamento degli articoli da sinistra a destra tramite un'interazione drag-and-drop o tramite un singolo tap sulla riga del piatto, decrementando la quantità disponibile a sinistra e incrementando quella a destra.  
* **AC 9.3.3:** Se un articolo ha una quantità maggiore di 1 (es. 3 bottiglie d'acqua), il tap deve aprire un mini-selettore numerico per consentire lo split frazionato della singola riga di consumo.  
* **AC 9.3.4:** Al click su "SALDA SUB-CONTO", l'applicazione procede all'incasso dei soli elementi presenti nella colonna di destra. Una volta ricevuto l'ACK dall'RT hardware, questi articoli vengono eliminati permanentemente dal database del tavolo. Se la colonna di sinistra contiene ancora elementi, il tavolo rimane nello stato Occupied.

### **User Story 9.4: Instradamento delle Stampe Fiscali via WebSocket LAN**

* **Come:** Cameriere / Staff di Sala  
* **Voglio:** inviare l'ordine di saldo ed emissione documento dal tablet handheld in mobilità  
* **Al fine di:** comandare in tempo reale il Registratore Telematico collegato alla Main Station senza dover toccare la cassa centrale.

#### **Criteri di Accettazione (AC):**

* **AC 9.4.1:** Quando un'operazione di pagamento viene confermata da tablet, l'applicazione non deve dialogare con l'hardware ma deve inviare un payload WebSocket strutturato TRIGGER\_FISCAL\_RECEIPT alla Main Station.  
* **AC 9.4.2:** Il payload deve contenere obbligatoriamente: Table\_ID, Metodo\_Pagamento, Importo\_Ricevuto, Mappatura\_Articoli (nel caso di split analitico).  
* **AC 9.4.3:** La Main Station acquisisce il messaggio, applica il lock di cassa, invia la stringa RAW al driver Micrelec Hydra SF20, e restituisce al tablet l'esito della transazione via WebSocket (RECEIPT\_SUCCESS o RECEIPT\_ERROR).  
* **AC 9.4.4:** Se l'operazione ha successo, il tablet emette una notifica visiva verde e riporta automaticamente lo staff alla mappa sale aggiornata. In caso di errore (es. carta esaurita nell'RT), mostra un blocco rosso indicando l'anomalia hardware rilevata sul server centrale.

# **Area 4**

## **Area 4: Moduli Estesi (Hardware Avanzato)**

### **Epic 10: KDS (Kitchen Display System) \- Opzionale**

* **Focus:** Digitalizzazione dei centri di lavoro in sostituzione o affiancamento alle stampanti termiche.  
* **Funzionalità Core:** UI per monitor Kitchen/Pizzeria con visualizzazione delle comande in entrata suddivise per Step di marcia; calcolo del tempo di permanenza dell'ordine con alert visivi per i piatti in ritardo; interazione touch per contrassegnare i piatti come "Pronti", notificando istantaneamente i tablet dei camerieri via WebSocket.

# **Epic 10**

### **User Story 10.1: Inizializzazione Dispositivo e Profilazione del Centro di Lavoro**

* **Come:** Operatore di Cucina / Pizzaiolo / Pasticcere  
* **Voglio:** connettere il monitor KDS alla Main Station locale e selezionare la stazione di competenza  
* **Al fine di:** visualizzare a schermo esclusivamente le linee e i piatti che il mio reparto deve produrre, eliminando il rumore visivo delle altre comande.

#### **Criteri di Accettazione (AC):**

* **AC 10.1.1:** Al primo avvio dell'applicazione KDS su rete locale, il software deve eseguire una scansione automatica dei nodi LAN alla ricerca dell'IP statico della Main Station o permetterne l'inserimento manuale tramite form di configurazione.  
* **AC 10.1.2:** Una volta stabilito l'handshake iniziale, la UI deve mostrare l'elenco dei Centri di Lavoro configurati a sistema dall'User Admin (es. Cucina, Pizzeria, Bar, Riepilogo Chef).  
* **AC 10.1.3:** Selezionando un centro specifico (es. Pizzeria), il KDS deve iscriversi formalmente alla coda WebSocket dedicata (es. /topic/kds/pizzeria). Da questo momento, il backend edge filtrerà i payload inviati dai tablet escludendo tutti i piatti non associati a quella stazione (es. mostrando solo le pizze e ignorando i fritti e le bibite).  
* **AC 10.1.4:** Selezionando il profilo Riepilogo Chef (Monitor di Controllo al Pass), la UI deve mostrare la totalità dei piatti dell'ordine, aggregando lo stato di avanzamento in tempo reale degli altri KDS verticali per consentire la coordinazione delle uscite al tavolo.

### **User Story 10.2: Griglia delle Comande Live e Gestione degli Step di Marcia**

* **Come:** Operatore di Cucina / Pizzaiolo  
* **Voglio:** visualizzare le comande in entrata organizzate in schede d'ordine dinamiche e suddivise per Step di portata  
* **Al fine di:** produrre i piatti rispettando l'esatta sequenza temporale di marcia ordinata in sala dal cameriere.

#### **Criteri di Accettazione (AC):**

* **AC 10.2.1:** L'interfaccia deve adottare un layout a griglia flessibile a scorrimento orizzontale composto da "Schede Ordine". Ogni scheda deve esporre in testata: Identificativo Tavolo (es. T3), Numero Coperti, Nome del Cameriere e un Cronometro Progressivo (MM:SS) che tiene traccia del tempo trascorso dal click su "SPEDITO" in sala.  
* **AC 10.2.2:** All'interno di ciascuna scheda, i piatti devono essere raggruppati rigidamente per Step di marcia (es. \--- PORTATA 1 \---, \--- PORTATA 2 \---).  
* **AC 10.2.3:** Se una portata o un articolo si trovano nello stato logico Suspended o Frozen (es. Step in HOLD o piatti con flag X DOLCE non ancora sbloccati), il KDS deve renderizzare quelle specifiche righe opacizzate al 40% con l'etichetta visiva \[HOLD\], disabilitandone temporaneamente l'interazione per impedirne la cottura errata.  
* **AC 10.2.4:** Alla ricezione di un evento WebSocket di "Chiama Portata" (US 8.2), la sezione corrispondente della scheda ordine sul KDS deve illuminarsi istantaneamente, emettere un alert acustico localizzato ad alta frequenza e far partire il rispettivo timer di preparazione.

### **User Story 10.3: Interazione Touch, Avanzamento Stati e Notifica di "Piatto Pronto"**

* **Come:** Chef al Pass / Operatore di Cucina  
* **Voglio:** interagire tramite tocchi rapidi sullo schermo per contrassegnare un piatto o un intero Step come pronto  
* **Al fine di:** aggiornare la persistenza dello stato a database locale e allertare istantaneamente lo staff di sala sui tablet handheld.

#### **Criteri di Accettazione (AC):**

* **AC 10.3.1:** Un singolo tap sulla riga di un articolo in stato In Preparazione deve mutare lo stato a DB in Ready. La UI del KDS deve aggiornare la riga applicando un effetto sbarrato sul testo, cambiando lo sfondo in colore verde ed eliminando l'articolo dall'elenco attivo dopo 2 secondi di animazione.  
* **AC 10.3.2:** Ogni blocco di portata all'interno della scheda deve includere un pulsante macro Completa Step. Il tap su questo comando contrassegna istantaneamente come pronti tutti gli articoli validi di quello specifico blocco in un'unica azione di massa.  
* **AC 10.3.3:** Al cambio di stato in Ready, la Main Station acquisisce il payload del KDS e lo distribuisce via WebSocket a tutti i tablet handheld della sala. Il tablet del cameriere proprietario del tavolo deve intercettare la notifica push, attivando una vibrazione hardware e mostrando un badge popup visivo verde (es. *"Pizze Pronte per Tavolo T3\!"*).  
* **AC 10.3.4:** La barra superiore (Top Bar) del KDS deve includere l'icona "Cronologia/Recupero". Cliccando su di essa, l'operatore può visualizzare gli ultimi 10 blocchi completati ed eseguire un'operazione di Undo (Ripristino) per riportare una comanda a schermo in caso di click accidentale.

### **User Story 10.4: Monitoraggio dei Tempi di Permanenza (SLA) e Alert Visivi di Ritardo**

* **Come:** Store Manager / SuperAdmin  
* **Voglio:** che il KDS monitori i tempi di preparazione dei piatti confrontandoli con le soglie massime della categoria merceologica  
* **Al fine di:** evidenziare visivamente le comande in sofferenza e registrare le metriche di efficienza culinaria della sede.

#### **Criteri di Accettazione (AC):**

* **AC 10.4.1:** L'applicazione KDS deve mappare in tempo reale le configurazioni dei tempi limite di preparazione ereditati dal catalogo (es. Categoria Fritti \= max 8 minuti; Categoria Pizze \= max 12 minuti).  
* **AC 10.4.2:** Se il cronometro progressivo di una scheda ordine supera il minutaggio di tolleranza previsto senza che i piatti dello step corrente siano stati evasi, la testata della scheda ordine deve colorarsi in Arancione Lampeggiante (Stato: WARNING).  
* **AC 10.4.3:** Superata la soglia critica di ritardo extra (configurabile, es. \+5 minuti oltre il warning), la scheda deve commutare in colore Rosso Fisso (Stato: CRITICAL) e il contatore del tempo deve mostrare il tempo di ritardo netto accumulato preceduto dal carattere \+ (es. \+04:12).  
* **AC 10.4.4:** Al completamento definitivo della scheda sul KDS, il sistema deve salvare a DB il timestamp di evasione e calcolare il Lead\_Time (Tempo di produzione effettivo). Questo dato viene storicizzato localmente e inviato in modo asincrono al Cloud Hub per alimentare le metriche analitiche del SuperAdmin (Epic 2).

# **UserAdmin**

# **E3**

## **Epic 3: Configurazione Locale, Sala Builder 2D & Device Routing**

Quest'epica governa l'inizializzazione del server edge locale all'interno della rete LAN del punto vendita e la mappatura delle periferiche hardware di stampa comande.

### **User Story 3.1: Primo Provisioning Locale tramite Token API**

* **Come:** User Admin (Store Manager)  
* **Voglio:** inserire il token crittografato della sede nella Main Station locale ancora vuota  
* **Al fine di:** autenticare il server edge del locale ed eseguire lo scaricamento completo dello snapshot iniziale dal Cloud Hub.

#### **Criteri di Accettazione (AC):**

* **AC 3.1.1:** Al primo avvio assoluto dell'applicazione sulla Main Station (rilevamento stato logico di sistema UNPROVISIONED), l'interfaccia deve presentare un'interfaccia a blocco totale che richiede unicamente l'inserimento del Token API generato sul Cloud Hub.  
* **AC 3.1.2:** All'invio del token, la Main Station deve avviare una richiesta HTTPS POST cifrata verso l'endpoint cloud /api/v2/prov/handshake. Se l'handshake fallisce (token invalido o scaduto), la UI deve mostrare un messaggio di errore esplicito e bloccare la transazione.  
* **AC 3.1.3:** A token validato, il sistema deve scaricare un payload JSON contenente l'intera struttura dell'anagrafica di sede. Il backend locale deve inizializzare il database relazionale locale (Postgres o SQLite Edge) e popolarlo istantaneamente con le tabelle di fallback: alberatura del menu, varianti fiscali, politiche di sconto e la matrice dei prezzi dinamici legati a quella sede per i tre canali (Tavolo, Asporto, Delivery).  
* **AC 3.1.4:** Al completamento della scrittura a DB, la Main Station deve aggiornare il proprio stato in ACTIVE, memorizzare localmente l'hash di sessione per le successive chiamate API delta e sbloccare la dashboard locale, avviando contestualmente il server WebSocket in ascolto per i terminali handheld dei camerieri.

### **User Story 3.2: Sala Builder 2D e Configurazione Topologia della Sala**

* **Come:** User Admin (Store Manager)  
* **Voglio:** mappare graficamente la disposizione fisica dei tavoli e delle sale del locale sul pannello amministrativo  
* **Al fine di:** fornire allo staff un'interfaccia visiva interattiva e fedele alla realtà sui tablet per la selezione dei tavoli e la presa delle comande.

#### **Criteri di Accettazione (AC):**

* **AC 3.2.1:** La UI della Main Station deve includere una sezione "Configurazione Mappa Sale" dotata di una griglia bidimensionale interattiva (Editor con griglia a nodi e funzione Drag-and-Drop).  
* **AC 3.2.2:** Il sistema deve permettere la creazione, rinomina ed eliminazione di più sale/ambienti fisici (es. "Sala Interna", "Terrazza Esterna", "Bancone") organizzati e navigabili tramite un'interfaccia a schede (Tab).  
* **AC 3.2.3:** Per ogni tavolo trascinato e posizionato sulla griglia, l'interfaccia deve richiedere obbligatoriamente un identificativo alfanumerico univoco per quella sede (es. T1, T2, B1) e il numero di Coperti di Default. Al salvataggio, il sistema deve registrare nel DB locale le coordinate spaziali assolute X e Y e l'ID della sala di appartenenza.  
* **AC 3.2.4:** Il modulo deve generare e mantenere persistenti a DB due macro-tavoli virtuali speciali, non vincolati a coordinate geometriche nella griglia ma accessibili da liste d'attesa dedicate nella UI, denominati rispettivamente ASPORTO e DELIVERY per la canalizzazione degli ordini esterni.

### **User Story 3.3: Hardware Device Routing per Centri di Lavoro**

* **Come:** User Admin (Store Manager)  
* **Voglio:** censire gli indirizzi IP e le porte di rete delle stampanti termiche LAN del locale e associarle ai rispettivi centri di produzione culinaria  
* **Al fine di:** garantire l'instradamento automatico e differenziato dei comandi di stampa delle comande inviate dai camerieri.

#### **Criteri di Accettazione (AC):**

* **AC 3.3.1:** La UI deve esporre un pannello hardware denominato "Gestione Periferiche di Stampa". Lo Store Manager deve poter aggiungere una stampante inserendo: Nome Logico (es. "Stampante Pizzeria"), Indirizzo IP statico all'interno della LAN (es. 192.168.1.50) e Porta logica TCP (di default impostata a 9100 per protocollo ESC/POS).  
* **AC 3.3.2:** Ogni periferica censita deve includere un pulsante "Stampa di Prova". Al trigger, la Main Station deve inviare un pacchetto di byte RAW TCP alla stampante; se la periferica non risponde entro 3000ms, la UI deve intercettare il timeout mostrando un alert visivo di errore: *"Stampante non raggiungibile in rete. Verificare cablaggio o IP"*.  
* **AC 3.3.3:** Il modulo deve consentire di mappare le Categorie del menu ai "Centri di Lavoro" logici del locale (es. Categoria Pizze e Calzoni ➔ Centro "Pizzeria"; Categoria Fritti e Primi ➔ Centro "Cucina"; Categoria Bibite ➔ Centro "Bar").  
* **AC 3.3.4:** Ciascun Centro di Lavoro logico deve poter essere associato a una o più stampanti fisiche registrate a sistema (es. impostando il routing in modo che la comanda inviata al Centro "Pizzeria" generi una stampa fisica sulla "Stampante Pizzeria" e una seconda stampa di cortesia sulla stampante "Riepilogo Chef" posizionata al pass).

### **User Story 3.4: Logica di Override del Table Locking in Cassa**

* **Come:** User Admin (Store Manager)  
* **Voglio:** forzare lo sblocco manuale di un tavolo bloccato in stato Locked direttamente dalla Main Station di cassa  
* **Al fine di:** ripristinare immediatamente l'operatività della sala se un tablet handheld ha subito un crash hardware, si è spento o ha perso la rete rimanendo all'interno di una comanda aperta.

#### **Criteri di Accettazione (AC):**

* **AC 3.4.1:** Se un tavolo si trova nello stato logico Locked nel DB relazionale locale (ovvero bloccato da un cameriere tramite la logica della US 6.3), sulla mappa della cassa centrale deve comparire un badge grafico rosso bloccante con l'indicazione *"Tavolo in uso da: \[Nome Cameriere\]"*.  
* **AC 3.4.2:** Facendo clic sul tavolo in stato Locked, la Main Station deve inibire le normali funzioni di apertura conto del cassiere e mostrare un popup contestuale contenente esclusivamente l'azione amministrativa "Forza Sblocco Tavolo".  
* **AC 3.4.3:** Al click sul comando di sblocco forzato, l'applicazione deve mostrare un tastierino numerico protetto che richiede obbligatoriamente l'inserimento del **PIN a 4 cifre** dello Store Manager (User Admin).  
* **AC 3.4.4:** A PIN validato con successo dal backend locale, la Main Station deve eseguire una query atomica sul database, modificando lo stato del tavolo da Locked a Occupied (se erano già presenti piatti consolidati) o a Free (se il tavolo era vuoto). Contemporaneamente, il server deve inviare una notifica broadcast via WebSocket a tutti i tablet handheld della LAN per eliminare l'overlay rosso e ripristinare la cliccabilità del tavolo in meno di 500ms.

### **User Story 3.6: Pannello Gestione Staff e Generazione PIN Rapidi di Sala**

* **Come:** User Admin (Store Manager)  
* **Voglio:** censire i camerieri attivi nella mia sede e associare a ciascuno un PIN rapido di accesso  
* **Al fine di:** permettere allo staff di sala di autenticarsi sui tablet handheld e tracciare l'autore di ogni singola comanda inviata.

#### **Criteri di Accettazione (AC):**

* **AC 3.6.1:** La UI della Main Station deve esporre una sezione denominata "Gestione Staff Locale", accessibile solo previa convalida del PIN dello Store Manager.  
* **AC 3.6.2:** Il sistema deve mostrare l'elenco degli operatori ereditati dallo snapshot del Cloud Hub (US 1.7) e permettere allo Store Manager di aggiungere collaboratori locali "extra" (es. personale a chiamata o stagionale) inserendo: Nome, Cognome e Ruolo (Cameriere / Cassiere).  
* **AC 3.6.3:** Per ogni operatore, la UI deve consentire la configurazione o la rigenerazione di un **PIN rapido a 4 cifre** per l'accesso ai palmari. Il sistema deve validare in tempo reale che il PIN inserito sia univoco all'interno della sede corrente per evitare conflitti di identità a DB locale.  
* **AC 3.6.4:** Al salvataggio, i dati e gli hash dei PIN devono essere memorizzati nel database relazionale locale (Tabelle\_Staff\_Locale) e propagati istantaneamente via WebSocket LAN a tutti i tablet entro 500ms, aggiornando la cache di login dei dispositivi mobili.

### **User Story 3.7: Apertura/Chiusura Turno Operatore e Monitoraggio Sessioni Attive**

* **Come:** User Admin (Store Manager)  
* **Voglio:** attivare o disattivare lo stato di un operatore all'inizio e alla fine del suo turno di lavoro  
* **Al fine di:** controllare quali camerieri sono autorizzati a prendere comande in tempo reale e monitorare quali tablet sono associati a quali utenti.

#### **Criteri di Accettazione (AC):**

* **AC 3.7.1:** Accanto a ogni nome nella lista staff locale, la UI deve mostrare un selettore di stato (In Turno / Fuori Turno) e un indicatore visivo del dispositivo associato (es. *"Tablet 3 \- IP: 192.168.1.61"*).  
* **AC 3.7.2:** Se un operatore viene impostato in stato Fuori Turno dallo Store Manager, la Main Station deve inviare un comando WebSocket imperativo di sconnnessione (FORCE\_LOGOUT) al tablet su cui quell'utente era autenticato. Il tablet deve interrompere la sessione corrente, cancellare i token temporanei e reindirizzare alla schermata di lock screen in meno di 1 secondo.  
* **AC 3.7.3:** L'interfaccia della Main Station deve includere una vista di monitoraggio in tempo reale che elenca i camerieri attualmente "In Turno" e il conteggio dei tavoli che stanno gestendo o modificando (integrazione con la logica di Table Locking dell'Epic 6).  
* **AC 3.7.4:** In caso di emergenza (es. un cameriere abbandona il servizio senza fare logout), lo Store Manager deve poter cliccare sul pulsante "Disconnetti Operatore" per liberare istantaneamente tutti i tavoli bloccati da quell'utente a DB locale, ripristinando la disponibilità della sala.

# **E4**

### **User Story 4.5: Intercettazione e Blocco di Sicurezza per Sconti Critici e Omaggi**

* **Come:** User Admin (Store Manager)  
* **Voglio:** che il sistema blocchi l'applicazione di sconti manuali superiori alla soglia definita o a totale omaggio, richiedendo la mia autorizzazione fisica sul dispositivo  
* **Al fine di:** supervisionare le variazioni di listino ad alto impatto economico e assicurarmi che ogni agevolazione commerciale sia tracciata ed approvata.

#### **Criteri di Accettazione (AC):**

* **AC 4.5.1:** Quando un operatore (cameriere da tablet o cassiere da Main Station) inserisce uno sconto manuale (percentuale o a valore) nel carrello, il sistema deve confrontare il valore con il parametro di controllo globale ereditato dal Cloud Hub (US 1.8). Se lo sconto supera la soglia (es. \> 20%) o se viene selezionata l'opzione Omaggio (Sconto 100%), l'interfaccia deve congelare istantaneamente il carrello.  
* **AC 4.5.2:** Il software deve mostrare un overlay modale bloccante a tutto schermo con la dicitura: ⚠️ AUTORIZZAZIONE RICHIESTA \- Rilevato Sconto Critico \[X%\] / Omaggio. L'overlay deve inibire qualsiasi interazione con il resto dell'applicazione, inclusi i pulsanti di uscita, preconto o invio scontrino.  
* **AC 4.5.3:** All'interno della modale deve essere renderizzato un tastierino numerico (0-9) protetto. Lo User Admin deve inserire il proprio **PIN visivo a 4 cifre**. I caratteri inseriti devono essere mascherati (\*\*\*\*) e il sistema deve avviare la verifica atomica a database edge locale non appena viene digitata la quarta cifra, senza necessità di un tasto di conferma.  
* **AC 4.5.4:** **Politica "Single-Use" di Scadenza Istantanea:** Se il PIN è valido, la Main Station sblocca il carrello applicando la riduzione di prezzo e consentendo l'emissione del documento. L'autorizzazione dello Store Manager decade immediatamente dopo l'applicazione dello sconto: se lo scontrino viene annullato o se l'operatore tenta di applicare un secondo sconto sulla riga successiva, il sistema deve richiedere nuovamente la digitazione fisica del PIN.  
* **AC 4.5.5:** In caso di PIN errato, il dispositivo deve attivare il feedback aptico (vibrazione se su tablet), ripulire l'input e mostrare in rosso l'errore *"PIN Errato \- Autorizzazione Negata"*. Al terzo tentativo fallito consecutivo, il modulo si blocca per 60 secondi e invia una segnalazione silenziosa di allarme memorizzata nell'Audit Log locale.  
* **AC 4.5.6:** Ad ogni sblocco andato a buon fine, il backend locale deve scrivere una riga immutabile nella tabella di auditing (US 1.6) registrando: Timestamp, ID Sede, ID Operatore Richiedente, ID User Admin Autorizzante, Valore Sconto Totale \[€/%\], ID Tavolo/Ordine.

# **E5**

## **Epic 5: Chiusura Fiscale, Report Z & Riconciliazione Cassa**

Quest'epica governa i processi contabili, fiscali e di auditing di fine giornata prima dello spegnimento del sistema del locale.

### **User Story 5.1: Controllo di Stato della Sala e Inibizione della Chiusura Fiscale**

* **Come:** User Admin (Store Manager)  
* **Voglio:** avviare la procedura di chiusura di fine giornata ottenendo una verifica automatica dello stato della sala  
* **Al fine di:** impedire la chiusura fiscale del punto cassa in presenza di tavoli ancora attivi, comande non salvate o conti operativi in sospeso.

#### **Criteri di Accettazione (AC):**

* **AC 5.1.1:** L'interfaccia della Main Station deve presentare un menu di fine servizio con il pulsante "AVVIA CHIUSURA GIORNALIERA". Al click, il sistema deve lanciare una query sincrona di controllo su tutte le tabelle attive del database locale della sala.  
* **AC 5.1.2:** Se all'interno del DB locale vengono rilevati tavoli negli stati logici Occupied, Locked o Conto Richiesto, o se vi sono ordini nei canali virtuali Asporto e Delivery contrassegnati come aperti/non saldati, il software deve bloccare categoricamente l'avanzamento della procedura.  
* **AC 5.1.3:** In caso di blocco, la UI deve mostrare una schermata modale imperativa non eludibile che elenca analiticamente tutti i sospesi rilevati (es. *"Impossibile procedere alla Chiusura Z: Il Tavolo T3 risulta ancora Occupato; Il Canale Delivery ha 2 ordini pendenti non saldati"*), costringendo l'utente a risolvere i conti in sala.  
* **AC 5.1.4:** Se la verifica attesta che la sala è completamente vuota e tutti i carrelli sono azzerati, la Main Station deve mutare il proprio stato operativo in Closing e inviare istantaneamente un payload WebSocket broadcast bloccante a tutti i tablet handheld in LAN, disabilitando la presa di qualsiasi nuova comanda per il resto della sessione.


### **User Story 5.2: Trigger Esecuzione Chiusura Fiscale Giornaliera (Report Z) via Hardware**

* **Come:** User Admin (Store Manager)  
* **Voglio:** comandare l'emissione della Chiusura Fiscale Z direttamente dall'interfaccia software della Main Station  
* **Al fine di:** istruire il Registratore Telematico hardware a consolidare la memoria fiscale della giornata, stampare il report cartaceo ufficiale e trasmettere telematicamente i corrispettivi all'Agenzia delle Entrate.

#### **Criteri di Accettazione (AC):**

* **AC 5.2.1:** Superata la validazione dello stato della sala (US 5.1), la UI della cassa deve abilitare un pulsante ad alto contrasto denominato "ESEGUI CHIUSURA Z FISCALE".  
* **AC 5.2.2:** Al click sul pulsante, il software deve compilare e trasmettere il pacchetto sequenziale nativo di comandi (RAW/XML) verso l'indirizzo IP del Registratore Telematico hardware **Micrelec Hydra SF20** configurato a sistema.  
* **AC 5.2.3:** Durante la trasmissione dei dati e l'elaborazione del firmware dell'RT, la UI della Main Station deve mostrare un overlay di caricamento a schermo intero bloccante con un indicatore di progresso e la dicitura tassativa: *"Comunicazione fiscale con il Registratore Telematico in corso... Non spegnere la macchina e attendere la stampa del Report Z"*.  
* **AC 5.2.4:** Al ricevimento del codice di successo (ACK) dal driver Micrelec, che attesta l'avvenuta chiusura della memoria fiscale hardware e l'invio dei corrispettivi telematici, la Main Station deve memorizzare l'evento nel proprio database locale impostando lo stato in Fiscally\_Closed, associando al record il timestamp UTC e il numero progressivo di Chiusura Z restituito dall'hardware fiscale.  
* **AC 5.2.5:** In caso di errore restituito dall'hardware (es. *"Carta esaurita"*, *"Nessun transato fiscale presente"*), il software deve catturare l'eccezione, salvare la traccia dell'errore nell'Audit Log locale e mostrare allo Store Manager le opzioni di risoluzione hardware o la possibilità di forzare una chiusura unicamente software protetta da PIN di emergenza.

### **User Story 5.3: Modulo di Riconciliazione Cassa e Calcolo Discrepanze (Scostamento)**

* **Come:** User Admin (Store Manager)  
* **Voglio:** dichiarare il contante reale contato fisicamente all'interno del cassetto cassa e verificare i totali dei terminali POS  
* **Al fine di:** permettere al software di calcolare automaticamente eventuali discrepanze finanziarie (scostamenti) tra il venduto teorico registrato e l'incasso reale.

#### **Criteri di Accettazione (AC):**

* **AC 5.3.1:** Avvenuta la chiusura fiscale dell'RT (US 5.2), la Main Station deve indirizzare l'User Admin alla schermata del "Modulo di Riconciliazione Turno", divisa rigidamente in due macro-sezioni: Conteggio Contanti e Verifica POS/Carte.  
* **AC 5.3.2:** Nella sezione Conteggio Contanti, l'interfaccia deve presentare un form tabellare strutturato per il conteggio del denaro in cassa al netto del fondo cassa iniziale. L'utente deve inserire la quantità fisica rilevata per ciascun taglio di banconota e moneta (es. N banconote da 50€, M da 20€, ecc.). Il software esegue il calcolo matematico del totale progressivo in tempo reale.  
* **AC 5.3.3:** Nella sezione Verifica POS/Carte, la UI deve esporre un campo di input numerico obbligatorio in cui lo Store Manager deve digitare il totale economico estratto dalla strisciata cartacea di chiusura (Report Totale Giornaliero) del terminale POS hardware indipendente del locale.  
* **AC 5.3.4:** Al click sul pulsante "CONFERMA RICONCILIAZIONE", l'algoritmo della Main Station deve confrontare i valori reali digitati dallo Store Manager con i totali teorici memorizzati a database locale durante il servizio. Il sistema deve renderizzare a schermo uno specchietto di riepilogo che calcola matematicamente ed evidenzia lo scostamento (Discrepanza \= Incassato Reale \- Venduto Teorico a DB). Qualsiasi valore diverso da 0.00€ deve essere colorato visivamente in rosso se negativo (mancanza di cassa) o in arancione se positivo (eccedenza di cassa).

### **User Story 5.4: Generazione Report di Chiusura Locale e Sincronizzazione Cloud Notturna**

* **Come:** User Admin (Store Manager)  
* **Voglio:** confermare il report di chiusura locale del punto vendita  
* **Al fine di:** archiviare in modo immutabile la sessione finanziaria della giornata, resettare i contatori operativi della sala e spingere i dati analitici consolidati al Cloud Hub aziendale.

#### **Criteri di Accettazione (AC):**

* **AC 5.4.1:** Al salvataggio finale della riconciliazione (US 5.3), la Main Station deve generare un record definitivo e non modificabile nella tabella Turni\_Chiusi del database locale. Il record deve accorpare: Totale Fiscale RT, numero progressivo Z, Totale Teorico DB suddiviso per canali (Tavolo/Asporto/Delivery), dati analitici di riconciliazione e valore dello scostamento contabile calcolato.  
* **AC 5.4.2:** Il sistema deve resettare lo stato logico di tutti i tavoli della mappa 2D, cancellando la cache dei carrelli d'ordine associati e riportandoli tutti a Free (Verdi). La Main Station si imposta nello stato di standby di sicurezza Turno\_Chiuso.  
* **AC 5.4.3:** L'edge server locale deve attivare un worker di sincronizzazione in background che impacchetta in un payload JSON crittografato l'intero transato analitico della giornata (l'elenco di tutti gli scontrini, le fatture e i dettagli dei piatti venduti).  
* **AC 5.4.4:** Il worker effettua una chiamata API POST verso l'endpoint /api/v2/sync/daily-closure del Cloud Hub, autenticandosi tramite il Token API crittografato della sede. In caso di totale assenza di connettività Internet (Modalità Offline-First), il sistema deve trattenere il pacchetto JSON nella coda locale marchiandolo come Pending\_Sync e riavviare tentativi automatici di invio a intervalli ciclici di 15 minuti fino alla ricezione dell'HTTP 200 OK (ACK) da parte del Cloud Hub.

# **E6**

## **Epic 6: Engine di Rete, Sincronizzazione LAN & Table Locking**

### **User Story 6.5: Override e Sblocco di Sicurezza del Tavolo da Terminale Mobile con Gestione Bozza**

* **Come:** User Admin (Store Manager)  
* **Voglio:** inserire il mio PIN numerico visivo a 4 cifre sul tablet di un cameriere davanti a un tavolo bloccato  
* **Al fine di:** forzare il rilascio dello stato Locked a database locale, recuperando gli articoli in bozza precedentemente inseriti e blindando la sessione contro sblocchi persistenti non autorizzati.

#### **Criteri di Accettazione (AC):**

* **AC 6.5.1:** Quando un cameriere fa tap su un tavolo in stato Locked (bloccato da un altro palmare andato in crash o disconnesso), la UI dell'Handheld App deve mostrare una finestra modale con il nome dell'operatore bloccante e il pulsante Sblocco di Sicurezza.  
* **AC 6.5.2:** Al click su Sblocco di Sicurezza, viene renderizzato un tastierino numerico (0-9) a tutto schermo ottimizzato per il touch (target minimi 48x48px). I caratteri digitati devono essere mascherati (\*\*\*\*). Il sistema intercetta l'input e invia la richiesta al database locale della Main Station non appena viene inserita la quarta cifra.  
* **AC 6.5.3:** **Logica di Recupero Carrello (Bozza):** Al momento dello sblocco, la Main Station non deve cancellare i piatti inseriti dal tablet andato in crash. La transazione sul DB edge deve mutare lo stato del tavolo da Locked a Occupied (o mantenere lo stato corrente se già popolato) e preservare le righe d'ordine non ancora inviate in cucina, contrassegnandole nel carrello del nuovo tablet come Draft\_Items (Articoli in Bozza).  
* **AC 6.5.4:** **Politica di Sicurezza "Single-Use" (Uso Singolo):** L'autorizzazione concessa tramite il PIN dello Store Manager deve valere ed essere consumata **esclusivamente per la singola operazione di sblocco corrente**. Una volta che la griglia degli articoli viene caricata sul tablet e il Table Lock passa al nuovo cameriere, la sessione amministrativa decade istantaneamente. Qualsiasi successiva azione critica sul tablet (come l'applicazione di sconti superiori alla soglia o storni di piatti già spediti) richiederà una nuova digitazione fisica del PIN dello Store Manager.  
* **AC 6.5.5:** Se il PIN è errato, il tablet attiva il feedback aptico (vibrazione), pulisce il campo e mostra l'errore *"PIN Errato \- Autorizzazione Negata"*. Dopo 3 tentativi falliti consecutivi, il modulo di sblocco viene inibito sul dispositivo per 60 secondi.  
* **AC 6.5.6:** Ogni sblocco forzato andato a buon fine viene storicizzato nell'Audit Log immutabile della Main Station con i metadati: Timestamp, Table\_ID, User\_Admin\_ID (autorizzante), Cameriere\_ID (beneficiario) e Recovered\_Items\_Count (numero di piatti salvati in bozza).

# **E7**

### **User Story 7.5: Intercettazione Sconti e Variazioni di Listino da Palmare con Vincolo di Sicurezza**

* **Come:** User Admin (Store Manager)  
* **Voglio:** che l'applicazione handheld blocchi immediatamente la UI se un cameriere tenta di applicare uno sconto superiore alla soglia tollerata direttamente dal tavolo  
* **Al fine di:** impedire ammanchi, accordi non autorizzati con i clienti in sala e garantire che ogni anomalia di prezzo richieda la mia presenza fisica sul dispositivo.

#### **Criteri di Accettazione (AC):**

* **AC 7.5.1:** All'interno del modulo carrello del tablet (Epic 7), se il cameriere fa tap sulla funzione "Sconto" e inserisce un valore percentuale o flat che supera il limite massimo configurato a livello globale (es. \> 20%), la UI deve congelare immediatamente la schermata d'ordine.  
* **AC 7.5.2:** Il sistema deve sovrapporre un overlay modale bloccante con la dicitura: ⚠️ SCONTO CRITICO RILEVATO \- Richiesto PIN Store Manager. Questo overlay disabilita i pulsanti di invio comanda (SPEDITO), l'uscita dalla schermata e la navigazione tra le categorie del menu.  
* **AC 7.5.3:** Lo Store Manager deve digitare il proprio **PIN visivo a 4 cifre** sul tastierino touch dedicato (0-9) integrato nella modale. La UI deve mascherare l'input (\*\*\*\*) e inviare la richiesta di convalida via WebSocket alla Main Station non appena viene premuto il quarto numero.  
* **AC 7.5.4:** **Scadenza Istantanea della Sessione (Single-Use):** Se il PIN è corretto, la Main Station restituisce un ACK di sblocco, lo sconto viene applicato al carrello e la modale si chiude. Il token temporaneo di autorizzazione viene distrutto immediatamente: se il cameriere cancella lo sconto appena inserito o tenta di modificarlo nuovamente, la UI riattiva il blocco richiedendo nuovamente il PIN.  
* **AC 7.5.5:** Se il PIN inserito è errato, il tablet deve attivare il motorino di vibrazione hardware (Haptic Feedback), ripulire i campi e mostrare la stringa rossa *"PIN Errato \- Autorizzazione Negata"*. Al terzo tentativo fallito consecutivo, il tastierino viene inibito per 60 secondi.  
* **AC 5.5.6:** Ogni sblocco autorizzato con successo viene registrato nell'Audit Log della Main Station (US 1.6) accorpando i dati del cameriere richiedente e dello Store Manager autorizzante.

# **E8**

### **User Story 8.5: Sblocco Autoritativo delle Comande Consolidate (Lucchetto Software)**

* **Come:** User Admin (Store Manager)  
* **Voglio:** che il tablet di sala richieda il mio PIN numerico a 4 cifre ogni volta che si tenta di eliminare o modificare un articolo già inviato in cucina  
* **Al fine di:** tracciare centralmente le variazioni dei flussi di cassa operativi, azzerare le frodi interne (piatti serviti e poi cancellati di nascosto) e autorizzare solo gli storni legittimi.

#### **Criteri di Accettazione (AC):**

* **AC 8.5.1:** Nella UI del carrello sul tablet (Epic 8), tutti gli articoli che si trovano in stato Sent o In Preparation (ovvero già trasmessi alla Main Station tramite il comando "SPEDITO") devono mostrare visivamente un'icona a forma di lucchetto blindato accanto al nome.  
* **AC 8.5.2:** Al tap sul pulsante \[-\] o sull'icona di eliminazione di una riga contrassegnata dal lucchetto, l'applicazione deve inibire l'azione distruttiva e sovrapporre un overlay modale bloccante a tutto schermo con la dicitura: ⚠️ STORNO ARTICOLO CONSOLIDATO \- Richiesto PIN Store Manager.  
* **AC 8.5.3:** La modale deve esporre un tastierino numerico touch (0-9) protetto. Lo Store Manager deve digitare il proprio **PIN visivo a 4 cifre**. L'input deve essere mascherato (\*\*\*\*) e, al rilevamento della quarta cifra, il tablet deve inviare immediatamente un payload WebSocket di tipo REQUEST\_STORN\_AUTHORIZATION alla Main Station locale.  
* **AC 8.5.4:** **Scadenza Istantanea "Single-Use" dell'Autorizzazione:** Se il PIN è valido, il server edge restituisce un ACK di approvazione, il lucchetto sulla singola riga selezionata si sblocca temporaneamente permettendo al cameriere di scalare la quantità o eliminare il piatto. Immediatamente dopo aver applicato la modifica, i privilegi amministrativi decadono: per stornare un secondo articolo differente nello stesso carrello, lo Store Manager dovrà digitare nuovamente il PIN.  
* **AC 8.5.5:** In caso di validazione fallita del PIN, il tablet attiva il feedback aptico (vibrazione hardware), pulisce i campi e mostra l'errore *"PIN Errato \- Autorizzazione Negata"*. Al terzo tentativo errato consecutivo, il modulo si blocca per 60 secondi.  
* **AC 8.5.6:** Ad ogni storno autorizzato con successo, la Main Station deve aggiornare il DB locale registrando la variazione contabile e scrivere una riga immutabile nell'Audit Log locale (US 1.6) catturando i metadati: Timestamp, ID Sede, ID Cameriere Richiedente, ID User Admin Autorizzante, Articolo\_Stornato, Quantità\_Stornata, Valore\_Economico\_Storno \[€\].

### **User Story 8.6: Generazione Automatica del Ticket Termico di Annullamento (Layout ESC/POS Invertito)**

* **Come:** Operatore di Cucina / Pizzaiolo  
* **Voglio:** ricevere istantaneamente un ticket cartaceo stampato in modalità "testo invertito" quando lo Store Manager autorizza uno storno  
* **Al fine di:** bloccare immediatamente la linea di preparazione del piatto stornato, evitando lo spreco di materie prime e disallineamenti con i conti della sala.

#### **Criteri di Accettazione (AC):**

* **AC 8.6.1:** Non appena lo Store Manager convalida lo storno di un articolo (US 8.5), la Main Station deve intercettare il Centro di Lavoro logico associato alla categoria del piatto (es. "Pizzeria") e compilare un payload di stampa RAW ESC/POS dedicato.  
* **AC 8.6.2:** **Vincolo di Formattazione Fiscale e Hardware:** Il ticket di storno deve adottare formati di testo ad altissimo impatto visivo per catturare l'attenzione dei cuochi in ambiente di lavoro rumoroso. La stringa inviata via TCP (porta 9100) alla stampante LAN di competenza deve forzare i seguenti comandi nativi ESC/POS:  
  * Inizio e Fine riga con dicitura fissa a caratteri di altezza e larghezza doppia (GS \! \\x11): \=== ANNULLO PIATTO \===.  
  * Abilitazione della modalità **Testo Invertito / Reverse Video** (GS B \\x01 \- testo bianco su sfondo nero) per tutta la riga dell'articolo stornato e la relativa quantità.  
* **AC 8.6.3:** Il corpo del ticket deve esporre in modo chiaro ed evidente i dati identificativi di tracciabilità dell'azione: Numero Tavolo / Canale, Quantità Stornata, Nome Piatto, Ora Esecuzione dello Storno, Nome Cameriere di Sala e Nome dello Store Manager che ha inserito il PIN di sblocco.  
* **AC 8.6.4:** In calce al documento, il ticket deve riportare a caratteri standard la dicitura: \*\*\* NOTA: VERIFICARE LA DISPONIBILITÀ DELLA LINEA CON LA SALA \*\*\*.

# **Cassiere**

### **ECO SISTEMA EPIC 3: CONSULTAZIONE ED INTEGRITÀ DELLA SALA** 

#### **User Story 3.8: Consultazione Planimetria Sale Dinamica Live e Monitoraggio Code Virtuali**

* **Come:** Cassiere  
* **Voglio:** visualizzare in tempo reale lo stato cromatico dei tavoli e i contatori delle code di Asporto e Delivery  
* **Al fine di:** individuare all'istante i tavoli pronti per il saldo e gestire i clienti o i rider in attesa di pagamento al banco.

##### **Criteri di Accettazione (AC):**

* **AC 3.8.1:** La schermata principale della modalità cassa deve renderizzare la planimetria geometrica del locale. I cambi di stato dei tavoli (Verde=Libero, Blu=Occupato, Giallo Lampeggiante=Conto Richiesto, Rosso=Bloccato da Cameriere) devono riflettersi sulla UI tramite eventi push WebSocket in meno di 150ms.  
* **AC 3.8.2:** In una barra laterale fissa della UI (Left/Right Panel), devono essere sempre visibili due widget numerici di conteggio relativi ai canali virtuali: ASPORTO (Attivi: N) e DELIVERY (Attivi: M).  
* **AC 3.8.3:** Al click sul widget ASPORTO o DELIVERY, la mappa sale viene temporaneamente sostituita da una List View degli ordini attivi, ordinati cronologicamente per timestamp di creazione, evidenziando l'ID progressivo (es. *\#ASP-042*), il nome del cliente o il broker (es. *Glovo*) e lo stato del pagamento (Da Saldare / Pagato).  
* **AC 3.8.4:** Il tap su un tavolo della mappa o su un ordine delle liste virtuali carica istantaneamente l'elenco dei piatti nel carrello attivo, predisponendo la schermata per la riscossione o la modifica.


### **ECO SISTEMA EPIC 4: MODULO CASSA CENTRALE & INTERFACCIA FISCALE** 

#### **User Story 4.1: Interfaccia di Vendita Touchscreen, Selezione Canale e Composizione Rapida Carrello**

* **Come:** Cassiere  
* **Voglio:** selezionare il canale di vendita corretto e inserire i piatti tramite una griglia articoli reattiva  
* **Al fine di:** servire i clienti direttamente al banco (Asporto) o registrare comande telefoniche e rider senza passare per i tablet di sala.

##### **Criteri di Accettazione (AC):**

* **AC 4.1.1:** Quando il Cassiere avvia un nuovo ordine direttamente dalla Main Station, la UI deve forzare la selezione del canale tramite tre pulsanti macro: TAVOLO, ASPORTO (genera automaticamente un ID progressivo giornaliero, es. *\#ASP-042*), DELIVERY (apre un sottomenu di selezione del broker specifico, es. *Glovo, Deliveroo*).  
* **AC 4.1.2:** Selezionato il canale, la UI applica istantaneamente la matrice dei prezzi dinamici legata a quel canale per la sede corrente (es. se *Delivery*, carica automaticamente il listino con prezzi maggiorati per le commissioni dei broker).  
* **AC 4.1.3:** Il layout di vendita deve mostrare a sinistra il carrello corrente (Append-Only) e a destra la griglia degli articoli suddivisa nelle categorie merceologiche colorate ereditate dal Cloud.  
* **AC 4.1.4:** Il tempo di risposta della UI al tap di un articolo per l'inserimento nel carrello deve essere inferiore a 30ms, garantendo fluidità totale e assenza di latenze percettibili per l'operatore.

#### **User Story 4.2: Chiusura Conto Singolo, Selezione Metodo di Pagamento e Calcolo Resto Giga**

* **Come:** Cassiere  
* **Voglio:** selezionare il metodo di riscossione del conto e digitare l'importo di banconote ricevuto dal cliente  
* **Al fine di:** visualizzare il resto calcolato a caratteri giganti, comandare l'apertura fisica del cassetto contanti ed emettere il documento commerciale dall'RT.

##### **Criteri di Accettazione (AC):**

* **AC 4.2.1:** Al click sul pulsante "PAGAMENTO / SCONTRINO", il sistema blocca la griglia articoli e apre una modale contenente il riepilogo del conto e i pulsanti dei metodi di pagamento: Contanti, POS / Carta, Buono.  
* **AC 4.2.2:** Se viene selezionato Contanti, la UI mostra un tastierino numerico rapido affiancato dai tagli di banconote standard (10€, 20€, 50€, 100€).  
* **AC 4.2.3:** All'inserimento della cifra ricevuta, se superiore al totale dell'ordine, il software esegue il calcolo matematico in tempo reale e renderizza a tutto schermo la stringa RESTO: X.XX € utilizzando un font ad alto contrasto non inferiore a **36pt**.  
* **AC 4.2.4:** Al click definitivo su "CONFERMA ED EMETTI", la Main Station compila il tracciato comandi per il driver del Registratore Telematico **Micrelec Hydra SF20**, invia un impulso a 24V tramite la porta RJ11 posteriore per attivare l'apertura fisica del cassetto porta-contanti, archivia lo scontrino a DB locale come Paid e azzera la schermata cassa per l'ordine successivo.

#### **User Story 4.3: Generazione ed Emissione del Preconto (Documento Non Fiscale)**

* **Come:** Cassiere  
* **Voglio:** comandare la stampa di un documento cartaceo di riepilogo non fiscale per un tavolo che si appresta a pagare  
* **Al fine di:** consentire la verifica preliminare dei piatti da parte dei clienti direttamente al tavolo, bloccando la comanda contro modifiche concorrenti.

##### **Criteri di Accettazione (AC):**

* **AC 4.3.1:** Selezionando un tavolo in stato Occupied dalla mappa sale, la UI deve esporre il pulsante "STAMPA PRECONTO".  
* **AC 4.3.2:** Al click, il sistema compila la stringa di testo e la indirizza via TCP (porta 9100) alla stampante termica LAN di cortesia configurata per la cassa, aggirando completamente l'hardware dell'RT.  
* **AC 4.3.3:** **Vincolo di Layout:** Il documento stampato deve riportare in modo esplicito in testa e in calce (footer) la dicitura formattata a caratteri di altezza e larghezza doppia: \*\*\* DOCUMENTO NON FISCALE \*\*\*.  
* **AC 4.3.4:** L'emissione del preconto deve mutare istantaneamente lo stato del tavolo a database locale in Conto Richiesto (attivando l'effetto Giallo Lampeggiante sulla mappa sale). Da questo momento il carrello del tavolo è bloccato in sola lettura e i camerieri non possono aggiungere piatti da tablet, a meno di un override amministrativo.

#### **User Story 4.4: Emissione Fattura Elettronica Diretta con Scontrino Allegato (Azzeramento Corrispettivi)**

* **Come:** Cassiere  
* **Voglio:** inserire i dati fiscali o la partita IVA di un cliente per generare una fattura elettronica immediata  
* **Al fine di:** trasmettere il file XML al Sistema di Interscambio (SDI) ed emettere un titolo cartaceo dall'RT che non duplichi i corrispettivi fiscali a fine giornata.

##### **Criteri di Accettazione (AC):**

* **AC 4.4.1:** Nella schermata di pagamento, il Cassiere può attivare il toggle "FATTURA". Al click, si apre un modulo con i campi di validazione sintattica obbligatori: Ragione Sociale/Nome, Partita IVA / Codice Fiscale, Codice Destinatario SDI (7 caratteri) o PEC.  
* **AC 4.4.2:** Se la Partita IVA (11 cifre) o il Codice Destinatario non superano il controllo di conformità dei caratteri, il pulsante di emissione viene inibito dalla UI.  
* **AC 4.4.3:** Al click su "CONFERMA ED EMETTI", il backend genera il tracciato standard FatturaPA XML e lo accoda nella tabella locale Invio\_SDI\_Pending per la trasmissione asincrona verso il Cloud Hub.  
* **AC 4.4.4:** Contemporaneamente, la Main Station istruisce l'RT **Micrelec Hydra SF20** a stampare il titolo impostando il flag di chiusura come **"Scontrino Fattura" / "Fattura Allegata"**. Questo comando permette la stampa fisica del foglio per il cliente ma indica alla memoria fiscale dell'RT di azzerare l'importo nel calcolo del totale dei corrispettivi del Report Z, escludendo il rischio di una doppia tassazione.

### **ECO SISTEMA EPIC 5: CHIUSURA DI SESSIONE OPERATORE**

#### **User Story 5.6: Chiusura Sessione Cassiere e Dichiarazione Finanziaria (Cassetto Cieco)**

* **Come:** Cassiere  
* **Voglio:** effettuare il conteggio del denaro ed inserire i totali dei terminali POS prima di effettuare il logout a fine turno  
* **Al fine di:** registrare formalmente il mio incassato reale a DB senza condizionamenti visivi, delegando il calcolo delle discrepanze allo Store Manager.

##### **Criteri di Accettazione (AC):**

* **AC 5.6.1:** Al termine del proprio turno di lavoro, il Cassiere clicca sulla funzione "CHIUDI SESSIONE CASSA". Il sistema blocca istantaneamente l'interfaccia di vendita, impedendo l'apertura di nuovi carrelli o tavoli a nome dell'operatore.  
* **AC 5.6.2:** **Logica Blind Cash Count (Conteggio Cieco):** La UI deve mostrare una schermata di input numerico strutturata in cui il Cassiere dichiara il contante fisico in cassa (suddiviso obbligatoriamente per singoli tagli di monete e banconote) e il totale cumulativo estratto dalla strisciata cartacea del terminale POS fisico delle carte.  
* **AC 5.6.3:** L'interfaccia **non deve mostrare in nessun modo** al Cassiere i totali teorici calcolati dal software a DB durante il servizio, impedendo aggiustamenti arbitrari o quadrature forzate dei dati da parte dell'operatore.  
* **AC 5.6.4:** Al click su "CONFERMA E LOGOUT", il sistema memorizza le informazioni dichiarate nella tabella locale Sessioni\_Operatori\_Log legandole all'ID del Cassiere, chiude la sessione finanziaria e reindirizza l'applicazione alla Lock Screen principale.

# **Cameriere**

## **Epic 6: Engine di Rete, Sincronizzazione LAN & Table Locking** 

### **User Story 6.1: Login Rapido tramite PIN e Persistenza della Sessione Locale**

* **Come:** Cameriere  
* **Voglio:** digitare il mio PIN personale a 4 chiuse sul tablet per sbloccare l'applicazione  
* **Al fine di:** accedere istantaneamente alla mappa delle sale associando la mia firma operatore a ogni operazione d'ordine.

#### **Criteri di Accettazione (AC):**

* **AC 6.1.1:** Lo schermo di standby del tablet mostra una Lock Screen fissa con tastierino numerico nativo. All'inserimento della 4° cifra, l'app convalida l'operatore confrontando l'input con l'alberatura dello staff in cache locale. Il tempo di sblocco e rendering della mappa sale deve essere $\\le 150\\text{ms}$.  
* **AC 6.1.2:** A login eseguito, lo stato dell'applicazione memorizza l'ID operatore. La sessione non scade finché non viene premuto esplicitamente il tasto "LOGOUT" o il dispositivo entra in modalità sleep per inattività ($\> 10\\text{ max minuti}$).  
* **AC 6.1.3:** **Fallback Offline-First:** Se il tablet perde temporaneamente la connessione Wi-Fi, l'app esegue la validazione del PIN confrontando l'input con l'hash SHA-256 salvato nell'autenticazione locale (SecureStorage del dispositivo).

### **User Story 6.2: Acquisizione del Lock Concorrente ed Esclusività del Tavolo**

* **Come:** Cameriere  
* **Voglio:** fare tap su un tavolo libero o occupato per acquisirne il controllo esclusivo  
* **Al fine di:** impedire che un altro cameriere possa modificare contemporaneamente lo stesso tavolo, evitando sovrascritture distruttive a DB.

#### **Criteri di Accettazione (AC):**

* **AC 6.2.1:** Al tap su un tavolo in stato FREE o OCCUPIED, l'app invia un messaggio WebSocket sincrono REQUEST\_TABLE\_LOCK all'edge server.  
* **AC 6.2.2:** Se l'edge server risponde LOCK\_GRANTED, l'interfaccia sblocca la griglia del menu. In contemporanea, il server propaga a tutti gli altri tablet della LAN l'evento push TABLE\_LOCKED\_BROADCAST, mutando il colore di quel tavolo in rosso e disabilitandone la cliccabilità per gli altri operatori.  
* **AC 6.2.3:** Se il server risponde LOCK\_DENIED (perché un altro operatore ha anticipato la richiesta di frazioni di secondo), il tablet mostra un banner di errore nativo, colora il tavolo in rosso e inibisce l'accesso.

#### **Data Contract: Payload WebSocket** REQUEST\_TABLE\_LOCK

## **Epic 7: Presa Comanda, Interfaccia Operativa & Modulo Varianti**

### **User Story 7.1: Selezione Canale, Navigazione Categorie e Composizione Carrello**

* **Come:** Cameriere  
* **Voglio:** navigare la griglia dei piatti filtrando per categorie e inserire gli articoli nel carrello  
* **Al fine di:** comporre l'ordine applicando istantaneamente i prezzi dinamici corretti per il canale ereditato.

#### **Criteri di Accettazione (AC):**

* **AC 7.1.1:** Se il tavolo selezionato è in stato FREE, la UI mostra un popup modale bloccante per l'inserimento obbligatorio del numero dei coperti ($\> 0$). Se il canale del tavolo è virtuale (ASPORTO / DELIVERY), la richiesta coperti viene ignorata di default.  
* **AC 7.1.2:** La griglia articoli carica i dati dalla cache in RAM locale con un tempo di rendering $\\le 30\\text{ms}$. Le categorie mostrano i colori identificativi HEX configurati a livello di Cloud Hub.  
* **AC 7.1.3:** Il carrello calcola dinamicamente il totale progressivo. Se l'ordine fa riferimento al canale DELIVERY, la UI applica automaticamente la maggiorazione di listino ereditata a DB per i broker esterni.  
* 

### **User Story 7.2: Configurazione Varianti d'Ingrediente con Vincolo di Non-Negatività**

* **Come:** Cameriere  
* **Voglio:** applicare aggiunte o rimozioni di ingredienti su un piatto tramite un menu contestuale rapido  
* **Al fine di:** personalizzare la comanda modificando correttamente il prezzo di riga senza scendere sotto lo zero fiscale.

#### **Criteri di Accettazione (AC):**

* **AC 7.2.1:** Un Long Press (\>400ms) o un doppio tap sulla riga di un articolo a carrello apre il Bottom Sheet delle varianti associate.  
* **AC 7.2.2:** Le varianti in aggiunta incrementano il valore del piatto (es. \+ Bufala (+1.50€)). Le varianti in rimozione (es. \- Mozzarella) decrementano il valore solo se configurate con segno negativo a Cloud Hub.  
* **AC 7.2.3:** **Algoritmo Antifrode di Riga:** Il motore di calcolo del carrello locale deve includere un controllo logico imperativo: la somma algebrica delle rimozioni non può mai portare il prezzo finale della singola riga articolo a un valore inferiore a 0.00€. Se si tenta di violare il vincolo, la UI blocca il click e mostra un alert visivo.  
* **AC 7.2.4:** Le varianti confermate vengono renderizzate nel carrello subito sotto l'articolo principale, indentate e precedute dal rispettivo segno matematico.

## **Epic 8: Workflow del Servizio, Gestione Uscite & Stampe LAN di Comanda**

### **User Story 8.1: Smistamento in Step di Marcia, Controllo** HOLD **e Invio in Produzione**

* **Come:** Cameriere  
* **Voglio:** organizzare gli articoli del carrello in portate sequenziali e congelare i secondi piatti  
* **Al fine di:** trasmettere l'ordine alle stampanti di cucina rispettando i tempi di uscita richiesti dal cliente.

#### **Criteri di Accettazione (AC):**

* **AC 8.1.1:** Al momento dell'inserimento, il software distribuisce i piatti negli Step di marcia di default basati sulla categoria merceologica (es. Fritti ➔ Step 0; Pizze ➔ Step 1; Dessert ➔ Coda X DOLCE). Il cameriere può variare lo step toccando il badge numerico presente sulla riga del piatto.  
* **AC 8.1.2:** Attivando l'interruttore grafico HOLD su uno Step, i piatti di quella portata vengono contrassegnati nello stato logico Suspended.  
* **AC 8.1.3:** Al click sul pulsante "SPEDITO", l'app compila il payload JSON, lo trasmette via WebSocket alla Main Station, rilascia il Table Lock (il tavolo diventa Blu sulla mappa) e forza il logout rimandando alla Lock Screen.  
* **AC 8.1.4:** **Chiamata Portata:** Per sbloccare uno step in HOLD, il cameriere riapre il tavolo, seleziona la portata sospesa e preme CHIAMA PORTATA. Questo lancia un trigger WebSocket prioritario alla Main Station, la quale elabora la stringa ESC/POS e stampa in cucina il layout di sollecito fissa: \=== CHIAMA PORTATA X \===.


## **Epic 9: Modulo Pagamenti Avanzato, Split & Conti Separati**

### **User Story 9.1: Riscossione al Tavolo tramite Split alla Romana (Divisione Paritaria)**

* **Come:** Cameriere  
* **Voglio:** frazionare il totale economico del tavolo in parti e quote uguali selezionate dal cliente  
* **Al fine di:** procedere all'incasso sequenziale delle singole quote inviando i trigger fiscali alla cassa centrale.

#### **Criteri di Accettazione (AC):**

* **AC 9.1.1:** All'interno del modulo pagamenti del tablet, cliccando su "Split alla Romana", la UI rileva il totale lordo e imposta come divisore di default il numero dei coperti. Il cameriere può aumentare o diminuire il numero dei pagatori tramite i selettori \[+\] e \[-\].  
* **AC 9.1.2:** L'app calcola e blocca la riga di quota ($\\text{Quota} \= \\text{Totale} / N$). Selezionando una quota, il cameriere dichiara il metodo di riscossione (Contanti / POS) e preme "PAGA QUOTA".  
* **AC 9.1.3:** Ad ogni pagamento parziale andato a buon fine, il tablet riceve l'ACK dalla Main Station (che ha dialogato con l'RT Micrelec) e aggiorna un counter visivo statico: *"Pagato: X di Y quote \- Residuo: Z.ZZ€"*.  
* **AC 9.1.4:** Il tavolo rimane bloccato in sala e non può tornare in stato FREE finché il valore residuo da pagare non risulta matematicamente pari a 0.00€.

### **User Story 9.2: Riscossione al Tavolo tramite Split Analitico (Selezione Piatti)**

* **Come:** Cameriere  
* **Voglio:** estrarre selettivamente i singoli piatti consumati da un cliente spostandoli in un sub-carrello  
* **Al fine di:** incassare un conto parziale specifico lasciando il resto della comanda memorizzato sul tavolo.

#### **Criteri di Accettazione (AC):**

* **AC 9.2.1:** Attivando lo "Split Analitico", la UI del tablet si sdoppia in due colonne: a sinistra l'elenco dei piatti ancora da pagare per il tavolo, a destra il carrello vuoto del "Sub-Conto".  
* **AC 9.2.2:** Il cameriere sposta i piatti da sinistra a destra tramite interazione *Drag-and-Drop* o tramite tap singolo sulla riga. Se un piatto ha quantità multipla, il tap apre un micropopup numerico per la selezione della quantità frazionata da estrarre.  
* **AC 9.2.3:** Al click su "SALDA SUB-CONTO", l'app calcola il totale esatto dei soli piatti estratti nella colonna di destra e richiede la chiusura finanziaria inviando il payload WebSocket alla Main Station.  
* **AC 9.2.4:** Ad scontrino emesso, i piatti saldati vengono eliminati definitivamente dal database principale del tavolo. Se la colonna di sinistra contiene ancora articoli residui, il server rilascia il Table Lock e mantiene il tavolo nello stato OCCUPIED (Blu) sulla mappa.

