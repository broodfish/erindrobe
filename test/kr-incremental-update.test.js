const assert = require('node:assert/strict');
const test = require('node:test');

const {
  mergeBoardItems,
  scanBoardSince,
} = require('../scripts/kr-incremental.js');

function fixturePage(ids) {
  return {
    totalcount: ids.length,
    items: ids.map(id => ({
      id,
      title: `公告 ${id}`,
      date: '2026.09.24',
    })),
    blockStartNo: '1',
    blockStartKey: 'fixture',
  };
}

test('stops after the first page containing only known IDs', async () => {
  const pages = new Map([
    [1, fixturePage(['103', '102'])],
    [2, fixturePage(['101', '100'])],
    [3, fixturePage(['99'])],
  ]);
  const requestedPages = [];
  const result = await scanBoardSince({
    board: { key: 'notice-info', path: '/News/Notice' },
    knownIds: new Set(['102', '101', '100', '99']),
    fetchPage: async page => {
      requestedPages.push(page);
      return pages.get(page);
    },
  });

  assert.deepEqual(result.items.map(item => item.id), ['103']);
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(result.pagesRead, 2);
  assert.equal(result.stoppedOnKnownPage, true);
});

test('merges the same notice found in multiple board views once', () => {
  const merged = mergeBoardItems(
    [{ id: '103', boardPath: '/News/Notice', sourceBoards: ['notice-info'] }],
    [{ id: '103', boardPath: '/News/Notice', sourceBoards: ['notice-done'] }],
  );

  assert.equal(merged.length, 1);
  assert.deepEqual(merged[0].sourceBoards, ['notice-info', 'notice-done']);
});
