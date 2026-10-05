const assert = require('node:assert/strict');
const test = require('node:test');

const updateKr = require('../scripts/update-kr.js');

function notice(overrides = {}) {
  return {
    id: '3554491',
    category: '주요상품',
    title: '10/1(목) 크리온 팝업 스토어 패키지 안내 (남성 캐릭터 전용 패션 장비 상품)',
    date: '2026.09.30',
    boardPath: '/News/Notice',
    contentImages: ['https://example.test/preview.png'],
    fullText: '패션 장비 상품의 미리보기 이미지가 포함되어 있습니다.',
    ...overrides,
  };
}

test('classifies explicit fashion previews as auto-include', () => {
  assert.equal(typeof updateKr.classifyNotice, 'function');
  const result = updateKr.classifyNotice(notice());

  assert.equal(result.decision, 'auto-include');
  assert.ok(result.reason);
});

test('classifies maintenance notices as auto-exclude', () => {
  assert.equal(typeof updateKr.classifyNotice, 'function');
  const result = updateKr.classifyNotice(notice({
    category: '안내',
    title: '(완료) 서버 불안정 현상 안내',
    contentImages: [],
    fullText: '서버 안정화 작업이 완료되었습니다. 게임 이용에 불편을 드려 죄송합니다.',
  }));

  assert.equal(result.decision, 'auto-exclude');
  assert.match(result.reason, /維修|伺服器|排除|maintenance/iu);
});

test('keeps ambiguous packages for manual review', () => {
  assert.equal(typeof updateKr.classifyNotice, 'function');
  const result = updateKr.classifyNotice(notice({
    category: '주요상품',
    title: '10/1(목) 신규 패키지 안내',
    contentImages: ['https://example.test/package.png'],
    fullText: '신규 패키지 상품이 추가됩니다.',
  }));

  assert.equal(result.decision, 'review');
});

test('does not treat noisy notice-page footer text as a product signal', () => {
  const result = updateKr.classifyNotice(notice({
    category: '주요상품',
    title: '10/1(목) 신규 패키지 안내',
    contentImages: ['https://example.test/package.png'],
    fullText: '신규 패키지 상품이 추가됩니다. 목록에는 패션, 염색, 꾸미기 상품이 표시됩니다. 회사소개 개인정보처리방침.',
  }));

  assert.equal(result.decision, 'review');
});

test('classifies a rerun without new appearance content as auto-exclude', () => {
  assert.equal(typeof updateKr.classifyNotice, 'function');
  const result = updateKr.classifyNotice(notice({
    category: '주요상품',
    title: '패션 상품 재판매 안내',
    contentImages: [],
    fullText: '기존 패션 상품을 재판매합니다.',
  }));

  assert.equal(result.decision, 'auto-exclude');
});

test('supports selecting auto-included records for apply', () => {
  assert.deepEqual(updateKr.parseApplyIds(['--auto']), {
    ids: [],
    applyAll: false,
    applyAuto: true,
  });
});
