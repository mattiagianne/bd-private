# Piano di implementazione: Mappa → Google Sheet (deploy Vercel)

Collegare la ricerca sulla mappa (griglia di cerchi) al salvataggio dei risultati nel Google Sheet, con webapp deployata su Vercel e flusso semplice per utenti con competenze base.

---

## Obiettivo

- **Non perdere i dati**: tutti i risultati delle chiamate API RMV (Compravendite) vengono salvati nel foglio **Compravendite** del Google Sheet.
- **Un solo click dalla mappa**: l’utente seleziona area (comune/provincia) e raggio nella webapp, clicca “Cerca e salva in Google Sheet” e attendere; i dati compaiono nel foglio.
- **Step 2 e 3 invariati**: Arricchisci Catasto e Ricerca Persona continuano a funzionare dal menu del foglio come oggi, sui dati salvati in Compravendite.

---

## Architettura

```
Utente → Webapp (Vercel) → API route Vercel (/api/salva-griglia)
                              → Apps Script Web App (doPost)
                                   → API RMV + scrittura foglio Compravendite
```

- **Webapp React (Vercel)**: genera la griglia, invia centri + raggio all’API Vercel.
- **API route Vercel**: riceve il payload, chiama la Web App di Apps Script con token in env (non esposto al browser).
- **Apps Script Web App**: valida token, esegue le chiamate RMV per ogni centro, scrive nel foglio Compravendite, restituisce riepilogo.

---

## 1. Apps Script: refactor griglia

**File:** `openapi_realestate_test.gs`

### 1.1 Funzione riutilizzabile

Estrarre la logica da `cercaCompravenditeGriglia()` in una funzione interna:

- **`eseguiGrigliaRMV_(ss, points, radiusM, paramsOverride)`**
  - **Input:**
    - `ss`: spreadsheet attivo
    - `points`: array di `{ lat, lng }`
    - `radiusM`: raggio in metri (50–20000)
    - `paramsOverride`: opzionale (tipo immobile, filtri importo/data)
  - **Logica:**
    - Legge `params` da `leggiConfig(ss)`, applica override e imposta `params.raggio = radiusM`
    - Per ogni punto: `bodyRicercaFromParams(params, lat, lng)` → `chiamaAPI` → accumula risultati
    - Deduplica per `keycode`
    - Costruisce le righe con lo stesso formato colonne usato oggi
    - Svuota dati del foglio Compravendite (mantiene header), scrive le righe
    - Calcola costo stimato con `getPrice(points.length)`
  - **Ritorno:** `{ numChiamate, numCompravendite, costoStimato, tier }`

### 1.2 Adattare `cercaCompravenditeGriglia()`

- Continua a usare `getBoundsFromConfig(ss)` e `calcGridPoints(bounds, raggio, 0.7)`
- Chiama `eseguiGrigliaRMV_(ss, points, raggio, null)` e mostra l’alert di conferma come oggi

---

## 2. Apps Script: Web App (doPost)

**File:** `openapi_realestate_test.gs`

### 2.1 Funzione `doPost(e)`

- Legge il body: `JSON.parse(e.postData.contents)`
- **Payload atteso:**
  ```json
  {
    "token": "...",
    "centers": [{ "latitude": 43.7, "longitude": 10.4 }, ...],
    "search_radius_m": 5000
  }
  ```
- **Validazione:**
  - Confronta `token` con `PropertiesService.getScriptProperties().getProperty('WEBAPP_TOKEN')`
  - `centers`: array non vuoto, lunghezza ragionevole (es. max 5000)
  - `search_radius_m` in [50, 20000]
- **Conversione:** `points = centers.map(c => ({ lat: c.latitude, lng: c.longitude }))`
- Chiama `eseguiGrigliaRMV_(SpreadsheetApp.getActiveSpreadsheet(), points, search_radius_m, null)`
- **Risposta:** `ContentService.createTextOutput(JSON.stringify({ success: true, numChiamate, numCompravendite, costoStimato, message: "Salvato in Compravendite" })).setMimeType(ContentService.MimeType.JSON)`
- In caso di errore: `{ success: false, message: "..." }`

### 2.2 Configurazione

- **Script Properties:** chiave `WEBAPP_TOKEN` con valore segreto condiviso con Vercel
- **Deploy Web App:**
  - Eseguzione come: utente proprietario del foglio
  - Chi può accedere: “Solo chi ha il link” (il token nel body protegge le chiamate)

---

## 3. Vercel: API route proxy

**Progetto:** webapp-gis (o progetto Vercel che ospita la mappa)

### 3.1 Endpoint `/api/salva-griglia`

- **Metodo:** POST
- **Body:** `{ centers: [{ longitude, latitude }, ...], search_radius_m: number }`
- **Env:** `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_TOKEN`
- **Logica:**
  - Costruisce payload per Apps Script: `{ token: GOOGLE_SCRIPT_TOKEN, centers, search_radius_m }`
  - `fetch(GOOGLE_SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })`
  - Restituisce al client il JSON di risposta (success, numChiamate, numCompravendite, costoStimato, message)
- **Gestione errori:** in caso di rete o risposta non valida, rispondere con `{ success: false, message: "..." }`

### 3.2 Variabili d’ambiente Vercel

- `GOOGLE_SCRIPT_URL`: URL completo della Web App Apps Script
- `GOOGLE_SCRIPT_TOKEN`: stesso valore di `WEBAPP_TOKEN` in Script Properties

---

## 4. Webapp React: pulsante “Cerca e salva in Google Sheet”

**File:** `webapp-gis/src/App.jsx`

### 4.1 Pulsante

- Posizione: pannello destro, visibile quando `gridCenters.length > 0` (dopo “Genera griglia cerchi” / “Copia centri”)
- Label: **“Cerca e salva in Google Sheet”**
- Stato: disabilitato durante la richiesta (es. `isSaving`)

### 4.2 Flusso al click

1. Payload: `centers = gridCenters.map(([lng, lat]) => ({ longitude: lng, latitude: lat }))`, `search_radius_m = Math.round(searchRadiusKm * 1000)`
2. `fetch('/api/salva-griglia', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ centers, search_radius_m }) })`
3. Se `success === true`: messaggio tipo “Ricerca completata: X chiamate, Y compravendite. Apri il Google Sheet per vedere i risultati.” + link al foglio
4. Se errore: messaggio chiaro (es. “Token non valido”, “Troppe chiamate”, “Errore di rete”)

### 4.3 UX

- Durante la richiesta: testo “Ricerca in corso… (per aree grandi può richiedere alcuni minuti)”
- Link fisso al Google Sheet (URL configurato, es. in env o costante) per “Apri Google Sheet”

---

## 5. Integrazione con step 2 e 3 (Catasto, Ricerca Persona)

- **Nessuna modifica** alla logica esistente:
  - **Arricchisci con Catasto**: usa la riga selezionata in Compravendite, scrive in Intestatari
  - **Ricerca Persona**: usa Config e foglio RicercaPersona
- **Flusso per l’utente:** prima compila Compravendite dalla webapp (un click), poi dal foglio usa il menu per “Arricchisci con Catasto” e “Ricerca Persona” come oggi

---

## 6. Guida utente (competenze base)

Testo da mettere in README o in una pagina “Help” della webapp:

1. Apri la mappa: [URL Vercel della webapp]
2. Seleziona **comune** o **provincia** e il **raggio** (km)
3. Clicca **“Genera griglia cerchi”** (se vuoi vedere la copertura sulla mappa)
4. Clicca **“Cerca e salva in Google Sheet”**
5. Attendi il messaggio di conferma, poi clicca **“Apri Google Sheet”**
6. Nel foglio **Compravendite** trovi tutte le compravendite trovate
7. Per arricchire con dati catastali: seleziona una riga e dal menu del foglio usa **“Arricchisci con Catasto”**
8. Per cercare una persona: dal menu usa **“Ricerca Persona”** (CF + provincia in Config)

---

## 7. Checklist produzione

- [ ] Script Properties: `WEBAPP_TOKEN` impostato in Apps Script
- [ ] Vercel: variabili `GOOGLE_SCRIPT_URL` e `GOOGLE_SCRIPT_TOKEN` impostate
- [ ] Web App deployata (Eseguzione come: Me, Chi può accedere: Solo chi ha il link)
- [ ] Webapp deployata su Vercel con API route `/api/salva-griglia`
- [ ] Link “Apri Google Sheet” nella webapp punta al foglio corretto
- [ ] Foglio Compravendite usato come unica destinazione per i risultati della griglia

---

## 8. Ordine di implementazione suggerito

1. Refactor in Apps Script: `eseguiGrigliaRMV_` e adattamento di `cercaCompravenditeGriglia`
2. Implementare `doPost`, impostare `WEBAPP_TOKEN`, deploy Web App, test con Postman/curl
3. Creare API route Vercel `/api/salva-griglia` e configurare env
4. Aggiungere in webapp pulsante, chiamata a `/api/salva-griglia`, messaggi e link al foglio
5. Documentare il flusso e la guida utente (README o Help)

---

## 9. Guida utente (competenze base)

1. Apri la mappa: [URL Vercel della webapp]
2. Seleziona **comune** o **provincia** e il **raggio** (km)
3. Clicca **"Genera griglia cerchi"** (opzionale: per vedere la copertura sulla mappa)
4. Seleziona il **tipo immobile** (Residenziali, Non residenziali o Pertinenziali) e clicca **"Cerca e salva in Google Sheet"**
5. Attendi il messaggio di conferma (per aree grandi può richiedere alcuni minuti), poi clicca **"Apri Google Sheet"** se presente
6. Nel foglio **Compravendite** trovi le nuove righe aggiunte (con colonne BatchId, DataRicerca, Area)
7. Per arricchire con dati catastali: seleziona una riga e dal menu del foglio usa **"Arricchisci con Catasto"**
8. Per cercare una persona: dal menu usa **"Ricerca Persona"** (CF + provincia in Config)

**Variabili d'ambiente:**

- **Apps Script** (Script Properties): `WEBAPP_TOKEN` — valore segreto condiviso con Vercel
- **Vercel**: `GOOGLE_SCRIPT_URL` (URL Web App), `GOOGLE_SCRIPT_TOKEN` (stesso valore di WEBAPP_TOKEN)
- **Webapp (build)**: `VITE_GOOGLE_SHEET_URL` — link al foglio per il pulsante "Apri Google Sheet"
