// GTFS data loader utilities extracted from search page.
// Exports: loadStops, loadStopTimes, loadTrips, loadRoutes

import { loadNahaData } from './gtfs-naha';

let stopsCache: any[] | null = null;
let stopTimesCache: any[] | null = null;
let tripsCache: any[] | null = null;
let routesCache: any[] | null = null;
let stopMasterCache: any[] | null = null;

const resolvePublicUrl = (relativePath: string) => {
  if (typeof window !== 'undefined') {
    return relativePath;
  }

  const explicitBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicitBase) {
    try {
      return new URL(relativePath, explicitBase).toString();
    } catch (error) {
      // fall through to other fallbacks
    }
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelUrl) {
    try {
      const origin = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
      return new URL(relativePath, origin).toString();
    } catch (error) {
      // fall through to localhost fallback
    }
  }

  return new URL(relativePath, 'http://localhost:3000').toString();
};

const fetchText = async (relativePath: string) => {
  try {
    const response = await fetch(resolvePublicUrl(relativePath));
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    return null;
  }
};

const fetchJson = async (relativePath: string) => {
  const text = await fetchText(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    return null;
  }
};

function splitCsv(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);
}

function parseRouteDescriptor(raw: string | undefined) {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim();
  if (!cleaned) {
    return { shortName: 'naha-route', longName: 'naha route', headsign: 'naha route' };
  }
  const parts = cleaned.split('・').map(part => part.trim()).filter(Boolean);
  const shortName = parts.find(part => /線/.test(part)) || cleaned;
  const headsign = parts.length > 0 ? parts[parts.length - 1] : shortName;
  return {
    shortName,
    longName: cleaned,
    headsign: headsign || shortName,
  };
}

function parseCsv(txt: string) {
  const lines = txt.trim().split(/\r?\n/);
  const header = lines[0].split(',');
  return lines.slice(1).map(line => {
    const cols = line.split(',');
    const obj: any = {};
    header.forEach((h, i) => (obj[h] = cols[i]));
    return obj;
  });
}

type BaseStopEntry = {
  stop_id: string;
  stop_name: string;
  stop_lat: number;
  stop_lon: number;
  stop_code?: string;
};

let baseStopIndex: Map<string, BaseStopEntry[]> | null = null;
let baseStopAliasIndex: Map<string, BaseStopEntry[]> | null = null;
let baseStopList: BaseStopEntry[] | null = null;

const normaliseStopKey = (value: string | undefined | null) => {
  if (!value) return '';
  return value
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[　]/g, '')
    .toLowerCase();
};

async function ensureBaseStopIndex() {
  if (baseStopIndex && baseStopAliasIndex && baseStopList) return baseStopIndex;

  const map = new Map<string, BaseStopEntry[]>();
  const aliasMap = new Map<string, BaseStopEntry[]>();
  const list: BaseStopEntry[] = [];
  const seen = new Set<string>();
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];

  for (const company of companies) {
    try {
      const text = await fetchText(`/${company}/stops.txt`);
      if (!text) continue;
      const parsed = parseCsv(text);
      parsed.forEach(stop => {
        const stopId = (stop.stop_id || '').trim();
        const stopName = (stop.stop_name || '').trim();
        if (!stopId || !stopName) return;
        const latNum = parseFloat((stop.stop_lat || stop.stop_latitude || '').toString());
        const lonNum = parseFloat((stop.stop_lon || stop.stop_longitude || '').toString());
        if (!Number.isFinite(latNum) || !Number.isFinite(lonNum)) return;
        const entry: BaseStopEntry = {
          stop_id: stopId,
          stop_name: stopName,
          stop_lat: latNum,
          stop_lon: lonNum,
          stop_code: (stop.stop_code || '').trim() || undefined,
        };

        if (!seen.has(stopId)) {
          list.push(entry);
          seen.add(stopId);
        }

        const key = normaliseStopKey(stopName);
        if (!key) return;
        const bucket = map.get(key) || [];
        bucket.push(entry);
        map.set(key, bucket);

        const rawAliases = (stop.aliases || '').toString();
        const aliasList = rawAliases
          ? rawAliases.split(/\s+/).map((tok: string) => tok.trim()).filter(Boolean)
          : [];
        aliasList.forEach((alias: string) => {
          const aliasKey = normaliseStopKey(alias);
          if (!aliasKey) return;
          const aliasBucket = aliasMap.get(aliasKey) || [];
          aliasBucket.push(entry);
          aliasMap.set(aliasKey, aliasBucket);
        });
      });
    } catch (error) {
      // ignore individual company failures
    }
  }

  baseStopIndex = map;
  baseStopAliasIndex = aliasMap;
  baseStopList = list;
  return map;
}

const computeDistanceScore = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return Math.abs(dLat) + Math.abs(dLon);
};

const findBestBaseStop = (name: string, lat?: number, lon?: number): BaseStopEntry | null => {
  if (!baseStopIndex) return null;
  const key = normaliseStopKey(name);
  const candidateMap = new Map<string, BaseStopEntry>();
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  const addCandidates = (entries?: BaseStopEntry[]) => {
    if (!entries) return;
    entries.forEach(entry => {
      if (entry) candidateMap.set(entry.stop_id, entry);
    });
  };

  if (key) {
    addCandidates(baseStopIndex?.get(key));
    addCandidates(baseStopAliasIndex?.get(key));
  }

  let best: BaseStopEntry | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  const consider = (entry: BaseStopEntry) => {
    if (!entry) return;
    if (!hasCoords) {
      if (!best) best = entry;
      return;
    }
    const score = computeDistanceScore(entry.stop_lat, entry.stop_lon, lat as number, lon as number);
    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  };

  candidateMap.forEach(consider);

  if (!best && hasCoords && Array.isArray(baseStopList)) {
    baseStopList.forEach(consider);
  }

  if (!best) return null;
  if (hasCoords && bestScore > 0.02) return null;
  return best;
};

const deriveSourceKeys = (sourceKey: string): string[] => {
  if (!sourceKey) return [sourceKey];
  const keys = [sourceKey];
  const lower = sourceKey.toLowerCase();
  if (lower === '112') {
    keys.push('112down');
  } else if (lower === '7') {
    keys.push('7down');
  }
  return keys;
};

type ResolvedStop = {
  stopId: string;
  stopName: string;
  stopLat: number;
  stopLon: number;
  stopCode?: string;
};

const resolvedStopCache = new Map<string, ResolvedStop>();

const normalizeNahaLatLon = (latRaw: any, lonRaw: any) => {
  const fallback = { lat: 26.2125, lon: 127.6811 };
  const latNumRaw = parseFloat(latRaw);
  const lonNumRaw = parseFloat(lonRaw);
  if (Number.isNaN(latNumRaw) || Number.isNaN(lonNumRaw)) {
    return fallback;
  }

  let lat = latNumRaw;
  let lon = lonNumRaw;

  if (latNumRaw > 1000000) {
    lat = latNumRaw / 1000000;
    lon = lonNumRaw / 1000000;
  } else if (latNumRaw > 100000) {
    lat = latNumRaw / 100000;
    lon = lonNumRaw / 100000;
  } else if (latNumRaw > 10000) {
    lat = latNumRaw / 10000;
    lon = lonNumRaw / 10000;
  }

  if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
    if (latNumRaw > 2400000) {
      lat = latNumRaw / 1000000;
      lon = lonNumRaw / 1000000;
    }
    if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
      return fallback;
    }
  }

  return { lat, lon };
};

const resolveStopIdentity = async (input: {
  sid?: string;
  name?: string;
  lat?: number;
  lon?: number;
  fallbackId: string;
  stopCode?: string;
}): Promise<ResolvedStop> => {
  const cacheKey = [
    input.sid || '',
    input.name || '',
    Number.isFinite(input.lat) ? (input.lat as number).toFixed(6) : '',
    Number.isFinite(input.lon) ? (input.lon as number).toFixed(6) : ''
  ].join('|');

  if (resolvedStopCache.has(cacheKey)) {
    return resolvedStopCache.get(cacheKey)!;
  }

  await ensureBaseStopIndex();
  const safeName = (input.name || '').trim() || input.fallbackId;
  let lat = Number.isFinite(input.lat) ? (input.lat as number) : undefined;
  let lon = Number.isFinite(input.lon) ? (input.lon as number) : undefined;
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    const normalized = normalizeNahaLatLon(lat, lon);
    lat = normalized.lat;
    lon = normalized.lon;
  }
  const baseMatch = findBestBaseStop(safeName, lat, lon);

  const resolved: ResolvedStop = {
    stopId: baseMatch?.stop_id || input.fallbackId,
    stopName: baseMatch?.stop_name || safeName,
    stopLat: baseMatch?.stop_lat ?? (Number.isFinite(lat) ? (lat as number) : 26.2125),
    stopLon: baseMatch?.stop_lon ?? (Number.isFinite(lon) ? (lon as number) : 127.6811),
    stopCode: baseMatch?.stop_code || input.stopCode,
  };

  resolvedStopCache.set(cacheKey, resolved);
  return resolved;
};

function extractBusSegments(routeDiv: HTMLElement | null) {
  if (!routeDiv) return [] as { departure: string; arrival: string; description: string }[];
  const rows = Array.from(routeDiv.querySelectorAll('tr')) as HTMLTableRowElement[];
  const segments: { departure: string; arrival: string; description: string }[] = [];
  rows.forEach(row => {
    const cells = Array.from(row.querySelectorAll('td')) as HTMLTableCellElement[];
    if (cells.length !== 4) return;
    const departureRaw = cells[0].textContent?.trim() || '';
    const arrivalRaw = cells[1].textContent?.trim() || '';
    const description = cells[3].textContent?.trim() || '';
    if (!departureRaw || !arrivalRaw || !description) return;
    if (/発時刻|着時刻|運賃|系統名/.test(departureRaw)) return;
    if (description.includes('徒歩')) return;
    segments.push({ departure: departureRaw, arrival: arrivalRaw, description });
  });
  return segments;
}

// Naha-specific extra routes and naha_time integration moved to gtfs-naha.ts

function normaliseMasterStops(stops: any[]) {
  return stops.map(stop => {
    const latNum = typeof stop.stop_lat === 'number' ? stop.stop_lat : parseFloat(stop.stop_lat || '');
    const lonNum = typeof stop.stop_lon === 'number' ? stop.stop_lon : parseFloat(stop.stop_lon || '');
    return {
      ...stop,
      stop_lat: Number.isFinite(latNum) ? latNum.toFixed(6) : '',
      stop_lon: Number.isFinite(lonNum) ? lonNum.toFixed(6) : '',
    };
  });
}

export async function loadStopMasterData() {
  if (stopMasterCache) return stopMasterCache;

  const toNumber = (value: any) => {
    if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
    if (typeof value === 'string') {
      const num = parseFloat(value);
      return Number.isFinite(num) ? num : NaN;
    }
    return NaN;
  };

  const inOkinawaBounds = (lat: number, lon: number) => lat >= 24 && lat <= 27 && lon >= 122 && lon <= 132;
  const isFallbackLocation = (lat: number, lon: number) => {
    const fallbackLat = 26.2125;
    const fallbackLon = 127.6811;
    return Math.abs(lat - fallbackLat) < 0.0005 && Math.abs(lon - fallbackLon) < 0.0005;
  };

  const toArray = (value: any) => {
    if (Array.isArray(value)) return value.filter(Boolean);
    if (value === undefined || value === null || value === '') return [];
    return [value];
  };

  const mergeStop = (map: Map<string, any>, incomingStop: any, sourceTag?: string) => {
    if (!incomingStop || !incomingStop.stop_id) return;

    const candidate = { ...incomingStop };
    const latNum = toNumber(candidate.stop_lat ?? candidate.lat);
    const lonNum = toNumber(candidate.stop_lon ?? candidate.lon);
    const hasCoords = Number.isFinite(latNum) && Number.isFinite(lonNum);

    if (hasCoords) {
      candidate.stop_lat = latNum;
      candidate.stop_lon = lonNum;
    }

    candidate.aliases = toArray(candidate.aliases);
    const candidateSources = new Set(toArray(candidate.sources));
    if (sourceTag) candidateSources.add(sourceTag);
    candidate.sources = Array.from(candidateSources);

    const existing = map.get(candidate.stop_id);
    if (!existing) {
      if (!hasCoords) return;
      map.set(candidate.stop_id, candidate);
      return;
    }

    if (hasCoords) {
      const currentLat = toNumber(existing.stop_lat);
      const currentLon = toNumber(existing.stop_lon);
      const upgrade = (!Number.isFinite(currentLat) || !Number.isFinite(currentLon))
        || !inOkinawaBounds(currentLat, currentLon)
        || (isFallbackLocation(currentLat, currentLon) && inOkinawaBounds(latNum, lonNum) && !isFallbackLocation(latNum, lonNum));
      if (upgrade) {
        existing.stop_lat = latNum;
        existing.stop_lon = lonNum;
      }
    }

    if (candidate.stop_name && (!existing.stop_name || existing.stop_name === existing.stop_id)) {
      existing.stop_name = candidate.stop_name;
    }

    if (candidate.stop_desc && (!existing.stop_desc || existing.stop_desc === existing.stop_id)) {
      existing.stop_desc = candidate.stop_desc;
    }

    const mergedAliases = new Set([...toArray(existing.aliases), ...candidate.aliases]);
    existing.aliases = Array.from(mergedAliases);

    const mergedSources = new Set([...toArray(existing.sources), ...candidate.sources]);
    if (sourceTag) mergedSources.add(sourceTag);
    existing.sources = Array.from(mergedSources);

    if (!existing.stop_code && candidate.stop_code) {
      existing.stop_code = candidate.stop_code;
    }
  };

  const stopMap = new Map<string, any>();
  let baseStops: any[] = [];

  const masterPayload = await fetchJson('/okinawa_stops_master.json');
  if (masterPayload && Array.isArray(masterPayload.stops)) {
    baseStops = masterPayload.stops;
  }

  baseStops.forEach(stop => mergeStop(stopMap, stop));

  try {
    const nahaData = await loadNahaData();
    if (nahaData && Array.isArray(nahaData.stops)) {
      nahaData.stops.forEach(stop => {
        const aliases = [] as string[];
        if (stop.stop_desc && stop.stop_desc !== stop.stop_name) {
          aliases.push(stop.stop_desc);
        }
        mergeStop(stopMap, {
          stop_id: stop.stop_id,
          stop_name: stop.stop_name || stop.stop_id,
          stop_lat: stop.stop_lat,
          stop_lon: stop.stop_lon,
          stop_code: stop.stop_code || stop.stop_id,
          stop_desc: stop.stop_desc || stop.stop_name || stop.stop_id,
          aliases,
          sources: ['naha_feed']
        }, 'naha_feed');
      });
    }
  } catch (error) {
    // ignore
  }

  stopMasterCache = normaliseMasterStops(Array.from(stopMap.values()));
  return stopMasterCache;
}

export async function loadStops() {
  if (stopsCache) return stopsCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];
  const merged: any[] = [];
  const seen = new Map<string, any>();

  const masterStops = await loadStopMasterData();
  masterStops.forEach((stop: any) => {
    if (stop?.stop_id && !seen.has(stop.stop_id)) {
      seen.set(stop.stop_id, stop);
      merged.push(stop);
    }
  });

  for (const company of companies) {
    const text = await fetchText(`/${company}/stops.txt`);
    if (!text) continue;
    const parsed = parseCsv(text);
    parsed.forEach(stop => {
      if (!stop?.stop_id) return;
      if (!seen.has(stop.stop_id)) {
        seen.set(stop.stop_id, stop);
        merged.push(stop);
      }
    });
  }

  try {
    const nahaData = await loadNahaData();
    if (nahaData && Array.isArray(nahaData.stops)) {
      nahaData.stops.forEach(stop => {
        if (!stop?.stop_id) return;
        if (!seen.has(stop.stop_id)) {
          seen.set(stop.stop_id, stop);
          merged.push(stop);
        }
      });
    }
  } catch (error) {
    // ignore
  }

  stopsCache = merged;
  return merged;
}

export async function loadStopTimes() {
  if (stopTimesCache) return stopTimesCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];
  const allStopTimes: any[] = [];

  for (const company of companies) {
    const text = await fetchText(`/${company}/stop_times.txt`);
    if (!text) continue;
    const parsed = parseCsv(text);
    allStopTimes.push(...parsed);
  }

  try {
    const nahaData = await loadNahaData();
    if (nahaData && Array.isArray(nahaData.stopTimes)) {
      allStopTimes.push(...nahaData.stopTimes);
    }
  } catch (error) {
    // ignore
  }

  stopTimesCache = allStopTimes;
  return allStopTimes;
}

export async function loadTrips() {
  if (tripsCache) return tripsCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];
  const allTrips: any[] = [];

  for (const company of companies) {
    const text = await fetchText(`/${company}/trips.txt`);
    if (!text) continue;
    const parsed = parseCsv(text);
    allTrips.push(...parsed);
  }

  try {
    const nahaData = await loadNahaData();
    if (nahaData && Array.isArray(nahaData.trips)) {
      allTrips.push(...nahaData.trips);
    }
  } catch (error) {
    // ignore
  }

  tripsCache = allTrips;
  return allTrips;
}

export async function loadRoutes() {
  if (routesCache) return routesCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];
  const allRoutes: any[] = [];

  for (const company of companies) {
    const text = await fetchText(`/${company}/routes.txt`);
    if (!text) continue;
    const parsed = parseCsv(text);
    allRoutes.push(...parsed);
  }

  try {
    const nahaData = await loadNahaData();
    if (nahaData && Array.isArray(nahaData.routes)) {
      allRoutes.push(...nahaData.routes);
    }
  } catch (error) {
    // ignore
  }

  routesCache = allRoutes;
  return allRoutes;
}
