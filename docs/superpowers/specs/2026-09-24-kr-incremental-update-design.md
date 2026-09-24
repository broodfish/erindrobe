# Korean Incremental Update Workflow Design

**Status:** Implemented locally

## Goal

Provide a manual weekly workflow that runs while the user has a Korean VPN enabled, discovers only Korean notices that are newer than the existing local snapshots, stages their details for review, and changes the published timeline only after explicit approval.

## Non-goals

- No ChatGPT scheduled task, VPS, GitHub Actions job, or background automation.
- No routine full-history Korean search or detail re-fetch.
- No automatic insertion of pending records into `data/fashion.json`.
- No deletion or rewriting of historical detail records during a normal incremental scan.

## Architecture

The existing full-snapshot scripts remain available for deliberate historical recovery. A new incremental workflow is layered beside them:

1. `update:kr:scan` fetches the first pages of the existing Korean notice/event/update list views through the user's Korean VPN. It walks backward only until it reaches IDs already present in the cumulative raw snapshots or pending queue. It does not call the broad official search endpoint.
2. The scanner fetches detail pages only for newly discovered IDs and writes them to `data/raw/kr-pending.json`, together with discovery metadata and a human-readable review report. Existing raw data and `data/fashion.json` remain unchanged.
3. The user reviews the pending records and explicitly selects IDs.
4. `update:kr:apply -- --ids <id,...>` atomically merges selected records into the cumulative raw list/detail data, rebuilds the candidate snapshots and `data/fashion.json`, and removes only applied records from the pending queue.
5. Existing image, test, validation, and GitHub Pages commands remain the final publish gate. The existing full-history commands remain available for deliberate historical corrections when requested.

## Data contracts

### `data/raw/kr-sync-state.json`

```json
{
  "version": 1,
  "lastScanAt": "2026-09-24T00:00:00.000Z",
  "boards": {
    "notice-info": { "lastPage": 1, "lastSeenId": "3550530" },
    "notice-done": { "lastPage": 1, "lastSeenId": "3550529" },
    "notice-major": { "lastPage": 1, "lastSeenId": "3550528" },
    "update": { "lastPage": 1, "lastSeenId": "3550527" },
    "events-past": { "lastPage": 1, "lastSeenId": "3550526" },
    "events-all": { "lastPage": 1, "lastSeenId": "3550525" }
  }
}
```

The state is operational metadata, not the source of truth. The scanner also derives a known-ID set from all cumulative list snapshots and pending records, so deleting or rebuilding the state file cannot cause historical detail pages to be fetched automatically.

### `data/raw/kr-pending.json`

```json
{
  "version": 1,
  "updatedAt": "2026-09-24T00:00:00.000Z",
  "records": [
    {
      "id": "3550530",
      "boardPath": "/News/Notice",
      "sourceBoards": ["notice-info"],
      "discoveredAt": "2026-09-24T00:00:00.000Z",
      "status": "pending",
      "title": "...",
      "date": "2026.09.24",
      "pageTitle": "...",
      "contentImages": ["https://..."],
      "fullText": "..."
    }
  ]
}
```

Pending records use the same detail shape consumed by `build-dataset.js`, with only additive discovery metadata. The review report links to the official notice and lists its preview URLs without publishing them to the website.

## Incremental boundary rules

- Normal scans use the six existing Korean list views from `scrape-kr-lists.js`.
- IDs are deduplicated by `boardPath:id`; the same notice appearing in multiple views is fetched once and records all source views.
- A page is considered historical once every item on that page is already known. The scanner stops there instead of requesting the remaining historical pages.
- New detail requests are restricted to unknown IDs discovered in the current scan. Existing IDs with old parsing or image issues are not retried automatically.
- `scrape:kr-search` is excluded from the normal scan because its query results are not bounded to the new-notice window. It remains available for explicit backfills.
- Empty or malformed responses never replace a non-empty raw snapshot or pending file. Board-level failures are recorded in the scan report and return a non-zero exit status after other boards finish.

## Review and apply behavior

- `npm run update:kr:scan` is safe to run repeatedly; it merges by `boardPath:id` and does not duplicate pending records.
- `npm run update:kr:review` prints pending IDs, dates, titles, official URLs, image counts, and parsing warnings.
- `npm run update:kr:apply -- --ids 3550530,3550529` requires explicit IDs. Applying no IDs is an error; `--all` is an explicit opt-in for accepting the complete pending queue.
- Apply writes cumulative raw files atomically, rebuilds candidate snapshots from cumulative data, rebuilds `data/fashion.json`, and removes only successfully applied IDs from pending.
- Apply does not download images automatically. The selected IDs are printed so the user can run `MBC_IMAGE_IDS=... npm run build:images`, then optimize and validate before committing.
- If classification or image selection needs correction, the user can edit the existing manual split/override files or use the explicit historical recovery flow; the normal scan does not revisit old notices.

## Error handling

- Preserve the previous state, raw snapshots, pending records, and final dataset if a write or validation step fails.
- Keep failed detail fetches in the scan report with the URL and HTTP error, but do not create an apparently complete pending record.
- Refuse apply when an approved ID is absent from pending, duplicated in cumulative details, or missing required `id`/`fullText` fields.
- Run `npm test`, `npm run validate:data`, and `git diff --check` before publication.

## Verification

- Unit tests cover known-ID stopping, board deduplication, repeat-safe pending merges, state persistence, explicit apply selection, and failure-safe writes.
- A fixture-based scan test runs without a Korean network connection.
- An integration smoke test verifies that scanning an all-known fixture produces no pending records and does not modify the final dataset.
- The existing full test suite and raw-data validation remain required before a GitHub Pages push.
