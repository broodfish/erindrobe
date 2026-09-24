const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const appJs = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const styleCss = fs.readFileSync(path.join(root, 'css/style.css'), 'utf8');
const thumbnailBuilder = fs.readFileSync(path.join(root, 'scripts/build-thumbnails.js'), 'utf8');
const robotsTxt = fs.readFileSync(path.join(root, 'robots.txt'), 'utf8');
const sitemapXml = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');

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

test('homepage exposes crawlable SEO metadata and canonical URL', () => {
  assert.match(indexHtml, /<meta name="google-site-verification" content="pj9KWfodoGkUhqiVbKQaw6Y8bl8c9KFRMRxCXTEq_mw" \/>/);
  assert.match(indexHtml, /<link rel="canonical" href="https:\/\/broodfish\.github\.io\/erindrobe\/" \/>/);
  assert.match(indexHtml, /<meta property="og:url" content="https:\/\/broodfish\.github\.io\/erindrobe\/" \/>/);
  assert.match(indexHtml, /<meta name="twitter:card" content="summary_large_image" \/>/);
  assert.match(indexHtml, /<script type="application\/ld\+json">[\s\S]*"@type": "CollectionPage"[\s\S]*<\/script>/);
});

test('robots and sitemap point crawlers at the canonical GitHub Pages URL', () => {
  assert.match(robotsTxt, /^User-agent: \*/m);
  assert.match(robotsTxt, /^Allow: \/$/m);
  assert.match(robotsTxt, /^Sitemap: https:\/\/broodfish\.github\.io\/erindrobe\/sitemap\.xml$/m);
  assert.match(sitemapXml, /<loc>https:\/\/broodfish\.github\.io\/erindrobe\/<\/loc>/);
  assert.doesNotMatch(sitemapXml, /refresh=/);
});

test('timeline cards use generated thumbnails while the lightbox keeps full images', () => {
  assert.match(appJs, /function resolveCardImage\(item, source\)/);
  assert.match(appJs, /assets\/fashion-thumb/);
  assert.match(appJs, /image\.decoding = "async"/);
  assert.match(thumbnailBuilder, /fashion-thumb/);
  assert.match(thumbnailBuilder, /resize\(\{ width: 360, withoutEnlargement: true \}\)/);
});
