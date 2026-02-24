// ============================================================
// OpenAPI.it — Real Estate & Catasto Test Script
// Google Apps Script — Sandbox Environment
// ============================================================
// CONFIGURAZIONE
// ============================================================

const CONFIG = {
  // Token sandbox (aggiorna se necessario)
  TOKEN: "6995c6bf0de709af1e038207",
  
  // Endpoint Sandbox
  REALESTATE_URL: "https://test.realestate.openapi.com/IT-rmv",
  // Dominio confermato dalla documentazione ufficiale OpenAPI.it
  CATASTO_URL: "https://test.catasto.openapi.it",
  
  // Nomi dei fogli
  SHEET_COMPRAVENDITE: "Compravendite",
  SHEET_INTESTATARI: "Intestatari",
  SHEET_PERSONA: "RicercaPersona",
  SHEET_CONFIG: "Config",
  
  // Parametri di default per la ricerca
  DEFAULT_PROPERTY_TYPE: "immobili_residenziali",
  DEFAULT_RADIUS: 20000,       // 20 km (max consentito)
  DEFAULT_MIN_AMOUNT: 3000000, // €3M filtro high-value
  DEFAULT_START_YEAR: 2023,
  
  // Polling catasto
  POLL_INTERVAL_MS: 3000,  // 3 secondi tra un check e l'altro
  POLL_MAX_ATTEMPTS: 20    // max 60 secondi di attesa
};

// ============================================================
// MENU PERSONALIZZATO
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu("🏠 OpenAPI Real Estate")
    .addItem("1. Cerca Compravendite", "cercaCompravendite")
    .addItem("2. Arricchisci con Catasto (riga selezionata)", "arricchisciCatasto")
    .addItem("3. Ricerca Persona (CF + Provincia)", "ricercaPersona")
    .addSeparator()
    .addItem("▶ Flusso Completo (1 + 2)", "flussoCompleto")
    .addSeparator()
    .addItem("⚙ Crea fogli di lavoro", "setupFogli")
    .addItem("🔌 Test Real Estate", "testConnessione")
    .addItem("🔌 Test Catasto", "testCatasto")
    .addToUi();
}

// ============================================================
// SETUP — Crea i fogli con le intestazioni
// ============================================================

function setupFogli() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // --- Foglio Compravendite ---
  let sh = getOrCreateSheet(ss, CONFIG.SHEET_COMPRAVENDITE);
  sh.clear();
  const headerCompravendite = [
    "Riga", "Prezzo €", "Data Vendita", "Anno", "Mese",
    "Indirizzo", "Comune", "Provincia", "Regione", "Zona OMI",
    "Tipo Immobile", "Dettaglio Tipo", "Categoria Cat.", "Settore Mercato",
    "Superficie mq", "Superficie Totale mq", "Sup. Stimata mq",
    "Latitudine", "Longitudine", "Distanza (m)",
    "Codice Belfiore", "Codice Ufficio", "Keycode",
    "Garanzia Ipotecaria", "ID Proprietà", "Tot. Proprietà"
  ];
  sh.getRange(1, 1, 1, headerCompravendite.length).setValues([headerCompravendite]);
  sh.getRange(1, 1, 1, headerCompravendite.length)
    .setBackground("#1a73e8").setFontColor("white").setFontWeight("bold");
  sh.setFrozenRows(1);
  
  // --- Foglio Intestatari ---
  sh = getOrCreateSheet(ss, CONFIG.SHEET_INTESTATARI);
  sh.clear();
  const headerIntestatari = [
    "Rif. Compravendita", "Foglio", "Particella", "Subalterno",
    "Provincia", "Comune", "Categoria", "Classe", "Consistenza", "Rendita",
    "Intestatario", "Codice Fiscale", "Tipo Proprietà", "Quota",
    "ID Richiesta Catasto", "Stato"
  ];
  sh.getRange(1, 1, 1, headerIntestatari.length).setValues([headerIntestatari]);
  sh.getRange(1, 1, 1, headerIntestatari.length)
    .setBackground("#0d652d").setFontColor("white").setFontWeight("bold");
  sh.setFrozenRows(1);
  
  // --- Foglio Ricerca Persona ---
  sh = getOrCreateSheet(ss, CONFIG.SHEET_PERSONA);
  sh.clear();
  const headerPersona = [
    "Cognome", "Nome", "Data Nascita", "Luogo Nascita", "CF",
    "Catasto", "Titolarità", "Ubicazione", "Comune", "Provincia",
    "Foglio", "Particella", "Subalterno",
    "Categoria", "Classe", "Consistenza", "Rendita"
  ];
  sh.getRange(1, 1, 1, headerPersona.length).setValues([headerPersona]);
  sh.getRange(1, 1, 1, headerPersona.length)
    .setBackground("#e8710a").setFontColor("white").setFontWeight("bold");
  sh.setFrozenRows(1);
  
  // --- Foglio Config ---
  sh = getOrCreateSheet(ss, CONFIG.SHEET_CONFIG);
  sh.clear();
  sh.getRange("A1").setValue("Parametro").setFontWeight("bold");
  sh.getRange("B1").setValue("Valore").setFontWeight("bold");
  
  const configData = [
    ["Latitudine", 45.4642],
    ["Longitudine", 9.19],
    ["Raggio (m)", CONFIG.DEFAULT_RADIUS],
    ["Tipo Immobile", CONFIG.DEFAULT_PROPERTY_TYPE],
    ["Importo Minimo €", CONFIG.DEFAULT_MIN_AMOUNT],
    ["Importo Massimo €", ""],
    ["Anno Inizio", CONFIG.DEFAULT_START_YEAR],
    ["Mese Inizio", ""],
    ["Anno Fine", ""],
    ["Mese Fine", ""],
    ["--- Ricerca Persona ---", ""],
    ["CF / P.IVA", ""],
    ["Provincia", "MI"],
    ["Tipo Catasto", "F"]
  ];
  sh.getRange(2, 1, configData.length, 2).setValues(configData);
  // Forza formato testo sulle coordinate per evitare problemi di locale
  sh.getRange("B2").setNumberFormat("0.0000");
  sh.getRange("B3").setNumberFormat("0.0000");
  sh.setColumnWidth(1, 200);
  sh.setColumnWidth(2, 250);
  
  SpreadsheetApp.getUi().alert(
    "✅ Setup completato!\n\n" +
    "Fogli creati: Compravendite, Intestatari, RicercaPersona, Config\n\n" +
    "Modifica i parametri nel foglio 'Config' e poi usa il menu per lanciare le ricerche."
  );
}

// ============================================================
// 1. CERCA COMPRAVENDITE (POST /IT-rmv)
// ============================================================

function cercaCompravendite() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  
  // Leggi parametri dal foglio Config
  const params = leggiConfig(ss);
  
  // Costruisci il body della richiesta
  const body = {
    property_type: params.tipoImmobile || CONFIG.DEFAULT_PROPERTY_TYPE
  };
  
  // Usa coordinate se presenti, altrimenti chiedi indirizzo
  if (params.latitudine && params.longitudine) {
    body.latitude = normalizzaCoordinata(params.latitudine);
    body.longitude = normalizzaCoordinata(params.longitudine);
  } else {
    ui.alert("⚠️ Inserisci Latitudine e Longitudine nel foglio Config.");
    return;
  }
  
  Logger.log("Coordinate normalizzate - lat: " + body.latitude + ", lon: " + body.longitude);
  
  // Parametri opzionali
  if (params.raggio) body.search_radius = parseInt(params.raggio);
  if (params.importoMinimo) body.min_amount = parseInt(params.importoMinimo);
  if (params.importoMassimo) body.max_amount = parseInt(params.importoMassimo);
  if (params.annoInizio) body.start_year = parseInt(params.annoInizio);
  if (params.meseInizio) body.start_month = parseInt(params.meseInizio);
  if (params.annoFine) body.end_year = parseInt(params.annoFine);
  if (params.meseFine) body.end_month = parseInt(params.meseFine);
  
  Logger.log("Request body: " + JSON.stringify(body, null, 2));
  
  // Chiamata API
  const response = chiamaAPI("POST", CONFIG.REALESTATE_URL, body);
  
  if (!response) return;
  
  if (!response.success) {
    ui.alert("❌ Errore API: " + (response.message || "Errore sconosciuto"));
    return;
  }
  
  // Parsa i risultati — struttura: data[].data[].units[]
  const compravendite = parsaCompravendite(response);
  
  if (compravendite.length === 0) {
    ui.alert("ℹ️ Nessuna compravendita trovata con i parametri specificati.\n\n" +
             "(In sandbox i dati sono predefiniti e potrebbero non corrispondere ai filtri)");
    return;
  }
  
  // Scrivi nel foglio
  const sh = getOrCreateSheet(ss, CONFIG.SHEET_COMPRAVENDITE);
  const startRow = 2;
  
  // Pulisci dati precedenti (mantieni header)
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, sh.getLastColumn()).clear();
  }
  
  const rows = compravendite.map((c, i) => [
    i + 1,
    c.price || "",
    c.property_sale_date || "",
    c.property_sale_year || "",
    c.property_sale_month || "",
    c.address || "",
    c.town || "",
    c.province || "",
    c.region || "",
    c.omi_zone || "",
    c.property_type || "",
    c.property_type_detail || "",
    c.category_cat || "",
    c.market_sector || "",
    c.property_sqm || "",
    c.property_sqm_total || "",
    c.estimate_property_sqm || "",
    c.latitude || "",
    c.longitude || "",
    c.distance || "",
    c.belfior_code || "",
    c.office_code || "",
    c.keycode || "",
    c.mortgage_guarantee || "",
    c.id_property || "",
    c.total_property || ""
  ]);
  
  sh.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  
  // Formatta colonna prezzo
  sh.getRange(startRow, 2, rows.length, 1).setNumberFormat("€#,##0");
  
  ui.alert("✅ Trovate " + compravendite.length + " compravendite!\n\n" +
           "Risultati scritti nel foglio '" + CONFIG.SHEET_COMPRAVENDITE + "'.");
  
  return compravendite;
}

// ============================================================
// 2. ARRICCHISCI CON CATASTO (Prospetto Catastale)
// ============================================================

function arricchisciCatasto(rigaTarget) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const shComp = ss.getSheetByName(CONFIG.SHEET_COMPRAVENDITE);
  
  if (!shComp) {
    ui.alert("⚠️ Foglio 'Compravendite' non trovato. Esegui prima il setup.");
    return;
  }
  
  // Determina la riga da arricchire
  let riga = rigaTarget;
  if (!riga) {
    const activeRange = ss.getActiveRange();
    if (activeRange && activeRange.getSheet().getName() === CONFIG.SHEET_COMPRAVENDITE) {
      riga = activeRange.getRow();
    } else {
      riga = 2; // prima riga di dati
    }
  }
  
  if (riga < 2) {
    ui.alert("⚠️ Seleziona una riga di dati (non l'intestazione).");
    return;
  }
  
  // Leggi i dati della compravendita dalla riga
  const rowData = shComp.getRange(riga, 1, 1, shComp.getLastColumn()).getValues()[0];
  
  const prezzo = rowData[1];   // Colonna B - Prezzo
  const comune = rowData[6];   // Colonna G - Comune
  const provincia = rowData[7]; // Colonna H - Provincia
  const keycode = rowData[22]; // Colonna W - Keycode
  
  if (!comune && !keycode) {
    ui.alert("⚠️ Riga " + riga + " non contiene dati sufficienti.\n" +
             "Servono almeno: Comune e dati catastali.");
    return;
  }
  
  // Il keycode di OpenAPI contiene spesso info catastali
  // Proviamo a estrarre foglio/particella dal keycode o chiediamo input
  let foglio, particella, subalterno, provCode, comuneUpper;
  
  // Prova a parsare il keycode (formato variabile)
  if (keycode) {
    const parsed = parsaKeycode(keycode);
    foglio = parsed.foglio;
    particella = parsed.particella;
    subalterno = parsed.subalterno;
  }
  
  // Se non riusciamo a estrarre dal keycode, chiedi all'utente
  if (!foglio || !particella) {
    // Mostra all'utente i dati disponibili per aiutarlo
    const address = rowData[5] || "N/D";  // Colonna F - Indirizzo
    const town = rowData[6] || "N/D";     // Colonna G - Comune
    const prov = rowData[7] || "N/D";     // Colonna H - Provincia
    const price = rowData[1] || "N/D";    // Colonna B - Prezzo
    
    const input = ui.prompt(
      "📋 Dati Catastali Necessari",
      "L'API compravendite non fornisce direttamente i dati catastali.\n\n" +
      "Immobile selezionato (riga " + riga + "):\n" +
      "  📍 " + address + "\n" +
      "  🏘️ " + town + " (" + prov + ")\n" +
      "  💰 " + price + "\n\n" +
      "Inserisci: Foglio, Particella, Subalterno (separati da virgola)\n" +
      "Esempio: 123, 456, 7\n\n" +
      "💡 Per sandbox, prova valori fittizi es: 1, 100, 1",
      ui.ButtonSet.OK_CANCEL
    );
    
    if (input.getSelectedButton() !== ui.Button.OK) return;
    
    const parts = input.getResponseText().split(",").map(s => s.trim());
    foglio = parts[0] || "";
    particella = parts[1] || "";
    subalterno = parts[2] || "";
  }
  
  // Validazione: foglio e particella devono essere presenti
  if (!foglio || !particella) {
    ui.alert("⚠️ Foglio e Particella sono obbligatori.\n\nHai inserito:\n" +
             "Foglio: '" + foglio + "'\nParticella: '" + particella + "'");
    return;
  }
  
  // Determina provincia (2 lettere) e comune (uppercase)
  provCode = derivaCodiceProvincia(provincia || "");
  comuneUpper = (comune || "").toUpperCase().trim();
  
  if (!provCode) {
    const input = ui.prompt(
      "Provincia",
      "Inserisci il codice provincia (2 lettere, es: MI):",
      ui.ButtonSet.OK_CANCEL
    );
    if (input.getSelectedButton() !== ui.Button.OK) return;
    provCode = input.getResponseText().trim().toUpperCase();
  }
  
  if (!comuneUpper) {
    const input = ui.prompt(
      "Comune",
      "Inserisci il nome del comune (es: MILANO):",
      ui.ButtonSet.OK_CANCEL
    );
    if (input.getSelectedButton() !== ui.Button.OK) return;
    comuneUpper = input.getResponseText().trim().toUpperCase();
  }
  
  Logger.log("Catasto request - Prov: " + provCode + ", Comune: " + comuneUpper + 
             ", Foglio: " + foglio + ", Part: " + particella + ", Sub: " + subalterno);
  
  // Valida che foglio e particella siano numeri interi
  const foglioInt = parseInt(String(foglio).replace(/\D/g, ""));
  const particellaInt = parseInt(String(particella).replace(/\D/g, ""));
  
  if (isNaN(foglioInt) || isNaN(particellaInt)) {
    ui.alert("⚠️ Foglio e Particella devono essere numeri interi.\n\n" +
             "Foglio: '" + foglio + "' → " + foglioInt + "\n" +
             "Particella: '" + particella + "' → " + particellaInt);
    return;
  }
  
  // STEP 1: POST richiesta prospetto_catastale
  const bodyRichiesta = {
    tipo_catasto: "F",  // Fabbricati
    provincia: provCode,
    comune: comuneUpper,
    foglio: foglioInt,
    particella: particellaInt
  };
  
  // Subalterno opzionale
  const subalternoInt = parseInt(String(subalterno || "").replace(/\D/g, ""));
  if (!isNaN(subalternoInt) && subalterno) {
    bodyRichiesta.subalterno = subalternoInt;
  }
  
  Logger.log("Catasto body: " + JSON.stringify(bodyRichiesta));
  
  const urlRichiesta = CONFIG.CATASTO_URL + "/richiesta/prospetto_catastale";
  const responseRichiesta = chiamaAPI("POST", urlRichiesta, bodyRichiesta);
  
  if (!responseRichiesta || !responseRichiesta.success) {
    const errMsg = responseRichiesta ? 
      (responseRichiesta.message || JSON.stringify(responseRichiesta)) : "Nessuna risposta";
    ui.alert("❌ Errore Catasto\n\n" +
             "URL: " + urlRichiesta + "\n" +
             "Body: " + JSON.stringify(bodyRichiesta) + "\n\n" +
             "Errore: " + errMsg + "\n\n" +
             "💡 Se l'errore è di connessione, verifica il dominio sandbox catasto\n" +
             "nella costante CONFIG.CATASTO_URL dello script.");
    return;
  }
  
  const idRichiesta = responseRichiesta.data?.data?.id || responseRichiesta.data?.id;
  
  if (!idRichiesta) {
    ui.alert("❌ ID richiesta non trovato nella risposta:\n" + 
             JSON.stringify(responseRichiesta, null, 2));
    return;
  }
  
  Logger.log("ID Richiesta Catasto: " + idRichiesta);
  
  // STEP 2: Polling GET /richiesta/{id} fino a stato = "evasa"
  const risultato = pollRichiestaCatasto(idRichiesta);
  
  if (!risultato) {
    ui.alert("⏱️ Timeout: la richiesta catasto non è stata evasa in tempo.\n" +
             "ID: " + idRichiesta + "\n\n" +
             "Puoi riprovare più tardi con lo stesso ID.");
    return;
  }
  
  // STEP 3: Scrivi intestatari nel foglio
  const shInt = getOrCreateSheet(ss, CONFIG.SHEET_INTESTATARI);
  const intestatari = parsaIntestatari(risultato, riga, foglio, particella, subalterno, 
                                        provCode, comuneUpper, idRichiesta);
  
  if (intestatari.length === 0) {
    ui.alert("ℹ️ Nessun intestatario trovato per questo immobile.\n\n" +
             "(In sandbox i dati sono predefiniti)");
    return;
  }
  
  // Trova la prima riga vuota nel foglio Intestatari
  const startRow = Math.max(2, shInt.getLastRow() + 1);
  shInt.getRange(startRow, 1, intestatari.length, intestatari[0].length)
    .setValues(intestatari);
  
  ui.alert("✅ Trovati " + intestatari.length + " intestatari!\n\n" +
           "Risultati aggiunti al foglio '" + CONFIG.SHEET_INTESTATARI + "'.");
  
  return risultato;
}

// ============================================================
// 3. RICERCA PERSONA (CF + Provincia)
// ============================================================

function ricercaPersona() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const ui = SpreadsheetApp.getUi();
  const params = leggiConfig(ss);
  
  let cfPiva = params.cfPiva;
  let provincia = params.provinciaPersona;
  let tipoCatasto = params.tipoCatasto || "F";
  
  if (!cfPiva) {
    const input = ui.prompt(
      "Ricerca Persona",
      "Inserisci il Codice Fiscale o P.IVA:",
      ui.ButtonSet.OK_CANCEL
    );
    if (input.getSelectedButton() !== ui.Button.OK) return;
    cfPiva = input.getResponseText().trim().toUpperCase();
  }
  
  if (!provincia) {
    const input = ui.prompt(
      "Provincia",
      "Inserisci il codice provincia (2 lettere, es: MI):",
      ui.ButtonSet.OK_CANCEL
    );
    if (input.getSelectedButton() !== ui.Button.OK) return;
    provincia = input.getResponseText().trim().toUpperCase();
  }
  
  // POST /richiesta/ricerca_persona
  const body = {
    cf_piva: cfPiva,
    tipo_catasto: tipoCatasto,
    provincia: provincia
  };
  
  const urlRichiesta = CONFIG.CATASTO_URL + "/richiesta/ricerca_persona";
  const response = chiamaAPI("POST", urlRichiesta, body);
  
  if (!response || !response.success) {
    ui.alert("❌ Errore nella ricerca persona:\n" + 
             JSON.stringify(response, null, 2));
    return;
  }
  
  const idRichiesta = response.data?.data?.id || response.data?.id;
  
  if (!idRichiesta) {
    ui.alert("❌ ID richiesta non trovato.");
    return;
  }
  
  // Polling
  const risultato = pollRichiestaCatasto(idRichiesta);
  
  if (!risultato) {
    ui.alert("⏱️ Timeout nella ricerca persona. ID: " + idRichiesta);
    return;
  }
  
  // Parsa e scrivi risultati
  const shPersona = getOrCreateSheet(ss, CONFIG.SHEET_PERSONA);
  const righe = parsaRicercaPersona(risultato);
  
  if (righe.length === 0) {
    ui.alert("ℹ️ Nessun immobile trovato per CF: " + cfPiva + " in provincia " + provincia);
    return;
  }
  
  // Pulisci e riscrivi
  if (shPersona.getLastRow() > 1) {
    shPersona.getRange(2, 1, shPersona.getLastRow() - 1, shPersona.getLastColumn()).clear();
  }
  
  shPersona.getRange(2, 1, righe.length, righe[0].length).setValues(righe);
  
  ui.alert("✅ Trovati " + righe.length + " immobili intestati a " + cfPiva + "!\n\n" +
           "Risultati nel foglio '" + CONFIG.SHEET_PERSONA + "'.");
}

// ============================================================
// ▶ FLUSSO COMPLETO (1 + 2 in sequenza)
// ============================================================

function flussoCompleto() {
  const ui = SpreadsheetApp.getUi();
  
  ui.alert("▶ Flusso Completo\n\n" +
           "Step 1: Cerca compravendite\n" +
           "Step 2: Per ogni risultato, arricchisci con dati catastali\n\n" +
           "⚠️ In sandbox i dati catastali sono fittizi.\n" +
           "Il flusso arricchirà solo la PRIMA compravendita trovata.");
  
  // Step 1: Cerca compravendite
  const compravendite = cercaCompravendite();
  
  if (!compravendite || compravendite.length === 0) {
    ui.alert("⚠️ Nessuna compravendita trovata. Flusso interrotto.");
    return;
  }
  
  // Step 2: Arricchisci la prima riga
  // Piccola pausa per non sovraccaricare
  Utilities.sleep(1000);
  
  const risultato = arricchisciCatasto(2); // riga 2 = prima compravendita
  
  if (risultato) {
    ui.alert("🎉 Flusso completo terminato!\n\n" +
             "• Compravendite trovate: " + compravendite.length + "\n" +
             "• Dati catastali arricchiti per la prima riga\n\n" +
             "Controlla i fogli 'Compravendite' e 'Intestatari'.");
  }
}

// ============================================================
// FUNZIONI HELPER — API
// ============================================================

/**
 * Chiamata generica all'API OpenAPI.it
 */
function chiamaAPI(method, url, body) {
  const options = {
    method: method.toLowerCase(),
    headers: {
      "Authorization": "Bearer " + CONFIG.TOKEN,
      "Content-Type": "application/json"
    },
    muteHttpExceptions: true
  };
  
  if (body && method.toUpperCase() !== "GET") {
    options.payload = JSON.stringify(body);
  }
  
  try {
    Logger.log("📡 " + method + " " + url);
    if (body) Logger.log("Body: " + JSON.stringify(body));
    
    const response = UrlFetchApp.fetch(url, options);
    const code = response.getResponseCode();
    const text = response.getContentText();
    
    Logger.log("Response " + code + ": " + text.substring(0, 500));
    
    if (code === 402) {
      SpreadsheetApp.getUi().alert("💳 Errore 402: Credito insufficiente o scope mancante.");
      return null;
    }
    
    if (code === 428) {
      SpreadsheetApp.getUi().alert("🔑 Errore 428: Token mancante o scope non abilitato.");
      return null;
    }
    
    return JSON.parse(text);
    
  } catch (e) {
    Logger.log("❌ Errore chiamata API: " + e.message);
    SpreadsheetApp.getUi().alert("❌ Errore di connessione:\n" + e.message);
    return null;
  }
}

/**
 * Polling della richiesta catasto fino a stato "evasa"
 */
function pollRichiestaCatasto(idRichiesta) {
  const url = CONFIG.CATASTO_URL + "/richiesta/" + idRichiesta;
  
  for (let i = 0; i < CONFIG.POLL_MAX_ATTEMPTS; i++) {
    Utilities.sleep(CONFIG.POLL_INTERVAL_MS);
    
    const response = chiamaAPI("GET", url, null);
    
    if (!response) continue;
    
    const stato = response.data?.data?.stato || response.data?.stato || "";
    Logger.log("Poll #" + (i + 1) + " - Stato: " + stato);
    
    if (stato === "evasa") {
      return response;
    }
    
    if (stato === "errore" || stato === "error") {
      Logger.log("Richiesta in errore: " + JSON.stringify(response));
      return null;
    }
  }
  
  Logger.log("Timeout polling dopo " + CONFIG.POLL_MAX_ATTEMPTS + " tentativi");
  return null;
}

// ============================================================
// FUNZIONI HELPER — PARSING
// ============================================================

/**
 * Parsa la risposta IT-rmv in un array piatto di compravendite
 * Struttura risposta: { data: [{ data: [{ units: [...], keycode, price, ... }] }] }
 */
function parsaCompravendite(response) {
  const risultati = [];
  
  if (!response.data) return risultati;
  
  // La risposta può avere vari livelli di nesting
  const dataArray = Array.isArray(response.data) ? response.data : [response.data];
  
  for (const gruppo of dataArray) {
    const innerData = gruppo.data || gruppo;
    const items = Array.isArray(innerData) ? innerData : [innerData];
    
    for (const item of items) {
      // Se ci sono units, espandi
      if (item.units && Array.isArray(item.units)) {
        for (const unit of item.units) {
          risultati.push({
            price: unit.price || item.price || "",
            property_sale_date: unit.property_sale_date || item.property_sale_date || "",
            property_sale_year: unit.property_sale_year || item.property_sale_year || "",
            property_sale_month: unit.property_sale_month || item.property_sale_month || "",
            address: unit.address || item.address || "",
            town: unit.town || "",
            province: unit.province || "",
            region: unit.region || "",
            omi_zone: unit.omi_zone || "",
            property_type: unit.property_type || item.property_type || "",
            property_type_detail: unit.property_type_detail || "",
            category_cat: unit.category_cat || "",
            market_sector: unit.market_sector || "",
            property_sqm: unit.property_sqm || item.property_sqm || "",
            property_sqm_total: unit.property_sqm_total || "",
            estimate_property_sqm: unit.estimate_property_sqm || "",
            latitude: unit.latitude || item.latitude || "",
            longitude: unit.longitude || item.longitude || "",
            distance: item.distance_form || "",
            belfior_code: unit.belfior_code || "",
            office_code: unit.office_code || "",
            keycode: unit.keycode || item.keycode || "",
            mortgage_guarantee: unit.mortgage_guarantee || "",
            id_property: unit.id_property || "",
            total_property: unit.total_property || ""
          });
        }
      } else {
        // Nessun units, usa il livello corrente
        risultati.push({
          price: item.price || "",
          property_sale_date: item.property_sale_date || "",
          property_sale_year: item.property_sale_year || "",
          property_sale_month: item.property_sale_month || "",
          address: item.address || "",
          town: item.town || "",
          province: item.province || "",
          region: item.region || "",
          omi_zone: item.omi_zone || "",
          property_type: item.property_type || "",
          property_type_detail: item.property_type_detail || "",
          category_cat: item.category_cat || "",
          market_sector: item.market_sector || "",
          property_sqm: item.property_sqm || "",
          property_sqm_total: item.property_sqm_total || "",
          estimate_property_sqm: item.estimate_property_sqm || "",
          latitude: item.latitude || "",
          longitude: item.longitude || "",
          distance: item.distance_form || "",
          belfior_code: item.belfior_code || "",
          office_code: item.office_code || "",
          keycode: item.keycode || "",
          mortgage_guarantee: item.mortgage_guarantee || "",
          id_property: item.id_property || "",
          total_property: item.total_property || ""
        });
      }
    }
  }
  
  return risultati;
}

/**
 * Parsa intestatari dal prospetto catastale
 */
function parsaIntestatari(response, rigaRef, foglio, particella, subalterno, 
                           provincia, comune, idRichiesta) {
  const righe = [];
  
  const risultato = response.data?.data?.risultato || response.data?.risultato || {};
  const immobili = risultato.immobili || [];
  
  for (const immobile of immobili) {
    const intestatari = immobile.intestatari || [];
    
    if (intestatari.length === 0) {
      // Riga senza intestatari ma con dati immobile
      righe.push([
        rigaRef,
        immobile.foglio || foglio,
        immobile.particella || particella,
        immobile.subalterno || subalterno || "",
        provincia,
        comune,
        immobile.categoria || "",
        immobile.classe || "",
        immobile.consistenza || "",
        immobile.rendita || "",
        "(nessun intestatario)",
        "",
        "",
        "",
        idRichiesta,
        "evasa"
      ]);
    } else {
      for (const int of intestatari) {
        righe.push([
          rigaRef,
          immobile.foglio || foglio,
          immobile.particella || particella,
          immobile.subalterno || subalterno || "",
          provincia,
          comune,
          immobile.categoria || "",
          immobile.classe || "",
          immobile.consistenza || "",
          immobile.rendita || "",
          int.denominazione || "",
          int.cf || "",
          int.proprieta || "",
          int.quota || "",
          idRichiesta,
          "evasa"
        ]);
      }
    }
  }
  
  return righe;
}

/**
 * Parsa risultati ricerca persona
 */
function parsaRicercaPersona(response) {
  const righe = [];
  
  const risultato = response.data?.data?.risultato || response.data?.risultato || {};
  const soggetti = risultato.soggetti || [];
  
  for (const soggetto of soggetti) {
    const immobili = soggetto.immobili || [];
    
    for (const imm of immobili) {
      righe.push([
        soggetto.cognome || soggetto.denominazione || "",
        soggetto.nome || "",
        soggetto.data_nascita || "",
        soggetto.luogo_nascita || soggetto.sede || "",
        soggetto.cf || "",
        imm.catasto || "",
        imm.titolarita || "",
        imm.ubicazione || "",
        imm.comune || "",
        imm.provincia || "",
        imm.foglio || "",
        imm.particella || "",
        imm.subalterno || "",
        imm.classamento || imm.categoria || "",
        imm.classe || "",
        imm.consistenza || "",
        imm.rendita || ""
      ]);
    }
    
    // Se il soggetto non ha immobili, scrivi comunque i dati anagrafici
    if (immobili.length === 0) {
      righe.push([
        soggetto.cognome || soggetto.denominazione || "",
        soggetto.nome || "",
        soggetto.data_nascita || "",
        soggetto.luogo_nascita || soggetto.sede || "",
        soggetto.cf || "",
        "(nessun immobile)", "", "", "", "", "", "", "", "", "", "", ""
      ]);
    }
  }
  
  return righe;
}

/**
 * Tenta di estrarre foglio/particella/subalterno dal keycode
 * I keycode IT-rmv sandbox sono hash esadecimali → non parsabili
 */
function parsaKeycode(keycode) {
  const result = { foglio: "", particella: "", subalterno: "" };
  
  if (!keycode) return result;
  
  const kc = String(keycode).trim();
  
  // Se è un hash esadecimale (32+ caratteri hex), non è un riferimento catastale
  if (/^[0-9a-f]{16,}$/i.test(kc)) {
    Logger.log("Keycode è un hash, non parsabile: " + kc);
    return result;
  }
  
  // Prova pattern con separatori (es: "F123_P456_S7")
  const parts = kc.split(/[_\-\/|]/);
  if (parts.length >= 2) {
    result.foglio = parts[0].replace(/\D/g, "");
    result.particella = parts[1].replace(/\D/g, "");
    if (parts.length >= 3) {
      result.subalterno = parts[2].replace(/\D/g, "");
    }
  }
  
  return result;
}

// ============================================================
// FUNZIONI HELPER — FOGLI E CONFIG
// ============================================================

/**
 * Leggi parametri dal foglio Config
 */
function leggiConfig(ss) {
  const sh = ss.getSheetByName(CONFIG.SHEET_CONFIG);
  if (!sh) return {};
  
  const data = sh.getRange(2, 1, 20, 2).getValues();
  const config = {};
  
  // Mappa i valori per posizione
  const mapping = [
    "latitudine", "longitudine", "raggio", "tipoImmobile",
    "importoMinimo", "importoMassimo", "annoInizio", "meseInizio",
    "annoFine", "meseFine", "_separator",
    "cfPiva", "provinciaPersona", "tipoCatasto"
  ];
  
  for (let i = 0; i < mapping.length && i < data.length; i++) {
    if (mapping[i] && !mapping[i].startsWith("_")) {
      const val = data[i][1];
      if (val !== "" && val !== null && val !== undefined) {
        config[mapping[i]] = val;
        Logger.log("Config: " + mapping[i] + " = " + val + " (tipo: " + typeof val + ")");
      }
    }
  }
  
  return config;
}

/**
 * Ottieni o crea un foglio
 */
function getOrCreateSheet(ss, name) {
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
  }
  return sh;
}

/**
 * Normalizza una coordinata: gestisce virgola italiana, numeri, stringhe
 * "45,4642" → "45.4642"
 * 45.4642 → "45.4642"
 */
function normalizzaCoordinata(valore) {
  if (valore === null || valore === undefined || valore === "") return "";
  // Converti a stringa e sostituisci virgola con punto
  let s = String(valore).trim().replace(",", ".");
  // Rimuovi eventuali spazi
  s = s.replace(/\s/g, "");
  // Verifica che sia un numero valido
  if (isNaN(parseFloat(s))) return "";
  return s;
}

/**
 * Deriva il codice provincia (2 lettere) dal nome completo
 */
function derivaCodiceProvincia(testo) {
  if (!testo) return "";
  
  const t = testo.trim().toUpperCase();
  
  // Se già 2 lettere, usa direttamente
  if (t.length === 2 && /^[A-Z]{2}$/.test(t)) return t;
  
  // Mappa province principali
  const mappa = {
    "MILANO": "MI", "ROMA": "RM", "TORINO": "TO", "NAPOLI": "NA",
    "FIRENZE": "FI", "BOLOGNA": "BO", "GENOVA": "GE", "VENEZIA": "VE",
    "PISA": "PI", "PALERMO": "PA", "BARI": "BA", "CATANIA": "CT",
    "VERONA": "VR", "PADOVA": "PD", "BRESCIA": "BS", "BERGAMO": "BG",
    "COMO": "CO", "VARESE": "VA", "MONZA": "MB", "LECCO": "LC",
    "LODI": "LO", "CREMONA": "CR", "MANTOVA": "MN", "PAVIA": "PV",
    "SONDRIO": "SO", "PERUGIA": "PG", "TERNI": "TR", "ANCONA": "AN",
    "CAGLIARI": "CA", "SASSARI": "SS", "TRENTO": "TN", "BOLZANO": "BZ",
    "TRIESTE": "TS", "UDINE": "UD", "AOSTA": "AO", "POTENZA": "PZ",
    "REGGIO CALABRIA": "RC", "COSENZA": "CS", "CATANZARO": "CZ",
    "SIRACUSA": "SR", "MESSINA": "ME", "TRAPANI": "TP", "AGRIGENTO": "AG",
    "LUCCA": "LU", "LIVORNO": "LI", "AREZZO": "AR", "SIENA": "SI",
    "GROSSETO": "GR", "PRATO": "PO", "PISTOIA": "PT", "MASSA-CARRARA": "MS"
  };
  
  return mappa[t] || t.substring(0, 2);
}

// ============================================================
// DEBUG — Test connessione rapido
// ============================================================

/**
 * Test connessione Real Estate sandbox
 */
function testConnessione() {
  const body = {
    property_type: "immobili_residenziali",
    latitude: "45.4642",
    longitude: "9.1900",
    search_radius: 5000
  };
  
  const response = chiamaAPI("POST", CONFIG.REALESTATE_URL, body);
  
  if (response) {
    Logger.log("✅ Connessione OK");
    Logger.log("Response completa:\n" + JSON.stringify(response, null, 2));
    SpreadsheetApp.getUi().alert(
      "✅ Connessione sandbox Real Estate OK!\n\n" +
      "Success: " + response.success + "\n" +
      "Message: " + (response.message || "N/A") + "\n\n" +
      "Controlla i log (Ctrl+Enter) per la risposta completa."
    );
  } else {
    SpreadsheetApp.getUi().alert("❌ Connessione Real Estate fallita. Controlla i log.");
  }
}

/**
 * Test connessione Catasto sandbox — prova GET /territorio (non costa nulla)
 */
function testCatasto() {
  const ui = SpreadsheetApp.getUi();
  
  // Prova il dominio configurato
  const url = CONFIG.CATASTO_URL + "/territorio";
  Logger.log("🔍 Test Catasto: " + url);
  
  const response = chiamaAPI("GET", url, null);
  
  if (response && response.success) {
    const numProvince = (response.data || []).length;
    ui.alert("✅ Connessione Catasto sandbox OK!\n\n" +
             "URL: " + CONFIG.CATASTO_URL + "\n" +
             "Province trovate: " + numProvince + "\n\n" +
             "Il catasto funziona correttamente.");
  } else if (response) {
    ui.alert("⚠️ Catasto risponde ma con errore:\n\n" +
             "URL: " + url + "\n" +
             JSON.stringify(response, null, 2));
  } else {
    ui.alert("❌ Catasto non raggiungibile!\n\n" +
             "URL provato: " + url + "\n\n" +
             "Verifica che il token abbia gli scope Catasto abilitati.\n" +
             "Se il DNS non risolve, il dominio sandbox potrebbe essere diverso.");
  }
}