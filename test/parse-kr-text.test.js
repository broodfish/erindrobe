const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseTotalPackageName,
  parseChoiceBoxes,
  parseLuckyBoxNotice,
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

test('keeps lucky-box parsing behavior and returns no choice boxes for unrelated text', () => {
  const lucky = [
    '패션 럭키박스 ◼ 판매 기간 : 2025 년 4월 24일',
    '✨ 정열의 춤 : 패션 럭키박스',
    '패션 장비 (4종) 카르메나 캡',
  ].join(' ');
  assert.equal(parseLuckyBoxNotice(lucky)[0].boxName, '정열의 춤');
  assert.deepEqual(parseChoiceBoxes('일반 패션 공지에는 선택 상자가 없습니다.'), []);
});
