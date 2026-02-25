import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import Map from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import { GeoJsonLayer } from '@deck.gl/layers';
import * as turfArea from '@turf/area';
import turfCircle from '@turf/circle';
import booleanIntersects from '@turf/boolean-intersects';
import booleanPointInPolygon from '@turf/boolean-point-in-polygon';

const MAP_STYLE = 'https://tiles.openfreemap.org/styles/dark';

// Limiti API Realestate (API_Doc): search_radius in metri, min 50, max 20000
const API_RADIUS_M_MIN = 50;
const API_RADIUS_M_MAX = 20000;
const API_RADIUS_KM_MIN = API_RADIUS_M_MIN / 1000;
const API_RADIUS_KM_MAX = API_RADIUS_M_MAX / 1000;

// Costi API Compravendite Immobiliari (RMV) - openapi.it - prezzi + IVA
const RMV_SINGOLA_EUR = 4;
const RMV_ABBONAMENTI = [
  { chiamate: 300, prezzoUnitario: 3 },
  { chiamate: 1000, prezzoUnitario: 1.5 },
  { chiamate: 5000, prezzoUnitario: 0.7 },
  { chiamate: 10000, prezzoUnitario: 0.55 },
  { chiamate: 50000, prezzoUnitario: 0.3 },
  { chiamate: 100000, prezzoUnitario: 0.2 },
  { chiamate: 500000, prezzoUnitario: 0.1 },
];
const RMV_URL = 'https://openapi.it/prodotti/compravendite-immobiliari';

// URL del Google Sheet (configura in env: VITE_GOOGLE_SHEET_URL)
const GOOGLE_SHEET_URL = import.meta.env.VITE_GOOGLE_SHEET_URL || '';

// Tipi immobile API RMV (POST /IT-rmv)
const RMV_PROPERTY_TYPES = [
  { value: 'immobili_residenziali', label: 'Residenziali (appartamenti, ville, ecc.)' },
  { value: 'immobili_non_residenziali', label: 'Non residenziali (commerciali, uffici, magazzini)' },
  { value: 'pertinenziali', label: 'Pertinenziali (garage, posti auto, ecc.)' },
];

const PROV_NAME_KEYS = ['DEN_PCM', 'DEN_PROV', 'NOME', 'nome'];
const PROV_SIGLA_KEYS = ['SIGLA', 'COD_PROV', 'PROV'];
const COMUNE_NAME_KEYS = ['COMUNE', 'DEN_CM', 'NOME', 'nome'];
const COMUNE_PROV_KEYS = ['SIGLA_PROV', 'PROV', 'COD_PROV'];

function getProp(feature, keys) {
  const p = feature.properties || {};
  for (const k of keys) {
    if (p[k] != null && String(p[k]).trim() !== '') return String(p[k]).trim();
  }
  return '';
}

function getProvName(f) {
  return getProp(f, PROV_NAME_KEYS) || getProp(f, PROV_SIGLA_KEYS) || '—';
}
function getProvSigla(f) {
  return getProp(f, PROV_SIGLA_KEYS) || getProp(f, PROV_NAME_KEYS) || '';
}
function getComuneName(f) {
  return getProp(f, COMUNE_NAME_KEYS) || '—';
}
function getComuneProv(f) {
  return getProp(f, COMUNE_PROV_KEYS) || '';
}

function getBounds(feature) {
  const geom = feature.geometry;
  if (!geom || !geom.coordinates) return null;
  let coords = [];
  if (geom.type === 'Polygon') coords = geom.coordinates[0];
  else if (geom.type === 'MultiPolygon') coords = geom.coordinates.flatMap((p) => p[0]);
  else return null;
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
  for (const c of coords) {
    const lng = c[0], lat = c[1];
    if (lng != null && lat != null) {
      minLng = Math.min(minLng, lng);
      minLat = Math.min(minLat, lat);
      maxLng = Math.max(maxLng, lng);
      maxLat = Math.max(maxLat, lat);
    }
  }
  if (minLng === Infinity) return null;
  return [minLng, minLat, maxLng, maxLat];
}

function getAreaKm2(feature) {
  const p = feature.properties || {};
  const shapeArea = p.Shape_Area;
  if (shapeArea != null && Number(shapeArea) > 0) return Number(shapeArea) / 1e6;
  try {
    return turfArea.default(feature) / 1e6;
  } catch (_) {
    return null;
  }
}

function countCirclesToCover(feature, radiusKm) {
  const grid = getCircleGrid(feature, radiusKm);
  return grid ? grid.centers.length : null;
}

/** Griglia interna al poligono + bordo: prima tutti i centri dentro il poligono, poi i cerchi che coprono il bordo. Step fitto per evitare buchi. */
function getCircleGrid(feature, radiusKm) {
  if (!radiusKm || radiusKm <= 0) return null;
  const b = getBounds(feature);
  if (!b) return null;
  const [minLng, minLat, maxLng, maxLat] = b;
  const stepKm = 2 * radiusKm * 0.78;
  const kmPerDegLat = 111.32;
  const centerLat = (minLat + maxLat) / 2;
  const kmPerDegLng = 111.32 * Math.cos((centerLat * Math.PI) / 180);
  const stepDegLat = stepKm / kmPerDegLat;
  const stepDegLng = stepKm / kmPerDegLng;
  const centers = [];
  const circleFeatures = [];
  const added = new Set();

  const key = (lng, lat) => `${lng.toFixed(6)},${lat.toFixed(6)}`;
  const addCircle = (lng, lat) => {
    const k = key(lng, lat);
    if (added.has(k)) return;
    const circle = turfCircle([lng, lat], radiusKm, { units: 'kilometers' });
    if (!booleanIntersects(circle, feature)) return;
    added.add(k);
    centers.push([lng, lat]);
    circleFeatures.push(circle);
  };

  for (let lat = minLat; lat <= maxLat + stepDegLat * 0.5; lat += stepDegLat) {
    for (let lng = minLng; lng <= maxLng + stepDegLng * 0.5; lng += stepDegLng) {
      if (booleanPointInPolygon([lng, lat], feature)) addCircle(lng, lat);
    }
  }
  for (let lat = minLat; lat <= maxLat + stepDegLat * 0.5; lat += stepDegLat) {
    for (let lng = minLng; lng <= maxLng + stepDegLng * 0.5; lng += stepDegLng) {
      addCircle(lng, lat);
    }
  }
  return { centers, circleFeatures };
}

export default function App() {
  const [dettaglioConfini, setDettaglioConfini] = useState('generale'); // 'generale' | 'dettagliata' | 'esempio'
  const [provinceList, setProvinceList] = useState([]);
  const [comuniList, setComuniList] = useState([]);
  const [selectedProvincia, setSelectedProvincia] = useState('');
  const [selectedComune, setSelectedComune] = useState('');
  const [viewState, setViewState] = useState({
    longitude: 12.5,
    latitude: 42.0,
    zoom: 5,
  });
  const [highlightFeature, setHighlightFeature] = useState(null);
  const [searchRadiusKm, setSearchRadiusKm] = useState(5);
  const [searchCenter, setSearchCenter] = useState(null);
  const [gridCircles, setGridCircles] = useState([]);
  const [gridCenters, setGridCenters] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState(null);
  const [propertyType, setPropertyType] = useState('immobili_residenziali');
  const mapRef = useRef(null);
  const overlayRef = useRef(null);
  const dataCacheRef = useRef({});

  useEffect(() => {
    const key = dettaglioConfini;
    if (dataCacheRef.current[key]) {
      setProvinceList(dataCacheRef.current[key].province);
      setComuniList(dataCacheRef.current[key].comuni);
      setSelectedProvincia('');
      setSelectedComune('');
      setHighlightFeature(null);
      return;
    }

    const suffix =
      dettaglioConfini === 'generale'
        ? '_generale'
        : dettaglioConfini === 'dettagliata'
          ? '_dettagliata'
          : '';
    const provFile = '/geojson/province' + suffix + '.json';
    const comuniFile = '/geojson/comuni' + suffix + '.json';

    const load = (url) =>
      fetch(url)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null);

    Promise.all([load(provFile), load(comuniFile)]).then(([provGeo, comuniGeo]) => {
      if (!provGeo && !comuniGeo && suffix) {
        load('/geojson/province.json').then((p) => {
          if (p) {
            const list = (p.features || []).map((f) => ({ sigla: getProvSigla(f), name: getProvName(f), feature: f }));
            list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));
            setProvinceList(list);
            dataCacheRef.current.esempio = dataCacheRef.current.esempio || {};
            dataCacheRef.current.esempio.province = list;
          }
        });
        load('/geojson/comuni.json').then((c) => {
          if (c) {
            const list = (c.features || []).map((f) => ({ name: getComuneName(f), prov: getComuneProv(f), feature: f }));
            list.sort((a, b) => (a.prov || '').localeCompare(b.prov || '', 'it') || (a.name || '').localeCompare(b.name || '', 'it'));
            setComuniList(list);
            dataCacheRef.current.esempio = dataCacheRef.current.esempio || {};
            dataCacheRef.current.esempio.comuni = list;
          }
        });
        setSelectedProvincia('');
        setSelectedComune('');
        setHighlightFeature(null);
        return;
      }
      if (provGeo) {
        const provList = (provGeo.features || []).map((f) => ({
          sigla: getProvSigla(f),
          name: getProvName(f),
          feature: f,
        }));
        provList.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));
        setProvinceList(provList);
        dataCacheRef.current[key] = dataCacheRef.current[key] || {};
        dataCacheRef.current[key].province = provList;
        if (comuniGeo) {
          const codToSigla = {};
          provList.forEach((p) => {
            const cod = p.feature.properties && p.feature.properties.COD_PROV;
            if (cod != null) codToSigla[String(cod)] = p.sigla;
          });
          const comuniListData = (comuniGeo.features || []).map((f) => ({
            name: getComuneName(f),
            prov: codToSigla[String((f.properties || {}).COD_PROV)] ?? getComuneProv(f),
            feature: f,
          }));
          comuniListData.sort((a, b) => (a.prov || '').localeCompare(b.prov || '', 'it') || (a.name || '').localeCompare(b.name || '', 'it'));
          setComuniList(comuniListData);
          dataCacheRef.current[key].comuni = comuniListData;
        } else {
          setComuniList([]);
        }
      } else {
        setProvinceList([]);
        if (comuniGeo) {
          const comuniListData = (comuniGeo.features || []).map((f) => ({
            name: getComuneName(f),
            prov: getComuneProv(f),
            feature: f,
          }));
          comuniListData.sort((a, b) => (a.prov || '').localeCompare(b.prov || '', 'it') || (a.name || '').localeCompare(b.name || '', 'it'));
          setComuniList(comuniListData);
        } else {
          setComuniList([]);
        }
      }
    });
    setSelectedProvincia('');
    setSelectedComune('');
    setHighlightFeature(null);
  }, [dettaglioConfini]);

  const comuniFiltered = selectedProvincia
    ? comuniList.filter((c) => (c.prov || '').toUpperCase() === selectedProvincia.toUpperCase())
    : comuniList;

  const stats = useMemo(() => {
    if (!highlightFeature) return null;
    const area = getAreaKm2(highlightFeature);
    const cerchi = countCirclesToCover(highlightFeature, searchRadiusKm);
    if (selectedComune) {
      const item = comuniFiltered.find((c) => c.name === selectedComune);
      return {
        tipo: 'comune',
        nome: getComuneName(highlightFeature),
        provincia: item?.prov ?? getComuneProv(highlightFeature),
        areaKm2: area,
        cerchi,
      };
    }
    if (selectedProvincia) {
      const nComuni = comuniFiltered.length;
      return {
        tipo: 'provincia',
        nome: getProvName(highlightFeature),
        sigla: getProvSigla(highlightFeature),
        areaKm2: area,
        nComuni,
        cerchi,
      };
    }
    return null;
  }, [highlightFeature, selectedComune, selectedProvincia, comuniFiltered, searchRadiusKm]);

  const searchCircleFeature = useMemo(() => {
    if (!searchCenter || !searchRadiusKm || searchRadiusKm <= 0) return null;
    const circle = turfCircle(searchCenter, searchRadiusKm, { units: 'kilometers' });
    return circle;
  }, [searchCenter, searchRadiusKm]);

  useEffect(() => {
    if (!overlayRef.current) return;
    const layers = [];
    const baseFeatures = provinceList.map((p) => p.feature).filter(Boolean);
    if (baseFeatures.length > 0) {
      const baseGeoJson = { type: 'FeatureCollection', features: baseFeatures };
      layers.push(
        new GeoJsonLayer({
          id: 'confini-base',
          data: baseGeoJson,
          filled: true,
          stroked: true,
          getFillColor: [60, 70, 90, 55],
          getLineColor: [120, 140, 180, 200],
          lineWidthMinPixels: 1.5,
          lineWidthMaxPixels: 4,
          getLineWidth: 1,
        })
      );
    }
    if (highlightFeature) {
      const geoJson = { type: 'FeatureCollection', features: [highlightFeature] };
      layers.push(
        new GeoJsonLayer({
          id: 'confini-highlight',
          data: geoJson,
          filled: true,
          stroked: true,
          getFillColor: [64, 158, 255, 120],
          getLineColor: [255, 255, 255, 255],
          lineWidthMinPixels: 3,
          lineWidthMaxPixels: 8,
          getLineWidth: 1,
        })
      );
    }
    if (searchCircleFeature) {
      layers.push(
        new GeoJsonLayer({
          id: 'cerchio-ricerca',
          data: { type: 'FeatureCollection', features: [searchCircleFeature] },
          filled: true,
          stroked: true,
          getFillColor: [255, 200, 50, 60],
          getLineColor: [255, 180, 0, 220],
          lineWidthMinPixels: 2,
          lineWidthMaxPixels: 5,
          getLineWidth: 1,
        })
      );
    }
    if (gridCircles.length > 0) {
      layers.push(
        new GeoJsonLayer({
          id: 'griglia-cerchi',
          data: { type: 'FeatureCollection', features: gridCircles },
          filled: true,
          stroked: true,
          getFillColor: [80, 200, 120, 50],
          getLineColor: [40, 160, 80, 200],
          lineWidthMinPixels: 1,
          lineWidthMaxPixels: 3,
          getLineWidth: 1,
        })
      );
    }
    overlayRef.current.setProps({ layers });
  }, [highlightFeature, provinceList, searchCircleFeature, gridCircles]);

  const onMapLoad = useCallback(() => {
    if (!mapRef.current || overlayRef.current) return;
    const map = mapRef.current.getMap?.();
    if (!map) return;
    const overlay = new MapboxOverlay({
      interleaved: true,
      layers: [],
    });
    map.addControl(overlay);
    overlayRef.current = overlay;
  }, []);

  const onSelectProvincia = useCallback(
    (e) => {
      const sigla = e.target.value;
      setSelectedProvincia(sigla);
      setSelectedComune('');
      setGridCircles([]);
      setGridCenters([]);
      const item = provinceList.find((p) => p.sigla === sigla);
      if (item?.feature) {
        setHighlightFeature(item.feature);
        const b = getBounds(item.feature);
        if (b && mapRef.current) {
          const map = mapRef.current.getMap?.();
          if (map) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 40, maxZoom: 10 });
        }
      } else {
        setHighlightFeature(null);
      }
    },
    [provinceList]
  );

  const onSelectComune = useCallback(
    (e) => {
      const name = e.target.value;
      setSelectedComune(name);
      setGridCircles([]);
      setGridCenters([]);
      const item = comuniFiltered.find((c) => c.name === name);
      if (item?.feature) {
        setHighlightFeature(item.feature);
        const b = getBounds(item.feature);
        if (b && mapRef.current) {
          const map = mapRef.current.getMap?.();
          if (map) map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, maxZoom: 12 });
        }
      } else {
        setHighlightFeature(null);
      }
    },
    [comuniFiltered]
  );

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          background: 'rgba(255,255,255,0.95)',
          padding: 14,
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 240,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
          Confini amministrativi
        </h3>
        <label style={{ fontSize: 12, color: '#444' }}>
          Dettaglio confini
          <select
            value={dettaglioConfini}
            onChange={(e) => setDettaglioConfini(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: 8,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 13,
            }}
          >
            <option value="generale">00_Generale (semplificato)</option>
            <option value="dettagliata">01_Dettagliata (dettaglio alto)</option>
            <option value="esempio">Esempio (Milano, Pisa)</option>
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#444' }}>
          Provincia
          <select
            value={selectedProvincia}
            onChange={onSelectProvincia}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: 8,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 13,
            }}
          >
            <option value="">— Tutte —</option>
            {provinceList.map((p) => (
              <option key={p.sigla} value={p.sigla}>
                {p.name} ({p.sigla})
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 12, color: '#444' }}>
          Comune
          <select
            value={selectedComune}
            onChange={onSelectComune}
            style={{
              display: 'block',
              width: '100%',
              marginTop: 4,
              padding: 8,
              borderRadius: 6,
              border: '1px solid #ccc',
              fontSize: 13,
            }}
          >
            <option value="">— Seleziona —</option>
            {comuniFiltered.map((c) => (
              <option key={`${c.prov}-${c.name}`} value={c.name}>
                {c.name} {c.prov ? `(${c.prov})` : ''}
              </option>
            ))}
          </select>
        </label>
        {highlightFeature && (
          <div
            style={{
              fontSize: 11,
              color: '#555',
              borderTop: '1px solid #eee',
              paddingTop: 8,
              marginTop: 4,
            }}
          >
            Confine evidenziato (deck.gl)
          </div>
        )}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 12,
          right: 12,
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          background: 'rgba(255,255,255,0.95)',
          padding: 14,
          borderRadius: 10,
          boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
          minWidth: 260,
          maxWidth: 320,
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>
          Statistiche e preview API
        </h3>
        {stats ? (
          <>
            <div style={{ fontSize: 12, color: '#333' }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>
                {stats.nome} {stats.sigla ? `(${stats.sigla})` : stats.provincia ? `— ${stats.provincia}` : ''}
              </div>
              {stats.tipo === 'comune' && stats.provincia && (
                <div style={{ color: '#555' }}>Provincia: {stats.provincia}</div>
              )}
              {stats.areaKm2 != null && (
                <div>Area: {stats.areaKm2.toFixed(2)} km²</div>
              )}
              {stats.tipo === 'provincia' && stats.nComuni != null && (
                <div>Comuni: {stats.nComuni}</div>
              )}
            </div>
            <label style={{ fontSize: 12, color: '#444' }}>
              Raggio ricerca (km)
              <input
                type="number"
                min={API_RADIUS_KM_MIN}
                max={API_RADIUS_KM_MAX}
                step={0.1}
                value={searchRadiusKm}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!Number.isNaN(v)) {
                    setSearchRadiusKm(Math.max(API_RADIUS_KM_MIN, Math.min(API_RADIUS_KM_MAX, v)));
                    setGridCircles([]);
                    setGridCenters([]);
                  }
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  marginTop: 4,
                  padding: 8,
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  fontSize: 13,
                }}
              />
              <span style={{ fontSize: 10, color: '#888', display: 'block', marginTop: 2 }}>
                Limite API Realestate: 50 m – 20 km
              </span>
            </label>
            {stats.cerchi != null && (
              <>
                <div style={{ fontSize: 12, padding: 8, background: '#f0f7ff', borderRadius: 6, border: '1px solid #cce' }}>
                  <strong>Stima cerchi/chiamate API</strong> per coprire l’area selezionata: <strong>{stats.cerchi}</strong>
                </div>
                <p style={{ fontSize: 10, color: '#888', margin: '2px 0 0', fontStyle: 'italic' }}>
                  Con raggio limitato (50 m – 20 km) possono restare piccoli fori di copertura.
                </p>
                <div style={{ fontSize: 11, padding: 8, background: '#fff8e1', borderRadius: 6, border: '1px solid #ffcc02' }}>
                  <strong>Stima costi API</strong> (Compravendite RMV — <a href={RMV_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#1565c0' }}>openapi.it</a>)
                  <div style={{ marginTop: 6 }}>
                    <div>Ricarica singola: <strong>{stats.cerchi * RMV_SINGOLA_EUR} €</strong> + IVA ({stats.cerchi} × {RMV_SINGOLA_EUR} €)</div>
                    {(() => {
                      const tier = RMV_ABBONAMENTI.find((t) => t.chiamate >= stats.cerchi) || RMV_ABBONAMENTI[RMV_ABBONAMENTI.length - 1];
                      const tot = (stats.cerchi * tier.prezzoUnitario).toFixed(2);
                      return (
                        <div style={{ marginTop: 4 }}>
                          Abbonamento consigliato ({tier.chiamate} chiamate/anno): <strong>{tot} €</strong> + IVA ({stats.cerchi} × {tier.prezzoUnitario} €/chiamata)
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </>
            )}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                disabled={!highlightFeature}
                onClick={() => {
                  const grid = highlightFeature ? getCircleGrid(highlightFeature, searchRadiusKm) : null;
                  if (grid) {
                    setGridCircles(grid.circleFeatures);
                    setGridCenters(grid.centers);
                  }
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: 12,
                  borderRadius: 6,
                  border: '1px solid #2e7d32',
                  background: highlightFeature ? '#e8f5e9' : '#f5f5f5',
                  color: highlightFeature ? '#1b5e20' : '#999',
                  cursor: highlightFeature ? 'pointer' : 'default',
                }}
              >
                Genera griglia cerchi
              </button>
              {gridCircles.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => { setGridCircles([]); setGridCenters([]); }}
                    style={{
                      padding: '8px 12px',
                      fontSize: 12,
                      borderRadius: 6,
                      border: '1px solid #ccc',
                      background: '#fff',
                      cursor: 'pointer',
                    }}
                  >
                    Togli griglia
                  </button>
                  <span style={{ fontSize: 12, alignSelf: 'center' }}>
                    Centri: {gridCircles.length}
                  </span>
                </>
              )}
            </div>
            {gridCircles.length > 0 && (
              <>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 11, color: '#555', display: 'block', marginBottom: 4 }}>Tipo immobile (ricerca API)</label>
                  <select
                    value={propertyType}
                    onChange={(e) => setPropertyType(e.target.value)}
                    style={{ width: '100%', padding: '6px 8px', fontSize: 12, borderRadius: 6, border: '1px solid #ccc' }}
                  >
                    {RMV_PROPERTY_TYPES.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const payload = gridCenters.map(([lng, lat]) => ({ longitude: lng, latitude: lat }));
                    const text = JSON.stringify(payload, null, 2);
                    navigator.clipboard.writeText(text).then(() => alert('Centri copiati negli appunti. Usa search_radius (metri): ' + Math.round(searchRadiusKm * 1000)));
                  }}
                  style={{
                    padding: '6px 10px',
                    fontSize: 11,
                    borderRadius: 6,
                    border: '1px solid #1976d2',
                    background: '#e3f2fd',
                    color: '#1565c0',
                    cursor: 'pointer',
                  }}
                >
                  Copia centri (lat/lng per API)
                </button>
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={async () => {
                    setSaveResult(null);
                    setIsSaving(true);
                    try {
                      const centers = gridCenters.map(([lng, lat]) => ({ longitude: lng, latitude: lat }));
                      const search_radius_m = Math.round(searchRadiusKm * 1000);
                      const area = stats?.nome || 'Mappa';
                      const res = await fetch('/api/salva-griglia', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ centers, search_radius_m, area, property_type: propertyType }),
                      });
                      const data = await res.json().catch(() => ({}));
                      setSaveResult(data);
                    } catch (err) {
                      setSaveResult({ success: false, message: err.message || 'Errore di rete' });
                    } finally {
                      setIsSaving(false);
                    }
                  }}
                  style={{
                    padding: '8px 12px',
                    fontSize: 12,
                    borderRadius: 6,
                    border: '1px solid #2e7d32',
                    background: isSaving ? '#c8e6c9' : '#e8f5e9',
                    color: '#1b5e20',
                    cursor: isSaving ? 'wait' : 'pointer',
                  }}
                >
                  {isSaving ? 'Ricerca in corso…' : 'Cerca e salva in Google Sheet'}
                </button>
                {isSaving && (
                  <p style={{ fontSize: 11, color: '#666', margin: '4px 0 0' }}>Per aree grandi può richiedere alcuni minuti.</p>
                )}
              </>
            )}
            {saveResult && (
              <div style={{ marginTop: 8, padding: 8, borderRadius: 6, fontSize: 12, background: saveResult.success ? '#e8f5e9' : '#ffebee', color: saveResult.success ? '#1b5e20' : '#c62828' }}>
                {saveResult.success ? (
                  <>
                    <p style={{ margin: '0 0 6px' }}>{saveResult.message || 'Salvato.'} Chiamate: {saveResult.numChiamate ?? '—'}, Compravendite: {saveResult.numCompravendite ?? '—'}.</p>
                    {GOOGLE_SHEET_URL && (
                      <a href={GOOGLE_SHEET_URL} target="_blank" rel="noopener noreferrer" style={{ color: '#1b5e20', fontWeight: 'bold' }}>
                        Apri Google Sheet
                      </a>
                    )}
                  </>
                ) : (
                  <p style={{ margin: 0 }}>{saveResult.message || 'Errore'}</p>
                )}
              </div>
            )}
          </>
        ) : (
          <p style={{ fontSize: 12, color: '#666', margin: 0 }}>
            Seleziona una provincia o un comune per vedere statistiche e stima cerchi.
          </p>
        )}
        <div style={{ borderTop: '1px solid #eee', paddingTop: 8, marginTop: 4 }}>
          <div style={{ fontSize: 11, color: '#555', marginBottom: 4 }}>Cerchio di ricerca (anteprima)</div>
          <button
            type="button"
            onClick={() => setSearchCenter(null)}
            style={{
              padding: '6px 10px',
              fontSize: 12,
              borderRadius: 6,
              border: '1px solid #ccc',
              background: '#f5f5f5',
              cursor: 'pointer',
            }}
          >
            Togli cerchio
          </button>
          <p style={{ fontSize: 11, color: '#666', margin: '6px 0 0', marginBottom: 0 }}>
            Clicca sulla mappa per posizionare il centro del cerchio.
          </p>
        </div>
      </div>

      <Map
        ref={mapRef}
        {...viewState}
        onMove={(ev) => setViewState(ev.viewState)}
        onClick={(ev) => {
          if (ev.lngLat) setSearchCenter([ev.lngLat.lng, ev.lngLat.lat]);
        }}
        onLoad={onMapLoad}
        style={{ width: '100%', height: '100%' }}
        mapStyle={MAP_STYLE}
        mapLibreLogo
      />
    </div>
  );
}
