const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const kr = JSON.parse(fs.readFileSync(path.join(RAW, 'kr-details.json'), 'utf8'));
const tw = JSON.parse(fs.readFileSync(path.join(RAW, 'tw-details.json'), 'utf8'));
const { parseLuckyBoxNotice, parseTotalPackageName, parseChoiceBoxes } = require('./parse-kr-text.js');
const { normalizeName, deriveTwStatus, createEvidence } = require('./tw-match.js');

// Must exactly replicate download-images.js's pickImages() — the vision-extraction subagents
// read the LOCAL files it produced (assets/fashion-web/{noticeId}_{i}.webp), and those file
// indices only correspond to position i in THIS reordered/truncated selection, not to position i
// in the notice's raw contentImages array. Indexing raw contentImages directly by the local
// file's suffix silently pairs the wrong image with a split entry's title whenever a notice had
// >4 images or a non-banner-first original order (confirmed bug: e.g. notice 3311070's raw
// image 0 is a generic "이벤트" section-header banner, but local file "..._0.webp" — the one the
// vision agent actually read and labeled "데이지의 작은 패션 아틀리에 반짝 오픈!" — was really
// raw image 1, a 900x750 banner-dimension image that pickImages sorted to the front).
function pickImages(images, max = 4) {
  const stills = images.filter(u => !/\.gif(\?|$)/i.test(u));
  const banner = stills.filter(u => /\d{3,4}x\d{3,4}/.test(decodeURIComponent(u)));
  const rest = stills.filter(u => !banner.includes(u));
  return [...banner, ...rest].slice(0, max);
}

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

const twMatchRecords = fs.existsSync(path.join(RAW, 'tw-kr-matches.json'))
  ? JSON.parse(fs.readFileSync(path.join(RAW, 'tw-kr-matches.json'), 'utf8'))
  : [];
const VERIFIED_TW_MAP = Object.fromEntries(twMatchRecords.map(record => [record.krId, record]));

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

function parseTotalPackageTitle(title) {
  const normalized = cleanName(title).replace(/\s+/g, ' ').trim();
  const match = normalized.match(/^(.+?)\s+토탈\s*패키지/u);
  return match && match[1] !== '토탈' ? match[1].trim() : null;
}

function displayName(title, category, name) {
  if (category === '幸運箱') {
    if (/펫/.test(title)) return '寵物幸運箱';
    return '時裝幸運箱 & 時裝商店';
  }
  if (category === '通行證') return '冒險家高級通行證 & 系列包';
  if (category === '傳說時裝') return name; // keep original Korean proper noun (not yet officially localized)
  if (category === '聯動') {
    if (/산리오/.test(title)) return '瑪奇手機版 X Sanrio 聯名';
    return name;
  }
  if (category === '其他商城') {
    if (/염색약/.test(title)) return '染色藥選擇箱';
    if (/신규 패키지/.test(title)) return '新商城套裝 & 時裝商店';
    if (/Galaxy/.test(title)) return 'Galaxy 聯名週邊配件';
    if (/아틀리에|크리스마스/.test(title)) return '聖誕主題時裝活動';
    return name;
  }
  return name;
}

function categorize(title) {
  if (/전설 패션 장비|에픽 패션/.test(title)) return '傳說時裝';
  if (/토탈 패키지/.test(title)) return '套組時裝';
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

// Match a single item's images against TW evidence. Shared image UUIDs are retained as useful
// clues, but they cannot establish a release without a semantic/manual name match.
function matchTwForImages(rawImageUrls, verifiedMatch, krId, krName) {
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
  const normalizedKrName = normalizeName(krName);
  const directNameMatch = normalizedKrName && twThreadsMatched.some(thread => {
    const normalizedTwTitle = normalizeName(thread.title);
    return normalizedTwTitle === normalizedKrName
      || normalizedTwTitle.includes(normalizedKrName)
      || normalizedKrName.includes(normalizedTwTitle);
  });
  const manualMatch = Boolean(verifiedMatch);
  const nameMatch = manualMatch || directNameMatch;
  const imageMatch = matchedImageCount > 0;
  const twStatus = deriveTwStatus({ nameMatch, imageMatch, manualMatch });
  const twEvidence = [];
  if (verifiedMatch) {
    const thread = twThreadsMatched.find(item => item.threadId === verifiedMatch.twThreadId);
    twEvidence.push(createEvidence({
      krId,
      krName,
      twThreadId: verifiedMatch.twThreadId,
      twName: verifiedMatch.twName || thread?.title,
      twDate: thread?.createDate,
      method: verifiedMatch.method || 'manual-name-and-image',
      note: verifiedMatch.note || '人工核對韓文／中文語意與圖片。',
    }));
  } else {
    twThreadsMatched.forEach(thread => twEvidence.push(createEvidence({
      krId,
      krName,
      twThreadId: thread.threadId,
      twName: thread.title,
      twDate: thread.createDate,
      method: 'image-uuid-only',
      note: '圖片 UUID 相符，但尚未完成韓文／中文名稱語意核對。',
    })));
  }
  return {
    twStatus,
    twReleased: twStatus === 'confirmed',
    twFullyReleased: twStatus === 'confirmed',
    twMatchedImageCount: matchedImageCount,
    twTotalImageCount: rawImageUrls.length,
    twDate: twDates.length ? twDates[0] : null,
    twDates,
    twTitles: [...new Set(twThreadsMatched.map(t => t.title))],
    twEvidence,
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

  const name = category === '套組時裝'
    ? (parseTotalPackageTitle(r.title) || parseTotalPackageName(r.fullText) || cleanName(r.title))
    : cleanName(r.title);
  const verifiedMatch = VERIFIED_TW_MAP[r.id];

  const isChoiceBoxNotice = category === '商城樂器' || /염색약/.test(r.title);
  const choiceBoxes = isChoiceBoxNotice && r.fullText ? parseChoiceBoxes(r.fullText) : [];
  if (choiceBoxes.length > 0) {
    choiceBoxes.forEach((box, boxIdx) => {
      const manualImageConfig = INSTRUMENT_SPLIT[r.id]?.[boxIdx];
      const rawUrls = manualImageConfig
        ? manualImageConfig.imageIndices.map(i => r.contentImages[i]).filter(Boolean)
        : (r.contentImages[0] ? [r.contentImages[0]] : []);
      if (!rawUrls.length) return;
      const itemId = `${r.id}_box${boxIdx}`;
      const choiceMatch = VERIFIED_TW_MAP[itemId];
      const twInfo = matchTwForImages(rawUrls, choiceMatch, itemId, box.name);
      items.push({
        id: itemId,
        title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
        name: box.name,
        displayName: manualImageConfig?.displayName || box.name,
        category,
        choiceKind: box.kind,
        componentsText: box.componentsText,
        krDate: box.saleDate || r.date,
        images: rawUrls,
        sourceUrl: r.url,
        ...twInfo,
      });
    });
    continue;
  }

  // 套組時裝 (total-package bundles) are a single coherent product, not a bundle of independently
  // named items — skip the per-image split path entirely so they use the aggregate branch below
  // with parseTotalPackageName(), instead of an old vision-read title from before this category
  // existed (it would otherwise still match a stale kr-item-split.json entry).
  const splitForNotice = category === '套組時裝' ? [] : (splitMap.get(r.id) || []).filter(
    e => e.titleKr && !NON_FASHION_TITLE.test(e.titleKr)
  );

  // Prefer the notice's own body text over vision-read image banners for naming: the text
  // contains the authoritative official box name (e.g. "정열의 춤 : 패션 럭키박스"), while vision
  // extraction only saw a promotional banner and could invent a plausible-but-wrong name (it
  // previously produced "정열의 춤: 카르메나 세트" — "카르메나" is the equipment set's internal
  // prefix, not part of the box's real title). Vision is still used to pick which image belongs
  // to which box, matched by substring containment against the vision-read title/prefix.
  const textBoxes = category === '套組時裝' ? [] : (r.fullText ? parseLuckyBoxNotice(r.fullText) : []);

  if (textBoxes.length > 0) {
    const usedEntries = new Set();
    const fallbackImages = pickImages(r.contentImages);
    const usedFallbackIdx = new Set();
    textBoxes.forEach((box, boxOrderIdx) => {
      let match = splitForNotice.find(e => !usedEntries.has(e) && e.titleKr.includes(box.boxName));
      if (!match && box.setNamePrefix) {
        match = splitForNotice.find(e => !usedEntries.has(e) && e.titleKr.includes(box.setNamePrefix));
      }
      if (!match && splitForNotice.length > 0) {
        // Positional fallback among same-type entries (펫 vs 패션) in original order.
        const wantPet = box.boxType.includes('펫');
        match = splitForNotice.find(e => !usedEntries.has(e) && (/펫/.test(e.titleKr) === wantPet));
      }
      let imgIndex;
      if (match) {
        usedEntries.add(match);
        const idxMatch = match.imageFile.match(/_(\d+)\.webp$/);
        imgIndex = idxMatch ? parseInt(idxMatch[1], 10) : 0;
      } else {
        // No vision data at all for this notice (e.g. it had only one raw image, so it was never
        // sent through the vision-extraction batches) — fall back to positional order against
        // the notice's own picked images directly.
        imgIndex = [...fallbackImages.keys()].find(i => !usedFallbackIdx.has(i));
        if (imgIndex === undefined) return;
        usedFallbackIdx.add(imgIndex);
      }
      const rawUrl = fallbackImages[imgIndex];
      if (!rawUrl) return;
      const entryVerifiedMatch = VERIFIED_TW_MAP[`${r.id}_${imgIndex}`];
      const twInfo = matchTwForImages([rawUrl], entryVerifiedMatch, `${r.id}_${imgIndex}`, box.boxName);
      items.push({
        id: `${r.id}_${imgIndex}`,
        title: decodeEntities(r.title).replace(/\s+/g, ' ').trim(),
        name: box.boxName,
        displayName: entryVerifiedMatch ? entryVerifiedMatch.twName : box.boxName,
        category,
        krDate: box.date || r.date,
        images: [rawUrl],
        sourceUrl: r.url,
        ...twInfo,
      });
    });
    continue;
  }

  if (splitForNotice.length > 0) {
    // Fallback for notices where text parsing found nothing (a handful of older/differently-
    // formatted notices) — still split per bundled item, but name comes from vision only.
    for (const entry of splitForNotice) {
      const idxMatch = entry.imageFile.match(/_(\d+)\.webp$/);
      const imgIndex = idxMatch ? parseInt(idxMatch[1], 10) : 0;
      const rawUrl = pickImages(r.contentImages)[imgIndex];
      if (!rawUrl) continue;
      const entryVerifiedMatch = VERIFIED_TW_MAP[`${r.id}_${imgIndex}`];
      const twInfo = matchTwForImages([rawUrl], entryVerifiedMatch, `${r.id}_${imgIndex}`, entry.titleKr);
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

  const twInfo = matchTwForImages(r.contentImages, verifiedMatch, r.id, name);
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
