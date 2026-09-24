const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterTimelineItems,
  getCategoryFilterKey,
  getMonthOptions,
  getCategoryDisplayName,
  getImageCountHint,
  getPublicTwStatus,
  isCardMediaTarget,
  isPublicTimelineItem,
  UI_VISIBILITY,
  sortTimelineItems,
  summarizeTimeline,
} = require('../js/timeline-utils.js');

const items = [
  { id: 'new', krDate: '2026.02.12', category: '幸運箱', name: '아기 늑대', displayName: '幼狼', twStatus: 'unmatched' },
  { id: 'old', krDate: '2025.03.27', category: '傳說時裝', name: '코스믹 스타차일드', displayName: '宇宙星之子', twStatus: 'confirmed' },
  { id: 'mid', krDate: '2025.04.24', category: '幸運箱', name: '아기 늑대', displayName: '幼狼：寵物幸運箱', twStatus: 'confirmed' },
];

test('sorts the complete timeline in either direction without mutating input', () => {
  assert.deepEqual(sortTimelineItems(items).map(item => item.id), ['old', 'mid', 'new']);
  assert.deepEqual(sortTimelineItems(items, 'desc').map(item => item.id), ['new', 'mid', 'old']);
  assert.deepEqual(items.map(item => item.id), ['new', 'old', 'mid']);
});

test('filters by category, Taiwan status, month and bilingual search fields', () => {
  assert.deepEqual(filterTimelineItems(items, { category: '幸運箱' }).map(item => item.id), ['new', 'mid']);
  assert.deepEqual(filterTimelineItems(items, { twStatus: 'confirmed' }).map(item => item.id), ['old', 'mid']);
  assert.deepEqual(filterTimelineItems(items, { month: '2026-02' }).map(item => item.id), ['new']);
  assert.deepEqual(filterTimelineItems(items, { query: '宇宙星' }).map(item => item.id), ['old']);
});

test('uses compact labels for long category filter names', () => {
  assert.equal(getCategoryDisplayName('活動時裝'), '活動');
  assert.equal(getCategoryDisplayName('聯名時裝'), '活動');
  assert.equal(getCategoryDisplayName('商店時裝'), '造型');
  assert.equal(getCategoryDisplayName('染色劑選擇箱'), '染色劑');
  assert.equal(getCategoryDisplayName('新造型'), '造型');
  assert.equal(getCategoryDisplayName('特殊活動抽獎盒'), '活動');
  assert.equal(getCategoryDisplayName('時裝幸運盒'), '時裝');
  assert.equal(getCategoryDisplayName('寵物幸運盒'), '寵物');
  assert.equal(getCategoryDisplayName('傳說時裝'), '傳說');
  assert.equal(getCategoryDisplayName('動作'), '動作');
  assert.equal(getCategoryDisplayName('髮型'), '髮型');
});

test('groups shop fashion and new-style records under one style filter', () => {
  const styleItems = [
    { id: 'shop', productType: '商店時裝' },
    { id: 'accessory', productType: '新造型' },
  ];
  assert.deepEqual(filterTimelineItems(styleItems, { category: '造型' }).map(item => item.id), [
    'shop', 'accessory',
  ]);
  assert.equal(getCategoryFilterKey('商店時裝'), '造型');
  assert.equal(getCategoryFilterKey('新造型'), '造型');
});

test('groups activity and special-lottery records under one filter category', () => {
  const activityItems = [
    { id: 'activity', productType: '活動時裝' },
    { id: 'special', productType: '特殊活動抽獎盒' },
    { id: 'collab', productType: '聯名時裝' },
  ];
  assert.deepEqual(filterTimelineItems(activityItems, { category: '活動' }).map(item => item.id), [
    'activity', 'special', 'collab',
  ]);
});

test('provides a compact hint only for cards with multiple images', () => {
  assert.equal(getImageCountHint(1), '');
  assert.equal(getImageCountHint(2), '+1');
  assert.equal(getImageCountHint(8), '+7');
});

test('keeps Taiwan and rerun metadata hidden in the current Korean-future-view mode', () => {
  assert.deepEqual(UI_VISIBILITY, {
    showTaiwanStatus: false,
    showRerunStatus: false,
  });
});

test('exposes only confirmed or not-yet-released Taiwan status to the UI', () => {
  assert.equal(getPublicTwStatus({ twStatus: 'confirmed' }), 'confirmed');
  assert.equal(getPublicTwStatus({ twStatus: 'probable' }), 'unmatched');
  assert.equal(getPublicTwStatus({ twStatus: 'unmatched' }), 'unmatched');
});

test('can hide temporarily deferred choice-box kinds without deleting source data', () => {
  assert.equal(isPublicTimelineItem({ id: 'fashion', choiceKind: undefined }, ['dye']), true);
  assert.equal(isPublicTimelineItem({ id: 'palette', choiceKind: 'dye' }, ['dye']), false);
  assert.equal(isPublicTimelineItem({ id: 'instrument', choiceKind: 'instrument' }, ['dye']), true);
});

test('only treats clicks inside card media as image-viewer triggers', () => {
  const mediaTarget = { closest: (selector) => selector === '.card-media' ? {} : null };
  const bodyTarget = { closest: () => null };

  assert.equal(isCardMediaTarget(mediaTarget), true);
  assert.equal(isCardMediaTarget(bodyTarget), false);
});

test('returns chronological month options and accurate overview counts', () => {
  assert.deepEqual(getMonthOptions(items), [
    { key: '2025-03', label: '2025年3月' },
    { key: '2025-04', label: '2025年4月' },
    { key: '2026-02', label: '2026年2月' },
  ]);
  assert.deepEqual(summarizeTimeline(items), {
    total: 3,
    confirmed: 2,
    probable: 0,
    unmatched: 1,
    latestDate: '2026.02.12',
  });
});
