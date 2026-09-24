# Korean Incremental Update Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual, VPN-based Korean incremental update workflow that stages only new notices for review before they enter the published timeline.

**Architecture:** Keep the current full-history scrapers as explicit recovery tools. Add a focused incremental module that scans existing list views until known IDs, fetches only unknown detail pages into `kr-pending.json`, and applies explicitly approved IDs into the cumulative raw data before the existing dataset/image/test/publish steps.

**Tech Stack:** Node.js 18+ built-in `fetch`, Node.js test runner, existing JSON raw snapshots, existing `build-dataset.js` and image scripts.

**Spec:** `docs/superpowers/specs/2026-09-24-kr-incremental-update-design.md`

## Global Constraints

- Normal weekly scans must not call `scrape:kr-search` or fetch known historical detail pages.
- Pending data must not change `data/fashion.json` until explicit apply.
- Apply must require explicit IDs or an explicit `--all` flag.
- Existing full-history commands and raw data formats must remain usable.
- Failed or empty fetches must not overwrite valid raw snapshots or pending records.
- The final gate remains `npm test && npm run validate:data && git diff --check`.

---

### Task 1: Extract reusable incremental list and detail primitives

**Files:**
- Modify: `scripts/scrape-kr-lists.js`
- Modify: `scripts/scrape-kr-details.js`
- Create: `scripts/kr-incremental.js`
- Test: `test/kr-incremental-update.test.js`

**Interfaces:**
- `parseList(html)` continues to return `{ totalcount, items, blockStartNo, blockStartKey }`.
- `scrapeBoard(board, options)` returns a deduplicated list of board records and remains compatible with the existing full scraper.
- `fetchDetail(id, boardPath)` returns the current detail record shape without writing files.
- `scanBoardSince({ board, fetchPage, knownIds })` returns `{ items, pagesRead, stoppedOnKnownPage }` and never requests a page after the first all-known page.
- `mergeBoardItems(existing, discovered)` returns a stable, ID-deduplicated cumulative list without mutating either input.

- [ ] **Step 1: Write failing fixture tests for the stopping rule and board deduplication.**

```js
test('stops after the first page containing only known IDs', async () => {
  const pages = new Map([
    [1, fixturePage(['103', '102'])],
    [2, fixturePage(['101', '100'])],
    [3, fixturePage(['99'])],
  ]);
  const result = await scanBoardSince({
    board: { key: 'notice-info', path: '/News/Notice' },
    knownIds: new Set(['102', '101', '100', '99']),
    fetchPage: async page => pages.get(page),
  });
  assert.deepEqual(result.items.map(item => item.id), ['103']);
  assert.equal(result.pagesRead, 2);
  assert.equal(result.stoppedOnKnownPage, true);
});

test('merges the same notice found in multiple board views once', () => {
  const merged = mergeBoardItems(
    [{ id: '103', boardPath: '/News/Notice', sourceBoards: ['notice-info'] }],
    [{ id: '103', boardPath: '/News/Notice', sourceBoards: ['notice-done'] }],
  );
  assert.deepEqual(merged[0].sourceBoards, ['notice-info', 'notice-done']);
});
```

- [ ] **Step 2: Run the focused test file and verify it fails because the incremental helpers do not exist.**

Run: `node --test test/kr-incremental-update.test.js`

Expected: FAIL with missing exports or missing `scripts/kr-incremental.js`.

- [ ] **Step 3: Extract the existing parser/fetch logic and implement the minimal pure incremental helpers.**

Keep `scrape-kr-lists.js` and `scrape-kr-details.js` as CLI-compatible wrappers. Put only shared request/parsing and scan/merge behavior in `scripts/kr-incremental.js`; do not add search calls or file writes to the pure helpers.

- [ ] **Step 4: Rerun the focused tests and verify the stopping and merge behavior passes.**

Run: `node --test test/kr-incremental-update.test.js`

Expected: the fixture tests pass with no network access.

- [ ] **Step 5: Commit the extraction and pure incremental primitives.**

```bash
git add scripts/scrape-kr-lists.js scripts/scrape-kr-details.js scripts/kr-incremental.js test/kr-incremental-update.test.js
git commit -m "refactor: extract Korean incremental scraper primitives"
```

### Task 2: Add the pending scan command and durable state

**Files:**
- Create: `scripts/update-kr.js`
- Modify: `package.json`
- Create: `data/raw/kr-sync-state.json`
- Create: `data/raw/kr-pending.json`
- Test: `test/kr-incremental-update.test.js`

**Interfaces:**
- `loadSyncState(path)` returns a versioned state with `lastScanAt` and one cursor entry per Korean board view.
- `scanIncrementally({ rawDir, fetchPage, fetchDetail, now })` returns `{ pending, state, report }` and reads existing cumulative IDs without modifying final data.
- CLI `node scripts/update-kr.js scan` writes state/pending/report atomically and exits non-zero if any board or detail fetch failed.

- [ ] **Step 1: Add failing tests for repeat-safe pending merges, no final-data mutation, and failed fetch preservation.**

```js
test('repeated scans do not duplicate pending records or touch the final dataset', async () => {
  const result = await scanIncrementally({ ...fixtureScanOptions() });
  const second = await scanIncrementally({ ...fixtureScanOptions({ pending: result.pending }) });
  assert.deepEqual(second.pending.records, result.pending.records);
  assert.equal(second.finalDatasetTouched, false);
});

test('a failed board keeps the previous pending records and reports the failure', async () => {
  const result = await scanIncrementally({ ...fixtureScanOptions({ failBoard: 'events-all' }) });
  assert.equal(result.report.failures[0].board, 'events-all');
  assert.deepEqual(result.pending.records, fixtureExistingPending.records);
});
```

- [ ] **Step 2: Run the focused tests and verify the new scan command behavior fails.**

Run: `node --test test/kr-incremental-update.test.js`

Expected: FAIL because `scanIncrementally` and the CLI state/pending contracts are not implemented.

- [ ] **Step 3: Implement the scanner.**

Use the existing six board definitions. Build `knownIds` from all existing `kr-notice-*.json`, `kr-events-*.json`, `kr-update.json`, `kr-details.json`, and pending records. Fetch only unknown list items and then fetch details for those IDs. Merge source-board metadata, preserve prior pending records, write `kr-sync-state.json`, `kr-pending.json`, and `kr-pending-review.md` through temporary files followed by rename. Do not write `kr-details.json`, candidate snapshots, or `fashion.json`.

- [ ] **Step 4: Add the weekly command names and review output.**

Update `package.json` with:

```json
"update:kr:scan": "node scripts/update-kr.js scan",
"update:kr:review": "node scripts/update-kr.js review"
```

The review command prints each pending ID, date, Korean title, source URL, image count, and warning/error fields. The generated Markdown report contains the same information plus clickable official notice and image URLs.

- [ ] **Step 5: Run the fixture tests and verify that scan output is isolated from the final dataset.**

Run: `node --test test/kr-incremental-update.test.js`

Expected: all scanner tests pass and the fixture `fashion.json` hash is unchanged.

- [ ] **Step 6: Commit the scanner and pending-state workflow.**

```bash
git add scripts/update-kr.js package.json data/raw/kr-sync-state.json data/raw/kr-pending.json test/kr-incremental-update.test.js
git commit -m "feat: stage new Korean notices for review"
```

### Task 3: Add explicit apply and cumulative raw-data merge

**Files:**
- Modify: `scripts/update-kr.js`
- Modify: `scripts/filter-kr-candidates.js`
- Modify: `scripts/build-dataset.js`
- Modify: `package.json`
- Test: `test/kr-incremental-update.test.js`

**Interfaces:**
- `parseApplyIds(argv)` returns `{ ids, applyAll }` and rejects an empty selection.
- `applyPending({ ids, rawDir, buildCandidates, buildDataset })` returns `{ appliedIds, remainingPending }` and writes only after all selected records pass validation.
- CLI `node scripts/update-kr.js apply --ids 103,104` applies selected records; `node scripts/update-kr.js apply --all` is the explicit full-pending opt-in.

- [ ] **Step 1: Add failing tests for explicit selection, validation, and pending removal.**

```js
test('apply requires explicit IDs and removes only applied pending records', async () => {
  const result = await applyPending({ ...fixtureApplyOptions(), ids: ['103'] });
  assert.deepEqual(result.appliedIds, ['103']);
  assert.deepEqual(result.remainingPending.records.map(item => item.id), ['104']);
  assert.ok(result.details.some(item => item.id === '103'));
});

test('apply rejects an ID that is not pending without changing raw data', async () => {
  await assert.rejects(() => applyPending({ ...fixtureApplyOptions(), ids: ['999'] }));
  assert.equal(readFixtureHash('kr-details.json'), fixtureDetailsHash);
});
```

- [ ] **Step 2: Run the focused tests and verify the apply behavior fails.**

Run: `node --test test/kr-incremental-update.test.js`

Expected: FAIL because explicit apply and merge logic are not implemented.

- [ ] **Step 3: Implement atomic apply.**

Validate selected pending records with the existing raw-data validator, merge them into the correct cumulative list snapshots and `kr-details.json`, regenerate `kr-notice-merged.json`, `kr-events-merged.json`, and `kr-candidates.json`, then run the existing dataset builder. Use temporary files for every JSON output and remove applied IDs from pending only after all writes and validation succeed.

- [ ] **Step 4: Keep historical behavior explicit.**

Do not call `scrape-kr-search` from `scan` or `apply`. Add `--ids` support for a future `detail`/`backfill` command only if a requested historical correction needs it; normal apply consumes pending records exclusively.

- [ ] **Step 5: Add the apply command and run focused tests.**

Update `package.json` with:

```json
"update:kr:apply": "node scripts/update-kr.js apply"
```

Run: `node --test test/kr-incremental-update.test.js`

Expected: selection, validation, atomic-write, and pending-removal tests pass.

- [ ] **Step 6: Commit the explicit apply workflow.**

```bash
git add scripts/update-kr.js scripts/filter-kr-candidates.js scripts/build-dataset.js package.json test/kr-incremental-update.test.js
git commit -m "feat: apply approved Korean notice updates"
```

### Task 4: Document the weekly manual workflow and run full verification

**Files:**
- Modify: `README.md`
- Modify: `test/dataset-contract.test.js`
- Modify: `data/raw/kr-pending.json`
- Modify: `data/raw/kr-sync-state.json`

**Interfaces:**
- README documents the exact weekly scan/review/apply/image/test/push sequence.
- Dataset contract tests prove that pending records are excluded until apply.

- [ ] **Step 1: Add a regression test that a pending-only notice never appears in `fashion.json`.**

```js
test('pending Korean notices stay out of the published dataset until apply', () => {
  const pendingIds = new Set(loadPending().records.map(item => item.id));
  const publishedIds = new Set(loadFashion().map(item => item.id));
  for (const id of pendingIds) assert.equal(publishedIds.has(id), false);
});
```

- [ ] **Step 2: Run the regression test and verify it fails if the builder consumes pending data.**

Run: `node --test test/dataset-contract.test.js`

Expected: PASS after confirming the current builder reads only cumulative `kr-details.json`; if it fails, remove the pending input from the builder before proceeding.

- [ ] **Step 3: Document the weekly VPN workflow.**

Add the following sequence to README:

```text
# VPN 必須開啟韓國出口
npm run update:kr:scan
npm run update:kr:review

# 確認指定 ID 後
npm run update:kr:apply -- --ids <ID1,ID2>
MBC_IMAGE_IDS=<ID1,ID2> npm run build:images
npm test && npm run validate:data && git diff --check
```

Explain that ordinary scan/apply never searches or re-fetches historical notices; use the full-history commands only when explicitly backfilling.

- [ ] **Step 4: Run all verification commands.**

Run: `npm test && npm run validate:data && git diff --check`

Expected: all tests pass, all raw-data files validate, and diff check exits successfully.

- [ ] **Step 5: Inspect the final CLI help and dry-run fixture output.**

Run: `node scripts/update-kr.js --help` and `node --test test/kr-incremental-update.test.js`.

Expected: scan/review/apply syntax is printed clearly and all incremental tests pass without a Korean network connection.

- [ ] **Step 6: Commit the documentation and regression coverage.**

```bash
git add README.md test/dataset-contract.test.js data/raw/kr-pending.json data/raw/kr-sync-state.json
git commit -m "docs: document Korean incremental update workflow"
```

## Final verification checklist

- [ ] A scan only requests list pages through the first all-known page.
- [ ] A scan never calls the broad Korean search endpoint.
- [ ] A scan fetches detail pages only for unknown IDs.
- [ ] Pending records are repeat-safe and isolated from `fashion.json`.
- [ ] Apply requires explicit IDs or `--all`.
- [ ] Apply is atomic and removes only successfully applied pending records.
- [ ] Historical full-scan commands remain available.
- [ ] `npm test`, `npm run validate:data`, and `git diff --check` pass.
