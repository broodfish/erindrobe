const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  applyCachedTranslations,
  getTranslationTargets,
  parseTranslationResponse,
  runPretranslate,
} = require('../scripts/pretranslate-kr.js');

test('applies cached Traditional Chinese names without changing Korean source names', () => {
  const items = [{ id: '3554491_shop0', name: '크리온 스트라이커 세트', displayName: '크리온 스트라이커 세트' }];
  const translated = applyCachedTranslations(items, {
    byId: {},
    byName: { '크리온 스트라이커 세트': '克里昂打擊者套裝' },
  });

  assert.equal(translated[0].name, '크리온 스트라이커 세트');
  assert.equal(translated[0].zhName, '克里昂打擊者套裝');
});

test('only reports names that are not already in the translation cache', () => {
  const items = [
    { id: 'old', name: '既有名稱' },
    { id: 'new', name: '新的韓文名稱' },
  ];
  const targets = getTranslationTargets(items, {
    initialized: true,
    byId: {},
    byName: { 既有名稱: '既有中文名稱' },
    untranslated: ['既有名稱'],
  });

  assert.deepEqual(targets, ['新的韓文名稱']);
});

test('parses the structured translation response and ignores unknown names', () => {
  const response = JSON.stringify({
    translations: [
      { source: '크리온 스트라이커 세트', translation: '克里昂打擊者套裝' },
      { source: '不存在的名稱', translation: '不應寫入' },
    ],
  });

  assert.deepEqual(
    parseTranslationResponse(response, ['크리온 스트라이커 세트']),
    { '크리온 스트라이커 세트': '克里昂打擊者套裝' },
  );
});

test('translates only new names and persists the translated dataset', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erindrobe-translation-'));
  const dataPath = path.join(tempDir, 'fashion.json');
  const cachePath = path.join(tempDir, 'kr-translations.json');
  fs.writeFileSync(dataPath, JSON.stringify([
    { id: 'old', name: '既有名稱' },
    { id: 'new', name: '新的韓文名稱' },
  ]));
  fs.writeFileSync(cachePath, JSON.stringify({
    version: 1,
    initialized: true,
    byId: {},
    byName: { 既有名稱: '既有中文名稱' },
    untranslated: ['既有名稱'],
  }));

  try {
    const result = await runPretranslate({
      dataPath,
      cachePath,
      apiKey: 'test-key',
      translate: async names => ({ [names[0]]: '新的中文名稱' }),
      logger: { warn() {} },
    });
    const savedItems = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    assert.deepEqual(result.targets, ['新的韓文名稱']);
    assert.equal(savedItems.find(item => item.id === 'new').zhName, '新的中文名稱');
    assert.equal(JSON.parse(fs.readFileSync(cachePath, 'utf8')).byName['新的韓文名稱'], '新的中文名稱');
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
