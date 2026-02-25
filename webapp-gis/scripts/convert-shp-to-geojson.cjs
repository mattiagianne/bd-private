/**
 * Converte gli shapefile ISTAT (Comuni, Province) in GeoJSON WGS84.
 * I .prj sono UTM Zone 32N (metri): viene applicata reproiezione a WGS84 lon/lat.
 * Supporta due livelli: 00_Generale e 01_Dettagliata.
 * Esegui da webapp-gis: npm run convert-gis
 */
const path = require('path');
const fs = require('fs');
const shapefile = require('shapefile');
const proj4 = require('proj4');

const ROOT = path.resolve(__dirname, '../..');
const GIS = path.join(ROOT, 'GIS', 'ISTAT');
const OUT = path.join(ROOT, 'webapp-gis', 'public', 'geojson');

// UTM Zone 32N (WGS84) -> WGS84 lon/lat
const toWgs84 = proj4('EPSG:32632', 'EPSG:4326').forward;

function transformCoord(c) {
  if (Array.isArray(c[0])) return c.map(transformCoord);
  const [x, y] = c;
  if (x == null || y == null) return c;
  if (Math.abs(x) <= 180 && Math.abs(y) <= 90) return c;
  try {
    const out = toWgs84([x, y]);
    return [out[0], out[1], ...c.slice(2)];
  } catch (_) {
    return c;
  }
}

function reprojectGeometry(geom) {
  if (!geom || !geom.coordinates) return geom;
  const g = { type: geom.type, coordinates: transformCoord(geom.coordinates) };
  if (geom.bbox) g.bbox = geom.bbox;
  return g;
}

function reprojectFeature(f) {
  if (!f.geometry) return f;
  return { ...f, geometry: reprojectGeometry(f.geometry) };
}

function reprojectCollection(geojson) {
  if (!geojson || !geojson.features) return geojson;
  return { ...geojson, features: geojson.features.map(reprojectFeature) };
}

const LIVELLI = [
  { id: 'generale', dir: '00_Generale', comuniFolder: 'Com01012025_g', comuniBase: 'Com01012025_g_WGS84', provFolder: 'ProvCM01012025_g', provBase: 'ProvCM01012025_g_WGS84' },
  { id: 'dettagliata', dir: '01_Dettagliata', comuniFolder: 'Com01012025', comuniBase: 'Com01012025_WGS84', provFolder: 'ProvCM01012025', provBase: 'ProvCM01012025_WGS84' },
];

function parseShapefile(dir, baseName) {
  const shpPath = path.join(dir, baseName + '.shp');
  const dbfPath = path.join(dir, baseName + '.dbf');
  if (!fs.existsSync(shpPath) || !fs.existsSync(dbfPath)) {
    console.warn('Skip (file not found):', shpPath);
    return null;
  }
  return new Promise((resolve, reject) => {
    const features = [];
    shapefile.open(shpPath, dbfPath)
      .then(function read(source) {
        return source.read().then(function next(result) {
          if (result.done) {
            resolve({ type: 'FeatureCollection', features });
            return;
          }
          features.push(result.value);
          return source.read().then(next);
        });
      })
      .catch(reject);
  });
}

async function convertLivello(livello) {
  const basePath = path.join(GIS, livello.dir);
  const comuniDir = path.join(basePath, livello.comuniFolder);
  const provDir = path.join(basePath, livello.provFolder);
  const suffix = livello.id === 'generale' ? '_generale' : '_dettagliata';

  console.log('\n---', livello.dir, '---');

  try {
    const comuni = await parseShapefile(comuniDir, livello.comuniBase);
    if (comuni && comuni.features.length) {
      const reprojected = reprojectCollection(comuni);
      const outFile = path.join(OUT, 'comuni' + suffix + '.json');
      fs.writeFileSync(outFile, JSON.stringify(reprojected), 'utf8');
      console.log('Scritto comuni' + suffix + '.json:', reprojected.features.length, 'features');
      if (comuni.features[0].properties) console.log('Campi esempio:', Object.keys(comuni.features[0].properties));
    }
  } catch (e) {
    console.error('Errore comuni', livello.dir, ':', e.message);
  }

  try {
    const province = await parseShapefile(provDir, livello.provBase);
    if (province && province.features.length) {
      const reprojected = reprojectCollection(province);
      const outFile = path.join(OUT, 'province' + suffix + '.json');
      fs.writeFileSync(outFile, JSON.stringify(reprojected), 'utf8');
      console.log('Scritto province' + suffix + '.json:', reprojected.features.length, 'features');
      if (province.features[0].properties) console.log('Campi esempio:', Object.keys(province.features[0].properties));
    }
  } catch (e) {
    console.error('Errore province', livello.dir, ':', e.message);
  }
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });

  for (const livello of LIVELLI) {
    await convertLivello(livello);
  }

  console.log('\nFine. File in', OUT);
}

main();
