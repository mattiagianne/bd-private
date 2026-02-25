# Setup passo-passo: Google Sheet + Vercel + Git per testing sandbox

Guida per configurare l’ambiente di **test (sandbox)** e avviare i test. Quando tutto funziona, si potrà passare alla produzione cambiando solo token/endpoint e variabili d’ambiente.

---

## Prerequisiti

- Account **Google** (per Sheet e Apps Script)
- Account **Vercel** (vercel.com)
- Account **GitHub** (o GitLab/Bitbucket) per il repository
- **Token sandbox OpenAPI** già configurato nello script (in `openapi_realestate_test.gs`: `CONFIG.TOKEN` e `CONFIG.REALESTATE_URL` = `https://test.realestate.openapi.com/IT-rmv`)

---

## Parte A – Google Sheet e Apps Script

### A.1 Creare (o usare) il Google Sheet

1. Vai su [Google Drive](https://drive.google.com) e crea un **Nuovo** → **Google Foglio di lavoro** (Google Sheets).
2. Rinominalo (es. `BD Real Estate Sandbox`).
3. Tieni aperto questo foglio: sarà il “foglio di lavoro” legato allo script.

### A.2 Collegare lo script al foglio

1. Nel menu del foglio: **Estensioni** → **Apps Script**.
2. Si apre l’editor Apps Script con un progetto vuoto (file `Codice.gs`).
3. **Rinomina** il progetto (icona “Untitled project” in alto): es. `BD Real Estate Script`.
4. **Elimina** il contenuto predefinito di `Codice.gs` (se c’è solo una funzione vuota).
5. **Copia l’intero contenuto** del file `openapi_realestate_test.gs` dalla tua repo (cartella radice del progetto) e **incollalo** in `Codice.gs`, sostituendo tutto.
6. **Salva** (Ctrl+S).

### A.3 Creare i fogli e la Config

1. Torna al **tab del Google Sheet** (il foglio di lavoro).
2. Nel menu: **🏠 OpenAPI Real Estate** → **⚙ Crea fogli di lavoro**.
3. Verifica che siano stati creati i fogli: **Compravendite**, **Intestatari**, **RicercaPersona**, **Config**.
4. Apri il foglio **Config** e compila almeno:
   - **Latitudine** / **Longitudine** (es. per un test: 45.46, 9.19)
   - **Raggio** (es. 5000 metri)
   - **Tipo immobile**: `immobili_residenziali` (o altro se preferisci)
   - Se userai la griglia dal foglio: **Area griglia** (es. `milano_comune`) oppure Lat Nord/Sud, Lon Ovest/Est

(Le altre celle di Config sono opzionali per il primo test.)

### A.4 Impostare il token della Web App (WEBAPP_TOKEN)

1. In **Apps Script**, nel menu a sinistra clicca sull’icona **⏵ (Esegui)** oppure apri il menu a tre puntini → **Progetto**.
2. Vai in **Impostazioni progetto** (icona ingranaggio) oppure **Progetto** → **Impostazioni progetto**.
3. Nella sezione **Proprietà script** clicca **Aggiungi proprietà script**.
4. **Nome:** `WEBAPP_TOKEN`
5. **Valore:** scegli una stringa lunga e casuale (es. genera una UUID o una password di 20+ caratteri).  
   Esempio: `sandbox-webapp-abc123xyz789`  
   **Questo valore servirà anche su Vercel** (stesso identico token).
6. Salva.

### A.5 Pubblicare la Web App (Apps Script)

1. In Apps Script, in alto clicca **Distribuisci** → **Nuova distribuzione**.
2. Tipo: **Web app**.
3. **Descrizione:** es. `Sandbox – endpoint griglia`.
4. **Esegui come:** **Me** (il tuo account).
5. **Chi può accedere:** **Solo chi ha il link** (il token nel body protegge le chiamate; non serve aprire l’URL nel browser).
6. Clicca **Distribuisci**.
7. **Autorizza** l’app (se richiesto: “Autorizza l’accesso”, scegli il tuo account Google, “Avanzate” → “Vai a …” → “Consenti”).
8. **Copia e salva l’URL della Web App** (es. `https://script.google.com/macros/s/AKfy.../exec`).  
   Ti servirà per Vercel come `GOOGLE_SCRIPT_URL`.

### A.6 (Opzionale) Test rapido dello script dal foglio

- Dal menu del Sheet: **🏠 OpenAPI Real Estate** → **1. Cerca Compravendite**.  
- Se Config è compilata correttamente e il token sandbox è valido, dovresti vedere risultati nel foglio **Compravendite**.  
- Così verifichi che lo script e le API sandbox funzionano prima di collegare Vercel.

---

## Parte B – Repository Git

### B.1 Struttura consigliata

Il progetto può essere:

- **Opzione 1:** un repo che contiene solo la webapp (solo la cartella `webapp-gis` come root del repo).
- **Opzione 2:** un repo unico (es. `BD_Private`) con la cartella `webapp-gis` dentro: in Vercel imposterai la **Root Directory** su `webapp-gis`.

Qui si assume **Opzione 2** (repo con più cartelle, root = `webapp-gis` su Vercel).

### B.2 Assicurarsi che il codice sia su GitHub

1. Crea un repository su **GitHub** (es. `BD_Private`), se non esiste già.
2. In locale, dalla root del progetto:
   ```bash
   git add .
   git commit -m "Webapp GIS + API salva-griglia + vercel.json"
   git remote add origin https://github.com/TUO_USER/TUO_REPO.git
   git push -u origin main
   ```
   (Sostituisci `TUO_USER` e `TUO_REPO`; usa `master` se il branch principale si chiama così.)

3. Verifica su GitHub che ci siano almeno:
   - `webapp-gis/` (con `src/`, `api/`, `package.json`, `vercel.json`)

---

## Parte C – Progetto Vercel e deploy

### C.1 Creare il progetto su Vercel

1. Vai su [vercel.com](https://vercel.com) e fai login.
2. **Add New** → **Project**.
3. **Import Git Repository**: seleziona il tuo repo (es. `BD_Private`). Se non compare, **Configure** e collega GitHub (autorizza Vercel).
4. Clicca **Import** sul repository.

### C.2 Configurare la root e il framework

1. **Root Directory:** clicca **Edit** e imposta **`webapp-gis`** (così Vercel builda e deploya solo quella cartella).
2. **Framework Preset:** dovrebbe essere riconosciuto **Vite**. Se no, seleziona **Vite**.
3. **Build Command:** `npm run build` (default).
4. **Output Directory:** `dist` (default).
5. **Install Command:** `npm install` (default).  
   Non è necessario modificare altro per il primo deploy.

### C.3 Variabili d’ambiente (Environment Variables)

Prima di fare **Deploy**, aggiungi le variabili:

1. Nella pagina del progetto Vercel: **Settings** → **Environment Variables**.
2. Aggiungi (per **Production**, **Preview** e **Development** se vuoi testare anche in preview):

| Nome                   | Valore                                      | Note                          |
|------------------------|---------------------------------------------|-------------------------------|
| `GOOGLE_SCRIPT_URL`    | (URL della Web App copiato in A.5)          | Es. `https://script.google.com/macros/s/.../exec` |
| `GOOGLE_SCRIPT_TOKEN`  | (stesso valore di `WEBAPP_TOKEN` in A.4)   | Identico a Apps Script       |

3. Opzionale, per il link “Apri Google Sheet” nella webapp:

| Nome                   | Valore                                      |
|------------------------|---------------------------------------------|
| `VITE_GOOGLE_SHEET_URL`| URL del foglio (es. `https://docs.google.com/spreadsheets/d/ID_FOGLIO/edit`) |

Per ottenere l’URL del foglio: apri il Google Sheet nel browser e copia l’URL dalla barra degli indirizzi.

4. Clicca **Save** per ogni variabile.

### C.4 Primo deploy

1. Vai in **Deployments** (o nella dashboard del progetto).
2. Se il primo deploy è già partito senza le env, fai **Redeploy** (menu sui tre puntini dell’ultimo deployment) → **Redeploy** e assicurati che **Use existing Environment Variables** sia selezionato.
3. Attendi che il deploy sia **Ready**.
4. Apri l’**URL del progetto** (es. `https://xxx.vercel.app`): dovresti vedere la mappa GIS (province/comuni, selezione area, raggio, “Genera griglia cerchi”).

---

## Parte D – Collegare tutto e testare

### D.1 Verifica collegamenti

- **Apps Script** → Proprietà script: `WEBAPP_TOKEN` impostato.
- **Apps Script** → Web App distribuita: URL copiato.
- **Vercel** → Environment Variables: `GOOGLE_SCRIPT_URL` = URL Web App, `GOOGLE_SCRIPT_TOKEN` = stesso valore di `WEBAPP_TOKEN`.
- **Webapp:** se hai impostato `VITE_GOOGLE_SHEET_URL`, il pulsante “Apri Google Sheet” aprirà il foglio (le variabili `VITE_*` vanno impostate prima del build; dopo una modifica alle env, rifai un deploy).

### D.2 Test completo dal browser (sandbox)

1. Apri la **webapp su Vercel** (es. `https://xxx.vercel.app`).
2. Seleziona **Provincia** o **Comune** (es. Milano).
3. Imposta il **raggio** (es. 5 km).
4. Clicca **Genera griglia cerchi** (verifica che compaiano i cerchi sulla mappa).
5. Seleziona il **tipo immobile** (Residenziali / Non residenziali / Pertinenziali).
6. Clicca **Cerca e salva in Google Sheet**.
7. Attendi il messaggio (per aree grandi può richiedere alcuni minuti).
8. Controlla:
   - Messaggio di conferma con numero di chiamate e compravendite.
   - Apertura del **Google Sheet** (o apri il foglio a mano): nel foglio **Compravendite** devono comparire le nuove righe con colonne **BatchId**, **DataRicerca**, **Area**.
9. (Opzionale) Dal menu del foglio: **Arricchisci con Catasto** su una riga e **Ricerca Persona** per verificare che gli step 2 e 3 funzionino come prima.

### D.3 Se qualcosa non funziona

- **“Token non valido”**  
  Controlla che `GOOGLE_SCRIPT_TOKEN` su Vercel sia **identico** a `WEBAPP_TOKEN` in Apps Script (nessuno spazio, stesso maiuscole/minuscole).

- **“Configurazione mancante”**  
  Controlla che su Vercel ci siano sia `GOOGLE_SCRIPT_URL` sia `GOOGLE_SCRIPT_TOKEN` e rifai un **Redeploy** dopo averle salvate.

- **Nessun risultato in Compravendite**  
  In sandbox i dati possono essere pochi o fissi. Prova con un’area più grande o un raggio maggiore; verifica che in Config (e nel tipo immobile scelto in webapp) i filtri non escludano tutto.

- **404 su /api/salva-griglia**  
  Verifica che nella repo ci sia `webapp-gis/api/salva-griglia.js` e che la **Root Directory** su Vercel sia `webapp-gis`. Dopo una modifica, rifai deploy.

---

## Parte E – Passaggio alla produzione (dopo i test)

Quando i test in sandbox sono ok:

1. **OpenAPI:** passa al **token e all’endpoint di produzione** (sostituisci in `openapi_realestate_test.gs`:
   - `CONFIG.TOKEN`
   - `CONFIG.REALESTATE_URL` → URL produzione, es. `https://realestate.openapi.com/IT-rmv` o come da documentazione OpenAPI.)
2. **Apps Script:** puoi creare una **copia** del progetto script (o un nuovo deploy) dedicata alla produzione; imposta un **nuovo** `WEBAPP_TOKEN` per produzione e ridistribuisci la Web App.
3. **Vercel:** aggiungi (o modifica) le variabili d’ambiente per **Production** con il nuovo URL della Web App di produzione e il nuovo token. Opzionale: un secondo progetto Vercel “produzione” che punta allo stesso repo con env diverse.
4. **Foglio:** puoi usare una copia del Google Sheet per produzione (o lo stesso, se preferisci) e aggiornare `VITE_GOOGLE_SHEET_URL` con l’URL del foglio di produzione.

---

## Riepilogo checklist

- [ ] Google Sheet creato e script `openapi_realestate_test.gs` incollato in Apps Script
- [ ] Menu “Crea fogli di lavoro” eseguito (Compravendite, Intestatari, RicercaPersona, Config)
- [ ] Config compilata (almeno lat/lon, raggio, tipo immobile)
- [ ] Proprietà script `WEBAPP_TOKEN` impostata
- [ ] Web App pubblicata (Esegui come: Me, Solo chi ha il link), URL copiato
- [ ] Repo Git con `webapp-gis` pushato su GitHub
- [ ] Progetto Vercel creato, root = `webapp-gis`
- [ ] Env Vercel: `GOOGLE_SCRIPT_URL`, `GOOGLE_SCRIPT_TOKEN` (e opzionale `VITE_GOOGLE_SHEET_URL`)
- [ ] Deploy Vercel completato e test “Cerca e salva in Google Sheet” con dati nel foglio Compravendite
