const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeName,
  deriveTwStatus,
  createEvidence,
} = require('../scripts/tw-match.js');

test('normalizes Korean and Traditional Chinese labels for comparison', () => {
  assert.equal(normalizeName('（修改） 熱情之舞：卡門套裝'), '熱情之舞卡門套裝');
  assert.equal(normalizeName('정열의 춤 : 패션 럭키박스'), '정열의춤패션럭키박스');
});

test('requires name or manual evidence before image evidence can be probable', () => {
  assert.equal(deriveTwStatus({ nameMatch: false, imageMatch: true, manualMatch: false }), 'unmatched');
  assert.equal(deriveTwStatus({ nameMatch: true, imageMatch: false, manualMatch: false }), 'probable');
  assert.equal(deriveTwStatus({ nameMatch: true, imageMatch: true, manualMatch: false }), 'confirmed');
  assert.equal(deriveTwStatus({ nameMatch: false, imageMatch: false, manualMatch: true }), 'confirmed');
});

test('creates auditable evidence records', () => {
  assert.deepEqual(createEvidence({
    krId: '2839212_0',
    krName: '정열의 춤',
    twThreadId: '3527227',
    twName: '熱情之舞：卡門套裝',
    twDate: 1787090400,
    method: 'manual-name-and-image',
    note: '人工核對台服公告標題與韓服主題。',
  }), {
    krId: '2839212_0',
    krName: '정열의 춤',
    twThreadId: '3527227',
    twName: '熱情之舞：卡門套裝',
    twDate: 1787090400,
    method: 'manual-name-and-image',
    note: '人工核對台服公告標題與韓服主題。',
  });
});
