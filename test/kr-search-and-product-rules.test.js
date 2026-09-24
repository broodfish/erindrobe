const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseOfficialSearchResults,
  buildSearchQueries,
} = require('../scripts/kr-official-search.js');
const {
  classifyKrProduct,
  extractColorCodes,
  isRelevantKrProductNotice,
  selectOfficialImages,
} = require('../scripts/kr-product-rules.js');

const SEARCH_HTML = `
  <div class="result_count"><span>검색 결과 <b>67</b>건</span></div>
  <ul class="list">
    <li class="item" data-mm-listitem data-threadid="3521630">
      <div class="type"><span>공지사항</span><span>완료</span></div>
      <a href='/News/Notice/3521630' data-boardactionpath="/News/Notice" class="title">
        <span>8/13(목) <b>신규 상품</b> 안내</span>
      </a>
      <div class="date"><span>2026.08.12</span></div>
    </li>
  </ul>
  <div class="pagination" data-mm-paging data-blockstartno="0" data-blockstartkey="" data-totalcount="67"></div>
`;

test('parses official search result IDs, paths, titles, dates, and paging metadata', () => {
  const result = parseOfficialSearchResults(SEARCH_HTML, '신규 상품');
  assert.equal(result.totalcount, 67);
  assert.equal(result.blockStartNo, '0');
  assert.equal(result.items[0].id, '3521630');
  assert.equal(result.items[0].title, '8/13(목) 신규 상품 안내');
  assert.equal(result.items[0].boardPath, '/News/Notice');
  assert.equal(result.items[0].date, '2026.08.12');
  assert.deepEqual(result.items[0].matchedKeywords, ['신규 상품']);
});

test('official search query list covers the requested product vocabulary', () => {
  const queries = buildSearchQueries().map(query => query.keywords);
  for (const keyword of [
    '전설 패션', '토탈 패키지', '패션 럭키박스', '펫 럭키박스',
    '악기 선택 상자', '염색약 선택 상자', '헤어', '미리보기', '행운 상자',
  ]) {
    assert.ok(queries.includes(keyword), `missing search keyword: ${keyword}`);
  }
});

test('classifies the official product types from title and notice body', () => {
  assert.equal(classifyKrProduct({ title: '신규 전설 패션 장비 안내' }).productType, '傳說時裝');
  assert.equal(classifyKrProduct({ title: '그랜드 앙상블 토탈 패키지 종합 안내' }).productType, '套組');
  assert.equal(classifyKrProduct({ title: '패션 럭키박스 ＆ 패션샵 안내' }).productType, '時裝幸運盒');
  assert.equal(classifyKrProduct({ title: '펫 럭키박스 안내' }).productType, '寵物幸運盒');
  assert.equal(classifyKrProduct({ title: '신규 모험가 프리미엄 패스 안내' }).productType, '通行證');
  assert.equal(classifyKrProduct({ title: '마비노기 모바일 X 산리오 콜라보 상품 안내' }).productType, '聯名時裝');
  assert.equal(classifyKrProduct({ title: '아이템샵 안내(염색약 선택상자)', fullText: '색상 코드 #FBFFFF #EAB4D2' }).productType, '染色劑選擇箱');
  assert.equal(classifyKrProduct({ title: '아이템샵 안내(봄의 선율 악기 선택 상자)' }).productType, '樂器');
  assert.equal(classifyKrProduct({ title: '이벤트 패션 안내', sourceBoard: '/News/Events' }).productType, '活動時裝');
  assert.equal(classifyKrProduct({ title: '패션샵 신규 상품 안내' }).productType, '商店時裝');
  assert.equal(classifyKrProduct({ title: '8/13 신규 상품 안내', fullText: '신규 환생 전용 헤어 미리보기 헤어 쿠폰' }).productType, '髮型');
  assert.equal(classifyKrProduct({ title: '신규 외형 안내', fullText: '[ 눈] 눈 - 순진한 눈 [ 입] 입 - 도톰한 입' }).productType, '外觀');
});

test('keeps special event lottery boxes as the primary type and records embedded preview types', () => {
  const result = classifyKrProduct({
    title: '(추가) 7/30 캣스티벌 행운 상자 상품 안내',
    fullText: '행운 상자 악기 선택 상자 무기 선택 상자 미리보기',
  });
  assert.equal(result.productType, '特殊活動抽獎盒');
  assert.ok(result.relatedTypes.includes('樂器'));
  assert.ok(result.relatedTypes.includes('武器預覽'));
  assert.ok(result.relatedTypes.includes('預覽'));
});

test('extracts dye colors and omits dye preview downloads', () => {
  const text = '지정 염색약 #fbffff / #EAB4D2 / #fbffff';
  assert.deepEqual(extractColorCodes(text), ['#FBFFFF', '#EAB4D2']);
  assert.deepEqual(
    selectOfficialImages(['banner.png', 'preview.jpg'], { productType: '染色劑選擇箱' }),
    [],
  );
  assert.deepEqual(
    selectOfficialImages(['banner.png', 'preview.jpg'], { productType: '樂器' }),
    ['banner.png', 'preview.jpg'],
  );
});

test('keeps fashion product notices but rejects generic maintenance notices', () => {
  assert.equal(isRelevantKrProductNotice({
    title: '8/13(목) 신규 상품 안내',
    fullText: '신규 환생 전용 헤어 미리보기 헤어 쿠폰',
    sourceBoard: '/News/Notice',
  }), true);
  assert.equal(isRelevantKrProductNotice({
    title: '(완료) 8/13(목) 정기점검 안내',
    fullText: '서버 점검 및 오류 수정 안내。펫의持續傷害與行動預覽異常。',
    sourceBoard: '/News/Notice',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '이벤트 안내',
    fullText: '이벤트 보상으로 패션 럭키박스를 획득할 수 있습니다.',
    sourceBoard: '/News/Events',
  }), true);
});

test('rejects event overviews, schedule notices, and screenshot-only events', () => {
  assert.equal(isRelevantKrProductNotice({
    title: '진행 중인 이벤트 한눈에 보기',
    fullText: '엘리트 패션 장비를 선택하여 획득할 수 있어요.',
    sourceBoard: '/News/Events',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '6/19(목) 이벤트 및 주요 상품 일정 상세 안내',
    fullText: '패션 티켓과 상품 일정을 안내합니다.',
    sourceBoard: '/News/Events',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '함께하는 한가위! 스크린샷 이벤트 안내',
    fullText: '콜라보 IP 아이템(패션 등)이 확인되는 경우 제외될 수 있습니다.',
    sourceBoard: '/News/Events',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '친구 초대 이벤트 안내',
    fullText: '러블리 하트 벌룬 후드 패션 장비를 지급합니다. 아이템 미리보기',
    sourceBoard: '/News/Events',
  }), true);
  assert.equal(isRelevantKrProductNotice({
    title: 'BIG CAMPFIRE LIVE 온타임 이벤트 안내',
    fullText: '이벤트 선물로 패션 장비(전설) 성별 변경권과 프리미엄 패션 티켓을 지급합니다.',
    sourceBoard: '/News/Events',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '주말 온타임 이벤트 안내',
    fullText: '온타임 선물: 패션 장비(엘리트) 성별 변경권 3개, 프리미엄 패션 티켓 10개',
    sourceBoard: '/News/Notice',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '주말 온타임 이벤트 안내',
    fullText: '패션 장비(엘리트) 성별 변경권을 지급합니다. 기존 의상의 염색 슬롯 색상은 유지됩니다.',
    sourceBoard: '/News/Events',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '어비스 지옥 난이도 오픈 사전 안내',
    fullText: '보상으로 푸른 달의 인장 방어구 상자를 지급합니다. 구성품은 푸른 달의 인장: 모자, 상의, 하의입니다.',
    sourceBoard: '/News/Notice',
  }), false);
  assert.equal(isRelevantKrProductNotice({
    title: '어비스 지옥 3, 4, 5 난이도 오픈 사전 안내',
    fullText: '붉은 심연의 화석 상품과 함께 패션 장비 로스트 문스케이프 예복을 구입할 수 있습니다.',
    sourceBoard: '/News/Notice',
  }), false);
});
