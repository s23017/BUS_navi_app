// GTFS data loader utilities extracted from search page.
// Exports: loadStops, loadStopTimes, loadTrips, loadRoutes

export type GTFSData = {
  stops: any[];
  stopTimes: any[];
  trips: any[];
  routes: any[];
};

let stopsCache: any[] | null = null;
let stopTimesCache: any[] | null = null;
let tripsCache: any[] | null = null;
let routesCache: any[] | null = null;
let nahaDataCache: GTFSData | null = null;
let stopMasterCache: any[] | null = null;
let nahaExtrasLoaded = false;

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

function normalizeTimeString(time: string | undefined | null): string | undefined {
  if (!time) return undefined;
  const cleaned = time.replace(/[^0-9:]/g, '').trim();
  if (!cleaned) return undefined;
  const match = cleaned.match(/^([0-9]{1,2}):([0-9]{2})(?::([0-9]{2}))?$/);
  if (!match) return undefined;
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  const seconds = (match[3] || '00').padStart(2, '0');
  return `${hours}:${minutes}:${seconds}`;
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

async function appendNahaExtraRoutes(gtfs: GTFSData) {
  if (nahaExtrasLoaded) return;

  const extraFiles = [
    '21.json',
    '21up.json',
    '21down.json',
    'kakazu.json',
    '112.json',
    '112up.json',
    '112_raw.json',
    '112iti.json',
    '7.json',
    '7up.json',
    '55.json',
    '75.json',
    '120.json',
    '120down.json',
    '446.json',
    '446up.json',
    '24.json',
    '24up.json',
  ];

  const existingStopIds = new Set(gtfs.stops.map(stop => stop.stop_id));
  const existingRouteIds = new Set(gtfs.routes.map(route => route.route_id));
  const existingTripIds = new Set(gtfs.trips.map(trip => trip.trip_id));

  const processStructuredRoutes = async (data: any, sourceKey: string) => {
    if (!data || !Array.isArray(data.routes)) return;

    for (let routeIdx = 0; routeIdx < data.routes.length; routeIdx++) {
      const route = data.routes[routeIdx];
      if (!route) continue;

      const stopsArray: any[] = Array.isArray(route.stops) ? route.stops : [];
      const busIndices = stopsArray.reduce((acc: number[], stop: any, idx: number) => {
        const type = (stop?.type || stop?.mode || '').toString().toLowerCase();
        if (!type || type === 'bus') acc.push(idx);
        return acc;
      }, [] as number[]);
      if (busIndices.length === 0) continue;

      const busSegments = Array.isArray(route.legs)
        ? route.legs.filter((leg: any) => (leg?.mode || '').toString().toLowerCase() === 'bus')
        : [];

      const descriptor = parseRouteDescriptor(
        busSegments[0]?.description || route.summary?.text || `${sourceKey} route`
      );
      const keitouSid = Array.isArray(route.keitouSids)
        ? route.keitouSids.find((sid: string) => sid && sid.trim().length > 0)
        : undefined;
      const courseSid = Array.isArray(route.courseSids)
        ? route.courseSids.find((sid: string) => sid && sid.trim().length > 0)
        : undefined;

      const routeId = keitouSid
        ? `naha_extra_${keitouSid}`
        : `naha_extra_${sourceKey}_${routeIdx + 1}`;
      const tripId = courseSid
        ? `naha_extra_trip_${courseSid}`
        : `${routeId}_trip_${routeIdx + 1}`;

      if (!existingRouteIds.has(routeId)) {
        gtfs.routes.push({
          route_id: routeId,
          route_short_name: descriptor.shortName,
          route_long_name: descriptor.longName,
          route_type: 3,
          agency_id: 'naha_bus',
        });
        existingRouteIds.add(routeId);
      }

      if (!existingTripIds.has(tripId)) {
        gtfs.trips.push({
          trip_id: tripId,
          route_id: routeId,
          service_id: 'naha_service',
          trip_headsign: descriptor.headsign,
        });
        existingTripIds.add(tripId);
      }

      let stopSequence = 1;
      let busIndexPointer = 0;

      const addStopByIndex = async (idx: number | undefined, times?: { arrival?: string; departure?: string }) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= stopsArray.length) return;
        const stopObj = stopsArray[idx] || {};
        const sidRaw = (stopObj.sid ?? stopObj.stop_id ?? '').toString().trim();
        const fallbackId = sidRaw
          ? `naha_${sidRaw}`
          : `naha_extra_stop_${sourceKey}_${routeIdx + 1}_${stopSequence}`;
        const stopNameRaw = (stopObj.name ?? stopObj.stop_name ?? fallbackId).toString().trim() || fallbackId;
        const latParsed = parseFloat((stopObj.lat ?? stopObj.stop_lat ?? '').toString().trim());
        const lonParsed = parseFloat((stopObj.lon ?? stopObj.stop_lon ?? '').toString().trim());

        const resolved = await resolveStopIdentity({
          sid: sidRaw,
          name: stopNameRaw,
          lat: Number.isFinite(latParsed) ? latParsed : undefined,
          lon: Number.isFinite(lonParsed) ? lonParsed : undefined,
          fallbackId,
          stopCode: (stopObj.stop_code || stopObj.teiryujyoCd || '').toString().trim() || undefined,
        });

        const arrival = normalizeTimeString(times?.arrival);
        const departure = normalizeTimeString(times?.departure) || arrival || '';

        if (!existingStopIds.has(resolved.stopId)) {
          gtfs.stops.push({
            stop_id: resolved.stopId,
            stop_name: resolved.stopName,
            stop_lat: resolved.stopLat.toString(),
            stop_lon: resolved.stopLon.toString(),
            stop_code: resolved.stopCode || '',
            stop_desc: (stopObj.furigana ?? stopObj.stop_desc ?? resolved.stopName).toString(),
          });
          existingStopIds.add(resolved.stopId);
        }

        gtfs.stopTimes.push({
          trip_id: tripId,
          stop_id: resolved.stopId,
          stop_sequence: stopSequence.toString(),
          arrival_time: arrival || '',
          departure_time: departure || '',
        });
        stopSequence++;
      };

      for (const segment of busSegments) {
        const startIdx = busIndices[busIndexPointer];
        const endIdx = busIndices[busIndexPointer + 1] ?? startIdx;
        busIndexPointer += 2;

        await addStopByIndex(startIdx, { arrival: segment.departure, departure: segment.departure });
        if (endIdx !== startIdx) {
          await addStopByIndex(endIdx, { arrival: segment.arrival, departure: segment.arrival });
        }
      }

      for (; busIndexPointer < busIndices.length; busIndexPointer++) {
        await addStopByIndex(busIndices[busIndexPointer]);
      }
    }
  };

  const processHtmlRoutes = async (htmlString: string, sourceKey: string) => {
    if (!htmlString || typeof DOMParser === 'undefined') return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlString, 'text/html');
    if (!doc) return;

    let routeIndex = 1;
    while (true) {
      const nameInput = doc.getElementById(`_hdnName${routeIndex}`) as HTMLInputElement | null;
      if (!nameInput) break;

      const typeInput = doc.getElementById(`_hdnType${routeIndex}`) as HTMLInputElement | null;
      const sidInput = doc.getElementById(`_hdnSID${routeIndex}`) as HTMLInputElement | null;
      const latInput = doc.getElementById(`_hdnLat${routeIndex}`) as HTMLInputElement | null;
      const lonInput = doc.getElementById(`_hdnLon${routeIndex}`) as HTMLInputElement | null;

      if (!typeInput || !sidInput || !latInput || !lonInput) {
        routeIndex++;
        continue;
      }

      const names = splitCsv(nameInput.value);
      const types = splitCsv(typeInput.value.toLowerCase());
      const sids = splitCsv(sidInput.value);
      const latStrings = splitCsv(latInput.value);
      const lonStrings = splitCsv(lonInput.value);

      const busIndices = types.reduce((acc: number[], type: string, idx: number) => {
        if (type === 'bus') acc.push(idx);
        return acc;
      }, [] as number[]);

      if (busIndices.length === 0) {
        routeIndex++;
        continue;
      }

      const routeDiv = doc.getElementById(`_divRosen${routeIndex}`) as HTMLElement | null;
      const busSegments = extractBusSegments(routeDiv);
      if (busSegments.length === 0) {
        routeIndex++;
        continue;
      }

      const courseSidInput = doc.getElementById(`_hdnCourseSid${routeIndex}`) as HTMLInputElement | null;
      const keitouSidInput = doc.getElementById(`_hdnKeitouSid${routeIndex}`) as HTMLInputElement | null;
      const courseSid = splitCsv(courseSidInput?.value)[0];
      const keitouSid = splitCsv(keitouSidInput?.value)[0];

      const descriptor = parseRouteDescriptor(busSegments[0].description);
      const routeId = keitouSid
        ? `naha_extra_${keitouSid}`
        : `naha_extra_${sourceKey}_${routeIndex}`;
      const tripId = courseSid
        ? `naha_extra_trip_${courseSid}`
        : `naha_extra_trip_${sourceKey}_${routeIndex}`;

      if (!existingRouteIds.has(routeId)) {
        gtfs.routes.push({
          route_id: routeId,
          route_short_name: descriptor.shortName,
          route_long_name: descriptor.longName,
          route_type: 3,
          agency_id: 'naha_bus',
        });
        existingRouteIds.add(routeId);
      }

      if (!existingTripIds.has(tripId)) {
        gtfs.trips.push({
          trip_id: tripId,
          route_id: routeId,
          service_id: 'naha_service',
          trip_headsign: descriptor.headsign,
        });
        existingTripIds.add(tripId);
      }

      let stopSequence = 1;
      let busIndexPointer = 0;

      const addStopByIndex = async (stopIdx: number | undefined, times?: { arrival?: string; departure?: string }) => {
        if (typeof stopIdx !== 'number' || stopIdx < 0 || stopIdx >= names.length) return;
        const sidRaw = (sids[stopIdx] || '').trim();
        const fallbackId = sidRaw
          ? `naha_${sidRaw}`
          : `naha_extra_stop_${sourceKey}_${routeIndex}_${stopSequence}`;
        const stopName = (names[stopIdx] || fallbackId).trim() || fallbackId;
        const latParsed = parseFloat((latStrings[stopIdx] || '').trim());
        const lonParsed = parseFloat((lonStrings[stopIdx] || '').trim());

        const resolved = await resolveStopIdentity({
          sid: sidRaw,
          name: stopName,
          lat: Number.isFinite(latParsed) ? latParsed : undefined,
          lon: Number.isFinite(lonParsed) ? lonParsed : undefined,
          fallbackId,
          stopCode: sidRaw || undefined,
        });

        if (!existingStopIds.has(resolved.stopId)) {
          gtfs.stops.push({
            stop_id: resolved.stopId,
            stop_name: resolved.stopName,
            stop_lat: resolved.stopLat.toString(),
            stop_lon: resolved.stopLon.toString(),
            stop_code: resolved.stopCode || '',
            stop_desc: resolved.stopName,
          });
          existingStopIds.add(resolved.stopId);
        }

        const arrival = normalizeTimeString(times?.arrival);
        const departure = normalizeTimeString(times?.departure) || arrival || '';
        gtfs.stopTimes.push({
          trip_id: tripId,
          stop_id: resolved.stopId,
          stop_sequence: stopSequence.toString(),
          arrival_time: arrival || '',
          departure_time: departure || '',
        });
        stopSequence++;
      };

      for (const segment of busSegments) {
        const startIdx = busIndices[busIndexPointer];
        const endIdx = busIndices[busIndexPointer + 1] ?? startIdx;
        busIndexPointer += 2;

        await addStopByIndex(startIdx, { arrival: segment.departure, departure: segment.departure });
        if (endIdx !== startIdx) {
          await addStopByIndex(endIdx, { arrival: segment.arrival, departure: segment.arrival });
        }
      }

      for (; busIndexPointer < busIndices.length; busIndexPointer++) {
        const idx = busIndices[busIndexPointer];
        await addStopByIndex(idx);
      }
      routeIndex++;
    }
  };

  let anyLoaded = false;
  try {
    for (const file of extraFiles) {
      const extraPath = `/naha/${file}`;
      console.info(`[GTFS] Fetching Naha extra structured route: ${extraPath}`);
      const text = await fetchText(extraPath);
      if (!text || text.trim().length === 0) {
        console.warn(`[GTFS] Empty response when fetching ${extraPath}`);
        continue;
      }

      let parsed: any = null;
      try {
        parsed = JSON.parse(text);
      } catch (err) {
        console.warn(`[GTFS] Failed to parse JSON from ${extraPath}:`, err);
        parsed = null;
      }

      const sourceKey = file.replace(/\.json$/i, '');

      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.routes)) {
        const derivedKeys = deriveSourceKeys(sourceKey);
        for (const key of derivedKeys) {
          await processStructuredRoutes(parsed, key);
        }
        console.info(`[GTFS] Processed structured routes from ${extraPath}`);
        anyLoaded = true;
        continue;
      }

      if (typeof parsed === 'string') {
        await processHtmlRoutes(parsed, sourceKey);
        console.info(`[GTFS] Processed HTML routes from ${extraPath}`);
        anyLoaded = true;
        continue;
      }

      if (Array.isArray(parsed)) {
        // リアルタイム配列は loadNahaData 側で GTFS 変換済みなのでここでは重複処理しない
        console.info(`[GTFS] Skipping realtime array payload from ${extraPath} (handled elsewhere)`);
        continue;
      }

      await processHtmlRoutes(text, sourceKey);
      console.info(`[GTFS] Processed fallback HTML routes from ${extraPath}`);
      anyLoaded = true;
    }
  } catch (err) {
    console.warn('[GTFS] Error while loading Naha extra routes:', err);
  } finally {
    if (anyLoaded) {
      nahaExtrasLoaded = true;
    }
  }
}

async function loadNahaData(): Promise<GTFSData> {
  if (nahaDataCache) return nahaDataCache;
  const allData: any[] = [];
  const nahaSources = ['nahabus.json', 'kokutai.json', '112up.json', '7.json', '7up.json'];

  for (const source of nahaSources) {
    const sourcePath = `/naha/${source}`;
    console.info(`[GTFS] Fetching Naha realtime source: ${sourcePath}`);
    const payload = await fetchJson(sourcePath);
    if (!payload) {
      console.warn(`[GTFS] Failed to fetch or parse ${sourcePath}`);
      continue;
    }
    if (Array.isArray(payload)) {
      allData.push(...payload);
      console.info(`[GTFS] Loaded ${payload.length} entries from ${sourcePath}`);
    } else {
      console.info(`[GTFS] ${sourcePath} payload is not an array (skipping realtime merge)`);
    }
  }

  const convertNahaToGTFS = (nahaData: any[]): GTFSData => {
    const stops: any[] = [];
    const stopTimes: any[] = [];
    const trips: any[] = [];
    const routes: any[] = [];
    const processedStops = new Set<string>();
    const processedRoutes = new Set<string>();

    nahaData.forEach((busData) => {
      if (!busData?.Daiya || !busData.Daiya.PassedSchedules) return;
      const routeId = `naha_${busData.Daiya.Course?.Keitou?.KeitouNo || 'unknown'}`;
      const tripId = `naha_trip_${busData.Daiya.SID}`;
      const routeName = busData.Daiya.Course?.Name || routeId;
      const routeShortName = busData.Daiya.Course?.Keitou?.KeitouNo || routeId;

      if (!processedRoutes.has(routeId)) {
        routes.push({
          route_id: routeId,
          route_short_name: routeShortName,
          route_long_name: routeName,
          route_type: 3,
          agency_id: 'naha_bus'
        });
        processedRoutes.add(routeId);
      }

      trips.push({
        trip_id: tripId,
        route_id: routeId,
        service_id: 'naha_service',
        trip_headsign: busData.Daiya.Course?.Group?.YukisakiName || routeName
      });

      busData.Daiya.PassedSchedules.forEach((schedule: any) => {
        const stopId = `naha_${schedule?.Station?.Sid}`;
        const stopName = schedule?.Station?.Name || stopId;
        if (!processedStops.has(stopId)) {
          let lat: number = 26.2125;
          let lon: number = 127.6811;
          const rawLat = parseFloat(schedule?.Station?.Position?.Latitude);
          const rawLon = parseFloat(schedule?.Station?.Position?.Longitude);
          if (!Number.isNaN(rawLat) && !Number.isNaN(rawLon)) {
            if (rawLat > 1000000) {
              lat = rawLat / 1000000;
              lon = rawLon / 1000000;
            } else if (rawLat > 100000) {
              lat = rawLat / 100000;
              lon = rawLon / 100000;
            } else if (rawLat > 10000) {
              lat = rawLat / 10000;
              lon = rawLon / 10000;
            } else {
              lat = rawLat;
              lon = rawLon;
            }
            if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
              if (rawLat > 2400000) {
                lat = rawLat / 1000000;
                lon = rawLon / 1000000;
              }
              if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
                lat = 26.2125;
                lon = 127.6811;
              }
            }
          }
          stops.push({
            stop_id: stopId,
            stop_name: stopName,
            stop_lat: lat.toString(),
            stop_lon: lon.toString(),
            stop_code: schedule?.Station?.RenbanCd || '',
            stop_desc: schedule?.Station?.ShortName || stopName || stopId
          });
          processedStops.add(stopId);
        }

        stopTimes.push({
          trip_id: tripId,
          stop_id: stopId,
          stop_sequence: String(schedule?.OrderNo || stopTimes.length + 1),
          arrival_time: schedule?.ScheduledTime?.Value || '',
          departure_time: schedule?.StartTime?.Value || ''
        });
      });
    });

    return { stops, stopTimes, trips, routes };
  };

  const gtfs = convertNahaToGTFS(allData);
  try {
    await appendNahaExtraRoutes(gtfs);
  } catch (err) {
    // ignore
  }
  nahaDataCache = gtfs;
  return gtfs;
}

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
  masterStops.forEach(stop => {
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
