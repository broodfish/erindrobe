const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, '..', 'data', 'raw');
const kr = JSON.parse(fs.readFileSync(path.join(RAW, 'kr-details.json'), 'utf8'));
const tw = JSON.parse(fs.readFileSync(path.join(RAW, 'tw-details.json'), 'utf8'));
const twReleaseDates = JSON.parse(fs.readFileSync(path.join(RAW, 'tw-release-dates.json'), 'utf8'));
const {
  parseFashionShopProducts,
  parseActionPreviews,
  parseHairProducts,
  parseLuckyBoxNotice,
  parseTotalPackageName,
  parseChoiceBoxes,
} = require('./parse-kr-text.js');
const { normalizeName, deriveTwStatus, createEvidence } = require('./tw-match.js');
const { annotateRepeatItems } = require('./timeline-history.js');
const {
  classifyKrProduct,
  isRelevantKrProductNotice,
  legacyCategoryForProductType,
  selectOfficialImages,
} = require('./kr-product-rules.js');

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
const GENERIC_TIMELINE_NAME = /^(?:신규\s+(?:패키지|상품|아이템샵|스페셜\s+패키지)\s+안내|기간제\s+패키지\s+안내(?:\s*\([^)]*\))?|(?:에픽|엘리트|레어|고급|희귀))$/u;

function luckyBoxProductType(value) {
  const signal = String(value || '');
  if (/펫|pet/iu.test(signal)) return '寵物幸運盒';
  if (/패션|costume/iu.test(signal)) return '時裝幸運盒';
  return undefined;
}

function imgKey(url) {
  // extract the /community/{date}/{uuid}/ part which is shared between KR/TW when assets are reused
  const m = url.match(/\/community\/\d+\/([a-f0-9-]{36})\//);
  return m ? m[1] : null;
}

// Event notices usually begin with a shared campaign banner, while the actual reward preview
// appears later in the article with an item-specific filename. Prefer that named preview for the
// card; otherwise a generic event banner makes an unrelated event look like a fashion product.
function isGenericEventImage(url) {
  const file = decodeURIComponent(String(url || '')).split('/').pop() || '';
  return /Property1(?:이벤트|공지사항)|이벤트(?:게시물|게시글|공지)(?:썸네일|이미지|900x|770x|숏)|게시글(?:내부|내용)이미지|^image\d+\.(?:png|jpe?g)$/iu.test(file);
}

function selectEventCardImages(images, fullText = '') {
  const usable = (images || []).filter(url => url && !/\.gif(?:\?|$)/iu.test(url));
  const contentImages = usable.filter(url => {
    const file = decodeURIComponent(String(url)).split('/').pop() || '';
    return !isGenericEventImage(url) && /[가-힣]/u.test(file);
  });
  const normalizedText = normalizeImageName(fullText);
  const fashionFileSignal = /모자|후드|의상|교복|한복|패션|세트|셋트|예복|글러브|부츠|신발|망토|아머|수트|재킷|자켓|캡|바이저|밴디지|오버롤|보닛|유니폼|슈즈|스커트|팬츠|장갑|드레스|코트/u;
  const fashionImages = contentImages.filter(url => {
    const file = decodeURIComponent(String(url)).split('/').pop() || '';
    const stem = normalizeImageName(file.replace(/\.[^.]+$/u, ''))
      .replace(/(?:전체|남성용|여성용|남자|여자|착용|미착용)$/u, '');
    const stemIndex = stem.length >= 3 ? normalizedText.indexOf(stem) : -1;
    const textFashionContext = stemIndex >= 0
      && /패션|모자|의상|세트|미리보기|착용/u.test(
        normalizedText.slice(Math.max(0, stemIndex - 42), stemIndex + stem.length + 42),
      );
    return fashionFileSignal.test(stem)
      || textFashionContext;
  });

  // A few official previews use an internal asset name such as "농부액터" or "전체".
  // If no filename/text signal identifies a fashion asset, the last non-generic image in
  // the article body is the site's product preview position; never fall back to the shared
  // event-list thumbnails that follow it.
  return fashionImages.length ? fashionImages : contentImages.slice(-1);
}

function normalizeImageName(value) {
  const raw = String(value || '');
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    // Full notice text is not a URL and may contain a literal "%" character.
  }
  return decoded
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function selectShopProductImages(images, productName) {
  const name = normalizeImageName(productName.replace(/\s*코디$/u, ''));
  if (!name) return [];
  return [...new Set((images || []).filter(url => {
    const file = decodeURIComponent(String(url)).split('/').pop() || '';
    const stem = normalizeImageName(file.replace(/\.[^.]+$/u, ''));
    return stem.includes(name);
  }))];
}

function selectInstrumentImages(images) {
  const instrumentName = /(?:류트|플루트|바이올린|샬루모|만돌린|실로폰|피아노|큰북|하프|심벌즈|하모니카|통기타)/u;
  return [...new Set((images || []).filter(url => {
    const file = decodeURIComponent(String(url)).split('/').pop() || '';
    return !/\.gif(?:\?|$)/iu.test(file) && instrumentName.test(file);
  }))];
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
const TW_RELEASE_DATE_MAP = new Map(twReleaseDates.map(record => [String(record.threadId), record]));
// A small number of Korean product notices are missing from kr-details.json even though the
// official notice still exists. Keep those intentional, source-linked rows in raw data instead
// of silently dropping the products from the timeline.
const manualItemsPath = path.join(RAW, 'kr-manual-items.json');
const manualItems = fs.existsSync(manualItemsPath)
  ? JSON.parse(fs.readFileSync(manualItemsPath, 'utf8'))
  : [];

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
    { name: '꾸러기 응원단 악기 선택 상자', displayName: '調皮啦啦隊樂器選擇箱', imageIndices: [0, 1, 2, 4] },
    { name: '봄의 선율 악기 선택 상자', displayName: '春之旋律樂器選擇箱', imageIndices: [8, 9, 14, 20] },
  ],
};

// Editorial corrections for notices that bundle several kinds of content. These are kept in the
// dataset builder so a fresh scrape/rebuild preserves the reviewed timeline instead of relying on
// a one-off edit to data/fashion.json.
const EXCLUDED_TIMELINE_ITEM_IDS = new Set([
  '2957846_shop0',
  '2957846_shop1',
  '3311070_1',
  '3398758',
  '3406753',
  '3414594',
  '3416432_0',
  '3428244',
  '3428344',
  '3448002',
  '3398563',
  '3545052',
]);

const MANUAL_IMAGE_INDICES = Object.freeze({
  // 꾸미기/패션샵 accessory and robe previews are mixed with the lucky-box banners in the
  // notice image list; keep the official item previews scoped to their shop cards.
  '3545054_shop0': [3, 4],
  '3100668_shop0': [2],
  '3100668_shop1': [3],
  '3100668_shop2': [4],
  '3201524_shop0': [2],
  '3521633_shop0': [2],
  '3500246_shop0': [2],
  '3481577_shop0': [2, 3, 4, 5],
  '3447996_shop0': [2],
  '3428346_shop0': [2],
  '3407264_shop0': [2],
  '3407264_shop1': [3],
  '3373326_shop0': [3],
  '3373326_shop1': [4],
  '3345414_shop0': [3],
  '3345414_shop1': [4],
  '3345414_shop2': [5],
  // Keep the two Sanrio fashion previews on the fashion event row; the sibling Christmas event
  // row is excluded above because it has no fashion reward.
  '3311070_0': [2, 3],
  // The second image is an in-game explanatory scene for the robe quest, not a wearable preview.
  '2918987': [0],
  '3407262': [4],
  // Merge the six hair previews from the package notice with the four previews from the event
  // notice below; the ticket icon is intentionally omitted.
  '3447992': [1, 2, 3, 4, 5, 6],
  // The event notice contains the fashion-weapon preview set; keep the instrument preview set on
  // the adjacent lucky-box notice so the two cards no longer mix their galleries.
  '3511361': Array.from({ length: 42 }, (_, index) => index + 10),
  '3511363': [0, 1, 2, 3, 4, 5],
});

const MANUAL_IMAGE_APPENDICES = Object.freeze({
  '3447992': [{ noticeId: '3448002', imageIndices: [2, 3, 4, 5] }],
});

const MANUAL_NON_RERUN_IDS = new Set(['3359491', '3201520', '3473711', '3532703']);

function manualImagesFor(itemId, source, fallbackImages = []) {
  const indices = MANUAL_IMAGE_INDICES[itemId];
  if (!indices) return null;
  const images = source?.contentImages || fallbackImages;
  return indices.map(index => images[index]).filter(Boolean);
}

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

// Resolve a Taiwan release date from the official notice's sale-period text. The notice's
// publication timestamp is only a fallback: an announcement can be published before the
// maintenance that actually puts the product in the shop.
function parseTaiwanDate(text) {
  if (!text) return null;
  const m = String(text).match(/(\d{4})\s*[./年-]\s*(\d{1,2})\s*[./月-]\s*(\d{1,2})/u);
  if (!m) return null;
  const [, year, month, day] = m;
  return Math.floor(Date.parse(`${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T00:00:00+08:00`) / 1000);
}

function parseTaiwanSaleStart(text, { allowUnlabeledDate = false } = {}) {
  if (!text) return null;
  const saleStart = String(text).match(/(?:販售(?:期間|時間|日期)|銷售期間|販售)[^\d]{0,80}(\d{4}\s*[./年-]\s*\d{1,2}\s*[./月-]\s*\d{1,2})/u);
  if (!saleStart && !allowUnlabeledDate) return null;
  const dateText = saleStart ? saleStart[1] : String(text);
  const timestamp = parseTaiwanDate(dateText);
  return timestamp == null ? null : { timestamp, text: String(text).trim() };
}

function resolveTaiwanRelease(thread) {
  const manifest = TW_RELEASE_DATE_MAP.get(String(thread.threadId));
  const officialText = thread.contentText || '';
  const parsed = parseTaiwanSaleStart(officialText)
    || parseTaiwanSaleStart(manifest?.saleDateText, { allowUnlabeledDate: true });
  if (parsed) {
    return {
      timestamp: parsed.timestamp,
      saleDateText: parsed.text,
      source: 'official-notice-text',
    };
  }
  if (thread.createDate != null) {
    return {
      timestamp: thread.createDate,
      saleDateText: null,
      source: 'notice-publication-time',
    };
  }
  return { timestamp: null, saleDateText: null, source: null };
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
  const twReleaseInfos = twThreadsMatched.map(thread => ({ thread, release: resolveTaiwanRelease(thread) }));
  const twDates = [...new Set(twReleaseInfos.map(({ release }) => release.timestamp).filter(date => date != null))];
  const twSaleDateTexts = [...new Set(twReleaseInfos.map(({ release }) => release.saleDateText).filter(Boolean))];
  const twDateSources = [...new Set(twReleaseInfos.map(({ release }) => release.source).filter(Boolean))];
  const twDateSource = twDateSources.length === 1 ? twDateSources[0] : (twDateSources.length ? 'mixed' : null);
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
    const release = thread ? resolveTaiwanRelease(thread) : { timestamp: null, saleDateText: null, source: null };
    twEvidence.push(createEvidence({
      krId,
      krName,
      twThreadId: verifiedMatch.twThreadId,
      twName: verifiedMatch.twName || thread?.title,
      twDate: release.timestamp,
      twDateSource: release.source,
      twSaleDateText: release.saleDateText,
      method: verifiedMatch.method || 'manual-name-and-image',
      note: verifiedMatch.note || '人工核對韓文／中文語意與圖片。',
    }));
  } else {
    twReleaseInfos.forEach(({ thread, release }) => twEvidence.push(createEvidence({
      krId,
      krName,
      twThreadId: thread.threadId,
      twName: thread.title,
      twDate: release.timestamp,
      twDateSource: release.source,
      twSaleDateText: release.saleDateText,
      method: 'image-uuid-only',
      note: '圖片 UUID 相符，但尚未完成韓文／中文名稱語意核對。',
    })));
  }
  return {
    twStatus,
    twNameMatch: Boolean(nameMatch),
    twImageMatch: Boolean(imageMatch),
    twManualMatch: manualMatch,
    twReleased: twStatus === 'confirmed',
    twFullyReleased: twStatus === 'confirmed',
    twMatchedImageCount: matchedImageCount,
    twTotalImageCount: rawImageUrls.length,
    twDate: twDates.length ? twDates[0] : null,
    twDateSource,
    twSaleDateText: twSaleDateTexts.length ? twSaleDateTexts.join('；') : null,
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

function appendFashionShopItems(notice) {
  const products = parseFashionShopProducts(notice.fullText);
  let matchedCount = 0;
  products.forEach((product, productIndex) => {
    const itemId = `${notice.id}_shop${productIndex}`;
    const images = manualImagesFor(itemId, notice)
      || selectShopProductImages(notice.contentImages, product.name);
    const verifiedMatch = VERIFIED_TW_MAP[itemId];
    const twInfo = matchTwForImages(images, verifiedMatch, itemId, product.name);
    items.push({
      id: itemId,
      title: decodeEntities(notice.title).replace(/\s+/g, ' ').trim(),
      name: product.name,
      displayName: verifiedMatch?.twName || product.name,
      category: '其他商城',
      productTypeOverride: ['accessory', 'robe'].includes(product.kind) ? '新造型' : '商店時裝',
      shopProductKind: product.kind,
      ...(product.officialSlot ? {
        officialSlot: product.officialSlot,
        slotDomain: product.slotDomain,
      } : {}),
      isShopProduct: true,
      krDate: product.saleDate || notice.date,
      images,
      sourceUrl: notice.url,
      ...twInfo,
    });
    matchedCount++;
  });
  return matchedCount;
}

function appendDerivedPreviewItems(notice) {
  let matchedCount = 0;
  if (notice.boardPath !== '/News/Notice') return matchedCount;

  for (const [index, product] of parseHairProducts(notice.fullText, notice.contentImages).entries()) {
    if (!product.images.length) continue;
    const itemId = `${notice.id}_hair${index}`;
    const twInfo = matchTwForImages(product.images, VERIFIED_TW_MAP[itemId], itemId, product.name);
    items.push({
      id: itemId,
      title: decodeEntities(notice.title).replace(/\s+/g, ' ').trim(),
      name: product.name,
      displayName: product.name,
      category: '其他商城',
      productTypeOverride: '髮型',
      choiceKind: 'hair',
      appearanceSlot: 'hair',
      officialSlot: '헤어',
      slotDomain: 'character-appearance',
      krDate: notice.date,
      images: product.images,
      sourceUrl: notice.url,
      ...twInfo,
    });
    matchedCount++;
  }

  let actionProducts = parseActionPreviews(notice.fullText, notice.contentImages);
  const heroActionNames = [
    '행동: 히어로레드',
    '행동: 히어로그린',
    '행동: 히어로옐로우',
    '행동: 히어로블루',
    '행동: 히어로핑크',
  ];
  const heroActionProducts = actionProducts.filter(product => heroActionNames.includes(product.name));
  if (heroActionProducts.length === heroActionNames.length) {
    const itemId = `${notice.id}_action_bundle`;
    const images = [...new Set(heroActionProducts.flatMap(product => product.images))];
    const twInfo = matchTwForImages(images, VERIFIED_TW_MAP[itemId], itemId, '짜릿한 등장 행동! 상자');
    items.push({
      id: itemId,
      title: decodeEntities(notice.title).replace(/\s+/g, ' ').trim(),
      name: '짜릿한 등장 행동! 상자',
      displayName: '짜릿한 등장 행동! 상자',
      category: '其他商城',
      productTypeOverride: '動作',
      choiceKind: 'actionBundle',
      tip: '內含 5 個動作：히어로레드、히어로그린、히어로옐로우、히어로블루、히어로핑크',
      krDate: notice.date,
      images,
      sourceUrl: notice.url,
      ...twInfo,
    });
    matchedCount++;
    actionProducts = actionProducts.filter(product => !heroActionNames.includes(product.name));
  }

  for (const [index, product] of actionProducts.entries()) {
    const itemId = `${notice.id}_action${index}`;
    const twInfo = matchTwForImages(product.images, VERIFIED_TW_MAP[itemId], itemId, product.name);
    items.push({
      id: itemId,
      title: decodeEntities(notice.title).replace(/\s+/g, ' ').trim(),
      name: product.name,
      displayName: product.name,
      category: '其他商城',
      productTypeOverride: '動作',
      choiceKind: 'action',
      krDate: notice.date,
      images: product.images,
      sourceUrl: notice.url,
      ...twInfo,
    });
    matchedCount++;
  }
  return matchedCount;
}

for (const r of kr) {
  if (!r.title) continue;
  if (!r.date) continue; // can't place on timeline without a date
  if (skipPatterns.some(p => p.test(r.title))) continue; // skip "end of sale" / correction / winner-announcement notices
  const category = categorize(r.title);
  if (category === '公告更正') continue;

  // The official search endpoint intentionally returns a broad set of notices. Keep the
  // previously vision-split records, but do not turn unrelated maintenance/general-event
  // announcements into fashion cards just because their footer mentions the cash shop.
  if (!splitMap.has(r.id) && !isRelevantKrProductNotice({
    title: r.title,
    fullText: r.fullText,
    sourceBoard: r.boardPath,
  })) continue;

  const name = category === '套組時裝'
    ? (parseTotalPackageTitle(r.title) || parseTotalPackageName(r.fullText) || cleanName(r.title))
    : cleanName(r.title);
  const verifiedMatch = VERIFIED_TW_MAP[r.id];
  const derivedPreviewCount = appendDerivedPreviewItems(r);
  const shopItemCount = appendFashionShopItems(r);

  const choiceSource = [r.title, r.fullText || ''].join(' ');
  const canParseChoiceBoxes = r.boardPath === '/News/Notice' && !/정기\s*점검|임시\s*점검/u.test(r.title);
  const candidateChoiceBoxes = canParseChoiceBoxes && /(?:염색약|악기)\s*선택\s*상자/u.test(choiceSource) && r.fullText
    ? parseChoiceBoxes(r.fullText)
    : [];
  const shouldSplitChoiceBoxes = category === '商城樂器'
    || /염색약\s*선택\s*상자/u.test(r.title)
    || candidateChoiceBoxes.length > 0;
  if (shouldSplitChoiceBoxes && candidateChoiceBoxes.length > 0) {
    const choiceBoxes = candidateChoiceBoxes;
    choiceBoxes.forEach((box, boxIdx) => {
      const manualImageConfig = INSTRUMENT_SPLIT[r.id]?.[boxIdx];
      const rawUrls = manualImageConfig
        ? manualImageConfig.imageIndices.map(i => r.contentImages[i]).filter(Boolean)
        : box.kind === 'instrument'
          ? selectInstrumentImages(r.contentImages)
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
        productTypeOverride: box.kind === 'dye' ? '染色劑選擇箱' : box.kind === 'instrument' ? '樂器' : undefined,
        ...(box.colorCodes?.length ? { colorCodes: box.colorCodes } : {}),
        componentsText: box.componentsText,
        ...(box.components?.length ? { components: box.components } : {}),
        krDate: box.saleDate || r.date,
        images: rawUrls,
        sourceUrl: r.url,
        ...twInfo,
      });
    });
    const noticeCore = [r.title, String(r.fullText || '').split(/\s+목록\s+(?:전체|안내|공지사항)/u)[0]].join(' ');
    const hasOtherNoticeProducts = splitMap.has(r.id)
      || /럭키\s*박스|토탈\s*패키지|패션샵|꾸미기/u.test(noticeCore);
    if (!hasOtherNoticeProducts) continue;
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
        derivedProductType: luckyBoxProductType(box.boxType),
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
        derivedProductType: luckyBoxProductType(entry.itemType),
        krDate: parseStartDate(entry.saleDateText) || r.date,
        images: [rawUrl],
        sourceUrl: r.url,
        ...twInfo,
      });
    }
    continue;
  }

  if (shopItemCount > 0) continue;

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

for (const manual of manualItems) {
  const verifiedMatch = VERIFIED_TW_MAP[manual.id];
  const twInfo = matchTwForImages(manual.images || [], verifiedMatch, manual.id, manual.name);
  items.push({
    ...manual,
    ...twInfo,
  });
}

// Add the user-facing product taxonomy after legacy records and split records have been built.
// `category` remains unchanged for Taiwan matching/history compatibility, while `productType`
// reflects the more precise official-notice meaning (for example, a special event lottery box
// can contain an instrument choice box without becoming a normal商城樂器 record).
const krById = new Map(kr.map(record => [String(record.id), record]));
for (const item of items) {
  const baseId = String(item.id)
    .replace(/_(?:box\d+|shop\d+)$/u, '')
    .replace(/_\d+$/u, '');
  const source = krById.get(String(item.id)) || krById.get(baseId);
  const product = classifyKrProduct({
    title: `${item.title || ''} ${item.name || ''}`,
    fullText: source?.fullText || '',
    sourceBoard: source?.boardPath || '',
    sourceCategory: source?.category || '',
  });
  let productType = item.productTypeOverride || item.derivedProductType || product.productType;
  // Event notices can mention dye/action rewards in their explanatory text, but they are not
  // standalone shop products. Their dedicated derived preview cards are only created from
  // official product notices, so keep the parent event card in the activity group.
  if (source?.boardPath === '/News/Events' && ['動作', '染色劑選擇箱'].includes(productType)) {
    productType = '活動時裝';
  }
  // Older vision-split/manual rows may not have a matching KR detail record. Keep their already
  // verified legacy category as a fallback instead of letting a generic title or an embedded dye
  // table turn a lucky-box card into商店時裝/染色劑選擇箱.
  if (item.category === '套組時裝') productType = '套組';
  else if (item.category === '傳說時裝') productType = '傳說時裝';
  else if (item.category === '通行證') productType = '通行證';
  else if (item.category === '聯動') productType = '聯名時裝';
  else if (item.category === '商城樂器') productType = '樂器';
  else if (!item.productTypeOverride && item.category === '幸運箱' && ['商店時裝', '染色劑選擇箱'].includes(productType)) {
    const petSignal = /펫|寵物/u.test(`${item.name || ''} ${item.displayName || ''} ${item.title || ''}`);
    productType = petSignal ? '寵物幸運盒' : '時裝幸運盒';
  }
  item.productType = productType;
  delete item.derivedProductType;
  item.relatedTypes = product.relatedTypes.filter(type => type !== productType);
  item.shopPath = product.shopPath;
  item.colorCodes = productType === '染色劑選擇箱'
    ? (item.choiceKind === 'dye' && item.colorCodes?.length ? item.colorCodes : product.colorCodes)
    : [];
  item.includePreviewImages = productType !== '染色劑選擇箱';
  item.legacyCategory = item.category || legacyCategoryForProductType(product.productType);
  item.sourceBoard = source?.boardPath || item.sourceBoard || null;
  const manualImages = manualImagesFor(item.id, source, item.images);
  const appendedImages = (MANUAL_IMAGE_APPENDICES[item.id] || []).flatMap(({ noticeId, imageIndices }) => {
    const appendSource = krById.get(String(noticeId));
    return imageIndices.map(index => appendSource?.contentImages?.[index]).filter(Boolean);
  });
  const curatedImages = manualImages
    ? [...new Set([...manualImages, ...appendedImages])]
    : null;
  const officialImages = curatedImages || selectOfficialImages(source?.contentImages || item.images || [], { productType });
  const isSplitItem = /_(?:box\d+|shop\d+|\d+)$/u.test(String(item.id));
  // Split records have an item-specific image list. Keep it scoped to the product so a card's
  // lightbox never exposes sibling products from the same mixed announcement. Unsplit records
  // keep the notice-level gallery because they represent the notice as one coherent product.
  const splitImages = isSplitItem && item.images?.length
    ? (curatedImages || selectOfficialImages(item.images, { productType }))
    : [];
  const eventCardImages = source?.boardPath === '/News/Events'
    ? (curatedImages || selectEventCardImages(officialImages, source?.fullText || item.fullText || ''))
    : officialImages;
  const itemGalleryImages = source?.boardPath === '/News/Events'
    ? eventCardImages
    : officialImages;
  item.galleryImages = productType === '染色劑選擇箱'
    ? []
    : (isSplitItem ? [...new Set(splitImages)] : [...new Set(itemGalleryImages)]);
  item.cardImages = productType === '染色劑選擇箱'
    ? []
    : (isSplitItem ? splitImages : eventCardImages);
}

// Do not publish text-only notices as timeline cards. A named shop product is the exception:
// it remains useful as a separate record even when the official notice has no standalone image,
// and the UI labels that limitation instead of borrowing a sibling product's image.
const visualItems = items.filter(item => !EXCLUDED_TIMELINE_ITEM_IDS.has(item.id)
  && !GENERIC_TIMELINE_NAME.test(item.name || '')
  && (item.productType === '染色劑選擇箱'
  ? item.colorCodes.length > 0
  : item.cardImages.length > 0 || item.isShopProduct === true));
visualItems.sort((a, b) => (a.krDate || '').localeCompare(b.krDate || ''));
const annotatedItems = annotateRepeatItems(visualItems).map(item => {
  if (!MANUAL_NON_RERUN_IDS.has(item.id)) return item;
  return {
    ...item,
    isRerun: false,
    firstReleaseId: item.id,
    firstReleaseDate: item.krDate,
    rerunIndex: 0,
  };
});

// Preserve already-downloaded/optimized localImages from a previous run, keyed by id. For
// freshly split items, also recover existing assets from the legacy fashion-web directory. This
// prevents a rebuilt dataset from emitting <img src=""> just because a split item's id is new.
const outPath = path.join(__dirname, '..', 'data', 'fashion.json');
const webAssetDir = path.join(__dirname, '..', 'assets', 'fashion-web');
const webAssetFiles = fs.existsSync(webAssetDir)
  ? fs.readdirSync(webAssetDir).filter(file => /\.(?:webp|png|jpe?g)$/i.test(file))
  : [];

function existingWebAssets(itemId) {
  const exactPrefix = `${itemId}_`;
  let matches = webAssetFiles.filter(file => file.startsWith(exactPrefix));
  if (!matches.length) {
    const noticeId = itemId.replace(/_box\d+$/u, '');
    if (noticeId !== itemId) matches = webAssetFiles.filter(file => file.startsWith(`${noticeId}_`));
  }
  return matches
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map(file => `assets/fashion-web/${file}`);
}

if (fs.existsSync(outPath)) {
  const prev = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  const prevMap = new Map(prev.map(p => [p.id, {
    localImages: p.localImages,
    motionImages: p.motionImages,
    lightboxImages: p.lightboxImages,
    galleryImages: p.galleryImages,
    cardImages: p.cardImages,
  }]));
  annotatedItems.forEach(i => {
    if (i.productType === '染色劑選擇箱') {
      i.localImages = [];
      delete i.lightboxImages;
      return;
    }
    const previous = prevMap.get(i.id);
    const sameImageSources = previous
      && JSON.stringify(previous.galleryImages || previous.cardImages || [])
        === JSON.stringify(i.galleryImages || i.cardImages || []);
    const expectedImageCount = (i.galleryImages || i.cardImages || []).length;
    const recovered = existingWebAssets(i.id);
    if (sameImageSources) {
      // Prefer the optimized web assets when the source files are present. The download
      // script may have refreshed the raw files since the last build, but that should not
      // make cards fall back to multi-megabyte PNG/GIF files in the browser.
      i.localImages = recovered.length === expectedImageCount
        ? recovered
        : previous.localImages;
      if (previous.motionImages?.length) i.motionImages = previous.motionImages;
      if (previous.lightboxImages?.length) i.lightboxImages = previous.lightboxImages;
    }
    if (!i.localImages?.length) {
      if (recovered.length === expectedImageCount) i.localImages = recovered;
    }
  });
}

fs.writeFileSync(outPath, JSON.stringify(annotatedItems, null, 2));
console.log('Built', annotatedItems.length, 'items');
const byCat = {};
annotatedItems.forEach(i => byCat[i.category] = (byCat[i.category] || 0) + 1);
console.log(byCat);
console.log('Reruns:', annotatedItems.filter(i => i.isRerun).length);
console.log('TW released (any piece):', annotatedItems.filter(i => i.twReleased).length);
console.log('TW fully released (all pieces):', annotatedItems.filter(i => i.twFullyReleased).length);
console.log('TW partially released:', annotatedItems.filter(i => i.twReleased && !i.twFullyReleased).length);
console.log('Items missing localImages:', annotatedItems.filter(i => !i.localImages?.length).length);
