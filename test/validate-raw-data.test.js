const { test } = require('node:test');
const assert = require('node:assert/strict');
const { validateRecords } = require('../scripts/validate-raw-data.js');

test('accepts a complete raw notice list', () => {
  const result = validateRecords([
    { id: '123', title: '公告', date: '2025.05.29' },
    { id: '124', title: '另一則公告', date: '2025.05.30' },
  ], { label: 'kr-notice-major', requiredFields: ['id', 'title', 'date'] });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.count, 2);
});

test('rejects duplicate IDs and missing required fields', () => {
  const result = validateRecords([
    { id: '123', title: '公告', date: null },
    { id: '123', title: '' },
  ], { label: 'kr-notice-major', requiredFields: ['id', 'title', 'date'] });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /duplicate id 123/);
  assert.match(result.errors.join('\n'), /record 1 missing date/);
  assert.match(result.errors.join('\n'), /record 2 missing title/);
  assert.match(result.errors.join('\n'), /record 2 missing date/);
});

test('requires full text for detail records when requested', () => {
  const result = validateRecords([
    { id: '123', title: '公告', fullText: '完整內容' },
    { id: '124', title: '公告二', fullText: '' },
  ], { label: 'kr-details', requiredFields: ['id', 'title'], requireNonEmpty: ['fullText'] });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ['kr-details record 2 missing fullText']);
});
