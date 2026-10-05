const POSITIVE_RULES = [
  ['fashion', /패션|의상|코디|패션 장비|패션샵/iu],
  ['appearance', /꾸미기|외형|헤어|헤어스타일|장신구|얼굴|눈|입|몸꾸밈/iu],
  ['action', /행동\s*:|액션/iu],
  ['instrument', /악기/iu],
  ['dye', /염색|염색약/iu],
];

function textOf(value) {
  return typeof value === 'string' ? value : '';
}

function classifyNotice(record = {}) {
  const title = textOf(record.title || record.pageTitle).trim();
  const category = textOf(record.category).trim();
  const pageTitle = textOf(record.pageTitle).trim();
  const titleText = [category, title, pageTitle].filter(Boolean).join(' ');

  if (/점검|임시점검|정기점검|서버 불안정|서버 장애|안정화 작업|오류 수정|버그 수정|미진행 안내/iu.test(titleText)) {
    return {
      decision: 'auto-exclude',
      reason: '維修／伺服器／錯誤修正公告，排除於資料更新。',
      signals: ['maintenance'],
    };
  }

  const isRerun = /재판매|복각|재출시|재입고/iu.test(titleText);
  const hasNewContent = /신규|추가|새로운|미리보기|사전예약|첫 출시|출시 예정/iu.test(titleText);
  if (isRerun && !hasNewContent) {
    return {
      decision: 'auto-exclude',
      reason: '既有商品再販／復刻公告，排除於增量更新。',
      signals: ['rerun'],
    };
  }

  const signals = POSITIVE_RULES
    .filter(([, pattern]) => pattern.test(titleText))
    .map(([name]) => name);
  if (signals.length) {
    return {
      decision: 'auto-include',
      reason: `出現明確的 ${signals.join('、')} 線索，列入自動收錄。`,
      signals,
    };
  }

  if (/스크린샷 이벤트|사진 이벤트|포토 이벤트/iu.test(titleText)) {
    return {
      decision: 'auto-exclude',
      reason: '單純截圖／照片活動，沒有可辨識的商品線索。',
      signals: ['photo-event'],
    };
  }

  return {
    decision: 'review',
    reason: '未找到足夠明確的商品線索，保留人工確認。',
    signals: [],
  };
}

module.exports = { classifyNotice };
