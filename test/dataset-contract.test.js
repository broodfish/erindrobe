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

test('repeated official products remain in the timeline and are marked as reruns', () => {
  const wolf = require('../data/fashion.json').filter(item => item.name === '아기 늑대');
  assert.deepEqual(wolf.map(item => [item.krDate, item.isRerun]), [
    ['2025.04.24', false],
    ['2026.02.12', true],
  ]);
  assert.equal(wolf[1].firstReleaseId, wolf[0].id);
  assert.equal(wolf[1].firstReleaseDate, wolf[0].krDate);
  assert.equal(wolf[1].rerunIndex, 1);
});

test('Taiwan release flags carry semantic/image evidence', () => {
  const items = require('../data/fashion.json');
  const released = items.filter(item => item.twReleased);
  assert.equal(released.length, 17);
  assert.ok(released.every(item => item.twStatus === 'confirmed'));
  assert.ok(released.every(item => item.twNameMatch));
  assert.ok(released.every(item => item.twManualMatch));
  assert.ok(released.every(item => item.twEvidence?.some(evidence => evidence.method)));
  assert.ok(items.every(item => item.twReleased === (item.twStatus === 'confirmed')));
  const instrument = items.find(item => item.id === '2918992_box0');
  assert.equal(instrument.twNameMatch, true);
  assert.equal(instrument.twImageMatch, false);
  assert.equal(instrument.twStatus, 'confirmed');

  const springMelody = items.find(item => item.id === '2918992_box1');
  assert.equal(springMelody.twStatus, 'confirmed');
  assert.equal(springMelody.twNameMatch, true);
  assert.equal(springMelody.twManualMatch, true);
  assert.equal(springMelody.twEvidence?.[0]?.twThreadId, '3505035');
  assert.equal(springMelody.twEvidence?.[0]?.twName, '春之旋律樂器選擇箱');

  const springFestival = items.find(item => item.id === '2757703_0');
  assert.equal(springFestival.name, '피어나는 봄빛');
  assert.equal(springFestival.displayName, '綻放春光：春之慶典套裝');
  assert.equal(springFestival.category, '幸運箱');
  assert.equal(springFestival.twStatus, 'confirmed');
  assert.equal(springFestival.twEvidence?.[0]?.twThreadId, '3505035');

  const gloryGuard = items.find(item => item.id === '2757703_1');
  assert.equal(gloryGuard.name, '별의 서약');
  assert.equal(gloryGuard.displayName, '星之誓約：榮耀守衛套裝');
  assert.equal(gloryGuard.category, '幸運箱');
  assert.equal(gloryGuard.twStatus, 'confirmed');
  assert.equal(gloryGuard.twEvidence?.[0]?.twThreadId, '3505035');
});

test('instrument choice boxes preserve the complete official component lists', () => {
  const items = require('../data/fashion.json');
  assert.equal(items.find(item => item.id === '2918992_box0').components.length, 16);
  assert.equal(items.find(item => item.id === '2918992_box1').components.length, 30);
});

test('shows the complete high-resolution official image without character cropping', () => {
  const item = require('../data/fashion.json').find(item => item.id === '2757708');
  assert.equal(item.lightboxImages.length, 2);
  assert.equal(item.lightboxImages[1].className, 'lightbox-image-official-full');
});
