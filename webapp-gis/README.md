# Webapp GIS — Confini amministrativi

Webapp con mappa **MapLibre** e layer **deck.gl** per selezionare **Provincia** e **Comune** e visualizzare il confine sulla mappa (bordi ben visibili).

## Setup

```bash
cd webapp-gis
npm install
```

## Sviluppo

```bash
npm run dev
```

Apri il link indicato (es. http://localhost:5173). I GeoJSON di esempio (Milano, Pisa) sono in `public/geojson/`.

## Perché vedo solo un quadrato?

I file `public/geojson/comuni.json` e `public/geojson/province.json` inclusi nel repo sono **solo di esempio**: contengono due rettangoli semplificati (uno per Milano, uno per Pisa). Per vedere i **confini reali** (polygon ISTAT) devi generare i GeoJSON dagli shapefile con:

```bash
npm run convert-gis
```

Dopo la conversione, ricarica la webapp: i menu mostreranno tutti i comuni e le province e sulla mappa vedrai i confini reali con i bordi evidenziati (deck.gl).

## Dettaglio degli shapefile (prima della conversione)

Le cartelle in `GIS/ISTAT/` usano la versione **generalizzata** (`_g`): i file sono semplificati per la cartografia, quindi i confini hanno meno vertici e possono apparire più “morbidi”. È il formato consigliato per web e mappe a scala media.

- **Più dettaglio**: se ti serve una geometria più fedele (es. coste o confini molto frastagliati), puoi usare gli shapefile **non generalizzati** ISTAT (es. `Limiti01012025` senza `_g`). Li trovi nella stessa [pagina ISTAT](https://www.istat.it/it/archivio/222527); dopo il download sostituisci le cartelle in `GIS/ISTAT/` e rilancia `npm run convert-gis`.
- **Conversione**: lo script legge `.shp` e `.dbf` e produce GeoJSON in WGS84; non modifica la geometria, quindi il livello di dettaglio dipende solo dagli shapefile di partenza.

## Dati ISTAT completi

Struttura attesa in `GIS/ISTAT/`:

- **00_Generale** — shapefile generalizzati (suffisso `_g`): meno vertici, adatti a mappe a scala media.
- **01_Dettagliata** — shapefile non generalizzati: geometria più dettagliata per confini e coste.

Sotto ogni cartella devono esserci le sottocartelle dei comuni e delle province (es. `Com01012025_g` e `ProvCM01012025_g` in 00_Generale, `Com01012025` e `ProvCM01012025` in 01_Dettagliata, con file `.shp` e `.dbf` WGS84).

Se hai gli shapefile in queste cartelle, genera i GeoJSON con:

```bash
# da dentro webapp-gis (non serve un secondo cd se sei già qui)
npm run convert-gis
```

Questo scrive in `public/geojson/`:

- `comuni_generale.json`, `province_generale.json` (da 00_Generale)
- `comuni_dettagliata.json`, `province_dettagliata.json` (da 01_Dettagliata)

Nella webapp il menu **Dettaglio confini** permette di scegliere tra "00_Generale", "01_Dettagliata" o "Esempio" (i due rettangoli Milano/Pisa). Ricarica la pagina dopo la conversione.

## Build

```bash
npm run build
```

Output in `dist/`. Per pubblicare su un server statico, copia il contenuto di `dist/` e assicurati che `dist/geojson/*.json` sia servito (o che i GeoJSON siano nella stessa origin).

## Collegamento a Google Sheet

In un secondo momento la webapp potrà essere collegata alla ricerca e all’archiviazione sul Google Sheet (script OpenAPI Real Estate): selezione comune/provincia qui, export punti griglia o parametri per lo script.
