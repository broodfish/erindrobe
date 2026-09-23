const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('build output keeps corrected categories and expanded choice-box records', () => {
  execFileSync(process.execPath, ['scripts/build-dataset.js'], { cwd: root, stdio: 'ignore' });
  const items = require('../data/fashion.json');

  assert.equal(items.some(item => item.category === '套組'), false);
  assert.equal(items.filter(item => item.category === '套組時裝').length, 7);
  assert.deepEqual(
    items.filter(item => item.choiceKind).map(item => [item.id, item.choiceKind]),
    [
      ['2906348_box0', 'dye'],
      ['2906348_box1', 'dye'],
      ['2918992_box0', 'instrument'],
      ['2918992_box1', 'instrument'],
    ],
  );
  assert.equal(items.filter(item => !item.localImages?.length).length, 0);
});

test('Taiwan release flags carry semantic/image evidence', () => {
  const items = require('../data/fashion.json');
  const released = items.filter(item => item.twReleased);
  assert.equal(released.length, 13);
  assert.ok(released.every(item => item.twStatus === 'confirmed'));
  assert.ok(released.every(item => item.twNameMatch));
  assert.ok(released.every(item => item.twManualMatch));
  assert.ok(released.every(item => item.twEvidence?.some(evidence => evidence.method === 'manual-name-and-image')));
  assert.ok(items.every(item => item.twReleased === (item.twStatus === 'confirmed')));
});
