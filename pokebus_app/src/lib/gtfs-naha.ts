import { loadHanabusTimeTable, loadKamiizumiTimeTable, loadKentyouminamiTimeTable, loadNahakoukouTimeTable, loadKainanTimeTable, loadYogijuuziroTimeTable, loadGinowankoukouTimeTable, NahaTimeIndex } from './nahaTime';

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
let nahaKainanTimeCache: NahaTimeIndex | null = null;
let nahaYogijuuziroTimeCache: NahaTimeIndex | null = null;
let nahaGinowankoukouTimeCache: NahaTimeIndex | null = null;

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

export function getKainanTimeTable(): NahaTimeIndex {
  if (!nahaKainanTimeCache) {
    try {
      nahaKainanTimeCache = loadKainanTimeTable();
    } catch {
      nahaKainanTimeCache = {};
    }
  }
  return nahaKainanTimeCache;
}

export function getYogijuuziroTimeTable(): NahaTimeIndex {
  if (!nahaYogijuuziroTimeCache) {
    try {
      nahaYogijuuziroTimeCache = loadYogijuuziroTimeTable();
    } catch {
      nahaYogijuuziroTimeCache = {};
    }
  }
  return nahaYogijuuziroTimeCache;
}

export function getGinowankoukouTimeTable(): NahaTimeIndex {
  if (!nahaGinowankoukouTimeCache) {
    try {
      nahaGinowankoukouTimeCache = loadGinowankoukouTimeTable();
    } catch {
      nahaGinowankoukouTimeCache = {};
    }
  }
  return nahaGinowankoukouTimeCache;
}

type NahaTimeRecord = {
  stationSid?: string;
  stopName?: string;
  routeNo?: string;
  courseSid?: string;
  tripSid?: string;
  calendar?: string;
  time?: string;
  parentCompanyCode?: string;
};

type NahaTimeIndexByStation = Record<string, Record<string, Record<string, NahaTimeRecord[]>>>;

function buildNahaTimeIndexByStation(index: NahaTimeIndex): NahaTimeIndexByStation {
  const byStation: NahaTimeIndexByStation = {};

  for (const routeNo of Object.keys(index)) {
    const byCal = index[routeNo];
    for (const cal of Object.keys(byCal)) {
      const records = byCal[cal] as NahaTimeRecord[];
      for (const rec of records) {
        const sid = rec.stationSid;
        if (!sid) continue;
        if (!byStation[sid]) byStation[sid] = {};
        if (!byStation[sid][routeNo]) byStation[sid][routeNo] = {};
        if (!byStation[sid][routeNo][cal]) byStation[sid][routeNo][cal] = [];
        byStation[sid][routeNo][cal].push(rec);
      }
    }
  }

  return byStation;
}

function normalizeStopName(name: string | undefined | null): string {
  if (!name) return '';
  let s = name.toString();
  s = s.replace(/[\s　]+/g, '');
  s = s.replace(/（.*?）/g, '').replace(/\(.*?\)/g, '');
  return s;
}

function findNahaStopIdByName(gtfs: GTFSData, stopName: string | undefined | null): string | undefined {
  const target = normalizeStopName(stopName);
  if (!target) return undefined;

  const candidates: string[] = [];
  for (const stop of gtfs.stops) {
    const id = stop?.stop_id as string | undefined;
    if (!id || typeof id !== 'string') continue;
    if (!id.startsWith('naha_')) continue;
    const name = stop?.stop_name as string | undefined;
    const norm = normalizeStopName(name);
    if (!norm) continue;
    if (norm === target) {
      candidates.push(id);
    }
  }

  if (candidates.length === 1) return candidates[0];
  return undefined;
}

function buildRouteIdByKeito(gtfs: GTFSData): Record<string, string> {
  const map: Record<string, string> = {};
  for (const route of gtfs.routes) {
    const id = route?.route_id as string | undefined;
    const short = route?.route_short_name as string | undefined;
    if (!id || !short) continue;
    if (id.startsWith('naha_') || id.startsWith('naha_extra_')) {
      map[short] = id;
    }
  }
  return map;
}

function applyNahaTimeToStation(
  gtfs: GTFSData,
  nahaIndex: NahaTimeIndex,
  stationSid: string,
  options?: {
    routeFilter?: (routeNo: string) => boolean;
    allowFallbackFirstNahaStop?: boolean;
  },
): void {
  const byStation = buildNahaTimeIndexByStation(nahaIndex);
  const routeIdByKeito = buildRouteIdByKeito(gtfs);

  const stationStopId = stationSid && stationSid !== 'dummy' ? `naha_${stationSid}` : undefined;

  for (const routeNo of Object.keys(nahaIndex)) {
    if (options?.routeFilter && !options.routeFilter(routeNo)) continue;
    const routeId = routeIdByKeito[routeNo];
    if (!routeId) continue;

    const byCal = byStation[stationSid]?.[routeNo] ?? {};
    for (const cal of Object.keys(byCal)) {
      const records = byCal[cal];
      for (const rec of records) {
        const targetTime = rec.time;
        if (!targetTime) continue;
        const hhmmss = `${targetTime}:00`;

        for (const trip of gtfs.trips) {
          if (trip.route_id !== routeId) continue;
          const tripId = trip.trip_id;

          let resolvedStopId: string | undefined = stationStopId;
          if (!resolvedStopId) {
            resolvedStopId = findNahaStopIdByName(gtfs, rec.stopName);
          }

          let st = resolvedStopId
            ? gtfs.stopTimes.find(
                t => t.trip_id === tripId && t.stop_id === resolvedStopId,
              )
            : undefined;

          if (!st && options?.allowFallbackFirstNahaStop) {
            st = gtfs.stopTimes.find(
              t => t.trip_id === tripId && typeof t.stop_id === 'string' && t.stop_id.startsWith('naha_'),
            );
          }

          if (!st) continue;
          st.departure_time = hhmmss;
          st.arrival_time = hhmmss;
        }
      }
    }
  }
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

      const keitouNo = route?.Course?.Keitou?.KeitouNo
        ? route.Course.Keitou.KeitouNo.toString().trim()
        : sourceKey.match(/^(\d+)/)?.[1];

      const descriptor = {
        shortName: keitouNo || route.summary?.text || `${sourceKey} route`,
        longName: route.summary?.text || `${sourceKey} route`,
        headsign: route.summary?.text || `${sourceKey} route`,
      };

      const keitouSid = Array.isArray(route.keitouSids)
        ? route.keitouSids.find((sid: string) => sid && sid.trim().length > 0)
        : undefined;
      const courseSid = Array.isArray(route.courseSids)
        ? route.courseSids.find((sid: string) => sid && sid.trim().length > 0)
        : undefined;

      const routeId = keitouNo
        ? `naha_extra_${keitouNo}`
        : keitouSid
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
        const existingStopId = (stopObj.stop_id ?? stopObj.stopId ?? '').toString().trim();
        const sidRaw = (stopObj.sid ?? '').toString().trim();
        const fallbackId = existingStopId
          || (sidRaw ? `naha_${sidRaw}` : `naha_extra_stop_${sourceKey}_${routeIdx + 1}_${stopSequence}`);
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

async function loadMergedNahaTimeIndex(): Promise<NahaTimeIndex | null> {
  const data = (await fetchJson('/naha_time_index_all.json')) as NahaTimeIndex | null;
  if (!data || typeof data !== 'object') return null;
  return data;
}

type TimeRecord113 = {
  stationSid?: string;
  stopName?: string;
  routeNo?: string;
  courseSid?: string;
  tripSid?: string;
  calendar?: string;
  time?: string;
  parentCompanyCode?: string;
};

type TimeIndex113 = {
  [routeNo: string]: {
    [calendar: string]: TimeRecord113[];
  };
};

async function load113TimeIndex(): Promise<TimeIndex113 | null> {
  const data = (await fetchJson('/time_index_113_all.json')) as TimeIndex113 | null;
  if (!data || typeof data !== 'object') return null;
  return data;
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

  // 全 naha_time_index_all を使って那覇系 stop_times を一括で上書き
  try {
    const mergedIndex = await loadMergedNahaTimeIndex();
    if (mergedIndex) {
      const routeIdByKeito = buildRouteIdByKeito(gtfs);

      for (const routeNo of Object.keys(mergedIndex)) {
        const routeId = routeIdByKeito[routeNo];
        if (!routeId) continue;

        const byCal = mergedIndex[routeNo] || {};
        for (const cal of Object.keys(byCal)) {
          const records = byCal[cal] as NahaTimeRecord[];
          for (const rec of records) {
            const targetTime = rec.time;
            if (!targetTime) continue;
            const hhmmss = `${targetTime}:00`;

            let resolvedStopId: string | undefined;
            if (rec.stationSid) {
              resolvedStopId = `naha_${rec.stationSid}`;
            } else {
              resolvedStopId = findNahaStopIdByName(gtfs, rec.stopName);
            }
            if (!resolvedStopId) continue;

            for (const trip of gtfs.trips) {
              if (trip.route_id !== routeId) continue;
              const tripId = trip.trip_id;
              const st = gtfs.stopTimes.find(
                t => t.trip_id === tripId && t.stop_id === resolvedStopId,
              );
              if (!st) continue;
              st.departure_time = hhmmss;
              st.arrival_time = hhmmss;
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // 113 系統の time_index_113_all を使って stop_times を上書き
  try {
    const idx113 = await load113TimeIndex();
    if (idx113) {
      const routeIdByKeito = buildRouteIdByKeito(gtfs);

      for (const routeNo of Object.keys(idx113)) {
        const routeId = routeIdByKeito[routeNo];
        if (!routeId) continue;

        const byCal = idx113[routeNo] || {};
        for (const cal of Object.keys(byCal)) {
          const records = byCal[cal] as TimeRecord113[];
          for (const rec of records) {
            const targetTime = rec.time;
            if (!targetTime) continue;
            const hhmmss = `${targetTime}:00`;

            let resolvedStopId: string | undefined;
            if (rec.stationSid) {
              resolvedStopId = `naha_${rec.stationSid}`;
            } else {
              resolvedStopId = findNahaStopIdByName(gtfs, rec.stopName);
            }
            if (!resolvedStopId) continue;

            for (const trip of gtfs.trips) {
              if (trip.route_id !== routeId) continue;
              const tripId = trip.trip_id;
              const st = gtfs.stopTimes.find(
                t => t.trip_id === tripId && t.stop_id === resolvedStopId,
              );
              if (!st) continue;
              st.departure_time = hhmmss;
              st.arrival_time = hhmmss;
            }
          }
        }
      }
    }
  } catch {
    // ignore
  }

  // naha_time を使って、那覇系停留所の時刻を公式時刻表で上書きする
  try {
    // 那覇BT (Sid=5019101)
    applyNahaTimeToStation(gtfs, getHanabusTimeTable(), '5019101');

    // 上泉 (Sid=1020000)
    applyNahaTimeToStation(gtfs, getKamiizumiTimeTable(), '1020000');

    // 県庁南口 (Sid=1010000)
    applyNahaTimeToStation(gtfs, getKentyouminamiTimeTable(), '1010000');

    // 与儀十字路（古島向け）(Sid=40800200)
    applyNahaTimeToStation(gtfs, getYogijuuziroTimeTable(), '40800200');

    // 宜野湾高校前 (Sid は naha_time 側の stationSid を利用)
    applyNahaTimeToStation(gtfs, getGinowankoukouTimeTable(), '40810300');

    // 那覇高校前・開南は stationSid がないため、
    // それぞれの系統の最初の那覇停留所に対して時刻を当てる形を維持する
    applyNahaTimeToStation(gtfs, getNahakoukouTimeTable(), 'dummy', {
      allowFallbackFirstNahaStop: true,
    });
    applyNahaTimeToStation(gtfs, getKainanTimeTable(), 'dummy', {
      allowFallbackFirstNahaStop: true,
    });
  } catch {
    // ignore
  }

  nahaDataCache = gtfs;
  return gtfs;
}
