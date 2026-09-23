const test = require('node:test');
const assert = require('node:assert/strict');
const {
  filterTimelineItems,
  getMonthOptions,
  getPublicTwStatus,
  isCardMediaTarget,
  isPublicTimelineItem,
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
