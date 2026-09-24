function boardItemKey(item) {
  return `${item.boardPath || ''}:${String(item.id)}`;
}

function mergeSourceBoards(existing, discovered) {
  return [...new Set([
    ...(existing.sourceBoards || []),
    ...(discovered.sourceBoards || []),
  ])];
}

function mergeBoardItems(existing, discovered) {
  const byKey = new Map();
  for (const item of [...existing, ...discovered]) {
    const key = boardItemKey(item);
    const previous = byKey.get(key);
    if (!previous) {
      byKey.set(key, { ...item, sourceBoards: [...(item.sourceBoards || [])] });
      continue;
    }
    byKey.set(key, {
      ...previous,
      ...item,
      sourceBoards: mergeSourceBoards(previous, item),
    });
  }
  return [...byKey.values()];
}

async function scanBoardSince({ board, fetchPage, knownIds, maxPages = 100 }) {
  const items = [];
  let page = 1;
  let paging = {};
  let pagesRead = 0;
  let stoppedOnKnownPage = false;

  while (page <= maxPages) {
    const parsed = await fetchPage(page, paging);
    pagesRead += 1;
    const pageItems = parsed?.items || [];
    const pageHasOnlyKnownItems = pageItems.length === 0
      || pageItems.every(item => knownIds.has(String(item.id)));

    for (const item of pageItems) {
      if (!knownIds.has(String(item.id))) {
        items.push({
          ...item,
          id: String(item.id),
          boardPath: item.boardPath || board.path,
          sourceBoards: [...new Set([...(item.sourceBoards || []), board.key])],
        });
      }
    }

    if (pageHasOnlyKnownItems) {
      stoppedOnKnownPage = true;
      break;
    }
    if (!pageItems.length) break;

    paging = {
      blockStartNo: parsed.blockStartNo,
      blockStartKey: parsed.blockStartKey,
    };
    page += 1;
  }

  return { items, pagesRead, stoppedOnKnownPage };
}

module.exports = {
  boardItemKey,
  mergeBoardItems,
  scanBoardSince,
};
