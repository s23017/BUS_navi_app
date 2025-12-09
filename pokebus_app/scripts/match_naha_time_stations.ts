const fs = require('fs');
const path = require('path');

// naha_time の stopName と naha_stations_index.json の name/shortName を
// できるだけ自動でマッチさせて、stopName -> sid のマップを作るスクリプト。

const appRoot = path.join(__dirname, '..');
const nahaTimeDir = path.join(appRoot, 'public', 'naha_time');
const stationsIndexPath = path.join(appRoot, 'public', 'naha_stations_index.json');
const outPath = path.join(appRoot, 'public', 'naha_time_station_map.json');

interface NahaTimeRecord {
  stationSid?: string;
  stopName?: string;
  routeNo?: string;
  courseSid?: string;
  tripSid?: string;
  calendar?: string;
  time?: string;
  parentCompanyCode?: string;
}

interface StationIndexEntry {
  sid: string;
  name: string;
  shortName: string;
}

// 文字列をゆるく正規化: 空白・全角空白を削除、カッコ内を削るなど
function normalizeName(raw: string | undefined | null): string {
  if (!raw) return '';
  let s = raw.trim();
  // 全角スペースを半角に
  s = s.replace(/[\u3000\s]+/g, '');
  // 全角カッコや半角カッコで区切る (例: 「宜野湾高校前（大謝名向け）」 -> 「宜野湾高校前」)
  s = s.split('（')[0].split('(')[0].split('（')[0];
  return s;
}

function loadStationsIndex(): StationIndexEntry[] {
  const text = fs.readFileSync(stationsIndexPath, 'utf8');
  const json = JSON.parse(text) as StationIndexEntry[];
  return json;
}

function buildStationLookup(stations: StationIndexEntry[]) {
  const byNormName = new Map<string, StationIndexEntry[]>();

  for (const st of stations) {
    const normName = normalizeName(st.name);
    const normShort = normalizeName(st.shortName);
    if (normName) {
      const arr = byNormName.get(normName) ?? [];
      arr.push(st);
      byNormName.set(normName, arr);
    }
    if (normShort && normShort !== normName) {
      const arr = byNormName.get(normShort) ?? [];
      arr.push(st);
      byNormName.set(normShort, arr);
    }
  }

  return { byNormName };
}

function findBestMatch(stopName: string, lookup: ReturnType<typeof buildStationLookup>): StationIndexEntry | undefined {
  const norm = normalizeName(stopName);
  if (!norm) return undefined;

  const exactList = lookup.byNormName.get(norm);
  if (exactList && exactList.length === 1) return exactList[0];

  // 完全一致が複数ある/見つからない場合は、前方一致で1つに絞れるか試す
  let candidate: StationIndexEntry | undefined;
  for (const [key, list] of lookup.byNormName.entries()) {
    if (!key.startsWith(norm) && !norm.startsWith(key)) continue;
    for (const st of list) {
      if (candidate && candidate.sid !== st.sid) {
        // あいまいに複数ヒットする場合はあきらめる
        return undefined;
      }
      candidate = st;
    }
  }

  return candidate;
}

function main() {
  if (!fs.existsSync(stationsIndexPath)) {
    console.error('stations index not found. Run extract_naha_stations.ts first.');
    process.exit(1);
  }

  const stations = loadStationsIndex();
  const lookup = buildStationLookup(stations);

  const files = (fs.readdirSync(nahaTimeDir) as string[]).filter((f: string) => f.endsWith('.json'));

  // stopName -> { sid, name, shortName, matched } というマップを作る
  const result: Record<string, { sid?: string; nameCandidates?: StationIndexEntry[]; matched: boolean }> = {};

  for (const file of files) {
    const full = path.join(nahaTimeDir, file);
    const text = fs.readFileSync(full, 'utf8');
    let json: NahaTimeRecord[];
    try {
      json = JSON.parse(text) as NahaTimeRecord[];
    } catch {
      continue;
    }

    for (const rec of json) {
      const stopName = rec.stopName;
      if (!stopName) continue;
      if (result[stopName]?.matched) continue; // 既に確定済みならスキップ

      const match = findBestMatch(stopName, lookup);
      if (match) {
        result[stopName] = {
          sid: match.sid,
          nameCandidates: [match],
          matched: true,
        };
      } else if (!result[stopName]) {
        result[stopName] = {
          sid: undefined,
          nameCandidates: undefined,
          matched: false,
        };
      }
    }
  }

  fs.writeFileSync(outPath, JSON.stringify(result, null, 2), 'utf8');
  console.log(`written mapping for ${Object.keys(result).length} stopNames to ${outPath}`);
}

main();
