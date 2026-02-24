import { useState, useMemo } from "react";

/*
  DATI REALI:
  - Comune di Milano: 181.7 km², ~15km diametro, forma quasi circolare
  - Città Metropolitana di Milano: 1,575.65 km², 133 comuni
  - Comune di Pisa: 185 km², ~15km diametro, forma allungata
  - Provincia di Pisa: 2,444 km², 37 comuni
*/

const AREAS = {
  milano_comune: {
    label: "Comune di Milano",
    short: "MI Comune",
    area_km2: 181.7,
    bounds: { north: 45.536, south: 45.390, west: 9.065, east: 9.278 },
    center: { lat: 45.464, lng: 9.190 },
    color: "#E63946",
    icon: "🏙️",
    note: "~15km diametro, forma compatta"
  },
  milano_provincia: {
    label: "Provincia di Milano",
    short: "MI Provincia",
    area_km2: 1575.65,
    bounds: { north: 45.650, south: 45.300, west: 8.850, east: 9.550 },
    center: { lat: 45.464, lng: 9.190 },
    color: "#C1121F",
    icon: "🏛️",
    note: "133 comuni, ~70×50 km"
  },
  pisa_comune: {
    label: "Comune di Pisa",
    short: "PI Comune",
    area_km2: 185,
    bounds: { north: 43.775, south: 43.600, west: 10.280, east: 10.470 },
    center: { lat: 43.716, lng: 10.401 },
    color: "#457B9D",
    icon: "🏗️",
    note: "~18×12km, forma allungata N-S"
  },
  pisa_provincia: {
    label: "Provincia di Pisa",
    short: "PI Provincia",
    area_km2: 2444,
    bounds: { north: 43.850, south: 43.200, west: 10.050, east: 10.950 },
    center: { lat: 43.525, lng: 10.500 },
    color: "#1D3557",
    icon: "🗺️",
    note: "37 comuni, ~90×70km, include colline e Val di Cecina"
  }
};

function metersToDegLat(m) { return m / 111320; }
function metersToDegLng(m, lat) { return m / (111320 * Math.cos(lat * Math.PI / 180)); }

function calcGrid(bounds, radiusM, overlap = 0.7) {
  const step = radiusM * 2 * overlap;
  const latStep = metersToDegLat(step);
  const midLat = (bounds.north + bounds.south) / 2;
  const lngStep = metersToDegLng(step, midLat);
  let count = 0;
  for (let lat = bounds.south; lat <= bounds.north; lat += latStep) {
    for (let lng = bounds.west; lng <= bounds.east; lng += lngStep) {
      count++;
    }
  }
  return count;
}

const RADII = [500, 1000, 2000, 3000, 4000, 5000, 7500, 10000];

const PRICING = [
  { min: 0, max: 299, price: 4.00, label: "PAYG" },
  { min: 300, max: 999, price: 3.00, label: "300" },
  { min: 1000, max: 4999, price: 1.50, label: "1K" },
  { min: 5000, max: 9999, price: 0.70, label: "5K" },
  { min: 10000, max: 49999, price: 0.55, label: "10K" },
  { min: 50000, max: 99999, price: 0.30, label: "50K" },
  { min: 100000, max: 499999, price: 0.20, label: "100K" },
  { min: 500000, max: Infinity, price: 0.10, label: "500K" },
];

function getPrice(calls) {
  const t = PRICING.find(p => calls >= p.min && calls <= p.max) || PRICING[0];
  return { unit: t.price, total: calls * t.price, tier: t.label };
}

function MiniGrid({ area, radius }) {
  const b = area.bounds;
  const W = 200, H = 160, pad = 10;
  const step = radius * 2 * 0.7;
  const latStep = metersToDegLat(step);
  const midLat = (b.north + b.south) / 2;
  const lngStep = metersToDegLng(step, midLat);
  
  const toX = lng => pad + ((lng - b.west) / (b.east - b.west)) * (W - 2*pad);
  const toY = lat => pad + ((b.north - lat) / (b.north - b.south)) * (H - 2*pad);
  
  const points = [];
  for (let lat = b.south; lat <= b.north; lat += latStep) {
    for (let lng = b.west; lng <= b.east; lng += lngStep) {
      if (points.length < 300) points.push({ lat, lng });
    }
  }
  
  const rPx = Math.max((metersToDegLng(radius, midLat) / (b.east - b.west)) * (W - 2*pad), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, background: "#08080d", borderRadius: 6 }}>
      <rect x={pad} y={pad} width={W-2*pad} height={H-2*pad}
        fill="none" stroke={area.color} strokeWidth="0.5" strokeDasharray="3 3" opacity="0.3"/>
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={toX(p.lng)} cy={toY(p.lat)} r={Math.min(rPx, 15)} fill={area.color} opacity="0.06"/>
          <circle cx={toX(p.lng)} cy={toY(p.lat)} r={0.8} fill={area.color} opacity="0.5"/>
        </g>
      ))}
    </svg>
  );
}

export default function Comparison() {
  const [selectedAreas, setSelectedAreas] = useState(["milano_comune", "milano_provincia", "pisa_comune", "pisa_provincia"]);
  const [propertyTypes, setPropertyTypes] = useState(3);
  const [queryMode, setQueryMode] = useState("annual"); // annual or monthly
  const [highlightRadius, setHighlightRadius] = useState(3000);

  const matrix = useMemo(() => {
    return Object.entries(AREAS).map(([key, area]) => ({
      key,
      ...area,
      radii: RADII.map(r => {
        const points = calcGrid(area.bounds, r, 0.7);
        const callsPerScan = points * propertyTypes;
        const totalCalls = queryMode === "annual" ? callsPerScan : callsPerScan * 12;
        const pricing = getPrice(totalCalls);
        const coveragePerPoint = Math.PI * (r/1000)**2;
        const coverage = Math.min((points * coveragePerPoint / area.area_km2 * 100), 999);
        return { radius: r, points, callsPerScan, totalCalls, pricing, coverage };
      })
    }));
  }, [propertyTypes, queryMode]);

  const combos = useMemo(() => {
    const results = [];
    // MI comune + PI comune
    const miC = matrix.find(m => m.key === "milano_comune");
    const piC = matrix.find(m => m.key === "pisa_comune");
    const miP = matrix.find(m => m.key === "milano_provincia");
    const piP = matrix.find(m => m.key === "pisa_provincia");

    if (miC && piC) {
      results.push({
        label: "Solo Comuni (MI + PI)",
        icon: "🎯",
        desc: "Focus urbano, zone ad alto valore",
        items: RADII.map(r => {
          const mi = miC.radii.find(x => x.radius === r);
          const pi = piC.radii.find(x => x.radius === r);
          const total = mi.totalCalls + pi.totalCalls;
          return { radius: r, points: mi.points + pi.points, totalCalls: total, pricing: getPrice(total) };
        })
      });
    }
    if (miP && piP) {
      results.push({
        label: "Province complete (MI + PI)",
        icon: "🗺️",
        desc: "Copertura totale, include hinterland",
        items: RADII.map(r => {
          const mi = miP.radii.find(x => x.radius === r);
          const pi = piP.radii.find(x => x.radius === r);
          const total = mi.totalCalls + pi.totalCalls;
          return { radius: r, points: mi.points + pi.points, totalCalls: total, pricing: getPrice(total) };
        })
      });
    }
    if (miP && piC) {
      results.push({
        label: "MI Provincia + PI Comune",
        icon: "⚖️",
        desc: "Milano ampio + Pisa focus città",
        items: RADII.map(r => {
          const mi = miP.radii.find(x => x.radius === r);
          const pi = piC.radii.find(x => x.radius === r);
          const total = mi.totalCalls + pi.totalCalls;
          return { radius: r, points: mi.points + pi.points, totalCalls: total, pricing: getPrice(total) };
        })
      });
    }
    return results;
  }, [matrix]);

  const fmt = n => n.toLocaleString("it-IT");
  const fmtE = n => "€" + n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  return (
    <div style={{
      fontFamily: "'JetBrains Mono', 'SF Mono', monospace",
      background: "#050508", color: "#d0d0d0",
      minHeight: "100vh", padding: "20px 16px",
      fontSize: 12
    }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: "#fff" }}>
          Comune vs Provincia — Matrice di confronto
        </h1>
        <p style={{ color: "#555", margin: "6px 0 0", fontSize: 11 }}>
          OpenAPI.it IT-rmv · min_amount: 3.000.000 · Anno 2025 · Max 10 risultati/chiamata
        </p>
      </div>

      {/* Controls */}
      <div style={{ 
        display: "flex", gap: 16, marginBottom: 20, flexWrap: "wrap",
        padding: 14, background: "#0a0a12", borderRadius: 8, border: "1px solid #1a1a25"
      }}>
        <div>
          <span style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Tipi immobile</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[1,2,3].map(n => (
              <button key={n} onClick={() => setPropertyTypes(n)} style={{
                padding: "4px 10px", fontSize: 11, fontFamily: "inherit",
                background: propertyTypes === n ? "#1a1a30" : "#0d0d14",
                border: propertyTypes === n ? "1px solid #457B9D" : "1px solid #151520",
                color: propertyTypes === n ? "#fff" : "#444",
                borderRadius: 4, cursor: "pointer"
              }}>{n}x</button>
            ))}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>Query temporale</span>
          <div style={{ display: "flex", gap: 4 }}>
            {[["annual","1 query annuale"],["monthly","12 query mensili"]].map(([id,l]) => (
              <button key={id} onClick={() => setQueryMode(id)} style={{
                padding: "4px 10px", fontSize: 11, fontFamily: "inherit",
                background: queryMode === id ? "#1a1a30" : "#0d0d14",
                border: queryMode === id ? "1px solid #457B9D" : "1px solid #151520",
                color: queryMode === id ? "#fff" : "#444",
                borderRadius: 4, cursor: "pointer"
              }}>{l}</button>
            ))}
          </div>
        </div>
        <div>
          <span style={{ fontSize: 10, color: "#555", display: "block", marginBottom: 4 }}>
            Evidenzia raggio: {highlightRadius}m
          </span>
          <input type="range" min={500} max={10000} step={500} value={highlightRadius}
            onChange={e => setHighlightRadius(+e.target.value)}
            style={{ width: 180, accentColor: "#E63946" }}/>
        </div>
      </div>

      {/* 4-area cards with mini maps */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {matrix.map(area => {
          const sel = area.radii.find(r => r.radius === highlightRadius);
          return (
            <div key={area.key} style={{
              background: "#0a0a10", border: `1px solid ${area.color}22`,
              borderRadius: 8, padding: 12, overflow: "hidden"
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{area.icon}</span>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: area.color }}>{area.short}</div>
                  <div style={{ fontSize: 10, color: "#444" }}>{area.area_km2.toLocaleString()} km²</div>
                </div>
              </div>
              <MiniGrid area={area} radius={highlightRadius} />
              <div style={{ marginTop: 8, fontSize: 10, color: "#666" }}>{area.note}</div>
              {sel && (
                <div style={{ 
                  marginTop: 8, padding: 8, background: "#0d0d16", borderRadius: 6,
                  borderLeft: `2px solid ${area.color}`
                }}>
                  <div style={{ fontSize: 10, color: "#555", marginBottom: 4 }}>
                    @ raggio {fmt(highlightRadius)}m
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{fmt(sel.points)}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>punti</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{fmt(sel.totalCalls)}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>chiamate</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: area.color }}>{fmtE(sel.pricing.total)}</div>
                      <div style={{ fontSize: 9, color: "#555" }}>costo</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: sel.coverage > 100 ? "#22c55e" : "#f59e0b" }}>
                        {sel.coverage > 100 ? "✓" : sel.coverage.toFixed(0) + "%"}
                      </div>
                      <div style={{ fontSize: 9, color: "#555" }}>copertura</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Full matrix table */}
      <div style={{ 
        background: "#0a0a10", border: "1px solid #1a1a25", 
        borderRadius: 8, padding: 16, marginBottom: 24, overflowX: "auto"
      }}>
        <h3 style={{ fontSize: 13, color: "#888", margin: "0 0 12px", letterSpacing: 1 }}>
          MATRICE COMPLETA — PUNTI GRIGLIA × RAGGIO (overlap 70%)
        </h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #1a1a25" }}>
              <th style={{ textAlign: "left", padding: "8px 6px", color: "#555" }}>Raggio</th>
              {matrix.map(a => (
                <th key={a.key} style={{ textAlign: "right", padding: "8px 6px", color: a.color, fontSize: 10 }}>
                  {a.short}
                </th>
              ))}
              <th style={{ textAlign: "right", padding: "8px 6px", color: "#888", fontSize: 10, borderLeft: "1px solid #1a1a25" }}>
                Comuni (MI+PI)
              </th>
              <th style={{ textAlign: "right", padding: "8px 6px", color: "#888", fontSize: 10 }}>
                Province (MI+PI)
              </th>
            </tr>
          </thead>
          <tbody>
            {RADII.map(r => {
              const isHL = r === highlightRadius;
              const comune_combo = (matrix.find(m => m.key === "milano_comune")?.radii.find(x => x.radius === r)?.totalCalls || 0)
                + (matrix.find(m => m.key === "pisa_comune")?.radii.find(x => x.radius === r)?.totalCalls || 0);
              const prov_combo = (matrix.find(m => m.key === "milano_provincia")?.radii.find(x => x.radius === r)?.totalCalls || 0)
                + (matrix.find(m => m.key === "pisa_provincia")?.radii.find(x => x.radius === r)?.totalCalls || 0);

              return (
                <tr key={r} 
                  onClick={() => setHighlightRadius(r)}
                  style={{ 
                    borderBottom: "1px solid #0d0d16", cursor: "pointer",
                    background: isHL ? "#12121f" : "transparent",
                    transition: "background 0.15s"
                  }}
                >
                  <td style={{ padding: "7px 6px", color: isHL ? "#fff" : "#888", fontWeight: isHL ? 700 : 400 }}>
                    {r >= 1000 ? (r/1000) + " km" : r + " m"}
                  </td>
                  {matrix.map(a => {
                    const d = a.radii.find(x => x.radius === r);
                    return (
                      <td key={a.key} style={{ textAlign: "right", padding: "7px 6px" }}>
                        <span style={{ color: isHL ? "#fff" : "#aaa" }}>{fmt(d.points)}</span>
                        <span style={{ color: "#333", margin: "0 3px" }}>→</span>
                        <span style={{ color: isHL ? a.color : "#555", fontWeight: isHL ? 600 : 400 }}>
                          {fmtE(d.pricing.total)}
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ textAlign: "right", padding: "7px 6px", borderLeft: "1px solid #1a1a25" }}>
                    <span style={{ color: isHL ? "#22c55e" : "#666", fontWeight: isHL ? 700 : 400 }}>
                      {fmtE(getPrice(comune_combo).total)}
                    </span>
                  </td>
                  <td style={{ textAlign: "right", padding: "7px 6px" }}>
                    <span style={{ color: isHL ? "#f59e0b" : "#666", fontWeight: isHL ? 700 : 400 }}>
                      {fmtE(getPrice(prov_combo).total)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Combos */}
      <div style={{ 
        background: "#0a0a10", border: "1px solid #1a1a25", 
        borderRadius: 8, padding: 16, marginBottom: 24
      }}>
        <h3 style={{ fontSize: 13, color: "#888", margin: "0 0 14px", letterSpacing: 1 }}>
          SCENARI COMBINATI — @ raggio {fmt(highlightRadius)}m
        </h3>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {combos.map((c, i) => {
            const sel = c.items.find(x => x.radius === highlightRadius);
            return (
              <div key={i} style={{
                padding: 14, background: "#0d0d16", borderRadius: 8,
                border: i === 0 ? "1px solid #22c55e33" : "1px solid #1a1a22"
              }}>
                <div style={{ fontSize: 14, marginBottom: 2 }}>{c.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#fff", marginBottom: 2 }}>{c.label}</div>
                <div style={{ fontSize: 10, color: "#555", marginBottom: 10 }}>{c.desc}</div>
                {sel && (
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "#666" }}>Punti totali</span>
                      <span style={{ color: "#ccc", fontWeight: 600 }}>{fmt(sel.points)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "#666" }}>Chiamate API</span>
                      <span style={{ color: "#ccc", fontWeight: 600 }}>{fmt(sel.totalCalls)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ color: "#666" }}>€/chiamata</span>
                      <span style={{ color: "#ccc" }}>€{sel.pricing.unit.toFixed(2)} ({sel.pricing.tier})</span>
                    </div>
                    <div style={{ 
                      display: "flex", justifyContent: "space-between",
                      borderTop: "1px solid #1a1a25", paddingTop: 8, marginTop: 6
                    }}>
                      <span style={{ color: "#fff", fontWeight: 700 }}>Costo totale</span>
                      <span style={{ 
                        fontSize: 16, fontWeight: 800,
                        color: i === 0 ? "#22c55e" : i === 1 ? "#f59e0b" : "#457B9D"
                      }}>
                        {fmtE(sel.pricing.total)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Key insight */}
      <div style={{ 
        background: "#0d120d", border: "1px solid #22c55e22", 
        borderRadius: 8, padding: 16
      }}>
        <h4 style={{ fontSize: 12, color: "#22c55e", margin: "0 0 8px" }}>
          💡 Raccomandazione per transazioni &gt;€3M
        </h4>
        <div style={{ fontSize: 12, color: "#888", lineHeight: 1.7 }}>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ddd" }}>Start con i soli comuni</strong> — Milano e Pisa comuni coprono ~367 km² totali.
            Con raggio 3km e 3 tipi, servono circa 50-80 chiamate totali. Costo: poche centinaia di euro.
            Per transazioni &gt;€3M è il 90% del mercato, concentrato nelle zone urbane.
          </p>
          <p style={{ margin: "0 0 8px" }}>
            <strong style={{ color: "#ddd" }}>Poi espandi se serve</strong> — Se i risultati mostrano transazioni ai bordi del comune,
            espandi alla provincia. Milano provincia è 8.7× il comune, Pisa provincia è 13.2× il comune.
          </p>
          <p style={{ margin: 0 }}>
            <strong style={{ color: "#f59e0b" }}>⚠ Il vero test prima di tutto</strong> — Prova in sandbox con raggio 5.000m e 10.000m 
            per verificare il limite massimo accettato. L'esempio nella doc usa 250m, ma non specifica un cap. 
            Se accetta 10km, la griglia si semplifica enormemente.
          </p>
        </div>
      </div>
    </div>
  );
}
