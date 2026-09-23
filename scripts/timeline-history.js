// Annotate repeated official products without removing their later sale events.
// The timeline is chronological before this function runs, so the first matching
// name is the original release and subsequent matches are reruns.

function normalizeProductName(value) {
  return String(value || '')
    .normalize('NFKC')
    .replace(/[\s:：·'"“”‘’「」【】\[\]（）()&＆+]/gu, '')
    .toLowerCase();
}

function repeatKey(item) {
  const name = normalizeProductName(item.name);
  if (!name || !item.category) return null;
  return `${item.category}|${name}`;
}

function annotateRepeatItems(items) {
  const firstByKey = new Map();
  const repeatCountByKey = new Map();

  return items.map((item) => {
    const key = repeatKey(item);
    const first = key ? firstByKey.get(key) : null;
    const repeatIndex = key ? (repeatCountByKey.get(key) || 0) : 0;

    if (key && !first) {
      firstByKey.set(key, { id: item.id, date: item.krDate });
      repeatCountByKey.set(key, 1);
    } else if (key) {
      repeatCountByKey.set(key, repeatIndex + 1);
    }

    return {
      ...item,
      isRerun: Boolean(first),
      firstReleaseId: first?.id || item.id,
      firstReleaseDate: first?.date || item.krDate,
      rerunIndex: first ? repeatIndex : 0,
    };
  });
}

module.exports = { annotateRepeatItems, normalizeProductName };
