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

  function filterTimelineItems(items, filters = {}) {
    const {
      category = 'all',
      twStatus = 'all',
      month = 'all',
      query = '',
    } = filters;
    const normalizedQuery = String(query).trim().toLocaleLowerCase();

    return items.filter((item) => {
      if (category !== 'all' && item.category !== category) return false;
      if (twStatus !== 'all' && getPublicTwStatus(item) !== twStatus) return false;
      if (month !== 'all' && String(item.krDate || '').slice(0, 7).replace('.', '-') !== month) return false;
      if (normalizedQuery) {
        const haystack = [item.name, item.displayName, item.title, item.category, item.id]
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

  return { filterTimelineItems, getMonthOptions, getPublicTwStatus, isCardMediaTarget, isPublicTimelineItem, sortTimelineItems, summarizeTimeline };
}));
