const fs = require('fs');

// -------- JSONファイルのパスを引数で取得 --------
const inputArg = process.argv[2];

if (!inputArg) {
  console.error("エラー: JSONファイルを指定してください\n例: ./run.sh public/naha_time/1234.json");
  process.exit(1);
}

// 引数のファイルパスを `inPath` に設定
const inPath = inputArg;
const outPath = inPath;

// ファイルの存在チェックを追加
if (!fs.existsSync(inPath)) {
  console.error(`エラー: ファイルが見つかりません: ${inPath}`);
  console.error(`現在の作業ディレクトリ: ${process.cwd()}`);
  process.exit(1);
}

// -------- 以下、元コード --------
const raw = fs.readFileSync(inPath, 'utf8');
let text = raw;

try {
  const parsed = JSON.parse(raw);
  if (typeof parsed === 'string') text = parsed;
} catch (_) {}

let stationSid = null, stopName = null;
{
  const m = text.match(/([0-9]{7,8})<span[^>]*>\s*&nbsp;[^>]*<\/span>\s*([^<]+?)\s*<\/div>/);
  if (m) {
    stationSid = m[1];
    stopName = m[2].trim();
  }
}

const keitoHeaderRegex = /viewTimeTableByKeito\('(\d+)',\s*'([0-9a-f\-]+)',\s*'([0-9a-f\-]+)'/g;
const keitoMap = {};
let mHeader;

while ((mHeader = keitoHeaderRegex.exec(text)) !== null) {
  const parentCompanyCode = mHeader[1];
  const courseSid = mHeader[3];
  const tail = text.slice(mHeader.index);
  const mRoute = tail.match(/\[([0-9]+)\]/);
  const routeNo = mRoute ? mRoute[1] : null;
  keitoMap[courseSid] = { routeNo, courseSid, parentCompanyCode };
}

const detailRegex = /ShowRouteDetail\('([0-9a-f\-]+)','([0-9a-f\-]+)','(Heijitsu|Saturday|Holiday)','(\d{2}:\d{2})','(\d+)','([0-9a-f\-]+)'\)/g;
const records = [];
let m;

while ((m = detailRegex.exec(text)) !== null) {
  const courseSid = m[2], calRaw = m[3], time = m[4];
  const parentCompanyCode = m[5], tripSid = m[6];

  let calendar;
  if (calRaw === 'Heijitsu') calendar = 'weekday';
  else if (calRaw === 'Saturday') calendar = 'saturday';
  else if (calRaw === 'Holiday') calendar = 'holiday';
  else calendar = calRaw;

  const keito = keitoMap[courseSid] || {};
  const routeNo = keito.routeNo || null;

  records.push({ stationSid, stopName, routeNo, courseSid, tripSid, calendar, time, parentCompanyCode });
}

// レコード数が0の場合はファイルを上書きしない
if (records.length === 0) {
  console.log('警告: 変換されたレコードが0件でした。ファイルを変更しません:', outPath);
  process.exit(0);
}

fs.writeFileSync(outPath, JSON.stringify(records, null, 2), 'utf8');
console.log('overwritten:', outPath, 'records:', records.length);
