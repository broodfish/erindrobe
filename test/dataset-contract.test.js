const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { parseFashionShopProducts } = require('../scripts/parse-kr-text.js');

const root = path.join(__dirname, '..');

test('build output keeps corrected categories and expanded choice-box records', () => {
  execFileSync(process.execPath, ['scripts/build-dataset.js'], { cwd: root, stdio: 'ignore' });
  const items = require('../data/fashion.json');

  assert.equal(items.some(item => item.category === '套組'), false);
  assert.equal(items.filter(item => item.category === '套組時裝').length, 7);
  const instrumentIds = items
    .filter(item => item.choiceKind === 'instrument')
    .map(item => item.id);
  assert.equal(instrumentIds.length, 19);
  for (const noticeId of [
    '3311101', '3201519', '3147454', '2918992', '3545049', '3481571',
    '3407261', '3311093', '2957837', '3521627', '3272482', '3500242',
    '3447990', '3428339', '3373323', '3345413', '3100664', '3037059',
  ]) {
    assert.ok(instrumentIds.some(id => id.startsWith(`${noticeId}_box`)), `missing instrument notice ${noticeId}`);
  }
  assert.ok(items.filter(item => item.choiceKind === 'instrument').every(item => item.components?.length > 0));
  const imageBearingItems = items.filter(item =>
    item.productType !== '染色劑選擇箱'
    && (item.galleryImages?.length || item.cardImages?.length)
    && !item.id.includes('_shop')
  );
  assert.equal(imageBearingItems.filter(item => !item.localImages?.length).length, 0);
});

test('repeated official products remain in the timeline and are marked as reruns', () => {
  const wolf = require('../data/fashion.json').filter(item => item.name === '아기 늑대');
  assert.deepEqual(wolf.map(item => [item.krDate, item.isRerun]), [
    ['2025.04.24', false],
    ['2026.02.12', true],
  ]);
  assert.equal(wolf[1].firstReleaseId, wolf[0].id);
  assert.equal(wolf[1].firstReleaseDate, wolf[0].krDate);
  assert.equal(wolf[1].rerunIndex, 1);
});

test('Taiwan release flags carry semantic/image evidence', () => {
  const items = require('../data/fashion.json');
  const released = items.filter(item => item.twReleased);
  assert.equal(released.length, 19);
  assert.ok(released.every(item => item.twStatus === 'confirmed'));
  assert.ok(released.every(item => item.twNameMatch));
  assert.ok(released.every(item => item.twManualMatch));
  assert.ok(released.every(item => item.twEvidence?.some(evidence => evidence.method)));
  assert.ok(items.every(item => item.twReleased === (item.twStatus === 'confirmed')));
  const instrument = items.find(item => item.id === '2918992_box0');
  assert.equal(instrument.twNameMatch, true);
  assert.equal(instrument.twImageMatch, false);
  assert.equal(instrument.twStatus, 'confirmed');

  const springMelody = items.find(item => item.id === '2918992_box1');
  assert.equal(springMelody.twStatus, 'confirmed');
  assert.equal(springMelody.twNameMatch, true);
  assert.equal(springMelody.twManualMatch, true);
  assert.equal(springMelody.twEvidence?.[0]?.twThreadId, '3505035');
  assert.equal(springMelody.twEvidence?.[0]?.twName, '春之旋律樂器選擇箱');

  const springFestival = items.find(item => item.id === '2757703_0');
  assert.equal(springFestival.name, '피어나는 봄빛');
  assert.equal(springFestival.displayName, '綻放春光：春之慶典套裝');
  assert.equal(springFestival.category, '幸運箱');
  assert.equal(springFestival.twStatus, 'confirmed');
  assert.equal(springFestival.twEvidence?.[0]?.twThreadId, '3505035');

  const gloryGuard = items.find(item => item.id === '2757703_1');
  assert.equal(gloryGuard.name, '별의 서약');
  assert.equal(gloryGuard.displayName, '星之誓約：榮耀守衛套裝');
  assert.equal(gloryGuard.category, '幸運箱');
  assert.equal(gloryGuard.twStatus, 'confirmed');
  assert.equal(gloryGuard.twEvidence?.[0]?.twThreadId, '3505035');

  const firstPass = items.find(item => item.id === '2757707');
  assert.equal(firstPass.twStatus, 'confirmed');
  assert.equal(firstPass.twEvidence?.[0]?.twThreadId, '3504636');
  assert.equal(firstPass.twDateSource, 'official-notice-text');

  const starChildRobe = items.find(item => item.id === '2918987');
  assert.equal(starChildRobe.twStatus, 'confirmed');
  assert.equal(starChildRobe.twDateSource, 'official-notice-text');
  assert.equal(starChildRobe.twEvidence?.[0]?.twThreadId, '3504848');
});

test('Taiwan release dates use the official sale start, not notice publication time', () => {
  const items = require('../data/fashion.json');
  const expectedDates = {
    '2757708': '2026.07.22',
    '2918987': '2026.07.22',
    '2757709': '2026.07.22',
    '2757703_0': '2026.07.22',
    '2757703_1': '2026.07.22',
    '2839212_0': '2026.08.19',
    '2839212_1': '2026.09.09',
    '2839212_2': '2026.08.19',
    '2906352_0': '2026.08.19',
    '2906352_1': '2026.08.19',
    '2918992_box0': '2026.08.19',
    '2918992_box1': '2026.07.22',
    '2957849': '2026.09.09',
    '2957846_2': '2026.09.09',
    '2957955': '2026.09.09',
    '3037067_0': '2026.07.22',
    '3201524_0': '2026.09.09',
    '3201524_1': '2026.09.09',
  };

  for (const [id, expected] of Object.entries(expectedDates)) {
    const item = items.find(candidate => candidate.id === id);
    assert.ok(item, `missing confirmed item ${id}`);
    assert.equal(
      new Date(item.twDate * 1000).toLocaleDateString('sv-SE', { timeZone: 'Asia/Taipei' }),
      expected.replaceAll('.', '-'),
      `${id} should use the official sale start date`,
    );
    assert.equal(item.twDateSource, 'official-notice-text');
    assert.ok(item.twSaleDateText, `${id} should retain the official sale-period evidence`);
    assert.equal(item.twEvidence?.[0]?.twDate, item.twDate);
  }
});

test('instrument choice boxes preserve the complete official component lists', () => {
  const items = require('../data/fashion.json');
  assert.equal(items.find(item => item.id === '2918992_box0').components.length, 16);
  assert.equal(items.find(item => item.id === '2918992_box1').components.length, 30);
});

test('shows the complete high-resolution official image without character cropping', () => {
  const item = require('../data/fashion.json').find(item => item.id === '2757708');
  assert.equal(item.lightboxImages.length, 2);
  assert.equal(item.lightboxImages[1].className, 'lightbox-image-official-full');
});

test('exposes the precise official product type and announcement gallery metadata', () => {
  const items = require('../data/fashion.json');
  const sanrio = items.find(item => item.id === '3311070_0');
  assert.equal(sanrio.productType, '聯名時裝');
  assert.equal(sanrio.galleryImages.length, 2);
  assert.deepEqual(sanrio.colorCodes, []);

  const dye = items.find(item => item.id === '2906348_box0');
  assert.equal(dye.productType, '染色劑選擇箱');
  assert.deepEqual(dye.galleryImages, []);
  assert.ok(dye.colorCodes.length > 0);

  const springFashion = items.find(item => item.id === '2757703_0');
  const gloryFashion = items.find(item => item.id === '2757703_1');
  assert.deepEqual(springFashion.colorCodes, []);
  assert.deepEqual(gloryFashion.colorCodes, []);
  assert.notEqual(springFashion.cardImages[0], gloryFashion.cardImages[0]);
});

test('keeps hairstyle, accessory, action, and complete dye records as separate timeline products', () => {
  const items = require('../data/fashion.json');
  const byId = id => items.find(item => item.id === id);

  assert.deepEqual(items.filter(item => item.id.startsWith('3373324_hair')).map(item => item.name), [
    '에어리 롱 웨이브펌', '언더컷 레이어드 헤어', '포멀 올백', '브레이드 트윈테일',
  ]);
  assert.ok(items.filter(item => item.id.startsWith('3373324_hair')).every(item => item.productType === '髮型'));
  assert.ok(items.filter(item => item.id.startsWith('3373324_action')).every(item => item.productType === '動作'));
  assert.equal(items.filter(item => item.id.startsWith('3500242_action')).length, 4);
  assert.equal(items.filter(item => item.id.startsWith('3545049_action')).length, 1);
  assert.equal(items.find(item => item.id === '3545049_action_bundle').name, '짜릿한 등장 행동! 상자');
  assert.ok(items.filter(item => item.id.startsWith('3500242_action')).every(item =>
    item.cardImages.every(image => /\.gif(?:\?|$)/iu.test(image))));

  const accessoryNames = [
    '스위트 램 봉제 가방', '멜티 스위트 아이스바', '미스티 라운드 선글라스',
    '스위트 문나이트 드림마스크', '이터널 그레이스 이어링', '솔리드 코어 마스크',
    '데일리 트립 배낭', '퍼니 모먼트 밴드', '코튼베어 백팩', '오리엔탈 태슬 이어링',
    '그라운디드 소울 마스크 (정면)', '스틸 마인드 이어링', '페이트우븐 이어링',
  ];
  for (const name of accessoryNames) {
    const item = items.find(candidate => candidate.name === name);
    assert.ok(item, `missing 꾸미기 product ${name}`);
    assert.equal(item.productType, '新造型');
    assert.ok(item.cardImages.length > 0, `${name} should keep its official preview`);
  }

  assert.equal(byId('3373324_box0').colorCodes.length, 7);
  assert.equal(byId('3500242_box0').colorCodes.length, 5);
  assert.equal(byId('3500242_box1').colorCodes.length, 5);
});

test('keeps accessory previews scoped and merges the shared hero action previews', () => {
  const items = require('../data/fashion.json');
  const byId = id => items.find(item => item.id === id);
  const imageNames = item => (item?.cardImages || [])
    .map(url => decodeURIComponent(String(url).split('/').pop()));

  assert.deepEqual(imageNames(byId('3100668_shop0')), ['image2025082011255916.png']);
  assert.equal(byId('3100668_shop1').name, '언밸런스 페더 이어링');
  assert.deepEqual(imageNames(byId('3100668_shop1')), ['image2025082011260717.png']);
  assert.equal(byId('3100668_shop2').name, '어드벤처 패션 백팩');
  assert.deepEqual(imageNames(byId('3100668_shop2')), ['image2025082011261518.png']);
  assert.equal(byId('3201524_shop0').name, '노블 파티 마스크');
  assert.deepEqual(imageNames(byId('3201524_shop0')), ['노블파티마스크.png']);

  const prayerActions = items.filter(item => item.id.startsWith('3147454_action'));
  assert.deepEqual(prayerActions.map(item => [item.name, imageNames(item)]), [
    ['행동: 다짐', ['다짐남아.gif', '다짐남자.gif', '다짐여자.gif']],
    ['행동: 간청', ['간청남자.gif', '간청여아.gif', '간청여자.gif']],
    ['행동: 기도', ['기도남자.gif', '기도여아.gif', '기도여자.gif']],
  ]);

  const heroActions = items.filter(item => /^3545049_action\d+$/u.test(item.id));
  assert.equal(heroActions.length, 0);
  const heroBundle = byId('3545049_action_bundle');
  assert.equal(heroBundle.name, '짜릿한 등장 행동! 상자');
  assert.deepEqual(imageNames(heroBundle), ['전대포즈성공.gif', '전대포즈실패.gif']);
  assert.match(heroBundle.tip, /5.*히어로레드.*히어로그린.*히어로옐로우.*히어로블루.*히어로핑크/u);
});

test('does not publish generic announcement cards or unscoped action galleries', () => {
  const items = require('../data/fashion.json');
  const genericName = /^(?:신규\s+(?:패키지|상품|아이템샵|스페셜\s+패키지)\s+안내|기간제\s+패키지\s+안내)/u;
  assert.equal(items.some(item => genericName.test(item.name || '')), false);
  assert.equal(items.some(item => item.productType === '動作'
    && item.choiceKind !== 'actionBundle'
    && !/^행동\s*:/u.test(item.name || '')), false);
  assert.equal(items.some(item => item.productType === '髮型' && genericName.test(item.name || '')), false);

  const scopedActions = items.filter(item => item.id.startsWith('3100664_action'));
  assert.ok(scopedActions.length > 0);
  assert.ok(scopedActions.every(item => item.cardImages.length < 15));
  assert.deepEqual(items.filter(item => item.id.startsWith('3473711_hair')).map(item => item.name), [
    '풀뱅 롱 헤어', '시크릿 믹스 숏 헤어', '사이드 파트 숏 헤어',
  ]);
  assert.equal(items.some(item => item.id === '2757703'), false);
});

test('does not emit text-only announcement cards without a preview or color card', () => {
  const items = require('../data/fashion.json');
  assert.equal(items.some(item => !item.galleryImages?.length
    && !item.cardImages?.length
    && !item.colorCodes?.length
    && !item.isShopProduct), false);
});

test('excludes the silent pledge correction notice from the timeline', () => {
  execFileSync(process.execPath, ['scripts/build-dataset.js'], { cwd: root, stdio: 'ignore' });
  const items = require('../data/fashion.json');
  assert.equal(items.some(item => item.id === '3398563'), false);
});

test('pending Korean notices stay out of the published dataset until apply', () => {
  const pending = JSON.parse(fs.readFileSync(path.join(root, 'data/raw/kr-pending.json'), 'utf8'));
  const publishedIds = new Set(require('../data/fashion.json').map(item => item.id));
  for (const record of pending.records) assert.equal(publishedIds.has(record.id), false);
});

test('parses shop products from mixed lucky-box notices', () => {
  const notices = require('../data/raw/kr-details.json');
  const notice = notices.find(item => item.id === '2957846');
  const products = parseFashionShopProducts(notice.fullText);

  assert.deepEqual(products.map(product => product.name), [
    '황야의 파수꾼 코디',
    '축제의 하모니 코디',
    '버드 바인 아이밴드',
    '버터플라이 드롭 이어링',
    '리프 싱글 이어링',
  ]);
  assert.ok(products.every(product => product.saleDate === '2025.06.19'));
});

test('mixed notices emit scoped shop cards and scoped lightbox galleries', () => {
  execFileSync(process.execPath, ['scripts/build-dataset.js'], { cwd: root, stdio: 'ignore' });
  const items = require('../data/fashion.json');
  const shopItems = items.filter(item => item.id.startsWith('2957846_shop'));

  assert.deepEqual(shopItems.map(item => item.name), [
    '버드 바인 아이밴드',
    '버터플라이 드롭 이어링',
    '리프 싱글 이어링',
  ]);
  assert.ok(shopItems.every(item => item.productType === '新造型'));
  assert.ok(shopItems.every(item => item.krDate === '2025.06.19'));
  assert.ok(shopItems.every(item => item.isShopProduct === true));
  assert.equal(shopItems.filter(item => item.cardImages.length === 1).length, 3);
  assert.ok(shopItems.every(item => item.galleryImages.length === item.cardImages.length));
  assert.ok(shopItems.filter(item => item.cardImages.length === 1)
    .every(item => item.galleryImages[0] === item.cardImages[0]));

  const luckyItems = items.filter(item => /^2957846_[012]$/.test(item.id));
  assert.equal(luckyItems.length, 3);
  assert.ok(luckyItems.every(item => item.galleryImages.length === 1));
  assert.ok(luckyItems.every(item => item.galleryImages[0] === item.cardImages[0]));
});

test('all split cards keep their galleries scoped to the card image set', () => {
  const items = require('../data/fashion.json');
  const splitItems = items.filter(item => /_(?:box\d+|shop\d+|\d+)$/.test(item.id));

  assert.ok(splitItems.length > 0);
  splitItems.forEach(item => {
    assert.deepEqual(
      item.galleryImages,
      item.cardImages,
      `${item.id} must not expose sibling announcement images in its lightbox`,
    );
  });
});

test('activity-fashion cards keep only their own fashion previews', () => {
  const items = require('../data/fashion.json');
  const activityItems = items.filter(item => item.productType === '活動時裝');

  assert.ok(activityItems.length > 0);
  activityItems.forEach(item => {
    assert.deepEqual(
      item.galleryImages,
      item.cardImages,
      `${item.id} activity lightbox must not include announcement or sibling images`,
    );
  });

  const chickenEvent = activityItems.find(item => item.id === '3521642');
  assert.deepEqual(
    chickenEvent.cardImages.map(url => decodeURIComponent(url.split('/').pop())),
    ['달걀달갸르르모자.png'],
  );
});

test('candidate discovery includes generic new-product and special-lottery notices', () => {
  const candidates = require('../data/raw/kr-candidates.json');
  assert.ok(candidates.notice.some(item => item.id === '3521630'));
  assert.ok(candidates.notice.some(item => item.id === '3511363'));
  assert.ok(candidates.events.some(item => item.id === '3311070'));
});

test('keeps only the fashion previews selected from mixed announcements', () => {
  execFileSync(process.execPath, ['scripts/build-dataset.js'], { cwd: root, stdio: 'ignore' });
  const items = require('../data/fashion.json');
  const fileNames = item => (item?.cardImages || [])
    .map(url => decodeURIComponent(String(url).split('/').pop()));
  const byId = id => items.find(item => item.id === id);

  const excludedIds = [
    '2957846_shop0', '2957846_shop1', '3311070_1', '3398758', '3406753',
    '3414594', '3416432_0', '3428244', '3428344', '3448002', '3545052',
  ];
  assert.deepEqual(items.filter(item => excludedIds.includes(item.id)), []);

  assert.deepEqual(items.filter(item => /^3272483_shop\d+$/u.test(item.id)).map(item => [
    item.id,
    item.name,
    fileNames(item),
  ]), [
    ['3272483_shop0', '레이어드 아이 밴디지', ['01.레이어드아이밴디지.png']],
    ['3272483_shop1', '플랫 아이 드레싱', ['02.플랫아이드레싱.png']],
    ['3272483_shop2', '크라켄 레더 아이가드', ['03.크라켄레더아이가드.png']],
  ]);
  assert.deepEqual(fileNames(byId('3311070_0')), [
    '산리오캐릭터즈티셔츠.png',
    '산리오캐릭터즈페이스스티커4종.png',
  ]);
  assert.deepEqual(fileNames(byId('3407262')), ['은의기사.png']);

  assert.deepEqual(fileNames(byId('2918987')), ['image202505290603357.png']);

  const mergedHair = items.filter(item => item.id.startsWith('3447992_hair'));
  assert.deepEqual(mergedHair.map(item => item.name), [
    '트윈번 롱 헤어', '컬리 리프펌', '풀뱅 롤링 번', '윈드컷 숏 헤어',
  ]);
  assert.deepEqual(mergedHair.flatMap(fileNames), [
    '트윈번롱헤어.png', '컬리리프펌.png', '풀뱅롤링번1.png', '풀뱅롤링번2.png',
    '윈드컷숏헤어1.png', '윈드컷숏헤어2.png',
  ]);

  const dailyChick = byId('3428241');
  assert.deepEqual(fileNames(dailyChick), ['멜로우폼폼패션세트.png']);

  const catEvent = byId('3511361');
  const catBox = byId('3511363');
  assert.ok(fileNames(catEvent).includes('캣츠데이피시소드전사앞.jpg'));
  assert.ok(fileNames(catEvent).includes('고양이특별무기020악사옆.jpg'));
  assert.deepEqual(fileNames(catBox), [
    '치즈고양이의하모니카앞.jpg', '턱시도고양이의하모니카앞.jpg', '은빛고양이의하모니카앞.jpg',
    '치즈고양이의하모니카옆.jpg', '턱시도고양이의하모니카옆.jpg', '은빛고양이의하모니카옆.jpg',
  ]);
});

test('manual rerun exceptions are not labeled as reruns', () => {
  const items = require('../data/fashion.json');
  for (const id of ['3359491', '3201520', '3473711', '3532703']) {
    const item = items.find(candidate => candidate.id === id);
    assert.equal(item, undefined, `generic announcement card ${id} should be removed`);
  }
});
