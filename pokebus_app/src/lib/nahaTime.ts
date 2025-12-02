import fs from 'fs';
import path from 'path';

export type NahaTimeRecord = {
  stationSid: string | null;
  stopName: string | null;
  routeNo: string | null;
  courseSid: string;
  tripSid: string;
  calendar: 'weekday' | 'saturday' | 'holiday' | string;
  time: string;
  parentCompanyCode: string;
};

export type NahaTimeIndex = {
  [routeNo: string]: {
    [calendar: string]: NahaTimeRecord[];
  };
};

// 汎用: 任意の naha_time JSON を読み込み、系統 / 曜日インデックスを作る
export function loadNahaTimeTable(
  filename: string,
  appRootDir?: string
): NahaTimeIndex {
  const baseDir = appRootDir ?? process.cwd();
  const filePath = path.join(baseDir, 'public/naha_time', filename);

  if (!fs.existsSync(filePath)) {
    return {};
  }

  const raw = fs.readFileSync(filePath, 'utf8');

  let records: NahaTimeRecord[];
  try {
    records = JSON.parse(raw);
  } catch {
    return {};
  }

  const index: NahaTimeIndex = {};

  for (const r of records) {
    if (!r || !r.routeNo) continue;

    const routeKey = String(r.routeNo);
    const calKey = r.calendar || 'unknown';

    if (!index[routeKey]) index[routeKey] = {};
    if (!index[routeKey][calKey]) index[routeKey][calKey] = [];

    index[routeKey][calKey].push(r);
  }

  for (const route of Object.keys(index)) {
    for (const cal of Object.keys(index[route])) {
      index[route][cal].sort((a, b) => {
        if (a.time === b.time) return 0;
        return a.time < b.time ? -1 : 1;
      });
    }
  }

  return index;
}

// 那覇BT (hanabus.json)
export function loadHanabusTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('hanabus.json', appRootDir);
}

// 上泉 (kamiizumi.json)
export function loadKamiizumiTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('kamiizumi.json', appRootDir);
}

// 県庁南口 (kentyouminami.json)
export function loadKentyouminamiTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('kentyouminami.json', appRootDir);
}

// 那覇高校前 (nahakoukou.json)
export function loadNahakoukouTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('nahakoukou.json', appRootDir);
}

// 開南 (kainan.json)
export function loadKainanTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('kainan.json', appRootDir);
}

// 与儀十字路（古島向け）(yogijuuziro.json)
export function loadYogijuuziroTimeTable(appRootDir?: string): NahaTimeIndex {
  return loadNahaTimeTable('yogijuuziro.json', appRootDir);
}
