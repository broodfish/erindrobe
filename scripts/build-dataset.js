const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const kr = JSON.parse(fs.readFileSync(path.join(RAW, 'kr-details.json'), 'utf8'));
const tw = JSON.parse(fs.readFileSync(path.join(RAW, 'tw-details.json'), 'utf8'));

const splitPath = path.join(RAW, 'kr-item-split.json');
const splitEntries = fs.existsSync(splitPath) ? JSON.parse(fs.readFileSync(splitPath, 'utf8')) : [];
const splitMap = new Map(); // noticeId -> entries[]
for (const e of splitEntries) {
  if (!splitMap.has(e.noticeId)) splitMap.set(e.noticeId, []);
  splitMap.get(e.noticeId).push(e);
}
// Generic promo/event entries that surface inside a fashion notice's image set but aren't
// themselves a cosmetic item (store cashback, attendance streak rewards, etc.) — keep them out
// of the per-item split since they'd just be noise on a fashion timeline.
const NON_FASHION_TITLE = /페이백|출석 이벤트|스토어 활동|쿠폰 지급/;

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

// Verified KR->TW item mapping, keyed by the final dataset item id (not name — several pet-box
// themes like "아기 올빼미: 펫 럭키박스" recur verbatim across multiple unrelated KR release
// cycles, so name-only keys would wrongly mark every recurrence as released). Matched by title,
// not image-UUID, since TW almost always re-renders its own marketing banners with a fresh CDN
// UUID even when it reuses the same costume/pet — UUID matching alone misses most releases.
// Built two ways:
//  1. Legendary sets: searching TW notices for the "傳說時裝裝備『...』" announcement pattern.
//  2. Everything else: vision-reading the Chinese title text baked into TW's own bundle-notice
//     banner images (see scripts/download-tw-raw.js + data/raw/tw-item-split.json), then pairing
//     each KR item's name with its thematically-matching TW translation by inspection. TW does
//     NOT release a KR week's items together or in KR's original order — it reshuffles KR's
//     back catalog into its own ~4-week bundles — so this has to be maintained as explicit
//     verified pairs rather than inferred from any date/order heuristic.
// Extend this map by running scripts/download-tw-raw.js against new TW bundle threads, vision-
// reading the images (see kr-item-split.json's approach for KR), and adding confirmed pairs here.
// Key format: "{noticeId}" for non-split (aggregate) items, "{noticeId}_{imageIndex}" for split items.
const VERIFIED_TW_MAP = {
  '2757708': { twName: '宇宙星之子', twThreadId: '3504848' },       // 코스믹 스타차일드
  '2957849': { twName: '古樹統治者', twThreadId: '3541066' },       // 엘더우드 소버린
  '2839212_2': { twName: '幼狼：寵物幸運箱', twThreadId: '3527227' },              // 신규 펫: 아기 늑대
  '2839212_1': { twName: '寂靜的審判：純琥珀套裝', twThreadId: '3541055' },        // 고요한 심판: 솔리드 엠버 세트
  '2839212_0': { twName: '熱情之舞：卡門套裝', twThreadId: '3527227' },            // 정열의 춤: 카르메나 세트
  '2906352_0': { twName: '春季運動會：春風運動套裝', twThreadId: '3527227' },      // 봄 운동회: 봄바람 트랙 세트
  '2906352_1': { twName: '閃耀的應援：公羊星啦啦隊套裝', twThreadId: '3527227' },  // 빛나는 응원: 램스타즈 응원단 세트
  '2957846_2': { twName: '幼貓頭鷹：寵物幸運箱', twThreadId: '3541055' },          // 아기 올빼미: 펫 럭키박스 (2025.06.19 debut)
  '3037067_0': { twName: '漣漪記憶：舒適針織套裝', twThreadId: '3505035' },        // 잔물결의 기억: 코지 크로셰 세트
  '3201524_0': { twName: '淡雅誘惑：優雅繆思套裝', twThreadId: '3541055' },        // 은은한 끌림: 엘레강트 뮤즈 세트
  '3201524_1': { twName: '盛宴的主人：永恆小步舞曲套裝', twThreadId: '3541055' },  // 연회의 주인: 타임리스 미뉴엣 세트
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
  if (/악기/.test(title)) return '商城樂器';
  if (/의상 수정|획득 종료|추가 능력치|소급/.test(title)) return '公告更正';
  return '其他商城';
}

// One-off manual split for the KR cash-shop instrument-skin notice: it bundles two separate
// "選擇箱" products (each offering a choice of recolored instrument skins), not distinct named
// costume sets, so it doesn't fit the automatic per-image title-split pipeline used for fashion
// lucky boxes — grouped here into one card per box instead of one per individual color variant.
const INSTRUMENT_SPLIT = {
  '2918992': [
    { name: '꾸러기 응원단 악기 선택 상자', displayName: '調皮應援團樂器選擇箱', imageIndices: [0, 1, 2, 4] },
    { name: '봄의 선율 악기 선택 상자', displayName: '春之旋律樂器選擇箱', imageIndices: [8, 9, 14, 20] },
  ],
};

// Parse a Korean sale-date string like "2025년 4월 24일(목) 점검 후 ~ 2025년 5월 22일(목) 05:59까지"
// or "2025/12/18(목) 점검 후 ~ ..." into the site's "YYYY.MM.DD" convention. Returns null if
// no recognizable date is found (caller falls back to the parent notice's date).
function parseStartDate(text) {
  if (!text) return null;
  const m = text.match(/(\d{4})[년/](\d{1,2})[월/](\d{1,2})일?/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}.${mo.padStart(2, '0')}.${d.padStart(2, '0')}`;
}

// Match a single raw image URL against the TW image index and return { released, fully, date, titles }.
function matchTwForImages(rawImageUrls, verifiedMatch) {
  const matchedThreads = new Map();
  let matchedImageCount = 0;
  for (const img of rawImageUrls) {
    const k = imgKey(img);
    const t = k && twIndex.get(k);
    if (t) {
      matchedImageCount++;
      matchedThreads.set(t.threadId, t);
    }
  }
  if (verifiedMatch && !matchedThreads.has(verifiedMatch.twThreadId)) {
    const t = tw.find(x => x.threadId === verifiedMatch.twThreadId);
    if (t) matchedThreads.set(t.threadId, t);
  }
  const twThreadsMatched = [...matchedThreads.values()].sort((a, b) => a.createDate - b.createDate);
  const twDates = [...new Set(twThreadsMatched.map(t => t.createDate))];
  return {
    twReleased: matchedThreads.size > 0,
    twFullyReleased: !!verifiedMatch || (matchedImageCount > 0 && matchedImageCount === rawImageUrls.length),
    twMatchedImageCount: matchedImageCount,
    twTotalImageCount: rawImageUrls.length,
    twDate: twDates.length ? twDates[0] : null,
    twDates,
    twTitles: [...new Set(twThreadsMatched.map(t => t.title))],
  };
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

  const name = cleanName(r.title);
  const verifiedMatch = VERIFIED_TW_MAP[r.id];

  if (INSTRUMENT_SPLIT[r.id]) {
    INSTRUMENT_SPLIT[r.id].forEach((box, boxIdx) => {
      const rawUrls = box.imageIndices.map(i => r.contentImages[i]).filter(Boolean);
      if (!rawUrls.length) return;
      const twInfo = matchTwForImages(rawUrls, VERIFIED_TW_MAP[`${r.id}_box${boxIdx}`]);
      items.push({
        id: `${r.id}_box${boxIdx}`,
        title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
        name: box.name,
        displayName: box.displayName,
        category,
        krDate: r.date,
        images: rawUrls,
        sourceUrl: r.url,
        ...twInfo,
      });
    });
    continue;
  }

  const splitForNotice = (splitMap.get(r.id) || []).filter(
    e => e.titleKr && !NON_FASHION_TITLE.test(e.titleKr)
  );

  if (splitForNotice.length > 0) {
    // Each entry in the notice's image bundle is an independently named, independently sold
    // item (e.g. a "럭키박스 & 패션샵" notice bundles several unrelated costume sets in one
    // announcement) — split into one card per item, each matched against TW individually so a
    // notice isn't shown as fully "not released" just because one piece in the bundle isn't.
    for (const entry of splitForNotice) {
      const idxMatch = entry.imageFile.match(/_(\d+)\.webp$/);
      const imgIndex = idxMatch ? parseInt(idxMatch[1], 10) : 0;
      const rawUrl = r.contentImages[imgIndex];
      if (!rawUrl) continue;
      const entryVerifiedMatch = VERIFIED_TW_MAP[`${r.id}_${imgIndex}`];
      const twInfo = matchTwForImages([rawUrl], entryVerifiedMatch);
      items.push({
        id: `${r.id}_${imgIndex}`,
        title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
        name: entry.titleKr,
        displayName: entryVerifiedMatch ? entryVerifiedMatch.twName : entry.titleKr,
        category,
        krDate: parseStartDate(entry.saleDateText) || r.date,
        images: [rawUrl],
        sourceUrl: r.url,
        ...twInfo,
      });
    }
    continue;
  }

  const twInfo = matchTwForImages(r.contentImages, verifiedMatch);
  const twNameOverride = verifiedMatch ? verifiedMatch.twName : null;

  items.push({
    id: r.id,
    title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
    name,
    displayName: twNameOverride || displayName(r.title, category, name),
    category,
    krDate: r.date,
    images: r.contentImages,
    sourceUrl: r.url,
    ...twInfo,
  });
}

items.sort((a, b) => (a.krDate || '').localeCompare(b.krDate || ''));

// Preserve already-downloaded/optimized localImages from a previous run, keyed by id. For
// freshly split items (new ids like "2839212_1"), fall back to the single local image path
// matching the original filename convention "{noticeId}_{imageIndex}.webp" downloaded earlier
// from the un-split notice, since download-images.js keys off the notice id + index too.
const outPath = path.join(__dirname, '..', 'data', 'fashion.json');
if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const prevMap = new Map(prev.map(p => [p.id, p.localImages]));
  items.forEach(i => {
    if (prevMap.has(i.id)) {
      i.localImages = prevMap.get(i.id);
    }
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
console.log('Items missing localImages:', items.filter(i => !i.localImages).length);
