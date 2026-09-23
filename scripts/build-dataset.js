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

// Verified KR->TW legendary fashion set name mapping, found by searching TW notices for the
// "傳說時裝裝備『...』" announcement pattern (title-based, not image-UUID based — TW usually
// re-renders its own marketing banners with a fresh CDN UUID even when it reuses the same
// costume, so UUID matching alone misses most legendary-set launches). Confirmed against TW
// thread content as of this scrape; update this list by re-running the search below when TW
// releases more legendary sets:
//   grep title for /傳說時裝装備|傳說時裝裝備/ across tw-notice-all / tw-event-all
const LEGENDARY_TW_MAP = {
  '코스믹 스타차일드': { twName: '宇宙星之子', twThreadId: '3504848' },
  '엘더우드 소버린': { twName: '古樹統治者', twThreadId: '3541066' },
};

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

  // Match each KR image independently against TW's image index — a KR notice can bundle
  // several distinct pieces, and TW may release them piecemeal across different threads/dates
  // rather than all at once, so a single "first match" flag would misrepresent partial releases.
  const matchedThreads = new Map(); // threadId -> tw thread
  let matchedImageCount = 0;
  for (const img of r.contentImages) {
    const k = imgKey(img);
    const t = k && twIndex.get(k);
    if (t) {
      matchedImageCount++;
      matchedThreads.set(t.threadId, t);
    }
  }
  const name = cleanName(r.title);

  // For legendary sets, prefer the verified title-based mapping over image matching — TW almost
  // always re-renders its own marketing banner with a fresh CDN UUID even when reusing the same
  // costume, so image-UUID matching alone misses most legendary launches (only catches cases
  // where individual character-pose renders happen to be reused verbatim).
  const legendaryMatch = category === '套組時裝' ? LEGENDARY_TW_MAP[name] : null;
  if (legendaryMatch && !matchedThreads.has(legendaryMatch.twThreadId)) {
    const t = tw.find(x => x.threadId === legendaryMatch.twThreadId);
    if (t) matchedThreads.set(t.threadId, t);
  }

  const twThreadsMatched = [...matchedThreads.values()].sort((a, b) => a.createDate - b.createDate);
  const twDates = [...new Set(twThreadsMatched.map(t => t.createDate))];
  const twNameOverride = legendaryMatch ? legendaryMatch.twName : null;

  items.push({
    id: r.id,
    title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
    name,
    displayName: twNameOverride || displayName(r.title, category, name),
    category,
    krDate: r.date,
    images: r.contentImages,
    sourceUrl: r.url,
    twReleased: matchedThreads.size > 0,
    twFullyReleased: !!legendaryMatch || (matchedImageCount > 0 && matchedImageCount === r.contentImages.length),
    twMatchedImageCount: matchedImageCount,
    twTotalImageCount: r.contentImages.length,
    twDate: twDates.length ? twDates[0] : null, // earliest TW date among matched pieces
    twDates,
    twTitles: [...new Set(twThreadsMatched.map(t => t.title))],
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
console.log('TW released (any piece):', items.filter(i => i.twReleased).length);
console.log('TW fully released (all pieces):', items.filter(i => i.twFullyReleased).length);
console.log('TW partially released:', items.filter(i => i.twReleased && !i.twFullyReleased).length);
