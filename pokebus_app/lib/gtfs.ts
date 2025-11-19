// GTFS data loader utilities (moved to project-level lib)
export type GTFSData = { stops: any[]; stopTimes: any[]; trips: any[]; routes: any[] };

let stopsCache: any[] | null = null;
let stopTimesCache: any[] | null = null;
let tripsCache: any[] | null = null;
let routesCache: any[] | null = null;
let nahaDataCache: GTFSData | null = null;

function parseCsv(txt: string) {
  const lines = txt.trim().split(/\r?\n/);
  const header = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj: any = {};
    header.forEach((h, i) => (obj[h] = cols[i]));
    return obj;
  });
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

  if (allData.length === 0) {
    nahaDataCache = { stops: [], stopTimes: [], trips: [], routes: [] };
    return nahaDataCache;
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

  const gtfs = convertNahaToGTFS(allData);
  nahaDataCache = gtfs;
  return gtfs;
}

export async function loadStops() {
  if (stopsCache) return stopsCache;
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni'];
  const allStops: any[] = [];
  for (const company of companies) {
    try {
      const res = await fetch(`/${company}/stops.txt`);
      if (res.ok) {
        const txt = await res.text();
        const parsed = parseCsv(txt);
        allStops.push(...parsed);
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
