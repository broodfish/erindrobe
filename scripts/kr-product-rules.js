// Product classification and official-notice metadata extraction.
// Keep this module free of filesystem/network side effects so rules can be tested with fixtures.

const PRODUCT_TYPES = [
  '時裝幸運盒', '寵物幸運盒', '傳說時裝', '套組', '通行證', '活動時裝',
  '聯名時裝', '商店時裝', '樂器', '染色劑選擇箱', '新造型', '髮型', '動作', '特殊活動抽獎盒',
];

function normalized(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function extractColorCodes(text) {
  const result = [];
  for (const match of normalized(text).matchAll(/#[0-9a-f]{6}\b/giu)) {
    const code = match[0].toUpperCase();
    if (!result.includes(code)) result.push(code);
  }
  return result;
}

function extractShopPath(text) {
  const source = normalized(text);
  const start = source.search(/게임\s*내\s*메뉴/u);
  if (start < 0) return [];
  const segment = source.slice(start, start + 220);
  const end = segment.search(/(?:판매\s*상품|상품명|공용\s*보관함|※)/u);
  const candidate = end >= 0 ? segment.slice(0, end) : segment;
  const labels = [...candidate.matchAll(/\[\s*([^\]]+?)\s*\]/gu)]
    .map(match => normalized(match[1]))
    .filter(Boolean);
  return labels.length ? labels : [normalized(candidate.replace(/\s*→\s*/g, ' → '))];
}

const PRODUCT_SIGNAL = /전설\s*패션|에픽\s*패션|토탈\s*패키지|패션\s*럭키\s*박스|펫\s*럭키\s*박스|행운\s*상자|행동\s*:|프리미엄\s*패스|시즌\s*패스|컬렉션\s*백|패션샵|꾸미기|패션\s*상점|패션|의상|외형|헤어|염색약|악기\s*(?:선택\s*)?상자|무기\s*(?:선택\s*)?상자|콜라보|컬래버|산리오/u;
const BODY_PRODUCT_SIGNAL = /전설\s*패션|에픽\s*패션|토탈\s*패키지|패션\s*럭키\s*박스|펫\s*럭키\s*박스|행운\s*상자|행동\s*:|프리미엄\s*패스|시즌\s*패스|컬렉션\s*백|패션샵|꾸미기|패션\s*상점|패션\s*장비|(?:헤어|헤어스타일)\s*(?:쿠폰|패키지|미리보기)|신규\s*환생.*헤어|염색약\s*선택\s*상자|악기\s*(?:선택\s*)?상자|무기\s*(?:선택\s*)?상자|의상\s*(?:선택|패키지|장비)|콜라보\s*(?:상품|패션)|컬래버\s*(?:상품|패션)|산리오/u;
const NON_PRODUCT_NOTICE_TITLE = /정기\s*점검|임시\s*점검|업데이트\s*노트|확인.{0,12}현상|오류\s*수정|서비스\s*개선|사전\s*등록|사전\s*예약|점검\s*미진행|연장\s*점검|당첨\s*안내|지급\s*완료|이벤트.*한눈에\s*보기|이벤트.*모아보기|이벤트\s*및\s*(?:주요\s*)?상품\s*일정\s*상세\s*안내|스크린샷\s*이벤트|난이도\s*오픈\s*사전\s*안내|콘텐츠\s*변경\s*사전\s*안내/u;
const APPEARANCE_PRODUCT_SIGNAL = /전설\s*패션\s*(?:세트|상자|장비)|에픽\s*패션\s*(?:세트|상자|장비)|토탈\s*패키지|패션\s*(?:럭키\s*박스|세트|모자|상의|하의|장갑|신발|장비\s*(?:상자|세트)|아이템|티셔츠|후드|예복|백팩|부츠|글러브)|펫\s*의상\s*(?:염색약|세트|상자)|(?:[가-힣A-Za-z0-9]{2,}\s+){1,4}(?:모자|후드|의상|세트)(?:\s*\([^)]*\))?|(?:변신\s*(?:모자|의상)|의태\s*(?:시약|물약))|헤어(?:스타일)?|신규\s*외형|외형\s*(?:쿠폰|미리보기)|악기\s*(?:선택\s*)?상자|염색약\s*(?:선택\s*)?상자|행운\s*상자|럭키\s*박스|콜라보\s*(?:상품|패션|아이템)|컬래버\s*(?:상품|패션|아이템)|산리오/u;

function hasAppearanceProductSignal(text) {
  // Tickets and gender-change vouchers mention "fashion" but do not introduce a new visual
  // product. Remove those phrases before testing the event body so generic reward announcements
  // do not become fashion timeline cards.
  const source = normalized(text);
  // Keep a real named fashion-equipment product (e.g. "패션 장비 로스트 문스케이프 예복"),
  // but do not treat generic gender-change vouchers or equipment explanations as a product.
  const namedFashionEquipment = /패션\s*장비(?:\s*\([^)]*\))?\s+[가-힣A-Za-z0-9][^,。.!?]{1,36}(?:세트|예복|후드|백팩|모자|상의|하의|장갑|신발|부츠|글러브|햇)/u.test(source);
  const withoutTickets = source
    .replace(/(?:프리미엄\s*)?패션(?:\s*장비)?(?:\s*\([^)]*\))?\s*(?:성별\s*변경권|티켓)/gu, ' ')
    .replace(/(?:성별|공용|기존|동일한|일부)\s*패션\s*장비/gu, ' ')
    .replace(/패션\s*장비/gu, ' ')
    .replace(/기존\s*의상/gu, ' ')
    .replace(/(?:인장|방어구|무기|보상|장비)\s*:\s*(?:모자|상의|하의|장갑|신발)/gu, ' ');
  return namedFashionEquipment || APPEARANCE_PRODUCT_SIGNAL.test(withoutTickets);
}

function isRelevantKrProductNotice({ title = '', fullText = '', sourceBoard = '' } = {}) {
  const titleText = normalized(title);
  const bodyText = normalized(fullText).split(/\s+목록\s+(?:전체|안내|공지사항)/u)[0];
  const titleHasSignal = PRODUCT_SIGNAL.test(titleText);
  const bodyHasSignal = BODY_PRODUCT_SIGNAL.test(bodyText);
  // Maintenance/update notices often contain a generic product footer or unrelated reward text.
  // Product releases are published as their own notices, so do not turn these operational pages
  // into timeline cards even when their body lists products that are ending or being updated.
  if (NON_PRODUCT_NOTICE_TITLE.test(titleText)) return false;
  if (sourceBoard === '/News/Events') {
    return (titleHasSignal || bodyHasSignal)
      && hasAppearanceProductSignal(`${titleText} ${bodyText}`);
  }
  // Generic notice titles can contain the site's repeated cash-shop vocabulary. Require the
  // body to name an actual appearance/product signal unless the title itself is an explicit
  // product notice (e.g. 전설 패션, 럭키박스, 프리미엄 패스).
  return titleHasSignal || hasAppearanceProductSignal(bodyText);
}

function relatedTypes(source) {
  const result = [];
  if (/악기/u.test(source)) result.push('樂器');
  if (/무기\s*(?:선택|미리보기)|패션\s*무기/u.test(source)) result.push('武器預覽');
  if (/미리보기/u.test(source)) result.push('預覽');
  if (/헤어|헤어스타일/u.test(source)) result.push('髮型');
  if (/행동\s*:/u.test(source)) result.push('動作');
  if (/꾸미기|액세서리|로브/u.test(source)) result.push('新造型');
  return result;
}

function classifyKrProduct({ title = '', fullText = '', sourceBoard = '', sourceCategory = '' } = {}) {
  const titleText = normalized(title);
  const bodyText = normalized(fullText).split(/\s+목록\s+(?:전체|안내|공지사항)/u)[0];
  const combined = normalized(`${titleText} ${bodyText}`);
  let productType = '商店時裝';

  // The page footer repeats links to every category. Resolve explicit title signals first so a
  // legendary notice is not accidentally classified as a lucky box just because the footer also
  // mentions "패션 럭키박스".
  if (/행동\s*:/u.test(titleText)) productType = '動作';
  else if (/염색약\s*선택\s*상자/u.test(titleText)) productType = '染色劑選擇箱';
  else if (/펫\s*럭키\s*박스/u.test(titleText)) productType = '寵物幸運盒';
  else if (/패션\s*럭키\s*박스/u.test(titleText)) productType = '時裝幸運盒';
  else if (/행운\s*상자/u.test(titleText)) productType = '特殊活動抽獎盒';
  else if (/전설\s*패션|에픽\s*패션/u.test(titleText)) productType = '傳說時裝';
  else if (/토탈\s*패키지/u.test(titleText)) productType = '套組';
  else if (/프리미엄\s*패스|시즌\s*패스|통행증/u.test(titleText)) productType = '通行證';
  else if (/콜라보|컬래버|산리오/u.test(titleText)) productType = '聯名時裝';
  else if (/헤어|헤어스타일|신규\s*외형/u.test(titleText)) productType = '髮型';
  else if (/악기/u.test(titleText)) productType = '樂器';
  else if (/패션샵|패션\s*상점/u.test(titleText)) productType = '商店時裝';
  else if (sourceBoard === '/News/Events'
    && /패션|의상|외형|아틀리에/u.test(titleText)
    && !/콜라보|컬래버|산리오/u.test(bodyText)) productType = '活動時裝';
  // Generic titles such as "신규 상품 안내" are resolved from the actual notice body.
  else if (/행동\s*:/u.test(bodyText)) productType = '動作';
  else if (/염색약\s*선택\s*상자/u.test(bodyText)) productType = '染色劑選擇箱';
  else if (/펫\s*럭키\s*박스/u.test(bodyText)) productType = '寵物幸運盒';
  else if (/패션\s*럭키\s*박스/u.test(bodyText)) productType = '時裝幸運盒';
  else if (/행운\s*상자/u.test(bodyText)) productType = '特殊活動抽獎盒';
  else if (/전설\s*패션|에픽\s*패션/u.test(bodyText)) productType = '傳說時裝';
  else if (/토탈\s*패키지/u.test(bodyText)) productType = '套組';
  else if (/프리미엄\s*패스|시즌\s*패스|통행증/u.test(bodyText)) productType = '通行證';
  else if (/콜라보|컬래버|산리오/u.test(bodyText)) productType = '聯名時裝';
  else if (/헤어\s*(?:쿠폰|패키지|미리보기)|헤어스타일|신규\s*(?:헤어|외형)|환생\s*전용\s*헤어/u.test(bodyText)) productType = '髮型';
  else if (/악기\s*(?:선택\s*)?상자|악기/u.test(bodyText)) productType = '樂器';
  else if (sourceBoard === '/News/Events' && /패션|의상|외형|아틀리에/u.test(bodyText)) productType = '活動時裝';
  else if (/패션샵|패션\s*상점|캐시샵|신규\s*상품|패키지/u.test(bodyText)) productType = '商店時裝';

  const related = relatedTypes(combined).filter(type => type !== productType);
  if (productType === '特殊活動抽獎盒' && /악기/u.test(combined) && !related.includes('樂器')) related.push('樂器');
  const shopPath = extractShopPath(combined);
  const colorCodes = extractColorCodes(combined);
  return {
    productType,
    relatedTypes: [...new Set(related)],
    shopPath,
    colorCodes,
    includePreviewImages: productType !== '染色劑選擇箱',
    keywordMatches: PRODUCT_TYPES.filter(type => type === productType || related.includes(type)),
    sourceCategory,
  };
}

function selectOfficialImages(images, { productType } = {}) {
  if (productType === '染色劑選擇箱') return [];
  if (productType === '動作') return [...new Set((images || []).filter(Boolean))];
  return [...new Set((images || []).filter(url => url && !/\.gif(?:\?|$)/iu.test(url)))];
}

function legacyCategoryForProductType(productType) {
  if (productType === '套組') return '套組時裝';
  if (productType === '傳說時裝') return '傳說時裝';
  if (['時裝幸運盒', '寵物幸運盒', '特殊活動抽獎盒'].includes(productType)) return '幸運箱';
  if (productType === '通行證') return '通行證';
  if (productType === '聯名時裝') return '聯動';
  if (productType === '樂器') return '商城樂器';
  return '其他商城';
}

module.exports = {
  PRODUCT_TYPES,
  classifyKrProduct,
  extractColorCodes,
  extractShopPath,
  hasAppearanceProductSignal,
  isRelevantKrProductNotice,
  legacyCategoryForProductType,
  selectOfficialImages,
};
