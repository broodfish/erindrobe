# Fashion Timeline Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Refresh the Korean fashion data pipeline, classification, selection-box coverage, and Taiwan matching evidence so the frontend can present a trustworthy chronological archive.

**Architecture:** Keep the static-site architecture. Add small pure Node modules for Korean notice parsing, Taiwan match evidence and dataset validation; keep data/fashion.json as the frontend contract. Preserve legacy fields while adding explicit bilingual names and twStatus/twEvidence fields so the new UI can consume evidence without guessing.

**Tech Stack:** Node.js 18+ built-in node:test, existing Playwright and Sharp scripts, JSON data files, vanilla JavaScript frontend.

**Spec:** docs/superpowers/specs/2026-09-23-fashion-timeline-redesign-design.md

## Global Constraints

- Use Korean notice正文 as the authoritative source for product names and sale dates.
- 전설 패션 장비 and 에픽 패션 map to 傳說時裝.
- 토탈 패키지, including 그랜드 앙상블 토탈 패키지, maps to 套組時裝.
- Image UUID evidence alone never produces confirmed.
- Failed fetches must not replace existing raw data with an empty result.
- Preserve all existing user/Claude changes; do not stage unrelated files.
- Do not introduce a backend service or frontend framework.

---

### Task 1: Establish the matching evidence contract with failing tests

**Files:**
- Create: scripts/tw-match.js
- Create: test/tw-match.test.js
- Modify: package.json

**Interfaces:**
- normalizeName(value): string
- deriveTwStatus({ nameMatch, imageMatch, manualMatch }): confirmed | probable | unmatched
- createEvidence({ krId, krName, twThreadId, twName, twDate, method, note }): object
- mergeMatchEvidence(base, evidence): object

- [ ] **Step 1: Write failing tests for evidence precedence.**

~~~js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeName, deriveTwStatus, createEvidence } = require('../scripts/tw-match.js');

test('normalizes Korean and Traditional Chinese labels for comparison', () => {
  assert.equal(normalizeName('（修改） 熱情之舞：卡門套裝'), '熱情之舞卡門套裝');
  assert.equal(normalizeName('정열의 춤 : 패션 럭키박스'), '정열의춤패션럭키박스');
});

test('requires name or manual evidence before image evidence can be probable', () => {
  assert.equal(deriveTwStatus({ nameMatch: false, imageMatch: true, manualMatch: false }), 'unmatched');
  assert.equal(deriveTwStatus({ nameMatch: true, imageMatch: false, manualMatch: false }), 'probable');
  assert.equal(deriveTwStatus({ nameMatch: true, imageMatch: true, manualMatch: false }), 'confirmed');
  assert.equal(deriveTwStatus({ nameMatch: false, imageMatch: false, manualMatch: true }), 'confirmed');
});

test('creates auditable evidence records', () => {
  assert.deepEqual(createEvidence({
    krId: '2839212_0',
    krName: '정열의 춤',
    twThreadId: '3527227',
    twName: '熱情之舞：卡門套裝',
    twDate: 1787090400,
    method: 'manual-name-and-image',
    note: '人工核對台服公告標題與韓服主題。',
  }), {
    krId: '2839212_0',
    twThreadId: '3527227',
    twName: '熱情之舞：卡門套裝',
    twDate: 1787090400,
    method: 'manual-name-and-image',
    note: '人工核對台服公告標題與韓服主題。',
  });
});
~~~

- [ ] **Step 2: Run the focused test and verify it fails because the module is missing.**

Run: node --test test/tw-match.test.js

Expected: FAIL with a missing-module error for scripts/tw-match.js.

- [ ] **Step 3: Implement the smallest pure matching module.**

normalizeName must decode common HTML entities, remove whitespace and punctuation used only as separators, and preserve CJK/Korean letters. deriveTwStatus must implement the exact precedence asserted above. createEvidence must omit absent optional values rather than inventing names or dates.

- [ ] **Step 4: Run the focused test and the full built-in test runner.**

Run: node --test test/tw-match.test.js

Expected: PASS with 3 tests.

Run: node --test

Expected: PASS for all tests currently present.

- [ ] **Step 5: Add the test script without changing existing scripts.**

Add "test": "node --test" to package.json, preserving all existing commands.

- [ ] **Step 6: Run npm test and commit only the matching contract.**

Run: npm test

Expected: PASS; commit message: test: define Taiwan match evidence contract.

### Task 2: Make Korean text parsing cover package, instrument, and dye products

**Files:**
- Modify: scripts/parse-kr-text.js
- Create: test/parse-kr-text.test.js

**Interfaces:**
- parseTotalPackageName(text): string or null
- parseChoiceBoxes(text, options): Array of product records
- parseLuckyBoxNotice(text): existing array shape, unchanged

- [ ] **Step 1: Write failing parser tests with small inline Korean notice fixtures.**

Cover one total package, two dye boxes in one notice, two instrument boxes with component names, and a notice with no choice-box section. Assert that the parser returns one product record per official product name and preserves the first sale date.

- [ ] **Step 2: Run node --test test/parse-kr-text.test.js and verify the new cases fail.**

Expected: FAIL because parseChoiceBoxes is not exported.

- [ ] **Step 3: Implement parser helpers using headings and table text, not image OCR.**

Recognize 토탈 패키지 names from the official heading. Recognize 염색약 선택 상자 and 악기 선택 상자 sections, split each product heading, collect the sale date and component line text, and return an empty array when no section matches.

- [ ] **Step 4: Run the parser tests and existing parser smoke examples.**

Run: node --test test/parse-kr-text.test.js

Expected: PASS.

Run: node scripts/parse-kr-text.js 2839212 2957846 3545054

Expected: existing lucky-box examples still parse and the command exits 0.

- [ ] **Step 5: Commit only parser and parser tests.**

Commit message: feat: parse Korean choice-box product sections.

### Task 3: Refresh official raw data safely through the Korean VPN

**Files:**
- Modify: scripts/scrape-kr-lists.js
- Modify: scripts/scrape-kr-details.js
- Modify: scripts/fetch-kr-fulltext.js
- Create: scripts/validate-raw-data.js
- Create: test/validate-raw-data.test.js
- Modify: package.json

**Interfaces:**
- validate-raw-data.js exits non-zero for missing IDs, empty successful responses, duplicate IDs or missing required fields.

- [ ] **Step 1: Add failing raw-data validation fixtures/tests.**

Exercise the validator against temporary in-memory fixtures or explicit JSON path arguments for valid records, duplicate IDs, an empty result, and a record missing title or date.

- [ ] **Step 2: Run the validator test and verify the invalid cases fail.**

Run: node --test test/validate-raw-data.test.js

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement validation and non-destructive fetch behavior.**

Fetch into a temporary output path or in-memory result first. Only replace the existing raw file after the response has the expected board count and required fields. Preserve the previous file when DNS, VPN, HTTP or parse errors occur and print a clear error containing the failed board or notice ID.

- [ ] **Step 4: Run the live Korean list refresh while VPN is connected.**

Run: npm run scrape:kr-lists

Expected: each board reports a non-zero count and no DNS/HTTP error. If it fails, stop and report the VPN/network error without overwriting existing raw data.

- [ ] **Step 5: Refresh candidates and full detail text.**

Run: npm run filter:kr-candidates.

Then run the existing detail refresh and full-text fetch for all current fashion candidates, preserving existing records for IDs that fail.

- [ ] **Step 6: Run raw-data validation and commit only intentional scraper/raw-data changes.**

Run: npm run validate:data

Expected: PASS with no empty board or duplicate ID errors. Commit message: feat: refresh Korean fashion source data safely.

### Task 4: Build the corrected dataset and auditable Taiwan match records

**Files:**
- Modify: scripts/build-dataset.js
- Create or modify: data/raw/tw-kr-matches.json
- Modify: data/fashion.json
- Modify: README.md
- Create: test/build-dataset.test.js

**Interfaces:**
- Dataset entries must include nameKr, nameTw (nullable), twStatus, twEvidence (array), twThreadId (nullable), and legacy-compatible displayName/twReleased fields.

- [ ] **Step 1: Write failing dataset contract tests.**

Assert that generated data contains 3545055 in 套組時裝, no 套組 category, at least one 染色劑選擇箱 product per parsed dye box, two instrument product records, and matching evidence semantics for every twStatus.

- [ ] **Step 2: Run the test before implementation and record the expected failures.**

Run: node --test test/build-dataset.test.js

Expected: FAIL on the old category name and missing match-status fields.

- [ ] **Step 3: Integrate the parser and evidence module into build-dataset.js.**

Change category output to 傳說時裝 and 套組時裝. Use Korean official text for nameKr; use verified Chinese names only for nameTw; preserve unresolved Korean names without fabricated translations. Split instrument/dye products from parser output, attach their source notice and selected images, and migrate the current manually verified map into tw-kr-matches.json with explicit methods and notes.

- [ ] **Step 4: Replace boolean-only matching with conservative evidence derivation.**

Use manual name evidence first, then normalized bilingual aliases, then image UUID/content evidence. A UUID-only hit must output probable at most; a no-name/no-manual result must output unmatched. Keep twReleased true only for confirmed and preserve a separate twStatus for the frontend.

- [ ] **Step 5: Run the dataset tests and a dry-run build.**

Run: node --test test/build-dataset.test.js

Expected: PASS with corrected categories and product-level records.

Run: npm run build:dataset

Expected: output reports category counts, no missing local-image references, and non-zero counts for 套組時裝, 商城樂器, and dye products.

- [ ] **Step 6: Validate all evidence and asset references.**

Run: npm run validate:data

Expected: no duplicate IDs, no missing source URLs, no missing local images, and every confirmed/probable match has a twEvidence entry.

- [ ] **Step 7: Update README and commit the data-layer changes.**

Document the corrected categories, three evidence states, live VPN requirement, and the meaning of unmatched data. Commit message: feat: rebuild fashion dataset with auditable Taiwan matches.

### Task 5: Hand the stable data contract to AGY for UI implementation

**Files AGY may modify:**
- index.html
- css/style.css
- js/app.js

**Files AGY must not modify:**
- scripts/
- data/raw/
- data/fashion.json
- package.json

- [ ] **Step 1: Provide AGY the final data contract and approved visual direction.**

The UI must consume nameKr, nameTw, twStatus, twEvidence, krDate, twDate, category, localImages, and source URLs. It must default to chronological ascending, support the current-date marker, and never label unmatched records as definitely unreleased.

- [ ] **Step 2: Ask AGY to implement only the approved UI scope in accept-edits mode.**

The prompt must require modern sans-serif typography, a fresh editorial layout, responsive mobile behavior, accessible status text, and no changes outside the three UI files.

- [ ] **Step 3: Review AGY's diff before accepting it.**

Check that no data or scripts changed, the UI does not hardcode counts, and the new fields degrade gracefully when absent.

### Task 6: Full verification and handoff

**Files:**
- Modify only files required by verification fixes.

- [ ] **Step 1: Run all automated checks.**

Run: npm test

Run: node --check scripts/*.js and node --check js/app.js

Run: npm run validate:data

Expected: all commands pass with no warnings that indicate data loss.

- [ ] **Step 2: Run the static site locally.**

Run: npm run serve

Open http://localhost:8080 and verify the real dataset renders without console errors.

- [ ] **Step 3: Smoke-test desktop and mobile behavior.**

Verify ascending timeline, year/month navigation, today jump, bilingual search, status filters, image carousel keyboard controls, mobile swipe/tap controls, empty-state reset, and official source links.

- [ ] **Step 4: Run git diff --check and inspect the final diff.**

Confirm that the original Claude changes remain intact unless intentionally superseded by the approved data contract, and that no debug UI or generated temporary files are included.

- [ ] **Step 5: Report the final changed files, test commands, data counts, and any unresolved VPN/source limitations.**
