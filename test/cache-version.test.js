const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { syncCacheVersions } = require('../scripts/cache-version');

test('syncCacheVersions fingerprints referenced assets and is idempotent', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'erindrobe-cache-version-'));
  fs.mkdirSync(path.join(root, 'css'), { recursive: true });
  fs.mkdirSync(path.join(root, 'js'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data'), { recursive: true });

  fs.writeFileSync(path.join(root, 'css/style.css'), 'body { color: black; }');
  fs.writeFileSync(path.join(root, 'js/timeline-utils.js'), 'window.timelineUtils = {};');
  fs.writeFileSync(path.join(root, 'js/ui-formatters.js'), 'window.timelineUiFormatters = {};');
  fs.writeFileSync(path.join(root, 'data/fashion.json'), '[{"id":"new"}]');
  fs.writeFileSync(
    path.join(root, 'js/app.js'),
    'fetch("data/fashion.json?v=old-data");\n',
  );
  fs.writeFileSync(
    path.join(root, 'index.html'),
    [
      '<link rel="stylesheet" href="css/style.css?v=old-css" />',
      '<script src="js/timeline-utils.js?v=old-utils"></script>',
      '<script src="js/ui-formatters.js?v=old-formatters"></script>',
      '<script src="js/app.js?v=old-app"></script>',
    ].join('\n'),
  );

  const first = syncCacheVersions(root);
  const firstIndex = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const firstApp = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

  assert.match(firstIndex, new RegExp(`css/style\\.css\\?v=${first.css}`));
  assert.match(firstIndex, new RegExp(`js/timeline-utils\\.js\\?v=${first.timelineUtils}`));
  assert.match(firstIndex, new RegExp(`js/ui-formatters\\.js\\?v=${first.uiFormatters}`));
  assert.match(firstIndex, new RegExp(`js/app\\.js\\?v=${first.app}`));
  assert.match(firstApp, new RegExp(`data/fashion\\.json\\?v=${first.data}`));

  const second = syncCacheVersions(root);
  assert.deepEqual(second, first);
  assert.equal(fs.readFileSync(path.join(root, 'index.html'), 'utf8'), firstIndex);
  assert.equal(fs.readFileSync(path.join(root, 'js/app.js'), 'utf8'), firstApp);
});
