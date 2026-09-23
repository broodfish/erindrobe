(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.timelineUiFormatters = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function formatRerunNote(item) {
    if (!item || !item.isRerun) return '';
    const firstDate = item.firstReleaseDate ? `首次推出：${item.firstReleaseDate}` : '首次推出日期待確認';
    return `復刻／再販 · ${firstDate}`;
  }

  return { formatRerunNote };
}));
