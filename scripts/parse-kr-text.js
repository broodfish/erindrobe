// Parse structured item names + sale dates directly from KR notice body text, instead of
// vision-reading promotional banner images. The notice text already contains the authoritative
// official names (e.g. "정열의 춤 : 패션 럭키박스") in a "✨ NAME" section-header pattern, each
// followed by a "분류/구성품" item table — far more reliable than OCR-style image reading, which
// previously invented plausible-but-wrong names like "정열의 춤: 카르메나 세트" (the real box name
// is "정열의 춤"; "카르메나" is just the equipment set's internal prefix, not the box title).
const fs = require('fs');
const path = require('path');

const kr = require(path.join(__dirname, '..', 'data', 'raw', 'kr-details.json'));

function parseDateRange(text) {
  const m = text.match(/판매\s*기간\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일/);
  if (!m) return null;
  const [, y, mo, d] = m;
  return `${y}.${mo.padStart(2, '0')}.${d.padStart(2, '0')}`;
}

function parseTotalPackageName(text) {
  if (!text) return null;
  const normalized = String(text).replace(/\s+/g, ' ').trim();
  const patterns = [
    /✨\s*([^✨]{2,30}?)\s*토탈\s*패키지/gu,
    /(?:^|\s)([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&-]{1,30}?)\s*토탈\s*패키지/gu,
  ];
  const candidates = [];
  for (const pattern of patterns) {
    for (const match of normalized.matchAll(pattern)) {
      const name = match[1].trim().replace(/^(?:종합\s*안내|안내)\s*/u, '');
      const after = normalized.slice(match.index + match[0].length);
      const hasHeadingBoundary = /^(?:\s*(?:🌟|◼|와|종합\s*안내|$))/u.test(after);
      if (name && hasHeadingBoundary && !/토탈\s*패키지|구매|제공되는|리워드|주요상품/u.test(name)) {
        candidates.push({ name, index: match.index });
      }
    }
  }
  candidates.sort((a, b) => a.index - b.index);
  return candidates.length ? candidates[0].name : null;
}

function parseDateFromContext(text) {
  const m = String(text || '').match(/(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일|\b(\d{4})[./](\d{1,2})[./](\d{1,2})\b/u);
  if (!m) return null;
  const year = m[1] || m[4];
  const month = m[2] || m[5];
  const day = m[3] || m[6];
  return `${year}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}`;
}

function extractColorCodes(text) {
  return [...new Set([...String(text || '').matchAll(/#[0-9a-f]{6}\b/giu)]
    .map(match => match[0].toUpperCase()))];
}

function normalizeImageName(value) {
  return String(value || '')
    .toLocaleLowerCase('ko-KR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

const INSTRUMENT_TERMS = '류트|플루트|바이올린|샬루모|만돌린|실로폰|피아노|큰북|하프|심벌즈|하모니카|통기타';
const INSTRUMENT_METADATA_WORDS = new Set([
  '상품명', '구성품', '수량', '가격', '구매', '제한', '없음', '개', '당', '회', '화음',
  '악기', '선택', '상자', '중', '종', '종을', '색상', '지정', '염색약', '게시글을', '게시글', '아이템샵', '안내', '마비노기모바일',
  '노블리드', '노블브리드', '스포티드', '그레이', '캐릭터당', '서버당', '월', '캐시샵', '포인트', '캐시', '레어', '고급', '탈것', '있습니다', '수',
  '획득', '선택하여', '확인하실', '시', '미리', '미리보기',
]);

function cleanInstrumentComponentName(value) {
  const words = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .filter(word => !INSTRUMENT_METADATA_WORDS.has(word) && !/^\d[\d,]*(?:회|개|종|종을)?$/.test(word));
  // The official tables flatten several columns together. The last four words are enough for
  // the longest current names (for example, "쿠로미의 트리키 프리티 피아노") and discard the
  // preceding quantity/price column text without relying on a fixed product vocabulary.
  return words.slice(-4).join(' ');
}

function collectInstrumentNames(text, suffix = '') {
  const matches = [];
  const pattern = new RegExp(`(?:${INSTRUMENT_TERMS})`, 'gu');
  let previousEnd = 0;
  for (const match of text.matchAll(pattern)) {
    const segment = text.slice(previousEnd, match.index);
    const name = cleanInstrumentComponentName(`${segment} ${match[0]}`);
    if (name) matches.push({ index: match.index, name: `${name}${suffix}` });
    previousEnd = match.index + match[0].length;
  }
  return matches.sort((a, b) => a.index - b.index).map(match => match.name);
}

function parseInstrumentComponents(section) {
  // The notice extractor flattens an HTML table into text. Some notices group all base
  // instruments first, while others interleave each base item with its 2/3-chord rows. Walk
  // instrument terms in order and carry the previous base name forward when a chord row has
  // no repeated name of its own.
  const previewIndex = section.search(/(?:◼|※)\s*구성품\s*미리보기|✨[^.!?。！？]{0,120}미리보기/u);
  const table = previewIndex >= 0 ? section.slice(0, previewIndex) : section;
  const components = [];
  const pattern = new RegExp('(?:' + INSTRUMENT_TERMS + ')', 'gu');
  let previousEnd = 0;
  let previousBase = null;
  for (const match of table.matchAll(pattern)) {
    let segment = table.slice(previousEnd, match.index);
    const boxMarker = segment.lastIndexOf('악기 선택 상자');
    if (boxMarker >= 0) segment = segment.slice(boxMarker + '악기 선택 상자'.length);
    const chordMatches = [...segment.matchAll(/(?:^|\s)([23])\s*화음/gu)];
    const chord = chordMatches.length ? chordMatches.at(-1)[1] : null;
    if (chordMatches.length) segment = segment.slice(chordMatches.at(-1).index + chordMatches.at(-1)[0].length);
    const base = cleanInstrumentComponentName(segment + ' ' + match[0]) || previousBase;
    if (base) {
      components.push(chord ? base + ' ' + chord + ' 화음' : base);
      if (!chord) previousBase = base;
    }
    previousEnd = match.index + match[0].length;
  }
  return [...new Set(components)];
}

function extractInstrumentBoxName(source, instrumentIndex) {
  const prefixStart = Math.max(0, instrumentIndex - 100);
  const startsMidWord = prefixStart > 0 && !/\s/u.test(source[prefixStart - 1]);
  let prefix = source.slice(prefixStart, instrumentIndex)
    .replace(/\s+/g, ' ')
    .trim();
  // The context window can begin in the middle of a Korean word. Discard that partial token
  // before extracting the box name.
  if (startsMidWord) prefix = prefix.replace(/^\S+\s+/u, '');
  const markerMatches = [...prefix.matchAll(/(?:상품명|상세\s*내용|미리보기)/gu)];
  if (markerMatches.length) prefix = prefix.slice(markerMatches.at(-1).index + markerMatches.at(-1)[0].length);
  const colorMatches = [...prefix.matchAll(/#[0-9a-f]{6}/giu)];
  if (colorMatches.length) prefix = prefix.slice(colorMatches.at(-1).index + colorMatches.at(-1)[0].length);
  const boundaryMatches = [...prefix.matchAll(/[.!?。！？]/gu)];
  if (boundaryMatches.length) prefix = prefix.slice(boundaryMatches.at(-1).index + 1);
  prefix = prefix
    .replace(/(?:부채질|음악듣기|반디잡기)/gu, ' ')
    .replace(/차단하여\s*내용을\s*가립니다\.?/gu, ' ')
    .replace(/\b\d{4}[./]\d{1,2}[./]\d{1,2}\s+\d{1,2}:\d{2}\s*/gu, ' ')
    .replace(/\b\d{1,2}\/\d{1,2}\([^)]*\)\s*/gu, ' ')
    .replace(/\b[0-9a-f]{5,}\b/giu, ' ')
    .replace(/[‘’'“”]/gu, ' ')
    .replace(/^[^\p{L}\p{N}]*/u, '')
    .trim();
  const words = prefix.split(/\s+/).filter(Boolean)
    .map(word => word.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, ''))
    .filter(Boolean)
    .filter(word => !INSTRUMENT_METADATA_WORDS.has(word) && !/^\d+(?:회|개|종)?$/.test(word));
  const name = words.slice(-3).join(' ').trim();
  return name ? `${name} 악기 선택 상자` : null;
}

function parseChoiceBoxes(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];
  const matches = [];

  const dyeRe = /염색약\s*선택\s*상자\s*[:：]\s*([^\d]{1,40}?)(?=\s+(?:지정\s*)?염색약|\s+\d+\s*개)/gu;
  let match;
  while ((match = dyeRe.exec(source))) {
    const dyeName = match[1].trim().replace(/[/'’“”]+$/gu, '');
    if (!dyeName || /[/]|에서는|구성품|판매|상품명/u.test(dyeName)) continue;
    const nextSection = [
      source.indexOf('염색약 선택 상자', match.index + match[0].length),
      source.indexOf('악기 선택 상자', match.index + match[0].length),
    ].filter(index => index >= 0);
    const sectionEnd = nextSection.length ? Math.min(...nextSection) : source.length;
    const colorCodes = extractColorCodes(source.slice(match.index, sectionEnd));
    matches.push({
      index: match.index,
      name: `염색약 선택 상자: ${dyeName}`,
      kind: 'dye',
      saleDate: parseDateFromContext(source),
      componentsText: source.slice(match.index, sectionEnd).match(/\(([^)]{1,80})\)/u)?.[1] || '',
      ...(colorCodes.length ? { colorCodes } : {}),
    });
  }

  const instrumentRe = /악기\s*선택\s*상자\s*(?:◼\s*판매\s*기간|상세\s*내용)/gu;
  const instrumentMatches = [...source.matchAll(instrumentRe)];
  instrumentMatches.forEach((item, index) => {
    const next = instrumentMatches[index + 1];
    const contentStart = item.index + item[0].length;
    const contentEnd = next ? next.index : source.length;
    const contentText = source.slice(contentStart, contentEnd).trim();
    const boxName = extractInstrumentBoxName(source, item.index);
    if (!boxName) return;
    matches.push({
      index: item.index,
      name: boxName,
      kind: 'instrument',
      saleDate: parseDateFromContext(source),
      componentsText: contentText,
      components: parseInstrumentComponents(contentText),
    });
  });

  const seen = new Set();
  return matches
    .sort((a, b) => a.index - b.index)
    .filter((item) => {
      if (seen.has(item.name)) return false;
      seen.add(item.name);
      return true;
    })
    .map(({ index, ...item }) => item);
}

// Split a lucky-box notice's text into per-box sections and extract each box's official name +
// the item-list's common name prefix (the actual equipment set name, e.g. "카르메나").
function parseLuckyBoxNotice(text) {
  const results = [];
  // Section markers: "패션 럭키박스" / "펫 럭키박스" blocks, each with one shared 판매 기간
  // covering every ✨-prefixed box title inside it until the next section marker.
  const sectionRe = /(패\s*션\s*럭키\s*박스|펫\s*럭키\s*박스)\s*◼\s*판매\s*기간\s*[:：]\s*(\d{4})\s*년\s*(\d{1,2})월\s*(\d{1,2})일/g;
  const sections = [];
  let m;
  while ((m = sectionRe.exec(text))) {
    sections.push({ start: m.index, kind: m[1].replace(/\s+/g, ''), date: `${m[2]}.${m[3].padStart(2, '0')}.${m[4].padStart(2, '0')}` });
  }
  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const end = i + 1 < sections.length ? sections[i + 1].start : text.length;
    const chunk = text.slice(sec.start, end);
    // Box-title headers are prefixed by a themed emoji (✨ for fashion, but pet boxes use varied
    // animal emoji like 🐷/🐺/🦉), so match on any pictographic-symbol prefix rather than a fixed
    // emoji, capturing the short name phrase immediately before the distinctive
    // ": 패션 럭키박스"/": 펫 럭키박스" suffix.
    // Exclude U+25A0-25FF (geometric shapes, e.g. ◼) — notices use that as a generic bullet for
    // "◼ 판매 기간" etc., which is also Extended_Pictographic and would otherwise swallow
    // unrelated preceding text into the capture.
    const boxRe = /(?![■-◿])\p{Extended_Pictographic}\s*\[?\s*([^\[\]\n:]{1,20}?)\s*:\s*(패\s*션\s*럭키\s*박스|펫\s*럭키\s*박스)\s*\]?/gu;
    let bm;
    while ((bm = boxRe.exec(chunk))) {
      const boxName = bm[1].replace(/^[^\p{L}\p{N}]+/u, '').trim();
      const boxType = bm[2].replace(/\s+/g, '');
      // Grab the item-list chunk between this box header and the next one (or chunk end) to find
      // the equipment set's common name prefix, e.g. repeated "봄바람 스포츠 ..." -> "봄바람 스포츠".
      const afterIdx = bm.index + bm[0].length;
      const nextBoxM = boxRe.exec(chunk);
      const itemChunkEnd = nextBoxM ? nextBoxM.index : chunk.length;
      boxRe.lastIndex = nextBoxM ? nextBoxM.index : boxRe.lastIndex; // rewind so outer loop still sees it
      const itemChunk = chunk.slice(afterIdx, itemChunkEnd);
      const setNameM = itemChunk.match(/패션\s*장비\s*\(\s*4\s*종\s*\)\s*([^\d(]{2,20}?)(?:캡|햇|페도라|후드|모자)/);
      results.push({
        boxName,
        boxType,
        date: sec.date,
        setNamePrefix: setNameM ? setNameM[1].trim() : null,
      });
      if (!nextBoxM) break;
    }
  }
  return results;
}

// Parse the separately sold fashion-shop products that can appear after lucky-box sections
// in the same notice. The official text keeps the shop table authoritative; image association
// is intentionally left to build-dataset.js, where the notice's image filenames are available.
function parseFashionShopProducts(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!source) return [];

  const headings = [...source.matchAll(/(?:패션샵|꾸미기)\s*◼\s*판매\s*기간/gu)];
  if (!headings.length) return [];
  const start = headings[headings.length - 1].index;
  const endCandidates = [
    source.indexOf('📢', start),
    source.indexOf('목록 전체', start),
  ].filter(index => index >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) : source.length;
  const section = source.slice(start, end);
  const saleDate = parseDateFromContext(section);
  const products = [];

  // Keep the older 패션샵/코디 rows supported as well; newer notices use the same table shape
  // under 꾸미기 for accessories and robes.
  const coordRe = /([가-힣A-Za-z0-9][가-힣A-Za-z0-9\s·&'’\-]{1,40}?\s*코디)\s*\([^)]*총\s*\d+\s*종\s*부위\)/gu;
  for (const match of section.matchAll(coordRe)) {
    const rawName = match[1].replace(/\s+/g, ' ').trim();
    const nameMatch = rawName.match(/(?:가격|M\s*캐시)\s+(.+?\s+코디)$/u);
    products.push({
      name: (nameMatch ? nameMatch[1] : rawName).replace(/\s+/g, ' ').trim(),
      kind: 'coord',
      saleDate,
    });
  }

  // Newer notices use 꾸미기 instead of 패션샵 and flatten the item table into one line. Start at
  // the accessory/robe table header (or its first row) so the preceding lucky-box table cannot
  // leak into the shop products.
  const tableStart = section.search(/(?:\[\s*(?:액세서리|로브)\s*\]|아이템명\s+장착\s+부위)/u);
  if (tableStart >= 0) {
    const table = section.slice(tableStart);
    const tableEndCandidates = [table.indexOf('✨'), table.indexOf('📢')].filter(index => index >= 0);
    const tableBody = tableEndCandidates.length ? table.slice(0, Math.min(...tableEndCandidates)) : table;
    const slotPattern = '(모자|상의|하의|장갑|신발|부츠|얼굴\\s*장식|얼굴장식|귀\\s*장식|귀장식|눈\\s*장식|눈장식|머리\\s*장식|머리장식|로브)';
    const rarityPattern = '(?:(?:에픽|엘리트|레어|고급|희귀)\\s+){0,2}';
    const rowRe = new RegExp(`([^\\d]{2,70}?)\\s+${slotPattern}\\s+${rarityPattern}\\d+\\s*개(?:\\s+\\d[\\d,]*\\s*M\\s*캐시)?`, 'gu');
    const reverseRowRe = new RegExp(`${slotPattern}\\s*(?:\\([^)]*\\))?\\s+${rarityPattern}([^\\d]{2,70}?)\\s+\\d+\\s*개(?:\\s+\\d[\\d,]*\\s*M\\s*캐시)?`, 'gu');
    const inferPriorSlot = rawName => {
      const nameIndex = tableBody.indexOf(String(rawName || '').trim());
      if (nameIndex < 0) return '';
      const slots = [...tableBody.slice(0, nameIndex).matchAll(new RegExp(slotPattern, 'gu'))];
      return slots.at(-1)?.[1] || '';
    };
    const addProduct = (rawName, slot = '') => {
      let name = rawName.replace(/\s+/g, ' ').trim();
      name = name.replace(/^.*(?:구매\s*제한|지급\s*수량|가격)\s+/u, '').trim();
      name = name.replace(/^.*M\s*캐시\s+/u, '').trim();
      name = name.replace(/^\d+\s+서버당\s+\S+\s+\d+\s*회\s+/u, '').trim();
      name = name.replace(/^\d+\s+/u, '').trim();
      name = name.replace(/^(?:아이템명|장착\s*부위|희귀도|수량)\s+/u, '').trim();
      name = name.replace(/^(?:(?:에픽|엘리트|레어|고급|희귀)(?:\s+희귀도)?\s+)+패션\s+(?:모자|상의|하의|장갑|신발|부츠|얼굴\s*장식|얼굴장식|귀\s*장식|귀장식|눈\s*장식|눈장식|머리\s*장식|머리장식|로브)\s+/u, '').trim();
      name = name.replace(/^(?:회|없음)\s+/u, '').trim();
      name = name.replace(/\s+(?:모자|상의|하의|장갑|신발|부츠|얼굴\s*장식|얼굴장식|귀\s*장식|귀장식|눈\s*장식|눈장식|머리\s*장식|머리장식|로브)(?:\s+(?:에픽|엘리트|레어|고급|희귀))?$/u, '').trim();
      name = name.replace(/\s+(?:에픽|엘리트|레어|고급|희귀)$/u, '').trim();
      if (!name || /^(?:아이템명|장착|부위|희귀도|수량|가격|구매|제한|에픽|엘리트|레어|고급|희귀)$/u.test(name)) return;
      if (name.length > 45) name = name.slice(-45).trim();
      const officialSlot = String(slot || '').replace(/\s+/g, ' ').trim();
      products.push({
        name,
        kind: /로브/u.test(officialSlot) ? 'robe' : 'accessory',
        saleDate,
        ...(officialSlot ? { officialSlot, slotDomain: 'fashion-equipment' } : {}),
      });
    };
    for (const match of tableBody.matchAll(rowRe)) addProduct(match[1], match[2]);
    for (const match of tableBody.matchAll(reverseRowRe)) addProduct(match[2], match[1]);

    // A continuation row can omit the repeated slot/rarity columns and only keep the item
    // name, quantity, and price. Match that compact shape directly instead of allowing the
    // trailing price label to become part of the next item's name.
    const continuationTable = tableBody.replace(/\d+\s+서버당\s+\S+\s+\d+\s*회/gu, ' ');
    const continuationRe = /(?:^|\s)([가-힣A-Za-z][가-힣A-Za-z\s·&'’\-]{1,60}?)\s+1\s*개\s+(?:\d[\d,]*\s+){0,3}\d[\d,]*\s*M\s*캐시/gu;
    const tableRowMetaTailRe = /(?:모자|상의|하의|장갑|신발|부츠|얼굴\s*장식|얼굴장식|귀\s*장식|귀장식|눈\s*장식|눈장식|머리\s*장식|머리장식|로브)\s+(?:에픽|엘리트|레어|고급|희귀)(?:\s+(?:에픽|엘리트|레어|고급|희귀))?$/u;
    for (const match of continuationTable.matchAll(continuationRe)) {
      if (tableRowMetaTailRe.test(match[1].trim())) continue;
      addProduct(match[1], inferPriorSlot(match[1]));
    }

    // Some tables omit the repeated slot and rarity on later rows (for example the third item in
    // the 1/15 accessory notice). The final "name 1개" row is still unambiguous before the preview.
    const trailingRe = /([^\d]{2,50}?)\s+\d+\s*개(?=\s*(?:✨|$))/gu;
    for (const match of tableBody.matchAll(trailingRe)) addProduct(match[1], inferPriorSlot(match[1]));
  }

  const seen = new Set();
  const uniqueProducts = [];
  for (const product of products) {
    if (!product.name) continue;
    const escapedProductName = product.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    if (new RegExp(`${escapedProductName}\\s+이미지가\\s*삭제되었습니다`, 'u').test(source)) continue;
    const existingIndex = uniqueProducts.findIndex(existing => existing.name === product.name);
    if (existingIndex >= 0) {
      // A reverse-row match can discover the same robe before the complete row match. Prefer the
      // typed robe record so the resulting card keeps the correct product classification.
      if (uniqueProducts[existingIndex].kind !== 'robe' && product.kind === 'robe') {
        uniqueProducts[existingIndex] = product;
      }
      continue;
    }
    if (seen.has(product.name)) continue;
    seen.add(product.name);
    uniqueProducts.push(product);
  }
  return uniqueProducts.map(product => {
    if (product.kind === 'coord') return product;
    // Some notices use a clarifying parenthetical only in the preview heading, e.g. the
    // front-facing accessory image is listed as "그라운디드 소울 마스크 (정면)".
    const escapedName = product.name.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
    const qualifier = source.match(new RegExp(`${escapedName}\\s*(\\([^)]{1,24}\\))`, 'u'))?.[1];
    const isEditorialQualifier = /^\((?:수정|취소)\)$/u.test(qualifier || '');
    return qualifier && !isEditorialQualifier && !product.name.endsWith(qualifier)
      ? { ...product, name: `${product.name} ${qualifier}` }
      : product;
  }).sort((a, b) => {
    const baseName = name => name.replace(/\s+\([^)]*\)$/u, '');
    return source.indexOf(baseName(a.name)) - source.indexOf(baseName(b.name));
  });
}

function parseAppearanceProducts(text) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  if (!/\b커스터마이징\b|환생\s*시\s*선택할\s*수\s*있는\s*(?:새로운\s*)?외형/u.test(source)) return [];

  const slotMap = new Map([
    ['헤어', 'hair'],
    ['눈', 'eyes'],
    ['입', 'mouth'],
    ['얼굴꾸밈', 'face'],
    ['얼굴 꾸밈', 'face'],
    ['몸꾸밈', 'body'],
    ['몸 꾸밈', 'body'],
  ]);
  const products = [];
  const itemRe = /(헤어(?:\s*\([^)]*\))?|눈|입|얼굴\s*꾸밈|몸\s*꾸밈)\s*[-–]\s*(.+?)(?=\s+(?:헤어(?:\s*\([^)]*\))?|눈|입|얼굴\s*꾸밈|몸\s*꾸밈)\s*[-–]|\s+\[|\s+클래스\s*\/\s*룬|$)/gu;
  for (const match of source.matchAll(itemRe)) {
    const officialSlot = match[1].replace(/\s*\([^)]*\)\s*/gu, '').replace(/\s+/g, ' ').trim();
    const name = match[2].replace(/\s*\*.*$/u, '').trim();
    const appearanceSlot = slotMap.get(officialSlot);
    if (!appearanceSlot || !name || products.some(product => product.name === name && product.appearanceSlot === appearanceSlot)) continue;
    products.push({ name, appearanceSlot, officialSlot, slotDomain: 'character-appearance' });
  }
  return products;
}

function parseHairProducts(text, images = []) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const products = [];
  const hairRe = /헤어\s*쿠폰\s*[:：]\s*([^\d]{2,60}?)(?=\s+(?:\*\s+[^*]*?)?\d+\s*개|\s+프리미엄|\s+환생석|\s+염색약)/gu;
  for (const match of source.matchAll(hairRe)) {
    const name = match[1]
      .replace(/\s*\*.*$/u, '')
      .trim()
      .replace(/[/'’“”]+$/gu, '');
    if (!name || products.some(product => product.name === name)) continue;
    const normalizedName = normalizeImageName(name);
    const matchedImages = [...new Set((images || []).filter(url => {
      if (/\.gif(?:\?|$)/iu.test(url)) return false;
      const file = decodeURIComponent(String(url)).split('/').pop() || '';
      return normalizeImageName(file).includes(normalizedName);
    }))];
    products.push({ name, images: matchedImages });
  }
  return products;
}

function cleanActionName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.,:;!?/\\'’“”"()[\]{}]+$/gu, '')
    .trim();
}

function parseActionPreviews(text, images = []) {
  const source = String(text || '').replace(/\s+/g, ' ').trim();
  const actionImages = [...new Set((images || []).filter(url => /\.gif(?:\?|$)/iu.test(url)))];
  if (!source || !actionImages.length) return [];

  const names = [];
  const actionRe = /행동\s*:\s*([가-힣A-Za-z0-9][가-힣A-Za-z0-9·&!?/'’"-]{1,35}?)(?=\s*(?:\d+\s*개|미리보기|행동\s*:|[◼✨*'’".,]|$))/gu;
  for (const match of source.matchAll(actionRe)) {
    const name = cleanActionName(match[1]);
    if (!name || /^(?:미리보기|사용|실제|아이템|상자)$/u.test(name)) continue;
    if (!names.includes(name)) names.push(name);
  }
  if (!names.length) return [];

  const aliasMap = new Map([
    ['초콜릿선물', ['초콜릿주기']],
    ['짜잔', ['짜쟌']],
    ['나아냐', ['나아나']],
    ['음악듣기', ['음악감상']],
    ['연설', ['연설하기']],
  ]);
  const matchImages = name => {
    const candidates = [name, ...(aliasMap.get(name) || [])]
      .map(normalizeImageName)
      .filter(candidate => candidate.length >= 2);
    return actionImages.filter(url => {
      const file = decodeURIComponent(String(url)).split('/').pop() || '';
      const stem = normalizeImageName(file.replace(/\.[^.]+$/u, ''));
      return candidates.some(candidate => stem.includes(candidate));
    });
  };

  const parsed = names.map(name => {
    const matchedImages = matchImages(name);
    return {
      name: `행동: ${name}`,
      images: [...new Set(matchedImages)],
    };
  });

  // If at least one filename is action-specific, an unmatched name has no trustworthy preview;
  // dropping it prevents the entire notice GIF gallery from being copied onto unrelated cards.
  // Some official notices intentionally use a shared success/failure pair for every named
  // action (for example colour variants), so retain that pair only when no action can be matched.
  const hasSpecificMatch = parsed.some(product => product.images.length > 0);
  return hasSpecificMatch
    ? parsed.filter(product => product.images.length > 0)
    : parsed.map(product => ({ ...product, images: actionImages }));
}

if (require.main === module) {
  const testIds = process.argv.slice(2);
  const ids = testIds.length ? testIds : ['2839212', '2906352', '3037067', '3201524', '2957846'];
  ids.forEach(id => {
    const r = kr.find(x => x.id === id);
    if (!r || !r.fullText) { console.log(id, 'NO DATA'); return; }
    console.log('===', id, r.pageTitle);
    console.log(JSON.stringify(parseLuckyBoxNotice(r.fullText), null, 2));
  });
}

module.exports = {
  parseActionPreviews,
  parseFashionShopProducts,
  parseAppearanceProducts,
  parseHairProducts,
  parseLuckyBoxNotice,
  parseDateRange,
  parseTotalPackageName,
  parseChoiceBoxes,
};
