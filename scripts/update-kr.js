const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { mergeBoardItems, scanBoardSince } = require('./kr-incremental.js');
const { validateRecords, writeJsonAtomically } = require('./validate-raw-data.js');

const BASE = 'https://mabinogimobile.nexon.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ROOT = path.join(__dirname, '..');
const RAW = path.join(ROOT, 'data', 'raw');

const BOARDS = [
  { key: 'notice-info', path: '/News/Notice', headlineId: 2497, file: 'kr-notice-info.json' },
  { key: 'notice-done', path: '/News/Notice', headlineId: 2499, file: 'kr-notice-done.json' },
  { key: 'notice-major', path: '/News/Notice', headlineId: 4204, file: 'kr-notice-major.json' },
  { key: 'update', path: '/News/Update', headlineId: null, file: 'kr-update.json' },
  { key: 'events-past', path: '/News/Events', headlineId: 2502, file: 'kr-events-past.json' },
  { key: 'events-all', path: '/News/Events', headlineId: 0, file: 'kr-events-all.json' },
];

function emptyPending() {
  return { version: 1, updatedAt: null, records: [] };
}

function emptyState() {
  return { version: 1, lastScanAt: null, boards: {} };
}

function loadJson(filePath, fallback) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function loadSyncState(filePath = path.join(RAW, 'kr-sync-state.json')) {
  const state = loadJson(filePath, emptyState());
  return {
    ...emptyState(),
    ...state,
    version: 1,
    boards: { ...(state.boards || {}) },
  };
}

function parseListHtml(html) {
  const source = String(html || '');
  const totalM = source.match(/data-totalcount="(\d+)"/);
  const blockNoM = source.match(/data-blockstartno="(\d+)"/);
  const blockKeyM = source.match(/data-blockstartkey="([^"]+)"/);
  const totalcount = totalM ? Number(totalM[1]) : null;
  const items = [];
  const liRe = /<li class="item[^"]*"\s+data-mm-listitem\s+data-threadid="(\d+)">([\s\S]*?)<\/li>\s*(?=<li class="item|<\/ul>)/g;
  let match;
  while ((match = liRe.exec(source))) {
    const block = match[2];
    const categoryM = block.match(/<div class="type"><span>([^<]*)<\/span><\/div>/);
    const titleM = block.match(/<span>([^<]+)<\/span>\s*<\/a>/);
    const dateM = block.match(/(\d{4}\.\d{2}\.\d{2})/);
    items.push({
      id: match[1],
      category: categoryM ? categoryM[1].trim() : null,
      title: titleM ? titleM[1].trim() : null,
      date: dateM ? dateM[1] : null,
    });
  }
  return {
    totalcount,
    items,
    blockStartNo: blockNoM ? blockNoM[1] : '1',
    blockStartKey: blockKeyM ? blockKeyM[1] : '253402300799,9223372036854775807',
  };
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'ko-KR,ko;q=0.9',
      ...(options.headers || {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  return response.text();
}

async function fetchBoardPage(board, page, paging = {}) {
  const query = new URLSearchParams();
  if (board.headlineId !== null && board.headlineId !== undefined) {
    query.set('headlineId', String(board.headlineId));
  }
  if (page > 1) {
    query.set('pageno', String(page));
    query.set('blockStartNo', String(paging.blockStartNo || '1'));
    query.set('blockStartKey', String(paging.blockStartKey || ''));
  }
  const suffix = query.toString() ? `?${query}` : '';
  const html = await fetchText(`${BASE}${board.path}${suffix}`);
  return parseListHtml(html);
}

function isContentImage(url) {
  const decoded = decodeURIComponent(url);
  if (!decoded.includes('cloudfront.net/community/')) return false;
  return ![
    '관리자프로필이미지', '상단배너', '게시글하단푸터', '공식홈페이지플로팅배너',
    '상점안내', '프로필이미지', 'default', 'favicon', 'banner108x241', '푸터',
  ].some(blocked => decoded.includes(blocked));
}

function parseDetailHtml(html, id, boardPath) {
  const source = String(html || '');
  const contentImages = [...source.matchAll(/<img[^>]+src="([^"]+)"/g)]
    .map(match => match[1])
    .filter(isContentImage);
  const text = source
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
  const marker = text.indexOf('차단한 게시글 입니다.');
  const fullText = marker >= 0 ? text.slice(marker + '차단한 게시글 입니다.'.length).trim() : text;
  const titleM = source.match(/<title>([^<]+)<\/title>/i);
  const dateM = source.match(/(\d{4}\.\d{2}\.\d{2}\s+\d{2}:\d{2})/);
  return {
    id: String(id),
    boardPath,
    url: `${BASE}${boardPath}/${id}`,
    pageTitle: titleM ? titleM[1].trim() : null,
    exactDate: dateM ? dateM[1] : null,
    contentImages: [...new Set(contentImages)],
    fullText,
    textPreview: fullText.slice(0, 4000),
  };
}

async function fetchDetail(item) {
  const html = await fetchText(`${BASE}${item.boardPath}/${item.id}`);
  return parseDetailHtml(html, item.id, item.boardPath);
}

function loadKnownIds(rawDir) {
  const knownIds = new Set();
  if (!fs.existsSync(rawDir)) return knownIds;
  const files = fs.readdirSync(rawDir).filter(file => /^kr-(?:notice|events|update|details|candidates|search|manual|item).*\.json$/u.test(file));
  for (const file of files) {
    const records = loadJson(path.join(rawDir, file), []);
    const values = Array.isArray(records) ? records : Object.values(records).flat();
    for (const record of values) {
      if (record?.id !== undefined) knownIds.add(String(record.id));
    }
  }
  return knownIds;
}

function normalizePending(value) {
  const pending = value || emptyPending();
  return {
    version: 1,
    updatedAt: pending.updatedAt || null,
    records: Array.isArray(pending.records) ? pending.records : [],
  };
}

async function scanIncrementally({
  rawDir = RAW,
  boards = BOARDS,
  fetchPage = fetchBoardPage,
  fetchDetail: fetchDetailFn = fetchDetail,
  now = () => new Date().toISOString(),
  existingPending,
} = {}) {
  const pendingBefore = normalizePending(existingPending || loadJson(path.join(rawDir, 'kr-pending.json'), emptyPending()));
  const knownIds = loadKnownIds(rawDir);
  for (const record of pendingBefore.records) knownIds.add(String(record.id));

  let pendingRecords = [...pendingBefore.records];
  const failures = [];
  const boardReports = [];
  const state = loadSyncState(path.join(rawDir, 'kr-sync-state.json'));
  const startedAt = now();

  for (const board of boards) {
    try {
      const scan = await scanBoardSince({
        board,
        knownIds,
        fetchPage: (page, paging) => fetchPage(board, page, paging),
      });
      const discovered = scan.items.map(item => ({
        ...item,
        boardPath: item.boardPath || board.path,
        sourceBoards: [...new Set([...(item.sourceBoards || []), board.key])],
      }));
      for (const item of discovered) knownIds.add(String(item.id));

      const added = [];
      for (const item of discovered) {
        try {
          const detail = await fetchDetailFn(item);
          added.push({
            ...item,
            ...detail,
            id: String(item.id),
            boardPath: item.boardPath || detail.boardPath || board.path,
            sourceBoards: item.sourceBoards,
            discoveredAt: startedAt,
            status: 'pending',
          });
        } catch (error) {
          failures.push({ kind: 'detail', board: board.key, id: item.id, message: error.message });
        }
      }
      pendingRecords = mergeBoardItems(pendingRecords, added);
      state.boards[board.key] = {
        lastPage: scan.pagesRead,
        lastSeenId: discovered[0]?.id || state.boards[board.key]?.lastSeenId || null,
      };
      boardReports.push({
        board: board.key,
        pagesRead: scan.pagesRead,
        discovered: discovered.map(item => item.id),
        added: added.map(item => item.id),
        stoppedOnKnownPage: scan.stoppedOnKnownPage,
      });
    } catch (error) {
      failures.push({ kind: 'board', board: board.key, message: error.message });
    }
  }

  const report = {
    startedAt,
    finishedAt: now(),
    newIds: pendingRecords
      .filter(item => item.discoveredAt === startedAt)
      .map(item => item.id),
    failures,
    boards: boardReports,
  };
  state.lastScanAt = report.finishedAt;
  return {
    pending: { version: 1, updatedAt: report.finishedAt, records: pendingRecords },
    state,
    report,
  };
}

function renderReviewMarkdown(pending, report) {
  const lines = [
    '# Korean Pending Updates',
    '',
    `- Updated: ${pending.updatedAt || 'unknown'}`,
    `- New in this scan: ${report.newIds.length}`,
    `- Failures: ${report.failures.length}`,
    '',
  ];
  if (!pending.records.length) {
    lines.push('No pending notices.');
  } else {
    for (const item of pending.records) {
      lines.push(`## ${item.id} — ${item.title || item.pageTitle || 'Untitled'}`);
      lines.push('');
      lines.push(`- Status: ${item.status || 'pending'}`);
      lines.push(`- Date: ${item.date || item.exactDate || 'unknown'}`);
      lines.push(`- Notice: [Open official notice](${item.url || `${BASE}${item.boardPath}/${item.id}`})`);
      lines.push(`- Images: ${(item.contentImages || []).length}`);
      for (const image of item.contentImages || []) lines.push(`  - ${image}`);
      lines.push('');
    }
  }
  if (report.failures.length) {
    lines.push('## Failures', '');
    for (const failure of report.failures) {
      lines.push(`- ${failure.kind} ${failure.board || ''} ${failure.id || ''}: ${failure.message}`);
    }
  }
  return `${lines.join('\n')}\n`;
}

async function runScan(options = {}) {
  const rawDir = options.rawDir || RAW;
  fs.mkdirSync(rawDir, { recursive: true });
  const result = await scanIncrementally({ ...options, rawDir });
  writeJsonAtomically(path.join(rawDir, 'kr-sync-state.json'), result.state);
  writeJsonAtomically(path.join(rawDir, 'kr-pending.json'), result.pending);
  fs.writeFileSync(path.join(rawDir, 'kr-pending-report.md'), renderReviewMarkdown(result.pending, result.report));
  if (result.report.failures.length) process.exitCode = 1;
  return result;
}

function printReview(pendingPath = path.join(RAW, 'kr-pending.json')) {
  const pending = normalizePending(loadJson(pendingPath, emptyPending()));
  if (!pending.records.length) {
    console.log('No pending Korean notices.');
    return pending;
  }
  for (const item of pending.records) {
    console.log(`${item.id}\t${item.date || item.exactDate || '?'}\t${item.title || item.pageTitle || 'Untitled'}\t${(item.contentImages || []).length} images\t${item.url || `${BASE}${item.boardPath}/${item.id}`}`);
  }
  return pending;
}

function parseApplyIds(argv) {
  const args = [...argv];
  const ids = [];
  let applyAll = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--all') {
      applyAll = true;
      continue;
    }
    if (arg === '--ids') {
      const value = args[++i];
      if (!value) throw new Error('--ids requires a comma-separated value');
      ids.push(...value.split(',').map(id => id.trim()).filter(Boolean));
      continue;
    }
    throw new Error(`Unknown apply option: ${arg}`);
  }
  const uniqueIds = [...new Set(ids)];
  if (applyAll && uniqueIds.length) throw new Error('use either --ids or --all, not both');
  if (!applyAll && !uniqueIds.length) throw new Error('apply requires an explicit --ids or --all selection');
  return { ids: uniqueIds, applyAll };
}

function listFileForSourceBoard(sourceBoard) {
  return BOARDS.find(board => board.key === sourceBoard)?.file || null;
}

function listRecordFromPending(record) {
  return {
    id: String(record.id),
    category: record.category || null,
    title: record.title || record.pageTitle || null,
    date: record.date || null,
  };
}

function mergeRecordsById(existing, additions) {
  const byId = new Map(existing.map(item => [String(item.id), item]));
  for (const item of additions) {
    const id = String(item.id);
    if (!byId.has(id)) byId.set(id, item);
  }
  return [...byId.values()];
}

function runBuildScript(scriptName) {
  execFileSync(process.execPath, [`scripts/${scriptName}`], { cwd: ROOT, stdio: 'inherit' });
}

async function applyPending({
  ids = [],
  applyAll = false,
  rawDir = RAW,
  buildCandidates = () => {},
  buildDataset = () => {},
} = {}) {
  const pendingPath = path.join(rawDir, 'kr-pending.json');
  const pending = normalizePending(loadJson(pendingPath, emptyPending()));
  const selectedIds = applyAll ? pending.records.map(record => String(record.id)) : [...new Set(ids.map(String))];
  if (!selectedIds.length) throw new Error('no pending records to apply');

  const pendingById = new Map(pending.records.map(record => [String(record.id), record]));
  const missing = selectedIds.filter(id => !pendingById.has(id));
  if (missing.length) throw new Error(`IDs not pending: ${missing.join(', ')}`);
  const selected = selectedIds.map(id => pendingById.get(id));
  for (const record of selected) {
    if (!record.id || typeof record.fullText !== 'string' || !record.fullText.trim()) {
      throw new Error(`pending record ${record.id || '?'} is missing fullText`);
    }
  }

  const detailPath = path.join(rawDir, 'kr-details.json');
  const details = loadJson(detailPath, []);
  const detailValidation = validateRecords(details, { label: 'kr-details', requiredFields: ['id'] });
  if (!detailValidation.ok) throw new Error(detailValidation.errors.join('; '));
  const mergedDetails = mergeRecordsById(details, selected);

  const listUpdates = new Map();
  for (const record of selected) {
    const sourceBoards = record.sourceBoards?.length
      ? record.sourceBoards
      : [BOARDS.find(board => board.path === record.boardPath)?.key].filter(Boolean);
    for (const sourceBoard of sourceBoards) {
      const file = listFileForSourceBoard(sourceBoard);
      if (!file) continue;
      if (!listUpdates.has(file)) listUpdates.set(file, loadJson(path.join(rawDir, file), []));
      listUpdates.set(file, mergeRecordsById(listUpdates.get(file), [listRecordFromPending(record)]));
    }
  }

  const remainingPending = {
    version: 1,
    updatedAt: pending.updatedAt,
    records: pending.records.filter(record => !selectedIds.includes(String(record.id))),
  };
  const detailsCheck = validateRecords(mergedDetails, { label: 'kr-details', requiredFields: ['id'], requireNonEmpty: ['fullText'] });
  if (!detailsCheck.ok) throw new Error(detailsCheck.errors.join('; '));

  const rollbackPaths = new Set([
    detailPath,
    pendingPath,
    path.join(rawDir, 'kr-notice-merged.json'),
    path.join(rawDir, 'kr-events-merged.json'),
    path.join(rawDir, 'kr-candidates.json'),
    path.join(ROOT, 'data', 'fashion.json'),
  ]);
  for (const file of listUpdates.keys()) rollbackPaths.add(path.join(rawDir, file));
  const snapshots = new Map([...rollbackPaths].map(file => [
    file,
    fs.existsSync(file) ? fs.readFileSync(file) : null,
  ]));
  const restore = () => {
    for (const [file, contents] of snapshots) {
      if (contents === null) {
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } else {
        fs.writeFileSync(file, contents);
      }
    }
  };

  try {
    writeJsonAtomically(detailPath, mergedDetails);
    for (const [file, records] of listUpdates) {
      writeJsonAtomically(path.join(rawDir, file), records);
    }
    writeJsonAtomically(pendingPath, remainingPending);
    await buildCandidates();
    await buildDataset();
  } catch (error) {
    restore();
    throw error;
  }

  return {
    rawDir,
    appliedIds: selectedIds,
    details: mergedDetails,
    remainingPending,
  };
}

async function runApply(argv) {
  const { ids, applyAll } = parseApplyIds(argv);
  const result = await applyPending({
    ids,
    applyAll,
    buildCandidates: () => runBuildScript('filter-kr-candidates.js'),
    buildDataset: () => runBuildScript('build-dataset.js'),
  });
  console.log(`Applied ${result.appliedIds.length} Korean pending records: ${result.appliedIds.join(', ')}`);
  return result;
}

function usage() {
  console.log('Usage: node scripts/update-kr.js <scan|review|apply> [--ids id1,id2 | --all]');
}

async function main(argv = process.argv.slice(2)) {
  const [command, ...rest] = argv;
  if (command === 'scan') {
    const result = await runScan();
    console.log(`Scanned Korean notices: ${result.report.newIds.length} new pending records`);
    if (result.report.failures.length) {
      console.error(`Failures: ${result.report.failures.length}`);
      process.exitCode = 1;
    }
    return;
  }
  if (command === 'review') {
    printReview();
    return;
  }
  if (command === 'apply') {
    await runApply(rest);
    return;
  }
  usage();
  process.exitCode = command === '--help' || command === '-h' ? 0 : 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = {
  BOARDS,
  emptyPending,
  emptyState,
  loadSyncState,
  parseListHtml,
  parseDetailHtml,
  parseApplyIds,
  renderReviewMarkdown,
  applyPending,
  scanIncrementally,
  runScan,
};
