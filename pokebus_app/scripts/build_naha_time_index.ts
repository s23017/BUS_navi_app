// Build a merged NahaTimeIndex from all public/naha_time JSON files.
// Run with: npx ts-node scripts/build_naha_time_index.ts

// Use CommonJS style for ts-node compatibility in this project
const fs = require('fs');
const path = require('path');

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

type NahaTimeIndex = {
  [routeNo: string]: {
    [calendar: string]: NahaTimeRecord[];
  };
};

function isNahaTimeRecordArray(data: any): data is NahaTimeRecord[] {
  return Array.isArray(data);
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const publicDir = path.join(projectRoot, 'public');
  const nahaTimeDir = path.join(publicDir, 'naha_time');
  const outputPath = path.join(publicDir, 'naha_time_index_all.json');

  if (!fs.existsSync(nahaTimeDir)) {
    console.error('naha_time directory not found:',nahaTimeDir);
    process.exit(1);
  }

  const files = (fs.readdirSync(nahaTimeDir) as string[]).filter((f: string) => f.endsWith('.json'));

  const index: NahaTimeIndex = {};

  for (const file of files) {
    const fullPath = path.join(nahaTimeDir, file);
    let raw: string;
    try {
      raw = fs.readFileSync(fullPath, 'utf8');
    } catch (err) {
      console.warn('[build_naha_time_index] Failed to read', fullPath, err);
      continue;
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch (err) {
      console.warn('[build_naha_time_index] Failed to parse JSON', fullPath, err);
      continue;
    }

    if (!isNahaTimeRecordArray(data)) {
      console.warn('[build_naha_time_index] Skipping non-array file', fullPath);
      continue;
    }

    for (const rec of data) {
      if (!rec) continue;
      const routeNo = (rec.routeNo || '').toString().trim();
      const calendar = (rec.calendar || 'default').toString().trim() || 'default';
      if (!routeNo) continue;

      if (!index[routeNo]) index[routeNo] = {};
      if (!index[routeNo][calendar]) index[routeNo][calendar] = [];
      index[routeNo][calendar].push(rec);
    }
  }

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf8');
  console.log('[build_naha_time_index] Wrote merged index to', outputPath);
}

main();

export {};
