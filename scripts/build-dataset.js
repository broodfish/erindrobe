const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const kr = JSON.parse(fs.readFileSync(path.join(RAW, 'kr-details.json'), 'utf8'));
const tw = JSON.parse(fs.readFileSync(path.join(RAW, 'tw-details.json'), 'utf8'));

function imgKey(url) {
  // extract the /community/{date}/{uuid}/ part which is shared between KR/TW when assets are reused
  const m = url.match(/\/community\/\d+\/([a-f0-9-]{36})\//);
  return m ? m[1] : null;
}

// Build TW uuid -> {threadId, createDate, title} index
const twIndex = new Map();
for (const t of tw) {
  for (const img of t.images) {
    const k = imgKey(img);
    if (k) twIndex.set(k, t);
  }
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ');
}

function cleanName(title) {
  title = decodeEntities(title);
  const m = title.match(/['‘’"“”「](.*?)['’"”」]/);
  if (m) return m[1];
  return title
    .replace(/^\(수정\)\s*/, '')
    .replace(/^\(추가\)\s*/, '')
    .replace(/^\d{1,2}\/\d{1,2}\(.\)\s*/, '')
    .trim();
}

function displayName(title, category, name) {
  if (category === '幸運箱') {
    if (/펫/.test(title)) return '寵物幸運箱';
    return '時裝幸運箱 & 時裝商店';
  }
  if (category === '通行證') return '冒險家高級通行證 & 系列包';
  if (category === '套組時裝') return name; // keep original Korean proper noun (not yet officially localized)
  if (category === '聯動') {
    if (/산리오/.test(title)) return '瑪奇手機版 X Sanrio 聯名';
    return name;
  }
  if (category === '其他商城') {
    if (/염색약/.test(title)) return '染色藥選擇箱';
    if (/신규 패키지/.test(title)) return '新商城套裝 & 時裝商店';
    if (/그랜드 앙상블/.test(title)) return '豪華全套組合包';
    if (/Galaxy/.test(title)) return 'Galaxy 聯名週邊配件';
    if (/아틀리에|크리스마스/.test(title)) return '聖誕主題時裝活動';
    return name;
  }
  return name;
}

function categorize(title) {
  if (/전설 패션 장비|에픽 패션/.test(title)) return '套組時裝';
  if (/펫 럭키박스/.test(title)) return '幸運箱';
  if (/패션 럭키박스|럭키박스|럭키 박스/.test(title)) return '幸運箱';
  if (/프리미엄 패스|시즌패스|시즌 패스|통행증/.test(title)) return '通行證';
  if (/컬렉션 백|컬렉션백/.test(title)) return '通行證';
  if (/콜라보|컬래버|산리오/.test(title)) return '聯動';
  if (/의상 수정|획득 종료|추가 능력치|소급/.test(title)) return '公告更正';
  return '其他商城';
}

const skipPatterns = [
  /획득 종료 일정/, /추가 능력치 관련 보상/, /소급 시스템/, /의상 수정 관련/,
  /당첨 안내/, /지급완료/, /인증 이벤트/, /언박싱 댓글 이벤트/,
];

const items = [];
for (const r of kr) {
  if (!r.title) continue;
  if (!r.date) continue; // can't place on timeline without a date
  if (skipPatterns.some(p => p.test(r.title))) continue; // skip "end of sale" / correction / winner-announcement notices
  const category = categorize(r.title);
  if (category === '公告更正') continue;

  // find TW match via shared image uuid
  let twMatch = null;
  for (const img of r.contentImages) {
    const k = imgKey(img);
    if (k && twIndex.has(k)) { twMatch = twIndex.get(k); break; }
  }

  const name = cleanName(r.title);
  items.push({
    id: r.id,
    title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
    name,
    displayName: displayName(r.title, category, name),
    category,
    krDate: r.date,
    images: r.contentImages,
    sourceUrl: r.url,
    twReleased: !!twMatch,
    twDate: twMatch ? twMatch.createDate : null,
    twTitle: twMatch ? twMatch.title : null,
  });
}

items.sort((a, b) => (a.krDate || '').localeCompare(b.krDate || ''));

// Preserve already-downloaded/optimized localImages from a previous run, keyed by id.
const outPath = path.join(__dirname, '..', 'data', 'fashion.json');
if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const prevMap = new Map(prev.map(p => [p.id, p.localImages]));
  items.forEach(i => {
    if (prevMap.has(i.id)) i.localImages = prevMap.get(i.id);
  });
}

fs.writeFileSync(outPath, JSON.stringify(items, null, 2));
console.log('Built', items.length, 'items');
const byCat = {};
items.forEach(i => byCat[i.category] = (byCat[i.category] || 0) + 1);
console.log(byCat);
console.log('TW released count:', items.filter(i => i.twReleased).length);
