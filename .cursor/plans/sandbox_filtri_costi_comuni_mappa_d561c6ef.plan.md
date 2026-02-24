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

**Dati**: ISTAT mette a disposizione confini comuni in shapefile WGS84 (https://www.istat.it/it/archivio/222527); convertire in GeoJSON e fare lookup per nome + provincia. Progetti come teamdigitale/confini-amministrativi-istat o ondata/istat_boundaries_downloader facilitano download/conversione.

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

## 6. Ordine di implementazione

1. Sandbox: nota script + README (+ alert opzionale).
2. Dati confini: GeoJSON comuni ISTAT e lookup nome+provincia.
3. Tool analisi copertura (Node/React): nome comune + provincia + raggio; Turf per griglia nel polygon e intersezioni cerchio–polygon; output punti, % copertura, costo; export punti per .gs.
4. Stima costi multi-area in .gs (AREE) e uso lista punti per Cerca con griglia.
5. Mappa Leaflet (confine + punti + legenda) nel tool o standalone.
