const test = require('node:test');
const assert = require('node:assert/strict');
const { annotateRepeatItems, normalizeProductName } = require('../scripts/timeline-history.js');

test('normalizes punctuation and spacing for official product names', () => {
  assert.equal(normalizeProductName(' 아기 늑대 : 펫 럭키박스 '), '아기늑대펫럭키박스');
});

test('marks later same-category products as reruns without dropping events', () => {
  const result = annotateRepeatItems([
    { id: 'old', category: '幸運箱', name: '아기 늑대', krDate: '2025.04.24' },
    { id: 'different-category', category: '其他商城', name: '아기 늑대', krDate: '2025.05.01' },
    { id: 'new', category: '幸運箱', name: '아기 늑대', krDate: '2026.02.12' },
  ]);

  assert.equal(result.length, 3);
  assert.equal(result[0].isRerun, false);
  assert.equal(result[1].isRerun, false);
  assert.equal(result[2].isRerun, true);
  assert.equal(result[2].firstReleaseId, 'old');
  assert.equal(result[2].firstReleaseDate, '2025.04.24');
  assert.equal(result[2].rerunIndex, 1);
});

test('does not mark different premium-pass issues as reruns just because the title is generic', () => {
  const result = annotateRepeatItems([
    { id: 'pass-old', category: '通行證', name: '모험가 패스 안내', images: ['kr-pass-old.png'], krDate: '2025.03.27' },
    { id: 'pass-new', category: '通行證', name: '모험가 패스 안내', images: ['kr-pass-new.png'], krDate: '2025.05.08' },
  ]);

  assert.deepEqual(result.map(item => item.isRerun), [false, false]);
});
