(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.timelineUtils = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function compareDates(a, b) {
    return String(a.krDate || '').localeCompare(String(b.krDate || '')) || String(a.id).localeCompare(String(b.id));
  }

  function sortTimelineItems(items, order = 'asc') {
    const sorted = [...items].sort(compareDates);
    return order === 'desc' ? sorted.reverse() : sorted;
  }

  function getPublicTwStatus(item) {
    return item && (item.twStatus === 'confirmed' || item.twReleased === true) ? 'confirmed' : 'unmatched';
  }

  function isPublicTimelineItem(item, hiddenChoiceKinds = []) {
    return !hiddenChoiceKinds.includes(item?.choiceKind);
  }

  function isCardMediaTarget(target) {
    return Boolean(target?.closest?.('.card-media'));
  }

  const CATEGORY_DISPLAY_NAMES = Object.freeze({
    '時裝幸運盒': '時裝',
    '寵物幸運盒': '寵物',
    '傳說時裝': '傳說',
    '活動時裝': '活動',
    '特殊活動抽獎盒': '活動',
    '聯名時裝': '活動',
    '商店時裝': '造型',
    '染色劑選擇箱': '染色劑',
    '新造型': '造型',
    '髮型': '髮型',
    '動作': '動作',
  });

  const CATEGORY_FILTER_GROUPS = Object.freeze({
    '時裝幸運盒': '時裝',
    '寵物幸運盒': '寵物',
    '傳說時裝': '傳說',
    '活動時裝': '活動',
    '特殊活動抽獎盒': '活動',
    '聯名時裝': '活動',
    '商店時裝': '造型',
    '染色劑選擇箱': '染色劑',
    '新造型': '造型',
    '髮型': '髮型',
    '動作': '動作',
  });

  const UI_VISIBILITY = Object.freeze({
    showTaiwanStatus: false,
    showRerunStatus: false,
  });

  function getImageCountHint(imageCount) {
    const count = Number(imageCount);
    return Number.isFinite(count) && count > 1 ? '+' + (count - 1) : '';
  }

  function getCategoryDisplayName(category) {
    return CATEGORY_DISPLAY_NAMES[category] || category;
  }

  function getCategoryFilterKey(category) {
    return CATEGORY_FILTER_GROUPS[category] || category;
  }

  function filterTimelineItems(items, filters = {}) {
    const {
      category = 'all',
      twStatus = 'all',
      month = 'all',
      query = '',
    } = filters;
    const normalizedQuery = String(query).trim().toLocaleLowerCase();

    return items.filter((item) => {
      if (category !== 'all' && getCategoryFilterKey(item.productType || item.category) !== category) return false;
      if (twStatus !== 'all' && getPublicTwStatus(item) !== twStatus) return false;
      if (month !== 'all' && String(item.krDate || '').slice(0, 7).replace('.', '-') !== month) return false;
      if (normalizedQuery) {
        const haystack = [
          item.name, item.displayName, item.title, item.category, item.productType,
          ...(item.relatedTypes || []), ...(item.shopPath || []), ...(item.components || []),
          ...(item.colorCodes || []), item.id,
        ]
          .filter(Boolean)
          .join(' ')
          .toLocaleLowerCase();
        if (!haystack.includes(normalizedQuery)) return false;
      }
      return true;
    });
  }

  function getMonthOptions(items) {
    const months = new Map();
    items.forEach((item) => {
      const key = String(item.krDate || '').slice(0, 7);
      if (!/^\d{4}\.\d{2}$/.test(String(item.krDate || '')) && !/^\d{4}\.\d{2}/.test(key)) return;
      if (!months.has(key.replace('.', '-'))) {
        const [year, month] = key.split('.');
        months.set(key.replace('.', '-'), `${year}年${Number(month)}月`);
      }
    });
    return [...months.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, label]) => ({ key, label }));
  }

  function summarizeTimeline(items) {
    const summary = { total: items.length, confirmed: 0, probable: 0, unmatched: 0, latestDate: null };
    items.forEach((item) => {
      const status = item.twStatus || (item.twReleased ? 'confirmed' : 'unmatched');
      if (status === 'confirmed') summary.confirmed += 1;
      else if (status === 'probable') summary.probable += 1;
      else summary.unmatched += 1;
      if (!summary.latestDate || String(item.krDate) > summary.latestDate) summary.latestDate = item.krDate;
    });
    return summary;
  }

  return {
    filterTimelineItems,
    getCategoryFilterKey,
    getCategoryDisplayName,
    getImageCountHint,
    getMonthOptions,
    getPublicTwStatus,
    isCardMediaTarget,
    isPublicTimelineItem,
    sortTimelineItems,
    summarizeTimeline,
    UI_VISIBILITY,
  };
}));
