const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ASSET_PATHS = {
  css: 'css/style.css',
  timelineUtils: 'js/timeline-utils.js',
  uiFormatters: 'js/ui-formatters.js',
  app: 'js/app.js',
  data: 'data/fashion.json',
};

function contentVersion(filePath) {
  return crypto
    .createHash('sha256')
    .update(fs.readFileSync(filePath))
    .digest('hex')
    .slice(0, 12);
}

function replaceVersion(source, assetPath, version) {
  const escapedPath = assetPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(${escapedPath}\\?v=)[^"'\\s)]+`, 'g');
  const nextSource = source.replace(pattern, `$1${version}`);
  if (nextSource === source && !source.includes(`${assetPath}?v=`)) {
    throw new Error(`Could not find versioned asset reference: ${assetPath}`);
  }
  return nextSource;
}

function writeIfChanged(filePath, contents) {
  if (fs.readFileSync(filePath, 'utf8') === contents) return false;
  fs.writeFileSync(filePath, contents);
  return true;
}

function syncCacheVersions(root = path.join(__dirname, '..')) {
  const files = Object.fromEntries(
    Object.entries(ASSET_PATHS).map(([key, relativePath]) => [
      key,
      path.join(root, relativePath),
    ]),
  );

  const versions = {
    css: contentVersion(files.css),
    timelineUtils: contentVersion(files.timelineUtils),
    uiFormatters: contentVersion(files.uiFormatters),
    data: contentVersion(files.data),
  };

  let appSource = fs.readFileSync(files.app, 'utf8');
  appSource = replaceVersion(appSource, ASSET_PATHS.data, versions.data);
  writeIfChanged(files.app, appSource);
  versions.app = contentVersion(files.app);

  const indexPath = path.join(root, 'index.html');
  let indexSource = fs.readFileSync(indexPath, 'utf8');
  for (const [key, assetPath] of Object.entries(ASSET_PATHS)) {
    if (key === 'data') continue;
    indexSource = replaceVersion(indexSource, assetPath, versions[key]);
  }
  writeIfChanged(indexPath, indexSource);

  return versions;
}

if (require.main === module) {
  const versions = syncCacheVersions();
  console.log('Synchronized asset cache versions:', versions);
}

module.exports = {
  ASSET_PATHS,
  contentVersion,
  replaceVersion,
  syncCacheVersions,
};
