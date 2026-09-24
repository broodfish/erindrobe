const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('filter controls omit the redundant section title block', () => {
  assert.equal(indexHtml.includes('controls-heading'), false);
  assert.equal(indexHtml.includes('BROWSE THE TIMELINE'), false);
  assert.equal(indexHtml.includes('篩選與排序'), false);
});
