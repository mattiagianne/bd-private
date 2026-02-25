---
name: Sandbox filtri costi comuni mappa
overview: Piano per chiarire il comportamento sandbox (filtri non applicati), migliorare l'analisi costi per comune usando i confini amministrativi reali e le intersezioni geometriche (raggi e copertura), con input nome comune e provincia, e aggiungere visualizzazione mappa.
todos: []
isProject: false
---

# Sandbox, filtri, analisi costi per comune e visualizzazione

## 1. Sandbox: chiarire che i filtri non funzionano

In sandbox l'API Real Estate restituisce dati di test fissi (es. Roma); lat/lon, anno/mese e importo non modificano i risultati. Modifiche: nota in cima allo script, eventuale alert in UI se URL contiene "test.", sezione README "Sandbox vs produzione".

---

## 2. Confini amministrativi reali e intersezioni geometriche (priorità)

**Obiettivo**: stimare le aree di copertura usando i **confini amministrativi reali** dei comuni (polygon), valutare **raggi e intersezioni geometriche** per coprire tutta l'area possibile del comune. Input: **nome comune** e, opzionale, **provincia**.

**Flusso**: Input nome comune + provincia → caricamento **polygon reale** ISTAT (non rettangolo) → griglia di punti (solo **dentro il polygon** o filtrata) → per ogni punto cerchio di raggio R → **intersezione geometrica** cerchio ∩ polygon comune → area coperta per chiamata → aggregazione (somma/union) → **area coperta totale** e **% copertura** sul comune → numero chiamate e costo stimato.

**Dati**: ISTAT mette a disposizione confini comuni in shapefile WGS84 ([https://www.istat.it/it/archivio/222527](https://www.istat.it/it/archivio/222527)); convertire in GeoJSON e fare lookup per nome + provincia. Progetti come teamdigitale/confini-amministrativi-istat o ondata/istat_boundaries_downloader facilitano download/conversione.

**Implementazione**: **Turf.js** (JavaScript): `turf.circle`, `turf.intersect`, `turf.area`, `turf.booleanPointInPolygon`. Eseguire in un **tool Node/React** (non in Apps Script): carica GeoJSON comuni, risolvi comune da nome+provincia, genera punti dentro il polygon, calcola per ogni punto l'intersezione cerchio–polygon e l'area, aggrega copertura e costo; opzionale export elenco punti (lat,lng) per lo script .gs "Cerca con griglia".

**Riepilogo**: Aggiungere tool di analisi copertura (Node/React) con confini ISTAT e Turf per intersezioni; input comune + provincia; output punti, % copertura, costo. Lo script .gs può usare la lista punti prodotta per allineare le chiamate API alla geometria reale.

---

## 3. Analisi costi in relazione alla griglia per comune

Stima costi multi-area nello script .gs su AREE esistenti (dialog/foglio StimaCosti). Quando disponibile il tool con confini reali, l'analisi per comune usa polygon + intersezioni; lo script può ricevere lista punti (file/foglio) per "Cerca con griglia".

---

## 4. Dati comuni e input nome + provincia

Confini in GeoJSON (polygon); identificazione per **nome comune** e **provincia**. Indice nome+provincia → codice ISTAT o GeoJSON per caricamento. Mappa Leaflet per visualizzare confine, punti e cerchi; input Comune + Provincia.

---

## 5. Visualizzazione (mappa)

Pagina/conponente con Leaflet: disegna confine comune, punti griglia, opzionalmente cerchi; legenda con punti, area coperta, %, costo. Può essere integrata nel tool Turf (stessa app che calcola e visualizza).

---

## 6. Analisi cartella GIS e webapp con mappa (confini selezionabili)

### Contenuto attuale della cartella GIS

Nel progetto è presente la cartella **GIS/ISTAT/** con dati ISTAT confini amministrativi al **01/01/2025** (versione generalizzata, suffisso `_g`). Struttura rilevata:


| Cartella           | Contenuto                      | Uso                         |
| ------------------ | ------------------------------ | --------------------------- |
| `RipGeo01012025_g` | Ripartizioni geografiche       | Livello nazionale/aggregato |
| `Reg01012025_g`    | Regioni                        | Confini regionali           |
| `ProvCM01012025_g` | Province e Città metropolitane | Confini provinciali         |
| `Com01012025_g`    | Comuni                         | Confini comunali            |


Per ogni cartella è presente almeno il file **.prj** (proiezione). Il .prj letto (`Com01012025_g_WGS84.prj`) indica **WGS_1984_UTM_Zone_32N** (non lon/lat WGS84). Per una mappa web serve **EPSG:4326** (lon/lat); quindi in fase di conversione va indicato il reproject a WGS84 geografico.

I file **.shp**, **.shx**, **.dbf** (e opzionalmente .cpg) potrebbero non essere tracciati in git (binari/volume). Vanno garantiti in locale o tramite script di download (es. da [ISTAT – Confini amministrativi](https://www.istat.it/it/archivio/222527) o da [ondata/confini-amministrativi-istat](https://github.com/ondata/confini-amministrativi-istat)).

### Webapp: mappa con confine comune/provincia selezionabile da menu a tendina

**Obiettivo**: frontend web che mostra una mappa, con **menu a tendina** per scegliere **Provincia** e **Comune** (e opzionalmente Regione), e che **evidenzia il confine** dell’ente selezionato (polygon dal shapefile/GeoJSON).

**Stack consigliato (web)**:

- **MapLibre**: per il web si usa **MapLibre GL JS** ([maplibre.org](https://maplibre.org/)), non MapLibre React Native (quest’ultimo è per app mobile React Native). In React si può usare **react-map-gl** (supporta MapLibre come backend) per il componente mappa e i layer vettoriali.
- **deck.gl** ([deck.gl](https://deck.gl/)): ottimo per layer complessi e grandi dataset; si integra con MapLibre (o Mapbox/Google Maps) come base map. Può gestire direttamente GeoJSON e polygon per evidenziare confini; utile se in futuro si aggiungono molti layer (griglia, cerchi, heatmap).
- **Scelta pratica**: per “evidenziare confine comune/provincia” e menu a tendina basta **MapLibre GL JS + react-map-gl**; se si vogliono molte layer (griglia punti, cerchi, copertura) **deck.gl** sopra MapLibre è una buona opzione.

**Flusso**:

1. **Conversione shapefile → GeoJSON**: da riga di comando (es. `ogr2ogr -f GeoJSON comuni_wgs84.geojson Com01012025_g_WGS84.shp -t_srs EPSG:4326`) o con script Node (es. `shapefile` npm) per generare GeoJSON in WGS84. Preferibile un GeoJSON per livello (comuni, province, regioni) o suddiviso per provincia per caricamenti on-demand.
2. **Backend (opzionale)**: servire GeoJSON statici (es. da `/public/geojson/`) oppure un’API minima che, dato codice provincia o nome comune+provincia, restituisce il singolo feature (confine) da un GeoJSON indicizzato.
3. **Frontend**:
  - Mappa: MapLibre (via react-map-gl) o deck.gl con base map MapLibre/OSM.
  - **Menu a tendina**: prima “Provincia” (elenco da attributi shapefile/GeoJSON, es. `SIGLA` o `DEN_PROV`), poi “Comune” (filtrato per provincia selezionata). Attributi tipici ISTAT: `COMUNE`, `PROV`, `COD_REG`, ecc.
  - Alla selezione: caricare il GeoJSON del confine (o il feature) e aggiungerlo come **layer vettoriale** (fill + outline) sulla mappa, con zoom/fit ai bounds del polygon.
4. **Dati**: gli attributi nei .dbf (nome comune, sigla provincia, codice ISTAT) vanno preservati nella conversione GeoJSON per popolare i menu e per il lookup nome+provincia nel tool di analisi copertura (Turf).

**Riepilogo modifiche**:

- Aggiungere al piano (o alla doc) la **conversione** dei shapefile GIS in GeoJSON WGS84 e la creazione di un indice/elenco province e comuni (per i dropdown).
- Implementare una **webapp** (React + Vite o CRA) con: (1) react-map-gl + MapLibre oppure deck.gl + MapLibre; (2) dropdown Provincia e Comune; (3) caricamento e visualizzazione del confine selezionato sulla mappa; (4) opzionale integrazione con il tool di analisi copertura (stesso progetto) per mostrare anche griglia e cerchi dopo la selezione del comune.

---

## 7. Ordine di implementazione

1. Sandbox: nota script + README (+ alert opzionale).
2. **GIS**: verificare presenza completa dei file shapefile (.shp, .shx, .dbf) in GIS/ISTAT; convertire in GeoJSON WGS84 (comuni, province, eventualmente regioni) e indicizzare per provincia/comune.
3. **Webapp mappa**: React + MapLibre (react-map-gl) o deck.gl; menu a tendina Provincia → Comune; caricamento confine e highlight sulla mappa.
4. Tool analisi copertura (Node/React): nome comune + provincia + raggio; Turf per griglia e intersezioni; output punti, % copertura, costo; export punti per .gs; opzionale integrazione nella stessa webapp (stesso progetto).
5. Stima costi multi-area in .gs (AREE) e uso lista punti per Cerca con griglia.

