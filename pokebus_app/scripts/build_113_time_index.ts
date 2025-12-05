// Build a merged time index from all public/113 JSON files.
// Run with: npx ts-node scripts/build_113_time_index.ts

const fs = require('fs');
const path = require('path');

type TimeRecord = {
  stationSid?: string;
  stopName?: string;
  routeNo?: string;
  courseSid?: string;
  tripSid?: string;
  calendar?: string;
  time?: string;
  parentCompanyCode?: string;
};

type TimeIndex = {
  [routeNo: string]: {
    [calendar: string]: TimeRecord[];
  };
};

function isTimeRecordArray(data: any): data is TimeRecord[] {
  return Array.isArray(data);
}

function main() {
  const projectRoot = path.resolve(__dirname, '..');
  const publicDir = path.join(projectRoot, 'public');
  const dir113 = path.join(publicDir, '113');
  const outputPath = path.join(publicDir, 'time_index_113_all.json');

  if (!fs.existsSync(dir113)) {
    console.error('113 directory not found:', dir113);
    process.exit(1);
  }

  const subdirs = ['down', 'up'];
  const index: TimeIndex = {};

  for (const sub of subdirs) {
    const subDirPath = path.join(dir113, sub);
    if (!fs.existsSync(subDirPath)) continue;

    const files = (fs.readdirSync(subDirPath) as string[]).filter((f: string) => f.endsWith('.json'));

    for (const file of files) {
      const fullPath = path.join(subDirPath, file);
      let raw: string;
      try {
        raw = fs.readFileSync(fullPath, 'utf8');
      } catch (err) {
        console.warn('[build_113_time_index] Failed to read', fullPath, err);
        continue;
      }

      let data: any;
      try {
        data = JSON.parse(raw);
      } catch (err) {
        console.warn('[build_113_time_index] Failed to parse JSON', fullPath, err);
        continue;
      }

      if (!isTimeRecordArray(data)) {
        console.warn('[build_113_time_index] Skipping non-array file', fullPath);
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
  }

  fs.writeFileSync(outputPath, JSON.stringify(index, null, 2), 'utf8');
  console.log('[build_113_time_index] Wrote merged index to', outputPath);
}

main();
