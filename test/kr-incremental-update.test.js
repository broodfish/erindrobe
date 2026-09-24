const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  mergeBoardItems,
  scanBoardSince,
} = require('../scripts/kr-incremental.js');
const {
  applyPending,
  parseApplyIds,
  scanIncrementally,
} = require('../scripts/update-kr.js');

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

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function createFixtureRawDir({ pendingRecords = [] } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mbc-kr-incremental-'));
  const rawDir = path.join(root, 'raw');
  fs.mkdirSync(rawDir, { recursive: true });
  writeJson(path.join(rawDir, 'kr-notice-info.json'), [
    { id: '102', title: '既有公告', date: '2026.09.23' },
    { id: '100', title: '既有公告', date: '2026.09.21' },
    { id: '99', title: '既有公告', date: '2026.09.20' },
  ]);
  writeJson(path.join(rawDir, 'kr-pending.json'), {
    version: 1,
    updatedAt: '2026-09-23T00:00:00.000Z',
    records: pendingRecords,
  });
  writeJson(path.join(rawDir, 'kr-sync-state.json'), {
    version: 1,
    lastScanAt: '2026-09-23T00:00:00.000Z',
    boards: {},
  });
  writeJson(path.join(rawDir, 'kr-details.json'), [
    { id: '102', boardPath: '/News/Notice', fullText: '既有明細' },
  ]);
  const finalPath = path.join(root, 'fashion.json');
  writeJson(finalPath, [{ id: 'existing-final-item' }]);
  return { root, rawDir, finalPath };
}

function fixtureApplyOptions() {
  const pendingRecords = [
    {
      id: '103',
      boardPath: '/News/Notice',
      sourceBoards: ['notice-info'],
      status: 'pending',
      title: '新公告 103',
      date: '2026.09.24',
      fullText: '完整公告 103',
      contentImages: [],
    },
    {
      id: '104',
      boardPath: '/News/Notice',
      sourceBoards: ['notice-info'],
      status: 'pending',
      title: '新公告 104',
      date: '2026.09.24',
      fullText: '完整公告 104',
      contentImages: [],
    },
  ];
  const fixture = createFixtureRawDir({ pendingRecords });
  return {
    ...fixture,
    ids: ['103'],
    buildCandidates: async () => {},
    buildDataset: async () => {},
  };
}

function fixtureIncrementalOptions(overrides = {}) {
  const fixture = createFixtureRawDir(overrides);
  const boards = [
    { key: 'notice-info', path: '/News/Notice', headlineId: 2497 },
    { key: 'events-all', path: '/News/Events', headlineId: 0 },
  ];
  const fetchPage = async (board, page) => {
    if (overrides.failBoard === board.key) throw new Error(`fixture failure: ${board.key}`);
    if (board.key === 'events-all') return fixturePage(['101']);
    return page === 1 ? fixturePage(['103', '102']) : fixturePage(['101', '100']);
  };
  const fetchDetail = async item => ({
    ...item,
    boardPath: item.boardPath || '/News/Notice',
    pageTitle: item.title,
    contentImages: [],
    fullText: `完整公告 ${item.id}`,
  });
  return {
    ...fixture,
    boards,
    fetchPage,
    fetchDetail,
    now: () => '2026-09-24T00:00:00.000Z',
    ...overrides,
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

test('repeated scans do not duplicate pending records or touch the final dataset', async () => {
  const options = fixtureIncrementalOptions();
  const before = fs.readFileSync(options.finalPath);
  const result = await scanIncrementally(options);
  const second = await scanIncrementally({ ...options, existingPending: result.pending });

  assert.deepEqual(result.pending.records.map(item => item.id), ['103', '101']);
  assert.deepEqual(second.pending.records, result.pending.records);
  assert.deepEqual(fs.readFileSync(options.finalPath), before);
});

test('a failed board keeps previous pending records and reports the failure', async () => {
  const previous = {
    id: '104',
    boardPath: '/News/Notice',
    sourceBoards: ['notice-info'],
    status: 'pending',
    title: '待確認公告',
    fullText: '既有 pending',
  };
  const result = await scanIncrementally(fixtureIncrementalOptions({
    pendingRecords: [previous],
    failBoard: 'events-all',
  }));

  assert.deepEqual(result.pending.records.map(item => item.id), ['104', '103', '101']);
  assert.equal(result.report.failures[0].board, 'events-all');
});

test('parses explicit apply IDs and rejects an empty selection', () => {
  assert.deepEqual(parseApplyIds(['--ids', '103, 104']), {
    ids: ['103', '104'],
    applyAll: false,
  });
  assert.deepEqual(parseApplyIds(['--all']), { ids: [], applyAll: true });
  assert.throws(() => parseApplyIds([]), /explicit --ids or --all/iu);
});

test('apply requires explicit IDs and removes only applied pending records', async () => {
  const result = await applyPending(fixtureApplyOptions());
  const details = JSON.parse(fs.readFileSync(path.join(result.rawDir, 'kr-details.json'), 'utf8'));

  assert.deepEqual(result.appliedIds, ['103']);
  assert.deepEqual(result.remainingPending.records.map(item => item.id), ['104']);
  assert.ok(details.some(item => item.id === '103'));
});

test('apply rejects an ID that is not pending without changing raw data', async () => {
  const options = fixtureApplyOptions();
  const detailsPath = path.join(options.rawDir, 'kr-details.json');
  const before = crypto.createHash('sha256').update(fs.readFileSync(detailsPath)).digest('hex');

  await assert.rejects(
    () => applyPending({ ...options, ids: ['999'] }),
    /not pending/iu,
  );
  const after = crypto.createHash('sha256').update(fs.readFileSync(detailsPath)).digest('hex');
  assert.equal(after, before);
});
