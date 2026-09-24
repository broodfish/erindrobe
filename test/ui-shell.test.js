const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');

test('filter controls omit the redundant section title block', () => {
  assert.equal(indexHtml.includes('controls-heading'), false);
  assert.equal(indexHtml.includes('BROWSE THE TIMELINE'), false);
  assert.equal(indexHtml.includes('篩選與排序'), false);
});

test('dye cards hide swatch codes and open a dedicated color dialog', () => {
  assert.match(indexHtml, /id="dyeDialog"/);
  assert.match(indexHtml, /id="dyeDialogColors"/);
  assert.match(appJs, /function openDyeDialog\(item\)/);
  assert.match(appJs, /swatch\.textContent = ""/);
  assert.doesNotMatch(appJs, /swatch\.textContent = code/);
  assert.match(styleCss, /\.dye-dialog\.open/);
});
