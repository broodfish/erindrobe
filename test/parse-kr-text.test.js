const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseActionPreviews,
  parseHairProducts,
  parseTotalPackageName,
  parseChoiceBoxes,
  parseLuckyBoxNotice,
  parseFashionShopProducts,
  parseAppearanceProducts,
} = require('../scripts/parse-kr-text.js');

test('extracts the themed name from a total-package heading', () => {
  assert.equal(
    parseTotalPackageName('그랜드 앙상블 토탈 패키지 종합 안내'),
    '그랜드 앙상블',
  );
  assert.equal(
    parseTotalPackageName('✨ 토탈 패키지 구매 횟수에 따라 제공되는 보상! 미스틱 아르카나 토탈 패키지'),
    '미스틱 아르카나',
  );
});

test('splits dye choice boxes into one product per official name', () => {
  const text = [
    '염색약 선택상자',
    '판매 기간 : 2025 년 5월 22일(목) 점검 후',
    '상품명 구성품 수량',
    '염색약 선택 상자: 체리블라썸 지정 염색약 (5종 색상 중 1종 선택)',
    '염색약 선택 상자: 테라 그레이 지정 염색약 (5종 색상 중 1종 선택)',
  ].join(' ');

  assert.deepEqual(parseChoiceBoxes(text), [
    { name: '염색약 선택 상자: 체리블라썸', kind: 'dye', saleDate: '2025.05.22', componentsText: '5종 색상 중 1종 선택' },
    { name: '염색약 선택 상자: 테라 그레이', kind: 'dye', saleDate: '2025.05.22', componentsText: '5종 색상 중 1종 선택' },
  ]);
});

test('keeps dye color codes scoped to each choice box', () => {
  const text = [
    '염색약 선택 상자: 체리블라썸 지정 염색약 (5종 색상 중 1종 선택) #E9D2DA #F0D2D2 #E2B0B6 #FAAAAB #DD95A5',
    '염색약 선택 상자: 테라 그레이 지정 염색약 (5종 색상 중 1종 선택) #988D8D #7E7676 #606268 #4F4747 #3A3333',
  ].join(' ');
  const boxes = parseChoiceBoxes(text);
  assert.deepEqual(boxes.map(box => box.colorCodes), [
    ['#E9D2DA', '#F0D2D2', '#E2B0B6', '#FAAAAB', '#DD95A5'],
    ['#988D8D', '#7E7676', '#606268', '#4F4747', '#3A3333'],
  ]);
});

test('parses accessory products from the newer 꾸미기 shop heading', () => {
  const text = [
    '꾸미기 ◼ 판매 기간: 2026년 8월 13일(목) 점검 후',
    '◼ 패션 추가 상품 [ 액세서리] 아이템명 장착 부위 희귀도 수량 가격',
    '멜티 스위트 아이스바 얼굴 장식 엘리트 1 개 660 M 캐시',
    '✨ 신규 패션샵 상품 미리보기 멜티 스위트 아이스바 📢 유의사항',
  ].join(' ');
  assert.deepEqual(parseFashionShopProducts(text).map(product => product.name), ['멜티 스위트 아이스바']);
  assert.deepEqual(parseFashionShopProducts(text)[0], {
    name: '멜티 스위트 아이스바',
    kind: 'accessory',
    saleDate: '2026.08.13',
    officialSlot: '얼굴 장식',
    slotDomain: 'fashion-equipment',
  });
});

test('parses character appearance sections without confusing fashion equipment slots', () => {
  const text = [
    '◼ 커스터마이징 - 환생 시 선택할 수 있는 새로운 외형이 추가되었습니다.',
    '[ 헤어] 헤어(공통) - 내추럴 윈드펌',
    '[ 눈] 눈 - 순진한 눈 눈 - 통찰하는 눈',
    '[ 입] 입 - 도톰한 입',
    '[ 얼굴꾸밈] 얼굴꾸밈 - 달의 인장',
    '[ 몸꾸밈] 몸꾸밈 - 인연의 매듭',
    '클래스/룬 ◼ 전사 계열',
  ].join(' ');

  assert.deepEqual(parseAppearanceProducts(text), [
    { name: '내추럴 윈드펌', appearanceSlot: 'hair', officialSlot: '헤어', slotDomain: 'character-appearance' },
    { name: '순진한 눈', appearanceSlot: 'eyes', officialSlot: '눈', slotDomain: 'character-appearance' },
    { name: '통찰하는 눈', appearanceSlot: 'eyes', officialSlot: '눈', slotDomain: 'character-appearance' },
    { name: '도톰한 입', appearanceSlot: 'mouth', officialSlot: '입', slotDomain: 'character-appearance' },
    { name: '달의 인장', appearanceSlot: 'face', officialSlot: '얼굴꾸밈', slotDomain: 'character-appearance' },
    { name: '인연의 매듭', appearanceSlot: 'body', officialSlot: '몸꾸밈', slotDomain: 'character-appearance' },
  ]);
});

test('parses continuation accessory rows and ignores editorial preview suffixes', () => {
  const text = [
    '패션샵 ◼ 판매 기간: 2025년 8월 21일(목)',
    '패션샵 추가 상품 아이템명 장착 부위 희귀도 수량 가격',
    '내추럴 리프 이어링 귀장식 엘리트 1 개 600 M 캐시',
    '언밸런스 페더 이어링 1 개 600 M 캐시',
    '어드벤처 패션 백팩 로브 1 개 900 M 캐시',
    '✨ 신규 액세서리 미리보기 내추럴 리프 이어링 언밸런스 페더 이어링 어드벤처 패션 백팩',
  ].join(' ');
  assert.deepEqual(parseFashionShopProducts(text).map(product => product.name), [
    '내추럴 리프 이어링', '언밸런스 페더 이어링', '어드벤처 패션 백팩',
  ]);
  assert.deepEqual(parseFashionShopProducts(text).map(product => product.officialSlot), [
    '귀장식', '귀장식', '로브',
  ]);

  const revisedPreview = [
    '패션샵 ◼ 판매 기간: 2025년 10월 30일(목)',
    '패션샵 추가 상품 [ 액세서리] 아이템명 장착 부위 희귀도 수량 가격',
    '노블 파티 마스크 눈 장식 엘리트 1 개 780 M 캐시',
    '✨ 신규 액세서리 미리보기 노블 파티 마스크 (수정) 📢 유의사항',
  ].join(' ');
  assert.deepEqual(parseFashionShopProducts(revisedPreview).map(product => product.name), [
    '노블 파티 마스크',
  ]);
});

test('does not duplicate an accessory with its rarity and slot prefix', () => {
  const text = [
    '패션샵 ◼ 판매 기간: 2025년 7월 17일(목) 점검 후',
    '패션샵 추가 상품 [ 액세서리] 희귀도 장착 부위 아이템명 수량 가격',
    '엘리트 희귀도 패션 얼굴 장식 씨사이드 페인팅 1 개 66 660 M 캐시 서버당 주 1회',
    '러블리 서머 페인팅 1 개 66 660 M 캐시 서버당 주 1회',
    '✨ 신규 액세서리 미리보기 씨사이드 페인팅 러블리 서머 페인팅 📢 유의사항',
  ].join(' ');

  assert.deepEqual(parseFashionShopProducts(text).map(product => product.name), [
    '씨사이드 페인팅', '러블리 서머 페인팅',
  ]);
});

test('parses every accessory in a table with purchase limits and preview names', () => {
  const text = [
    '패션샵 ◼ 판매 기간: 2025 년 11월 27일(목) 점검 후 ~ 별도 안내 시까지',
    '패션샵 추가 상품 [ 액세서리] 아이템명 장착 부위 희귀도 수량 가격 캐시샵 포인트 지급 수량 구매 제한',
    '레이어드 아이 밴디지 눈 장식 엘리트 레어 1 개 780 390 M 캐시 78 39 서버당 주 1회',
    '플랫 아이 드레싱 1 개 780 390 M 캐시 78 39',
    '크라켄 레더 아이가드 엘리트 1 개 780 M 캐시 78',
    '✨ 신규 액세서리 미리보기 레이어드 아이 밴디지 플랫 아이 드레싱 크라켄 레더 아이가드',
    '📢 유의사항',
  ].join(' ');

  assert.deepEqual(parseFashionShopProducts(text).map(product => product.name), [
    '레이어드 아이 밴디지', '플랫 아이 드레싱', '크라켄 레더 아이가드',
  ]);
});

test('parses hair products and their official preview images', () => {
  const text = [
    '헤어 쿠폰: 에어리 롱 웨이브펌 1 개',
    '헤어 쿠폰: 언더컷 레이어드 헤어 1 개',
  ].join(' ');
  const images = [
    'https://example.test/헤어공통에어리롱웨이브펌남.png',
    'https://example.test/헤어공통언더컷레이어드헤어남.png',
  ];
  assert.deepEqual(parseHairProducts(text, images), [
    { name: '에어리 롱 웨이브펌', images: [images[0]] },
    { name: '언더컷 레이어드 헤어', images: [images[1]] },
  ]);
});

test('parses hair products when the official table includes preview conditions', () => {
  const text = [
    '풀뱅 롱 헤어 패키지 헤어 쿠폰: 풀뱅 롱 헤어 * 환생 시 사용 조건: 성인 남성 / 성인 여성 / 남아 / 여아 1 개',
    '사이드 스윕 언더컷 헤어 패키지 헤어 쿠폰: 사이드 스윕 언더컷 * 환생 시 사용 조건: 성인 남성 / 성인 여성 / 남아 / 여아 1 개',
  ].join(' ');
  const images = [
    'https://example.test/풀뱅롱헤어1.png',
    'https://example.test/사이드스윕언더컷.png',
  ];
  assert.deepEqual(parseHairProducts(text, images), [
    { name: '풀뱅 롱 헤어', images: [images[0]] },
    { name: '사이드 스윕 언더컷', images: [images[1]] },
  ]);
});

test('parses action names and keeps animated previews grouped by action', () => {
  const text = [
    '짓궂은 장난 행동! 상자 행동: 오들오들 행동: 혼비백산',
    '✨ 행동: 오들오들 미리보기 ✨ 행동: 혼비백산 미리보기',
  ].join(' ');
  const images = [
    'https://example.test/오들오들남자.gif',
    'https://example.test/혼비백산여자.gif',
  ];
  assert.deepEqual(parseActionPreviews(text, images), [
    { name: '행동: 오들오들', images: [images[0]] },
    { name: '행동: 혼비백산', images: [images[1]] },
  ]);
});

test('does not reuse the entire action gallery when some action names have no matching preview', () => {
  const text = '행동: 레트로댄스 행동: 바로너 행동: 음악듣기';
  const images = [
    'https://example.test/바로너남자.gif',
    'https://example.test/음악감상남자.gif',
    'https://example.test/반디잡기남자.gif',
  ];
  assert.deepEqual(parseActionPreviews(text, images), [
    { name: '행동: 바로너', images: [images[0]] },
    { name: '행동: 음악듣기', images: [images[1]] },
  ]);
});

test('keeps prayer action previews separate from similarly named actions', () => {
  const text = '행동: 다짐 행동: 간청 행동: 기도';
  const images = [
    'https://example.test/다짐남자.gif',
    'https://example.test/간청여자.gif',
    'https://example.test/기도남아.gif',
  ];
  assert.deepEqual(parseActionPreviews(text, images), [
    { name: '행동: 다짐', images: [images[0]] },
    { name: '행동: 간청', images: [images[1]] },
    { name: '행동: 기도', images: [images[2]] },
  ]);
});

test('splits instrument choice boxes and retains component context', () => {
  const text = [
    '꾸러기 응원단 악기 선택 상자 ◼ 판매 기간: 2025년 5월 29일',
    '스카이하이 레츠고 만돌린 파스텔드림 어텐션 플루트. 봄의 선율 악기 선택 상자 ◼ 판매 기간: 2025년 5월 29일',
    '봄날의 멜로디 만돌린 봄날의 멜로디 플루트',
  ].join(' ');

  const boxes = parseChoiceBoxes(text);
  assert.equal(boxes.length, 2);
  assert.equal(boxes[0].name, '꾸러기 응원단 악기 선택 상자');
  assert.equal(boxes[0].kind, 'instrument');
  assert.equal(boxes[0].saleDate, '2025.05.29');
  assert.match(boxes[0].componentsText, /레츠고 만돌린/);
});

test('extracts every instrument choice from the full notice tables', () => {
  const text = [
    '꾸러기 응원단 악기 선택 상자 ◼ 판매 기간: 2025년 5월 29일',
    '상품명 구성품 수량 가격 구매 제한 꾸러기 응원단 악기 선택 상자',
    '스카이하이 레츠고 만돌린 파스텔드림 레츠고 만돌린 스위트베리 레츠고 만돌린 블랙펑크 레츠고 만돌린',
    '스카이하이 어텐션 플루트 파스텔드림 어텐션 플루트 스위트베리 어텐션 플루트 블랙펑크 어텐션 플루트',
    '2 화음 스카이하이 레츠고 만돌린 2 화음 파스텔드림 레츠고 만돌린 2 화음 스위트베리 레츠고 만돌린 2 화음 블랙펑크 레츠고 만돌린',
    '3 화음 스카이하이 레츠고 만돌린 3 화음 파스텔드림 레츠고 만돌린 3 화음 스위트베리 레츠고 만돌린 3 화음 블랙펑크 레츠고 만돌린',
    '. 봄의旋律 악기 선택 상자 ◼ 판매 기간: 2025년 5월 29일',
    '상품명 구성품 수량 가격 구매 제한 봄의旋律 악기 선택 상자',
    '화이트 플로럴 류트 화이트 플로럴 플루트 화이트 플로럴 바이올린 화이트 플로럴 샬루모 화이트 플로럴 만돌린 화이트 플로럴 실로폰',
    '2 화음 화이트 플로럴 류트 2 화음 화이트 플로럴 만돌린',
    '3 화음 화이트 플로럴 류트 3 화음 화이트 플로럴 만돌린',
  ].join(' ');

  const boxes = parseChoiceBoxes(text);
  assert.equal(boxes[0].components.length, 16);
  assert.ok(boxes[0].components.includes('스카이하이 레츠고 만돌린 2 화음'));
  assert.ok(boxes[0].components.includes('블랙펑크 레츠고 만돌린 3 화음'));
  assert.equal(boxes[1].components.length, 10);
  assert.ok(boxes[1].components.includes('화이트 플로럴 류트 3 화음'));
});

test('finds instrument choice boxes in generic item-shop notices', () => {
  const notices = require('../data/raw/kr-details.json');
  const expected = {
    '3311101': ['산리오캐릭터즈 악기 선택 상자', 9],
    '3201519': ['무도회 악기 선택 상자', 12],
    '3147454': ['축복의 빛 악기 선택 상자', 18],
    '3545049': ['노을 진 목장 악기 선택 상자', 18],
    '3481571': ['깨어나는 숨결의 악기 선택 상자', 12],
    '3407261': ['봄의 세레나데 악기 선택 상자', 18],
    '3311093': ['겨울밤의 꿈 악기 선택 상자', 12],
    '2957837': ['숲의 찬미 악기 선택 상자', 6],
    '3521627': ['트로피컬 악기 선택 상자', 12],
    '3272482': ['검은 바다 악기 선택 상자', 18],
    '3500242': ['여름 항해의 악기 선택 상자', 18],
    '3447990': ['찬란한 약속 악기 선택 상자', 12],
    '3428339': ['테크 바이브 악기 선택 상자', 12],
    '3373323': ['고백의 순간 악기 선택 상자', 18],
    '3345413': ['우주의 선율 악기 선택 상자', 12],
    '3100664': ['산들바람 악기 선택 상자', 6],
    '3037059': ['여름 축제 악기 선택 상자', 9],
  };

  for (const [id, [name, componentCount]] of Object.entries(expected)) {
    const notice = notices.find(item => item.id === id);
    const instruments = parseChoiceBoxes(notice.fullText).filter(box => box.kind === 'instrument');
    assert.equal(instruments[0]?.components.length, componentCount);
    assert.equal(instruments.length, 1, `${id} should expose one instrument choice box`);
    assert.equal(instruments[0].name, name, `${id} should use the official box name`);
    assert.ok(instruments[0].components.length > 0, `${id} should retain instrument components`);
  }
});

test('keeps lucky-box parsing behavior and returns no choice boxes for unrelated text', () => {
  const lucky = [
    '패션 럭키박스 ◼ 판매 기간 : 2025 년 4월 24일',
    '✨ 정열의 춤 : 패션 럭키박스',
    '패션 장비 (4종) 카르메나 캡',
  ].join(' ');
  assert.equal(parseLuckyBoxNotice(lucky)[0].boxName, '정열의 춤');
  assert.deepEqual(parseChoiceBoxes('일반 패션 공지에는 선택 상자가 없습니다.'), []);
});
