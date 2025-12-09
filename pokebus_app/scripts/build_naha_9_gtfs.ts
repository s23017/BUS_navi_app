const fs = require('fs');
const path = require('path');

function ensureDir(p: string) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
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
};

function normaliseStopKey(value: string | undefined | null) {
  if (!value) return '';
  return value
    .replace(/[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, '')
    .replace(/[　]/g, '')
    .toLowerCase();
}

function buildBaseStopIndex(publicRoot: string) {
  const companies = ['okibus', 'touyou', 'kitanaka', 'nakagusuku', 'nanjoushi', 'okinawashi', 'yonaguni', 'naha'];
  const map = new Map<string, BaseStopEntry[]>();

  for (const company of companies) {
    const filePath = path.join(publicRoot, company, 'stops.txt');
    if (!fs.existsSync(filePath)) continue;
    const text = fs.readFileSync(filePath, 'utf8');
    const parsed = parseCsv(text);
    parsed.forEach((stop: any) => {
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
      };
      const key = normaliseStopKey(stopName);
      if (!key) return;
      const bucket = map.get(key) || [];
      bucket.push(entry);
      map.set(key, bucket);
    });
  }

  return map;
}

function computeDistanceScore(lat1: number, lon1: number, lat2: number, lon2: number) {
  const dLat = lat1 - lat2;
  const dLon = lon1 - lon2;
  return Math.abs(dLat) + Math.abs(dLon);
}

function findBestBaseStop(
  index: Map<string, BaseStopEntry[]>,
  name: string,
  lat?: number,
  lon?: number
): BaseStopEntry | null {
  const key = normaliseStopKey(name);
  const entries = key ? index.get(key) || [] : [];
  if (!entries.length) return null;
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lon);

  let best: BaseStopEntry | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  entries.forEach(entry => {
    if (!hasCoords) {
      if (!best) best = entry;
      return;
    }
    const score = computeDistanceScore(entry.stop_lat, entry.stop_lon, lat as number, lon as number);
    if (score < bestScore) {
      best = entry;
      bestScore = score;
    }
  });

  return best;
}

function main() {
  const appRoot = process.cwd();
  const publicRoot = path.join(appRoot, 'public');
  const srcPath = path.join(publicRoot, 'naha', '9.json');
  if (!fs.existsSync(srcPath)) {
    console.error('[build_naha_9_gtfs] source not found:', srcPath);
    process.exit(1);
  }

  const raw = fs.readFileSync(srcPath, 'utf8');
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    console.error('[build_naha_9_gtfs] failed to parse JSON:', e);
    process.exit(1);
  }

  const route = data && Array.isArray(data.routes) ? data.routes[0] : null;
  if (!route || !Array.isArray(route.stops) || route.stops.length === 0) {
    console.error('[build_naha_9_gtfs] no structured stops in 9.json');
    process.exit(1);
  }

  const baseIndex = buildBaseStopIndex(publicRoot);

  const outDir = path.join(publicRoot, 'naha_9');
  ensureDir(outDir);

  const routesLines = [
    'route_id,route_short_name,route_long_name,route_type,agency_id',
    `naha9_1,9,9 名護西空港線,3,naha_bus`,
  ];
  fs.writeFileSync(path.join(outDir, 'routes.txt'), routesLines.join('\n'));
  const tripsLines: string[] = ['route_id,service_id,trip_id,trip_headsign'];

  const stopsSeen = new Set<string>();
  const stopsLines: string[] = ['stop_id,stop_code,stop_name,stop_desc,stop_lat,stop_lon,zone_id,stop_url,location_type,platform_code'];

  let seq = 1;
  const baseStopOrder: string[] = [];
  for (const s of route.stops as any[]) {
    const rawName = (s.name || s.stop_name || '').toString().trim();
    const latNum = parseFloat((s.lat || '').toString());
    const lonNum = parseFloat((s.lon || '').toString());
    const match = rawName ? findBestBaseStop(baseIndex, rawName, latNum, lonNum) : null;

    const stopId = match?.stop_id || `naha9_stop_${seq}`;
    const name = match?.stop_name || rawName || stopId;
    const lat = Number.isFinite(latNum) ? latNum : match?.stop_lat || '';
    const lon = Number.isFinite(lonNum) ? lonNum : match?.stop_lon || '';

    if (!stopsSeen.has(stopId)) {
      stopsSeen.add(stopId);
      stopsLines.push(`${stopId},,${name},${name},${lat},${lon},,,`);
    }

    baseStopOrder.push(stopId);
    seq++;
  }

  const stopTimesLines: string[] = ['trip_id,arrival_time,departure_time,stop_id,stop_sequence'];

  // naha_time_index_all.json から 120 の時刻を読み込み、
  // 平日・休日ごとに「始発時刻」ベースで複数便(trip)を生成する
  try {
    const idxPath = path.join(publicRoot, 'naha_time_index_all.json');
    if (fs.existsSync(idxPath)) {
      const idxRaw = fs.readFileSync(idxPath, 'utf8');
      const idxJson: any = JSON.parse(idxRaw);
      const calendars = ['weekday', 'holiday'];

      let tripCounter = 1;

      for (const cal of calendars) {
        const recs9 = idxJson && idxJson['9'] && idxJson['9'][cal];
        if (!Array.isArray(recs9) || recs9.length === 0) continue;

        // tripSid ごとにまとめる。stopName が入っているものを優先し、無ければ time 単位で。
        const byTrip: Map<string, { time: string }[]> = new Map();
        for (const r of recs9 as any[]) {
          const key = (r.tripSid && String(r.tripSid)) || `time-${r.time}`;
          if (!key || !r.time) continue;
          const list = byTrip.get(key) || [];
          list.push({ time: r.time });
          byTrip.set(key, list);
        }

        for (const [tripKey, list] of byTrip.entries()) {
          // とりあえず先頭の時刻をその便の代表出発時刻とする
          const first = list[0];
          const hhmmss = `${first.time}:00`;
          const tripId = `naha9_trip_${tripCounter}`;
          tripCounter++;

          tripsLines.push(`naha9_1,${cal},${tripId},9`);

          let seq2 = 1;
          for (const stopId of baseStopOrder) {
            stopTimesLines.push(`${tripId},${hhmmss},${hhmmss},${stopId},${seq2}`);
            seq2++;
          }
        }
      }
    }
  } catch (e) {
    console.error('[build_naha_9_gtfs] failed to apply naha_time_index_all to 9:', e);
  }

  fs.writeFileSync(path.join(outDir, 'stops.txt'), stopsLines.join('\n'));
  fs.writeFileSync(path.join(outDir, 'trips.txt'), tripsLines.join('\n'));
  fs.writeFileSync(path.join(outDir, 'stop_times.txt'), stopTimesLines.join('\n'));

  console.log('[build_naha_9_gtfs] wrote GTFS-like files into public/naha_9 (with S-id mapping where possible)');
}

main();
