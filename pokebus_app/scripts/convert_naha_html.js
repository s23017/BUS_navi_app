const fs = require('fs');
const path = process.argv[2];

if (!path) {
  console.error('Usage: node scripts/convert_naha_html.js <json-file-path>');
  process.exit(1);
}

function decodeEntities(value) {
  if (!value || typeof value !== 'string') return '';
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(value) {
  return decodeEntities((value || '').replace(/<[^>]*>/g, ''))
    .replace(/\s+/g, ' ')
    .trim();
}

function splitCsv(value) {
  if (typeof value !== 'string' || value.length === 0) return [];
  return value.split(',').map(part => decodeEntities(part.trim()));
}

function normalizeTime(value) {
  const stripped = (value || '').replace(/\s+/g, '').trim();
  if (!stripped || stripped === '―') return '';
  const match = stripped.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return stripped;
  const hours = match[1].padStart(2, '0');
  const minutes = match[2];
  return `${hours}:${minutes}`;
}

const raw = fs.readFileSync(path, 'utf8');
let html = raw;
try {
  const parsed = JSON.parse(raw);
  if (typeof parsed === 'string') {
    html = parsed;
  }
} catch (err) {
  html = raw;
}

if (typeof html !== 'string' || html.trim().length === 0) {
  console.error('No HTML content detected in file.');
  process.exit(1);
}

const journeyMatch = html.match(/「([^」]+)」[^「]+「([^」]+)」/);
const journey = {
  start: journeyMatch ? journeyMatch[1] : '',
  end: journeyMatch ? journeyMatch[2] : ''
};

const routeRegex = /<div id="_divRosen(\d+)"[^>]*>([\s\S]*?)(?=<div id="_divRosen|$)/g;
const routes = [];
let routeMatch;

while ((routeMatch = routeRegex.exec(html))) {
  const optionNumber = parseInt(routeMatch[1], 10);
  if (!Number.isFinite(optionNumber)) continue;
  const content = routeMatch[2];

  const subtitles = [...content.matchAll(/<p class="subtitle06">([\s\S]*?)<\/p>/g)].map(m => stripTags(m[1]));
  const summaryText = subtitles[0] || '';
  const notesText = subtitles[1] || '';
  const summary = {
    text: summaryText,
    duration: (summaryText.match(/所要時間:([^\s]+)/) || [])[1] || '',
    fare: (summaryText.match(/運賃:([^\s]+)/) || [])[1] || '',
    transfers: (summaryText.match(/乗継回数:([^\s]+)/) || [])[1] || ''
  };
  if (notesText) summary.notes = notesText;

  const tableMatch = content.match(/<table[\s\S]*?<\/table>/);
  const legs = [];
  if (tableMatch) {
    const tableHtml = tableMatch[0];
    const rowRegex = /<tr>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRegex.exec(tableHtml))) {
      const rowHtml = rowMatch[1];
      if (/colspan=/i.test(rowHtml)) continue;
      const cells = [...rowHtml.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(cell => decodeEntities(cell[1]));
      if (cells.length !== 4) continue;
      const firstCell = stripTags(cells[0]);
      const secondCell = stripTags(cells[1]);
      if (firstCell === '発時刻' && secondCell === '着時刻') continue;
      const departure = normalizeTime(firstCell);
      const arrival = normalizeTime(secondCell);
      const fare = stripTags(cells[2]);
      const description = stripTags(cells[3]);
      const lowered = description.toLowerCase();
      let mode = 'other';
      if (description.includes('徒歩')) mode = 'walk';
      else if (description.includes('モノレール')) mode = 'rail';
      else if (description.includes('ゆいレール')) mode = 'rail';
      else if (description.includes('バス') || description.includes('琉球バス') || description.includes('沖縄バス')) mode = 'bus';
      legs.push({
        departure,
        arrival,
        fare,
        description,
        mode
      });
    }
  }

  const inputs = {};
  content.replace(/<input[^>]+id="([^"\s]+)"[^>]+value="([^"\s]*)"[^>]*>/g, (_, id, value) => {
    inputs[id] = decodeEntities(value || '');
    return '';
  });

  const getInput = (baseId) => inputs[`${baseId}${optionNumber}`] || '';
  const names = splitCsv(getInput('_hdnName'));
  const types = splitCsv(getInput('_hdnType'));
  const sids = splitCsv(getInput('_hdnSID'));
  const lats = splitCsv(getInput('_hdnLat'));
  const lons = splitCsv(getInput('_hdnLon'));
  const teiryujyo = splitCsv(getInput('_hdnTeiryujyoCd'));
  const stops = [];
  const stopCount = Math.max(names.length, types.length, lats.length, lons.length, sids.length, teiryujyo.length);
  for (let i = 0; i < stopCount; i += 1) {
    stops.push({
      name: names[i] || '',
      type: (types[i] || '').toLowerCase(),
      sid: sids[i] || '',
      lat: lats[i] || '',
      lon: lons[i] || '',
      teiryujyoCd: teiryujyo[i] || ''
    });
  }

  const courseSids = splitCsv(getInput('_hdnCourseSid'));
  const keitouSids = splitCsv(getInput('_hdnKeitouSid'));

  const passPoints = Object.keys(inputs)
    .filter(key => key.startsWith(`_hdnPassPoint`))
    .reduce((acc, key) => {
      if (!key.endsWith(String(optionNumber))) return acc;
      const info = inputs[key];
      if (!info) return acc;
      acc[key.replace(`_${optionNumber}`, '').slice('_hdn'.length).replace(/_/g, '').toLowerCase()] = splitCsv(info);
      return acc;
    }, {});

  routes.push({
    option: optionNumber,
    summary,
    legs,
    stops,
    courseSids,
    keitouSids,
    passPoints
  });
}

const structured = {
  journey,
  routes,
  source: {
    file: path,
    generatedAt: new Date().toISOString()
  }
};

if (routes.length === 0) {
  const stopRegex = /<dl[^>]*id="([^"]+)"[^>]*class="result"([^>]*)>([\s\S]*?)<\/dl>/g;
  const stopEntries = [];
  let stopMatch;

  const extractAttr = (attrs, name) => {
    const match = attrs.match(new RegExp(`${name}="([^"]*)"`));
    return decodeEntities(match ? match[1] : '');
  };

  while ((stopMatch = stopRegex.exec(html))) {
    const sid = decodeEntities(stopMatch[1] || '').trim();
    const attrs = stopMatch[2] || '';
    const name = extractAttr(attrs, 'data-name');
    const fname = extractAttr(attrs, 'data-fname');
    const lat = extractAttr(attrs, 'data-lat');
    const lon = extractAttr(attrs, 'data-lng');
    if (!name || !lat || !lon) continue;
    stopEntries.push({
      name,
      furigana: fname,
      sid,
      lat,
      lon
    });
  }

  if (stopEntries.length > 0) {
    if (!structured.journey.start) structured.journey.start = stopEntries[0].name;
    if (!structured.journey.end) structured.journey.end = stopEntries[stopEntries.length - 1].name;
    structured.routes.push({
      option: 1,
      summary: {
        text: `停留所数:${stopEntries.length}`,
        totalStops: stopEntries.length
      },
      legs: [
        {
          departure: '',
          arrival: '',
          fare: '',
          description: 'バス停一覧',
          mode: 'bus'
        }
      ],
      stops: stopEntries.map((entry) => ({
        name: entry.name,
        type: 'bus',
        sid: entry.sid,
        lat: entry.lat,
        lon: entry.lon,
        teiryujyoCd: ''
      })),
      courseSids: [],
      keitouSids: [],
      passPoints: {}
    });
  }
}

fs.writeFileSync(path, `${JSON.stringify(structured, null, 2)}\n`, 'utf8');
