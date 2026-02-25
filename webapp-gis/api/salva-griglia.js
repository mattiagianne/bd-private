/**
 * Vercel serverless: proxy verso Apps Script Web App per salvare griglia in Google Sheet.
 * Env: GOOGLE_SCRIPT_URL, GOOGLE_SCRIPT_TOKEN
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }
  const scriptUrl = process.env.GOOGLE_SCRIPT_URL;
  const token = process.env.GOOGLE_SCRIPT_TOKEN;
  if (!scriptUrl || !token) {
    return res.status(500).json({
      success: false,
      message: "Configurazione mancante: GOOGLE_SCRIPT_URL e GOOGLE_SCRIPT_TOKEN",
    });
  }
  let body;
  try {
    body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
  } catch (_) {
    return res.status(400).json({ success: false, message: "Body JSON non valido" });
  }
  const { centers, search_radius_m, area, property_type } = body;
  if (!Array.isArray(centers) || centers.length === 0) {
    return res.status(400).json({ success: false, message: "centers deve essere un array non vuoto" });
  }
  const searchRadiusM = parseInt(search_radius_m, 10);
  if (isNaN(searchRadiusM) || searchRadiusM < 50 || searchRadiusM > 20000) {
    return res.status(400).json({ success: false, message: "search_radius_m deve essere tra 50 e 20000" });
  }
  const validTypes = ["immobili_residenziali", "immobili_non_residenziali", "pertinenziali"];
  const propertyType = property_type && validTypes.includes(property_type) ? property_type : "immobili_residenziali";
  const payload = {
    token,
    centers,
    search_radius_m: searchRadiusM,
    property_type: propertyType,
  };
  if (area != null && typeof area === "string") payload.area = area;
  try {
    const response = await fetch(scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_) {
      const preview = text.slice(0, 400).replace(/\s+/g, " ").trim();
      return res.status(502).json({
        success: false,
        message: "Risposta non valida dallo script (non è JSON).",
        debug: response.status,
        preview: preview ? preview.slice(0, 300) : "(vuoto)",
      });
    }
    if (!response.ok) {
      return res.status(response.status).json(data);
    }
    return res.status(200).json(data);
  } catch (err) {
    return res.status(502).json({
      success: false,
      message: err.message || "Errore di rete verso Google Script",
    });
  }
}
