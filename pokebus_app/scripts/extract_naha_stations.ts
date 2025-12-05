const fs = require('fs');
const path = require('path');

// public/naha 以下の全 JSON から Station 一覧を抽出して
// public/naha_stations_index.json に書き出す簡単なスクリプト

const appRoot = path.join(__dirname, '..');
const nahaDir = path.join(appRoot, 'public', 'naha');
const outPath = path.join(appRoot, 'public', 'naha_stations_index.json');

interface StationLike {
  Sid?: string;
  Name?: string;
  ShortName?: string;
}

interface OutputStation {
  sid: string;
  name: string;
  shortName: string;
}

const stationMap = new Map<string, OutputStation>();

function addStation(st: StationLike) {
  const sid = st.Sid;
  if (!sid) return;
  const name = st.Name ?? '';
  const shortName = st.ShortName ?? '';
  if (stationMap.has(sid)) return;
  stationMap.set(sid, { sid, name, shortName });
}

function extractFromFile(filePath: string) {
  const text = fs.readFileSync(filePath, 'utf8');
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    return;
  }

  const walk = (node: any) => {
    if (!node || typeof node !== 'object') return;

    if (node.Station && typeof node.Station === 'object') {
      addStation(node.Station as StationLike);
    }

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
    } else {
      for (const v of Object.values(node)) walk(v);
    }
  };

  walk(json);
}

function main() {
  const files = (fs.readdirSync(nahaDir) as string[]).filter((f: string) => f.endsWith('.json'));
  for (const f of files) {
    extractFromFile(path.join(nahaDir, f));
  }

  const out = Array.from(stationMap.values()).sort((a, b) => {
    if (a.name === b.name) return a.sid.localeCompare(b.sid);
    return a.name.localeCompare(b.name);
  });

  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`written ${out.length} stations to ${outPath}`);
}

main();
