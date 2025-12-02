import { loadHanabusTimeTable, loadKamiizumiTimeTable, loadKentyouminamiTimeTable, loadNahakoukouTimeTable, NahaTimeIndex } from './nahaTime';

export type GTFSData = {
  stops: any[];
  stopTimes: any[];
  trips: any[];
  routes: any[];
};

let nahaDataCache: GTFSData | null = null;
let nahaExtrasLoaded = false;
let nahaHanabusTimeCache: NahaTimeIndex | null = null;
let nahaKamiizumiTimeCache: NahaTimeIndex | null = null;
let nahaKentyouminamiTimeCache: NahaTimeIndex | null = null;
let nahaNahakoukouTimeCache: NahaTimeIndex | null = null;

const resolvePublicUrl = (relativePath: string) => {
  if (typeof window !== 'undefined') {
    return relativePath;
  }

  const explicitBase = process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (explicitBase) {
    try {
      return new URL(relativePath, explicitBase).toString();
    } catch {
      // fall through
    }
  }

  const vercelUrl = process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelUrl) {
    try {
      const origin = vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`;
      return new URL(relativePath, origin).toString();
    } catch {
      // fall through
    }
  }

  return new URL(relativePath, 'http://localhost:3000').toString();
};

const fetchText = async (relativePath: string) => {
  try {
    const response = await fetch(resolvePublicUrl(relativePath));
    if (!response.ok) return null;
    return await response.text();
  } catch {
    return null;
  }
};

const fetchJson = async (relativePath: string) => {
  const text = await fetchText(relativePath);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

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

export function getHanabusTimeTable(): NahaTimeIndex {
  if (!nahaHanabusTimeCache) {
    try {
      nahaHanabusTimeCache = loadHanabusTimeTable();
    } catch {
      nahaHanabusTimeCache = {};
    }
  }
  return nahaHanabusTimeCache;
}

export function getKamiizumiTimeTable(): NahaTimeIndex {
  if (!nahaKamiizumiTimeCache) {
    try {
      nahaKamiizumiTimeCache = loadKamiizumiTimeTable();
    } catch {
      nahaKamiizumiTimeCache = {};
    }
  }
  return nahaKamiizumiTimeCache;
}

export function getKentyouminamiTimeTable(): NahaTimeIndex {
  if (!nahaKentyouminamiTimeCache) {
    try {
      nahaKentyouminamiTimeCache = loadKentyouminamiTimeTable();
    } catch {
      nahaKentyouminamiTimeCache = {};
    }
  }
  return nahaKentyouminamiTimeCache;
}

export function getNahakoukouTimeTable(): NahaTimeIndex {
  if (!nahaNahakoukouTimeCache) {
    try {
      nahaNahakoukouTimeCache = loadNahakoukouTimeTable();
    } catch {
      nahaNahakoukouTimeCache = {};
    }
  }
  return nahaNahakoukouTimeCache;
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

      const descriptor = {
        shortName: route.summary?.text || `${sourceKey} route`,
        longName: route.summary?.text || `${sourceKey} route`,
        headsign: route.summary?.text || `${sourceKey} route`,
      };

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

      const addStopByIndex = async (idx: number | undefined, times?: { arrival?: string; departure?: string }) => {
        if (typeof idx !== 'number' || idx < 0 || idx >= stopsArray.length) return;
        const stopObj = stopsArray[idx] || {};
        const sidRaw = (stopObj.sid ?? stopObj.stop_id ?? '').toString().trim();
        const fallbackId = sidRaw
          ? `naha_${sidRaw}`
          : `naha_extra_stop_${sourceKey}_${routeIdx + 1}_${stopSequence}`;
        const stopNameRaw = (stopObj.name ?? stopObj.stop_name ?? fallbackId).toString().trim() || fallbackId;

        if (!existingStopIds.has(fallbackId)) {
          gtfs.stops.push({
            stop_id: fallbackId,
            stop_name: stopNameRaw,
            stop_lat: '',
            stop_lon: '',
            stop_code: '',
            stop_desc: stopNameRaw,
          });
          existingStopIds.add(fallbackId);
        }

        const arrival = normalizeTimeString(times?.arrival);
        const departure = normalizeTimeString(times?.departure) || arrival || '';

        gtfs.stopTimes.push({
          trip_id: tripId,
          stop_id: fallbackId,
          stop_sequence: stopSequence.toString(),
          arrival_time: arrival || '',
          departure_time: departure || '',
        });
        stopSequence++;
      };

      for (let i = 0; i < busIndices.length; i++) {
        await addStopByIndex(busIndices[i]);
      }
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
        await processStructuredRoutes(parsed, sourceKey);
        console.info(`[GTFS] Processed structured routes from ${extraPath}`);
        anyLoaded = true;
        continue;
      }

      if (Array.isArray(parsed)) {
        console.info(`[GTFS] Skipping realtime array payload from ${extraPath} (handled elsewhere)`);
        continue;
      }
    }
  } catch (err) {
    console.warn('[GTFS] Error while loading Naha extra routes:', err);
  } finally {
    if (anyLoaded) {
      nahaExtrasLoaded = true;
    }
  }
}

export async function loadNahaData(): Promise<GTFSData> {
  if (nahaDataCache) return nahaDataCache;
  const allData: any[] = [];
  const nahaSources = ['nahabus.json', 'kokutai.json', '112up.json', '7.json', '7up.json', '55.json', '75.json', '24up.json', '446up.json', '120.json', '120down.json', '446.json', '21.json', '21up.json', '21down.json', 'kakazu.json', '112.json'];

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

    nahaData.forEach(busData => {
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
          agency_id: 'naha_bus',
        });
        processedRoutes.add(routeId);
      }

      trips.push({
        trip_id: tripId,
        route_id: routeId,
        service_id: 'naha_service',
        trip_headsign: busData.Daiya.Course?.Group?.YukisakiName || routeName,
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
            stop_desc: schedule?.Station?.ShortName || stopName || stopId,
          });
          processedStops.add(stopId);
        }

        stopTimes.push({
          trip_id: tripId,
          stop_id: stopId,
          stop_sequence: String(schedule?.OrderNo || stopTimes.length + 1),
          arrival_time: schedule?.ScheduledTime?.Value || '',
          departure_time: schedule?.StartTime?.Value || '',
        });
      });
    });

    return { stops, stopTimes, trips, routes };
  };

  const gtfs = convertNahaToGTFS(allData);
  try {
    await appendNahaExtraRoutes(gtfs);
  } catch {
    // ignore
  }

  // 那覇BT (Sid=5019101) の公式時刻表を反映
  try {
    const hanabus = getHanabusTimeTable();
    const stationStopId = 'naha_5019101';

    const routeIdByKeito: Record<string, string> = {};
    for (const route of gtfs.routes) {
      const id = route?.route_id as string | undefined;
      const short = route?.route_short_name as string | undefined;
      if (!id || !short) continue;
      if (id.startsWith('naha_')) {
        routeIdByKeito[short] = id;
      }
    }

    for (const routeNo of Object.keys(hanabus)) {
      const timesByCal = hanabus[routeNo];
      const routeId = routeIdByKeito[routeNo];
      if (!routeId) continue;

      for (const calKey of Object.keys(timesByCal)) {
        const records = timesByCal[calKey];
        for (const rec of records) {
          const targetTime = rec.time;
          if (!targetTime) continue;

          const hhmmss = `${targetTime}:00`;

          for (const trip of gtfs.trips) {
            if (trip.route_id !== routeId) continue;
            const tripId = trip.trip_id;
            const st = gtfs.stopTimes.find(
              t => t.trip_id === tripId && t.stop_id === stationStopId,
            );
            if (!st) continue;
            st.departure_time = hhmmss;
            st.arrival_time = hhmmss;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 上泉 (Sid=1020000) の公式時刻表を反映
  try {
    const kamiizumi = getKamiizumiTimeTable();
    const stationStopId = 'naha_1020000';

    const routeIdByKeito: Record<string, string> = {};
    for (const route of gtfs.routes) {
      const id = route?.route_id as string | undefined;
      const short = route?.route_short_name as string | undefined;
      if (!id || !short) continue;
      if (id.startsWith('naha_')) {
        routeIdByKeito[short] = id;
      }
    }

    for (const routeNo of Object.keys(kamiizumi)) {
      const timesByCal = kamiizumi[routeNo];
      const routeId = routeIdByKeito[routeNo];
      if (!routeId) continue;

      for (const calKey of Object.keys(timesByCal)) {
        const records = timesByCal[calKey];
        for (const rec of records) {
          const targetTime = rec.time;
          if (!targetTime) continue;

          const hhmmss = `${targetTime}:00`;

          for (const trip of gtfs.trips) {
            if (trip.route_id !== routeId) continue;
            const tripId = trip.trip_id;
            const st = gtfs.stopTimes.find(
              t => t.trip_id === tripId && t.stop_id === stationStopId,
            );
            if (!st) continue;
            st.departure_time = hhmmss;
            st.arrival_time = hhmmss;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 県庁南口 (Sid=1010000) の公式時刻表を反映
  try {
    const kentyouminami = getKentyouminamiTimeTable();
    const stationStopId = 'naha_1010000';

    const routeIdByKeito: Record<string, string> = {};
    for (const route of gtfs.routes) {
      const id = route?.route_id as string | undefined;
      const short = route?.route_short_name as string | undefined;
      if (!id || !short) continue;
      if (id.startsWith('naha_')) {
        routeIdByKeito[short] = id;
      }
    }

    for (const routeNo of Object.keys(kentyouminami)) {
      const timesByCal = kentyouminami[routeNo];
      const routeId = routeIdByKeito[routeNo];
      if (!routeId) continue;

      for (const calKey of Object.keys(timesByCal)) {
        const records = timesByCal[calKey];
        for (const rec of records) {
          const targetTime = rec.time;
          if (!targetTime) continue;

          const hhmmss = `${targetTime}:00`;

          for (const trip of gtfs.trips) {
            if (trip.route_id !== routeId) continue;
            const tripId = trip.trip_id;
            const st = gtfs.stopTimes.find(
              t => t.trip_id === tripId && t.stop_id === stationStopId,
            );
            if (!st) continue;
            st.departure_time = hhmmss;
            st.arrival_time = hhmmss;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 那覇高校前 (Sid 不明: stationSid が null のため、時間だけ利用)
  // route_short_name に対応する routeNo ごとに、那覇高校前に最も近い那覇系停留所の時刻として上書きする
  try {
    const nahakoukou = getNahakoukouTimeTable();

    // 系統番号 -> route_id
    const routeIdByKeito: Record<string, string> = {};
    for (const route of gtfs.routes) {
      const id = route?.route_id as string | undefined;
      const short = route?.route_short_name as string | undefined;
      if (!id || !short) continue;
      if (id.startsWith('naha_')) {
        routeIdByKeito[short] = id;
      }
    }

    for (const routeNo of Object.keys(nahakoukou)) {
      const timesByCal = nahakoukou[routeNo];
      const routeId = routeIdByKeito[routeNo];
      if (!routeId) continue;

      for (const calKey of Object.keys(timesByCal)) {
        const records = timesByCal[calKey];
        for (const rec of records) {
          const targetTime = rec.time;
          if (!targetTime) continue;

          const hhmmss = `${targetTime}:00`;

          for (const trip of gtfs.trips) {
            if (trip.route_id !== routeId) continue;
            const tripId = trip.trip_id;

            // 仮に、この系統の最初の那覇停留所の時刻を「那覇高校前」とみなして上書き
            const st = gtfs.stopTimes.find(
              t => t.trip_id === tripId && typeof t.stop_id === 'string' && t.stop_id.startsWith('naha_'),
            );
            if (!st) continue;
            st.departure_time = hhmmss;
            st.arrival_time = hhmmss;
          }
        }
      }
    }
  } catch {
    // ignore
  }

  nahaDataCache = gtfs;
  return gtfs;
}
