// GTFS data loader utilities (moved to project-level lib)
export type GTFSData = { stops: any[]; stopTimes: any[]; trips: any[]; routes: any[] };

let stopsCache: any[] | null = null;
let stopTimesCache: any[] | null = null;
let tripsCache: any[] | null = null;
let routesCache: any[] | null = null;
let nahaDataCache: GTFSData | null = null;
let stopMasterCache: any[] | null = null;

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = '';
  let insideQuotes = false;
  const buffer: string[] = [];
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
    const record: Record<string, string> = {};
    header.forEach((key, idx) => {
      const cell = row[idx] ?? '';
      record[key] = String(cell).trim();
    });
    return record;
  });
}

function splitCsvLoose(value: string) {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').map(part => part.trim());
}

function normalizeTimeString(value: string) {
  if (typeof value !== 'string') return '00:00:00';
  const trimmed = value.trim();
  if (!trimmed) return '00:00:00';
  const parts = trimmed.split(':');
  if (parts.length === 2) {
    const [h, m] = parts;
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:00`;
  }
  if (parts.length === 3) {
    const [h, m, s] = parts;
    return `${h.padStart(2, '0')}:${m.padStart(2, '0')}:${s.padStart(2, '0')}`;
  }
  return '00:00:00';
}

function hashString(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function parseRouteDescriptor(descriptor: string) {
  const fallback = typeof descriptor === 'string' && descriptor ? descriptor : '那覇バス路線';
  const normalized = fallback.normalize('NFKC').replace(/\s+/g, ' ').trim();
  const shortMatch = normalized.match(/([0-9]{1,4})[^0-9]*線/);
  const routeShortName = shortMatch ? shortMatch[1] : '';
  const headsignSource = normalized.split('・').pop() || normalized;
  const headsign = headsignSource.replace(/[※★☆◆◇]/g, '').trim();
  const agencyId = normalized.includes('琉球バス交通') ? 'ryukyu_bus' : normalized.includes('沖縄バス') ? 'okinawa_bus' : 'naha_bus';
  return { routeLongName: normalized, routeShortName, headsign, agencyId };
}

function extractJourneyEndpoints(html: string) {
  const headingMatch = html.match(/「([^」]+)」[\s\S]*?「([^」]+)」/);
  if (!headingMatch) return { start: '', end: '' };
  return { start: headingMatch[1] || '', end: headingMatch[2] || '' };
}

function parseNahaStructuredRoutes(data: any, sourceId: string): GTFSData {
  const empty: GTFSData = { stops: [], stopTimes: [], trips: [], routes: [] };
  if (!data || !Array.isArray(data.routes) || data.routes.length === 0) return empty;

  const result: GTFSData = { stops: [], stopTimes: [], trips: [], routes: [] };
  const seenStops = new Set<string>();
  const seenRoutes = new Set<string>();
  const journey = data.journey || {};
  const journeyStart = typeof journey.start === 'string' ? journey.start.trim() : '';
  const journeyEnd = typeof journey.end === 'string' ? journey.end.trim() : '';
  const busKeyword = /(バス|のりば|停留|沖縄県路線バス|空港|駅|港|高校|営業所)/;

  data.routes.forEach((route: any) => {
    if (!route) return;
    const stops = Array.isArray(route.stops) ? route.stops : [];
    if (stops.length === 0) return;
    const legs = Array.isArray(route.legs) ? route.legs : [];
    const busLeg = legs.find((leg: any) => typeof leg?.mode === 'string' && leg.mode.toLowerCase() === 'bus');
    if (!busLeg || typeof busLeg.description !== 'string' || !busLeg.description.trim()) return;

    const descriptor = busLeg.description.replace(/\s+/g, ' ').trim();
    const routeMeta = parseRouteDescriptor(descriptor);
    const routeKey = `${routeMeta.routeLongName}|${routeMeta.headsign}|${routeMeta.routeShortName}|${routeMeta.agencyId}`;
    const routeId = `naha_extra_${hashString(`${sourceId}|${routeKey}`)}`;

    if (!seenRoutes.has(routeId)) {
      result.routes.push({
        route_id: routeId,
        route_short_name: routeMeta.routeShortName || routeMeta.headsign,
        route_long_name: routeMeta.routeLongName,
        route_type: 3,
        agency_id: routeMeta.agencyId
      });
      seenRoutes.add(routeId);
    }

    const tripIdSeed = `${sourceId}|${route.option || ''}|${routeKey}|${busLeg.departure || ''}|${busLeg.arrival || ''}`;
    const tripId = `naha_trip_${sourceId}_${hashString(tripIdSeed)}`;
    result.trips.push({ trip_id: tripId, route_id: routeId, service_id: 'naha_service', trip_headsign: routeMeta.headsign });

    const candidateIndices: number[] = [];

    stops.forEach((stop: any, index: number) => {
      if (!stop) return;
      const rawName = typeof stop.name === 'string' ? stop.name : '';
      let name = rawName.replace(/\s+/g, ' ').trim();
      const type = typeof stop.type === 'string' ? stop.type.toLowerCase() : '';
      const sidRaw = typeof stop.sid === 'string' ? stop.sid.trim() : '';
      const latRaw = typeof stop.lat === 'string' ? stop.lat.trim() : '';
      const lonRaw = typeof stop.lon === 'string' ? stop.lon.trim() : '';
      const teiryujyoCd = typeof stop.teiryujyoCd === 'string' ? stop.teiryujyoCd.trim() : '';

      const isOrigin = name === '出発地';
      const isDestination = name === '目的地';
      if (isOrigin && journeyStart) name = journeyStart;
      if (isDestination) {
        if (journeyEnd) name = journeyEnd;
        else if (routeMeta.headsign) name = routeMeta.headsign.replace(/行$/, '') || name;
      }
      if (!name) return;

      if (type === 'bus' || busKeyword.test(name) || isOrigin || isDestination) {
        candidateIndices.push(index);
      }

      const stopIdBase = sidRaw || hashString(`${name}|${latRaw}|${lonRaw}`);
      const stopId = sidRaw ? `naha_${sidRaw}` : `naha_extra_stop_${stopIdBase}`;
      const lat = parseFloat(latRaw);
      const lon = parseFloat(lonRaw);
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

      if (hasCoords && !seenStops.has(stopId)) {
        result.stops.push({
          stop_id: stopId,
          stop_name: name,
          stop_lat: lat.toFixed(6),
          stop_lon: lon.toFixed(6),
          stop_code: sidRaw,
          stop_desc: teiryujyoCd ? `${name} (${teiryujyoCd})` : name
        });
        seenStops.add(stopId);
      }
    });

    if (candidateIndices.length === 0) return;

    const departureTime = normalizeTimeString(typeof busLeg.departure === 'string' ? busLeg.departure : '');
    const arrivalTime = normalizeTimeString(typeof busLeg.arrival === 'string' ? busLeg.arrival : '');

    candidateIndices.forEach((stopIndex, seqIdx) => {
      const stop = stops[stopIndex];
      if (!stop) return;
      const rawName = typeof stop.name === 'string' ? stop.name : '';
      let name = rawName.replace(/\s+/g, ' ').trim();
      const sidRaw = typeof stop.sid === 'string' ? stop.sid.trim() : '';
      const latRaw = typeof stop.lat === 'string' ? stop.lat.trim() : '';
      const lonRaw = typeof stop.lon === 'string' ? stop.lon.trim() : '';

      const isOrigin = name === '出発地';
      const isDestination = name === '目的地';
      if (isOrigin && journeyStart) name = journeyStart;
      if (isDestination) {
        if (journeyEnd) name = journeyEnd;
        else if (routeMeta.headsign) name = routeMeta.headsign.replace(/行$/, '') || name;
      }
      if (!name) return;

      const stopIdBase = sidRaw || hashString(`${name}|${latRaw}|${lonRaw}`);
      const stopId = sidRaw ? `naha_${sidRaw}` : `naha_extra_stop_${stopIdBase}`;
      const timing = seqIdx === 0 ? departureTime : (seqIdx === candidateIndices.length - 1 ? arrivalTime : departureTime);

      result.stopTimes.push({
        trip_id: tripId,
        stop_id: stopId,
        stop_sequence: (seqIdx + 1).toString(),
        arrival_time: timing,
        departure_time: timing
      });
    });
  });

  return result;
}

function parseNahaExtraRoutes(raw: string, sourceId: string): GTFSData {
  const empty: GTFSData = { stops: [], stopTimes: [], trips: [], routes: [] };
  if (typeof raw !== 'string' || raw.trim().length === 0) return empty;

  let structured: any = null;
  let html = '';
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'string') html = parsed;
    else if (parsed && typeof parsed === 'object') structured = parsed;
  } catch {
    html = raw;
  }

  if (structured) return parseNahaStructuredRoutes(structured, sourceId);
  if (!html) return empty;
  const result: GTFSData = { stops: [], stopTimes: [], trips: [], routes: [] };
  const seenStops = new Set<string>();
  const seenRoutes = new Set<string>();
  const journey = extractJourneyEndpoints(html);
  const sectionRegex = /<div id="_divRosen(\d+)"[^>]*>([\s\S]*?)(?=<div id="_divRosen|$)/g;
  let match: RegExpExecArray | null;
  while ((match = sectionRegex.exec(html))) {
    const optionIndex = parseInt(match[1], 10);
    if (!Number.isFinite(optionIndex)) continue;
    const section = match[2];
    const inputs = new Map<string, string>();
    section.replace(/<input[^>]+id="([^"]+)"[^>]+value="([^"]*)"/g, (_, id, value) => {
      inputs.set(id, value);
      return '';
    });
    const names = splitCsvLoose(inputs.get(`_hdnName${optionIndex}`) || '');
    const types = splitCsvLoose(inputs.get(`_hdnType${optionIndex}`) || '');
    const latList = splitCsvLoose(inputs.get(`_hdnLat${optionIndex}`) || '');
    const lonList = splitCsvLoose(inputs.get(`_hdnLon${optionIndex}`) || '');
    const sidList = splitCsvLoose(inputs.get(`_hdnSID${optionIndex}`) || '');

    const candidateIndices: number[] = [];
    names.forEach((rawName, idx) => {
      const type = (types[idx] || '').toLowerCase();
      const trimmed = (rawName || '').replace(/\s+/g, ' ').trim();
      if (!trimmed) return;
      const isOrigin = trimmed === '出発地';
      const isDestination = trimmed === '目的地';
      const busKeyword = /(バス|のりば|停留|沖縄県路線バス|空港|駅|港|高校|営業所)/.test(trimmed);
      if (type === 'bus' || busKeyword || isOrigin || isDestination) {
        candidateIndices.push(idx);
      }
    });
    if (candidateIndices.length === 0) continue;

    const rowRegex = /<tr[^>]*>\s*<td[^>]*>\s*([0-9]{1,2}:\d{2})\s*<\/td>\s*<td[^>]*>\s*([0-9]{1,2}:\d{2})\s*<\/td>[\s\S]*?<td[^>]*>\s*([^<]*?行[^<]*)\s*<\/td>\s*<\/tr>/g;
    let rowMatch: RegExpExecArray | null = null;
    let temp: RegExpExecArray | null;
    while ((temp = rowRegex.exec(section))) {
      const descriptorText = temp[3] ? temp[3].replace(/\s+/g, ' ').trim() : '';
      if (!descriptorText || descriptorText.includes('徒歩')) continue;
      rowMatch = temp;
      break;
    }
    if (!rowMatch) continue;

    const descriptor = rowMatch[3].replace(/\s+/g, ' ').trim();
    const routeMeta = parseRouteDescriptor(descriptor);
    const sourceDigits = sourceId.replace(/\D+/g, '');
    const shortNameFallback = sourceDigits || routeMeta.routeShortName || routeMeta.headsign.replace(/行$/, '');
    const routeShortName = shortNameFallback || routeMeta.routeShortName || routeMeta.headsign;
    const routeKey = `${routeMeta.routeLongName}|${routeMeta.headsign}|${routeShortName}|${routeMeta.agencyId}`;
    const routeId = `naha_extra_${hashString(`${sourceId}|${routeKey}`)}`;
    if (!seenRoutes.has(routeId)) {
      result.routes.push({ route_id: routeId, route_short_name: routeShortName, route_long_name: routeMeta.routeLongName, route_type: 3, agency_id: routeMeta.agencyId });
      seenRoutes.add(routeId);
    }

    const departureTime = normalizeTimeString(rowMatch[1]);
    const arrivalTime = normalizeTimeString(rowMatch[2]);
    const tripId = `naha_trip_${sourceId}_${hashString(`${sourceId}|${optionIndex}`)}`;
    result.trips.push({ trip_id: tripId, route_id: routeId, service_id: 'naha_service', trip_headsign: routeMeta.headsign });

    candidateIndices.forEach((idx, seqIdx) => {
      let name = (names[idx] || '').replace(/\s+/g, ' ').trim();
      const sidRaw = (sidList[idx] || '').trim();
      const maybeOrigin = name === '出発地';
      const maybeDestination = name === '目的地';
      if (maybeOrigin && journey.start) name = journey.start;
      if (maybeDestination) {
        if (journey.end) {
          name = journey.end;
        } else {
          name = routeMeta.headsign.replace(/行$/, '') || name;
        }
      }
      if (!name || name === '出発地' || name === '目的地') return;
      const lat = parseFloat(latList[idx] || '');
      const lon = parseFloat(lonList[idx] || '');
      const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

      if (!sidRaw && !hasCoords) {
        return;
      }

      const stopIdBase = sidRaw || hashString(`${name}|${hasCoords ? lat.toFixed(6) : ''}|${hasCoords ? lon.toFixed(6) : ''}`);
      const stopId = sidRaw ? `naha_${sidRaw}` : `naha_extra_stop_${stopIdBase}`;

      if (hasCoords && !seenStops.has(stopId)) {
        result.stops.push({
          stop_id: stopId,
          stop_name: name,
          stop_lat: lat.toFixed(6),
          stop_lon: lon.toFixed(6),
          stop_code: sidRaw || '',
          stop_desc: name
        });
        seenStops.add(stopId);
      }
      const timing = seqIdx === 0 ? departureTime : seqIdx === candidateIndices.length - 1 ? arrivalTime : departureTime;
      result.stopTimes.push({ trip_id: tripId, stop_id: stopId, stop_sequence: (seqIdx + 1).toString(), arrival_time: timing, departure_time: timing });
    });
  }
  return result;
}

function appendNahaExtraRoutes(base: GTFSData, extra: GTFSData) {
  if (!extra) return;
  const baseStopMap = new Map(base.stops.map(stop => [stop.stop_id, stop]));
  const stopIds = new Set(baseStopMap.keys());

  const toNumber = (value: any) => {
    const num = typeof value === 'string' ? parseFloat(value) : typeof value === 'number' ? value : NaN;
    return Number.isFinite(num) ? num : NaN;
  };

  const inOkinawaBounds = (lat: number, lon: number) => lat >= 24 && lat <= 27 && lon >= 122 && lon <= 132;

  const isFallbackLocation = (lat: number, lon: number) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return true;
    const fallbackLat = 26.2125;
    const fallbackLon = 127.6811;
    return Math.abs(lat - fallbackLat) < 0.0005 && Math.abs(lon - fallbackLon) < 0.0005;
  };

  const shouldUpgradeStop = (current: any, incoming: any) => {
    const currentLat = toNumber(current?.stop_lat);
    const currentLon = toNumber(current?.stop_lon);
    const incomingLat = toNumber(incoming?.stop_lat);
    const incomingLon = toNumber(incoming?.stop_lon);
    if (!inOkinawaBounds(incomingLat, incomingLon)) return false;
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLon)) return true;
    if (!inOkinawaBounds(currentLat, currentLon)) return true;
    if (isFallbackLocation(currentLat, currentLon) && !isFallbackLocation(incomingLat, incomingLon)) return true;
    return false;
  };

  extra.stops.forEach(stop => {
    if (!stop) return;
    const existing = baseStopMap.get(stop.stop_id);
    if (!existing) {
      base.stops.push(stop);
      baseStopMap.set(stop.stop_id, stop);
      stopIds.add(stop.stop_id);
      return;
    }

    if (shouldUpgradeStop(existing, stop)) {
      existing.stop_lat = stop.stop_lat;
      existing.stop_lon = stop.stop_lon;
      if (stop.stop_name && stop.stop_name !== existing.stop_name) existing.stop_name = stop.stop_name;
      if (stop.stop_desc && stop.stop_desc !== existing.stop_desc) existing.stop_desc = stop.stop_desc;
      if (stop.stop_code && stop.stop_code !== existing.stop_code) existing.stop_code = stop.stop_code;
    }
  });
  const routeIds = new Set(base.routes.map(route => route.route_id));
  extra.routes.forEach(route => {
    if (route && !routeIds.has(route.route_id)) {
      base.routes.push(route);
      routeIds.add(route.route_id);
    }
  });
  const tripIds = new Set(base.trips.map(trip => trip.trip_id));
  extra.trips.forEach(trip => {
    if (trip && !tripIds.has(trip.trip_id)) {
      base.trips.push(trip);
      tripIds.add(trip.trip_id);
    }
  });
  if (extra.stopTimes.length) base.stopTimes.push(...extra.stopTimes);
}

async function loadNahaData(): Promise<GTFSData> {
  if (nahaDataCache) return nahaDataCache;
  const allData: any[] = [];
  try {
    const res = await fetch('/naha/nahabus.json');
    if (res.ok) {
      const text = await res.text();
      if (text.trim().length > 0) {
        try { const data = JSON.parse(text); if (Array.isArray(data)) allData.push(...data); } catch (err) {}
      }
    }
  } catch (e) {}
  try {
    const res = await fetch('/naha/kokutai.json');
    if (res.ok) {
      const text = await res.text();
      if (text.trim().length > 0) {
        try { const data = JSON.parse(text); if (Array.isArray(data)) allData.push(...data); } catch (err) {}
      }
    }
  } catch (e) {}

  const extraBundles: GTFSData[] = [];
  const extraSources = ['21', '21up', '21down', 'kakazu', '112', '112up', '7', '7up', '55', '75', '120', '120down'];
  for (const source of extraSources) {
    try {
      const res = await fetch(`/naha/${source}.json`);
      if (res.ok) {
        const text = await res.text();
        const extra = parseNahaExtraRoutes(text, source);
        if (extra.routes.length || extra.trips.length || extra.stops.length) {
          extraBundles.push(extra);
        }
      }
    } catch (e) {}
  }

  function convertNahaToGTFS(nahaData: any[]) {
    const stops: any[] = [];
    const stopTimes: any[] = [];
    const trips: any[] = [];
    const routes: any[] = [];
    const processedStops = new Set<string>();
    const processedRoutes = new Set<string>();

    nahaData.forEach((busData) => {
      if (!busData.Daiya || !busData.Daiya.PassedSchedules) return;
      const routeId = `naha_${busData.Daiya.Course.Keitou.KeitouNo}`;
      const tripId = `naha_trip_${busData.Daiya.SID}`;
      const routeName = busData.Daiya.Course.Name;
      const routeShortName = busData.Daiya.Course.Keitou.KeitouNo;

      if (!processedRoutes.has(routeId)) {
        routes.push({ route_id: routeId, route_short_name: routeShortName, route_long_name: routeName, route_type: 3, agency_id: 'naha_bus' });
        processedRoutes.add(routeId);
      }

      trips.push({ trip_id: tripId, route_id: routeId, service_id: 'naha_service', trip_headsign: busData.Daiya.Course.Group.YukisakiName || routeName });

      busData.Daiya.PassedSchedules.forEach((schedule: any) => {
        const stopId = `naha_${schedule.Station.Sid}`;
        if (!processedStops.has(stopId)) {
          let lat, lon;
          const rawLat = parseFloat(schedule.Station.Position.Latitude);
          const rawLon = parseFloat(schedule.Station.Position.Longitude);
          if (!isNaN(rawLat) && !isNaN(rawLon)) {
            if (rawLat > 1000000) { lat = rawLat / 1000000; lon = rawLon / 1000000; }
            else if (rawLat > 100000) { lat = rawLat / 100000; lon = rawLon / 100000; }
            else if (rawLat > 10000) { lat = rawLat / 10000; lon = rawLon / 10000; }
            else { lat = rawLat; lon = rawLon; }
            if (lat < 24 || lat > 27 || lon < 122 || lon > 132) {
              if (rawLat > 2400000) { lat = rawLat / 1000000; lon = rawLon / 1000000; }
              if (lat < 24 || lat > 27 || lon < 122 || lon > 132) { lat = 26.2125; lon = 127.6811; }
            }
          } else { lat = 26.2125; lon = 127.6811; }
          stops.push({ stop_id: stopId, stop_name: schedule.Station.Name, stop_lat: lat.toString(), stop_lon: lon.toString(), stop_code: schedule.Station.RenbanCd || '', stop_desc: schedule.Station.ShortName || schedule.Station.Name });
          processedStops.add(stopId);
        }
        stopTimes.push({ trip_id: tripId, stop_id: stopId, stop_sequence: schedule.OrderNo.toString(), arrival_time: schedule.ScheduledTime.Value, departure_time: schedule.StartTime.Value });
      });
    });

    return { stops, stopTimes, trips, routes };
  }

  const gtfs = allData.length === 0 ? { stops: [], stopTimes: [], trips: [], routes: [] } : convertNahaToGTFS(allData);
  extraBundles.forEach(extra => appendNahaExtraRoutes(gtfs, extra));
  nahaDataCache = gtfs;
  return gtfs;
}

function normaliseMasterStops(stops: any[]) {
  return stops.map((stop: any) => {
    const lat = typeof stop.stop_lat === 'number' ? stop.stop_lat : parseFloat(stop.stop_lat || '');
    const lon = typeof stop.stop_lon === 'number' ? stop.stop_lon : parseFloat(stop.stop_lon || '');
    const normalisedLat = Number.isFinite(lat) ? lat.toFixed(6) : '';
    const normalisedLon = Number.isFinite(lon) ? lon.toFixed(6) : '';
    const aliases = Array.isArray(stop.aliases) ? stop.aliases.filter(Boolean) : [];
    return {
      stop_id: stop.stop_id,
      stop_name: stop.stop_name,
      stop_lat: normalisedLat,
      stop_lon: normalisedLon,
      stop_desc: aliases.length ? `${stop.stop_name} | ${aliases.join(', ')}` : stop.stop_name,
      stop_code: stop.stop_code || stop.stop_id,
      aliases,
      sources: Array.isArray(stop.sources) ? stop.sources : []
    };
  });
}

export async function loadStopMasterData() {
  if (stopMasterCache) return stopMasterCache;
  try {
    const res = await fetch('/okinawa_stops_master.json');
    if (res.ok) {
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const payload = await res.json();
        if (payload && Array.isArray(payload.stops)) {
          stopMasterCache = normaliseMasterStops(payload.stops);
          return stopMasterCache;
        }
      } else {
        const raw = await res.text();
        const data = JSON.parse(raw);
        if (data && Array.isArray(data.stops)) {
          stopMasterCache = normaliseMasterStops(data.stops);
          return stopMasterCache;
        }
      }
    }
  } catch (error) {
    stopMasterCache = [];
    return stopMasterCache;
  }
  stopMasterCache = [];
  return stopMasterCache;
}

export async function loadStops() {
  if (stopsCache) return stopsCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
  const masterStops = await loadStopMasterData();
  const allStops: any[] = masterStops ? [...masterStops] : [];
  const seen = new Map<string, any>();
  allStops.forEach(stop => {
    if (stop?.stop_id) seen.set(stop.stop_id, stop);
  });
  for (const company of companies) {
    try {
      const res = await fetch(`/${company}/stops.txt`);
      if (res.ok) {
        const txt = await res.text();
        const parsed = parseCsv(txt);
        parsed.forEach(stop => {
          if (!stop?.stop_id) return;
          if (!seen.has(stop.stop_id)) {
            seen.set(stop.stop_id, stop);
            allStops.push(stop);
          }
        });
      }
    } catch (e) {}
  }
  try { const nahaData = await loadNahaData(); if (nahaData && nahaData.stops) allStops.push(...nahaData.stops); } catch (e) {}
  const uniqueStops = allStops.filter((stop, index) => allStops.findIndex(s => s.stop_id === stop.stop_id) === index);
  stopsCache = uniqueStops;
  return uniqueStops;
}

export async function loadStopTimes() {
  if (stopTimesCache) return stopTimesCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
  const allStopTimes: any[] = [];
  for (const company of companies) {
    try {
      const res = await fetch(`/${company}/stop_times.txt`);
      if (res.ok) {
        const txt = await res.text();
        const parsed = parseCsv(txt);
        allStopTimes.push(...parsed);
      }
    } catch (e) {}
  }
  try { const nahaData = await loadNahaData(); if (nahaData && nahaData.stopTimes) allStopTimes.push(...nahaData.stopTimes); } catch (e) {}
  stopTimesCache = allStopTimes;
  return allStopTimes;
}

export async function loadTrips() {
  if (tripsCache) return tripsCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
  const allTrips: any[] = [];
  for (const company of companies) {
    try {
      const res = await fetch(`/${company}/trips.txt`);
      if (res.ok) {
        const txt = await res.text();
        const parsed = parseCsv(txt);
        allTrips.push(...parsed);
      }
    } catch (e) {}
  }
  try { const nahaData = await loadNahaData(); if (nahaData && nahaData.trips) allTrips.push(...nahaData.trips); } catch (e) {}
  tripsCache = allTrips;
  return allTrips;
}

export async function loadRoutes() {
  if (routesCache) return routesCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
  const allRoutes: any[] = [];
  for (const company of companies) {
    try {
      const res = await fetch(`/${company}/routes.txt`);
      if (res.ok) {
        const txt = await res.text();
        const parsed = parseCsv(txt);
        allRoutes.push(...parsed);
      }
    } catch (e) {}
  }
  try { const nahaData = await loadNahaData(); if (nahaData && nahaData.routes) allRoutes.push(...nahaData.routes); } catch (e) {}
  routesCache = allRoutes;
  return allRoutes;
}
