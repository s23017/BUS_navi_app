const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'public');
const OUTPUT_PATH = path.join(ROOT, 'okinawa_stops_master.json');

function parseCsv(text) {
  const rows = [];
  let current = '';
  let insideQuotes = false;
  const buffer = [];
  const pushField = () => {
    buffer.push(current.replace(/^\ufeff/, ''));
    current = '';
  };
  const pushRow = () => {
    if (!buffer.length) return;
    rows.push(buffer.splice(0));
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (char === '"') {
      if (insideQuotes && text[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === ',' && !insideQuotes) {
      pushField();
    } else if ((char === '\n' || char === '\r') && !insideQuotes) {
      if (char === '\r' && text[i + 1] === '\n') {
        i += 1;
      }
      pushField();
      pushRow();
    } else {
      current += char;
    }
  }
  if (current.length || buffer.length) {
    pushField();
    pushRow();
  }
  if (!rows.length) return [];
  const header = rows[0].map(cell => cell.trim());
  return rows.slice(1).filter(row => row.length).map(row => {
    const record = {};
    header.forEach((key, idx) => {
      const cell = row[idx] ?? '';
      record[key] = String(cell).trim();
    });
    return record;
  });
}

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  if (typeof value === 'string' && value.trim().length) {
    const num = parseFloat(value.trim());
    return Number.isFinite(num) ? num : NaN;
  }
  return NaN;
}

function inOkinawaBounds(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= 24 && lat <= 28 && lon >= 122 && lon <= 133;
}

function isFallbackLocation(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
  const fallbackLat = 26.2125;
  const fallbackLon = 127.6811;
  return Math.abs(lat - fallbackLat) < 0.0005 && Math.abs(lon - fallbackLon) < 0.0005;
}

function normaliseName(value) {
  return typeof value === 'string' ? value.trim() : '';
}

const master = new Map();

function addStop({ stop_id, stop_name, stop_lat, stop_lon }, source, alias) {
  if (!stop_id) return;
  const latNum = toNumber(stop_lat);
  const lonNum = toNumber(stop_lon);
  const hasValidCoords = inOkinawaBounds(latNum, lonNum);

  if (!master.has(stop_id)) {
    master.set(stop_id, {
      stop_id,
      name: normaliseName(stop_name) || stop_id,
      lat: hasValidCoords ? latNum : null,
      lon: hasValidCoords ? lonNum : null,
      aliases: new Set(alias && alias !== stop_name ? [alias] : []),
      sources: new Set(source ? [source] : [])
    });
    return;
  }

  const record = master.get(stop_id);
  if (source) record.sources.add(source);
  const aliasName = normaliseName(alias || stop_name);
  const primaryName = normaliseName(stop_name);
  if (primaryName && primaryName !== record.name) {
    record.aliases.add(primaryName);
    if (!record.name || record.name === stop_id) {
      record.name = primaryName;
    }
  }
  if (aliasName && aliasName !== record.name) {
    record.aliases.add(aliasName);
  }

  const currentLat = record.lat;
  const currentLon = record.lon;
  const currentValid = inOkinawaBounds(currentLat, currentLon);
  const currentFallback = isFallbackLocation(currentLat, currentLon);

  if (hasValidCoords) {
    if (!currentValid || currentFallback) {
      record.lat = latNum;
      record.lon = lonNum;
    }
  }
}

function loadStopsCsvFromDir(dirName) {
  const stopsPath = path.join(ROOT, dirName, 'stops.txt');
  if (!fs.existsSync(stopsPath)) return;
  const csv = fs.readFileSync(stopsPath, 'utf8');
  const records = parseCsv(csv);
  records.forEach(record => addStop(record, dirName, record.stop_name));
}

function incorporateStructuredStops(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Failed to read ${filePath}`, error);
    return;
  }
  if (!raw.trim()) return;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`Skipping ${filePath}: not valid JSON`);
    return;
  }
  if (!parsed || !Array.isArray(parsed.routes)) return;

  parsed.routes.forEach(route => {
    if (!route || !Array.isArray(route.stops)) return;
    route.stops.forEach(stop => {
      if (!stop) return;
      const name = normaliseName(stop.name);
      const rawSid = normaliseName(stop.sid);
      const lat = stop.lat;
      const lon = stop.lon;
      const stopIdBase = rawSid || hashString(`${name}|${lat}|${lon}`);
      const stop_id = rawSid ? `naha_${rawSid}` : `naha_extra_stop_${stopIdBase}`;
      addStop({ stop_id, stop_name: name, stop_lat: lat, stop_lon: lon }, path.basename(filePath), name);
    });
  });
}

function normalizeNahaPosition(position) {
  if (!position) return { lat: null, lon: null };
  const rawLat = toNumber(position.Latitude ?? position.latitude);
  const rawLon = toNumber(position.Longitude ?? position.longitude);
  if (!Number.isFinite(rawLat) || !Number.isFinite(rawLon)) {
    return { lat: null, lon: null };
  }

  const candidates = [];
  const adic = toNumber(position.AdicNumber ?? position.adicNumber);
  if (adic === 3) {
    candidates.push({ lat: rawLat / 60000, lon: rawLon / 60000 });
  }

  const scales = [1, 10, 60, 600, 1000, 10000, 60000, 100000, 1000000];
  scales.forEach(scale => {
    candidates.push({ lat: rawLat / scale, lon: rawLon / scale });
  });

  for (const candidate of candidates) {
    const lat = candidate.lat;
    const lon = candidate.lon;
    if (inOkinawaBounds(lat, lon)) {
      return { lat, lon };
    }
  }

  return { lat: null, lon: null };
}

function incorporateNahaTimetable(filePath) {
  if (!fs.existsSync(filePath)) return;
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    console.error(`Failed to read ${filePath}`, error);
    return;
  }

  if (!raw.trim()) return;

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.warn(`Skipping ${filePath}: not valid JSON`);
    return;
  }

  const dataArray = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.DaiyaList) ? parsed.DaiyaList : [];
  if (!Array.isArray(dataArray) || dataArray.length === 0) return;

  dataArray.forEach(entry => {
    const schedules = entry?.Daiya?.PassedSchedules;
    if (!Array.isArray(schedules)) return;

    schedules.forEach(schedule => {
      const station = schedule?.Station;
      if (!station) return;
      const sidRaw = station.Sid || station.sid || '';
      if (!sidRaw) return;
      const stopId = `naha_${sidRaw}`;
      const stopName = normaliseName(station.Name || station.ShortName || station.Yomigana || sidRaw);
      const alias = normaliseName(station.ShortName || station.Name || station.Yomigana || '');

      const position = station.Position || {};
      const { lat, lon } = normalizeNahaPosition(position);

      const finalLat = Number.isFinite(lat) ? lat : (Number.isFinite(toNumber(station?.Latitude)) ? toNumber(station.Latitude) : null);
      const finalLon = Number.isFinite(lon) ? lon : (Number.isFinite(toNumber(station?.Longitude)) ? toNumber(station.Longitude) : null);

      if (!Number.isFinite(finalLat) || !Number.isFinite(finalLon)) {
        return;
      }

      addStop({
        stop_id: stopId,
        stop_name: stopName || sidRaw,
        stop_lat: finalLat,
        stop_lon: finalLon
      }, path.basename(filePath), alias);
    });
  });
}

function buildMaster() {
  const entries = fs.readdirSync(ROOT, { withFileTypes: true });
  entries.forEach(entry => {
    if (!entry.isDirectory()) return;
    const name = entry.name;
    if (name.startsWith('.')) return;
    const stopsPath = path.join(ROOT, name, 'stops.txt');
    if (fs.existsSync(stopsPath)) {
      loadStopsCsvFromDir(name);
    }
  });

  const structuredFiles = ['21.json', '21up.json', '21down.json', 'kakazu.json'];
  structuredFiles.forEach(fileName => {
    const filePath = path.join(ROOT, 'naha', fileName);
    incorporateStructuredStops(filePath);
  });

  const nahaTimetableFiles = ['kokutai.json', 'nahabus.json'];
  nahaTimetableFiles.forEach(fileName => {
    const filePath = path.join(ROOT, 'naha', fileName);
    incorporateNahaTimetable(filePath);
  });

  const result = Array.from(master.values()).map(record => {
    const lat = Number.isFinite(record.lat) ? Number(record.lat.toFixed(6)) : null;
    const lon = Number.isFinite(record.lon) ? Number(record.lon.toFixed(6)) : null;
    return {
      stop_id: record.stop_id,
      stop_name: record.name,
      stop_lat: lat,
      stop_lon: lon,
      aliases: Array.from(record.aliases).filter(Boolean).sort(),
      sources: Array.from(record.sources).filter(Boolean).sort()
    };
  }).sort((a, b) => a.stop_name.localeCompare(b.stop_name, 'ja'));

  const payload = {
    generatedAt: new Date().toISOString(),
    stopCount: result.length,
    stops: result
  };

  fs.writeFileSync(OUTPUT_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Generated ${OUTPUT_PATH} (${result.length} stops)`);
}

buildMaster();
