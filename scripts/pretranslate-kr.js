const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const DATA_PATH = path.join(ROOT, 'data', 'fashion.json');
const CACHE_PATH = path.join(ROOT, 'data', 'raw', 'kr-translations.json');

function emptyTranslationCache() {
  return {
    version: 1,
    initialized: false,
    byId: {},
    byName: {},
    untranslated: [],
  };
}

function normalizeName(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function loadTranslationCache(filePath = CACHE_PATH) {
  if (!fs.existsSync(filePath)) return emptyTranslationCache();
  const cache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    ...emptyTranslationCache(),
    ...cache,
    byId: { ...(cache.byId || {}) },
    byName: { ...(cache.byName || {}) },
    untranslated: Array.isArray(cache.untranslated) ? cache.untranslated : [],
  };
}

function applyCachedTranslations(items, cache = emptyTranslationCache()) {
  const byId = cache.byId || {};
  const byName = cache.byName || {};
  return items.map(item => {
    const cached = byId[String(item.id)] || byName[normalizeName(item.name)];
    const existingOfficialName = item.twStatus === 'confirmed'
      && item.displayName
      && item.displayName !== item.name
      && /[\u3400-\u9fff]/u.test(item.displayName)
      ? item.displayName
      : null;
    const zhName = normalizeName(cached || existingOfficialName);
    if (zhName && zhName !== normalizeName(item.name)) return { ...item, zhName };
    const { zhName: ignored, ...withoutTranslation } = item;
    return withoutTranslation;
  });
}

function getTranslationTargets(items, cache = emptyTranslationCache(), { includeUntranslated = false } = {}) {
  const byId = cache.byId || {};
  const byName = new Set(Object.keys(cache.byName || {}).map(normalizeName));
  const untranslated = new Set((cache.untranslated || []).map(normalizeName));
  const seen = new Set();
  return items
    .map(item => normalizeName(item.name))
    .filter(name => {
      if (!name || seen.has(name)) return false;
      seen.add(name);
      const item = items.find(candidate => normalizeName(candidate.name) === name);
      if (item && (byId[String(item.id)] || byName.has(name))) return false;
      if (!includeUntranslated && untranslated.has(name)) return false;
      return true;
    });
}

function parseTranslationResponse(raw, sourceNames) {
  const text = String(raw || '').trim().replace(/^```(?:json)?\s*/u, '').replace(/\s*```$/u, '');
  const parsed = JSON.parse(text);
  const sourceByNormalizedName = new Map(sourceNames.map(name => [normalizeName(name), name]));
  const translations = {};
  for (const entry of Array.isArray(parsed.translations) ? parsed.translations : []) {
    const source = sourceByNormalizedName.get(normalizeName(entry.source));
    const translation = normalizeName(entry.translation);
    if (source && translation) translations[source] = translation;
  }
  return translations;
}

async function translateNamesWithOpenAI(sourceNames, {
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_TRANSLATION_MODEL || 'gpt-4o-mini',
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured');
  if (typeof fetchImpl !== 'function') throw new Error('fetch is unavailable');
  const response = await fetchImpl('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: 'system',
          content: '你是遊戲資料翻譯助手。把韓文商品名稱翻成自然、簡潔的繁體中文。保留專有名詞、數字與括號資訊。只回傳 JSON，不要 Markdown。格式：{"translations":[{"source":"韓文原名","translation":"繁中名稱"}]}。',
        },
        {
          role: 'user',
          content: JSON.stringify(sourceNames),
        },
      ],
    }),
  });
  if (!response.ok) throw new Error(`translation API HTTP ${response.status}`);
  const body = await response.json();
  const outputText = (body.output || [])
    .flatMap(output => output.content || [])
    .filter(content => content.type === 'output_text')
    .map(content => content.text)
    .join('');
  return parseTranslationResponse(outputText, sourceNames);
}

function writeTranslationCache(cache, filePath = CACHE_PATH) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(cache, null, 2)}\n`);
}

function initializeTranslationCache(cache, items) {
  if (cache.initialized) return cache;
  const translatedNames = new Set(Object.keys(cache.byName || {}).map(normalizeName));
  return {
    ...cache,
    initialized: true,
    untranslated: [...new Set([
      ...(cache.untranslated || []),
      ...items.map(item => normalizeName(item.name)).filter(name => name && !translatedNames.has(name)),
    ])],
  };
}

async function runPretranslate({
  dataPath = DATA_PATH,
  cachePath = CACHE_PATH,
  apiKey = process.env.OPENAI_API_KEY,
  includeUntranslated = false,
  translate = translateNamesWithOpenAI,
  logger = console,
} = {}) {
  const items = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  let cache = loadTranslationCache(cachePath);
  cache = initializeTranslationCache(cache, items);
  const targets = getTranslationTargets(items, cache, { includeUntranslated });
  let translated = {};
  if (targets.length && apiKey) {
    translated = await translate(targets, { apiKey });
    cache = {
      ...cache,
      byName: { ...cache.byName, ...translated },
    };
  } else if (targets.length && !apiKey) {
    logger.warn?.(`Skipped ${targets.length} new Korean names: OPENAI_API_KEY is not configured.`);
  }
  writeTranslationCache(cache, cachePath);
  const published = applyCachedTranslations(items, cache);
  fs.writeFileSync(dataPath, `${JSON.stringify(published, null, 2)}\n`);
  return { targets, translated, cache, items: published };
}

if (require.main === module) {
  const includeUntranslated = process.argv.includes('--all');
  runPretranslate({ includeUntranslated })
    .then(result => {
      console.log(`Pretranslated ${Object.keys(result.translated).length} names; ${result.targets.length} names were eligible.`);
    })
    .catch(error => {
      console.error(error.message);
      process.exitCode = 1;
    });
}

module.exports = {
  applyCachedTranslations,
  emptyTranslationCache,
  getTranslationTargets,
  initializeTranslationCache,
  loadTranslationCache,
  normalizeName,
  parseTranslationResponse,
  runPretranslate,
  translateNamesWithOpenAI,
};
