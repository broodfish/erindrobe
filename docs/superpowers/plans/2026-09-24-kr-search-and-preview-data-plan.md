# 韓服官網搜尋與公告預覽資料 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 以韓服官方「標題＋內容」搜尋補齊漏抓公告，從正文建立細分類、販售位置、預覽圖與染色碼資料。

**Architecture:** 新增純函式模組解析官方搜尋結果與分類規則；列表抓取仍作為備援，搜尋結果與列表候選合併去重後才抓公告詳情。資料建置在保留既有 `category` 的前提下，新增 `productType`、`relatedTypes`、`shopPath`、`colorCodes` 與公告圖庫欄位；前端以新欄位搜尋與顯示。

**Tech Stack:** Node.js 22、內建 `fetch`、Node test runner、既有 Sharp/Playwright 圖片與瀏覽器工具。

**Spec:** `docs/superpowers/specs/2026-09-24-kr-search-and-preview-data-spec.md`

## Global Constraints

- 保留使用者尚未提交的台服日期、比對與 UI 修改。
- 不用圖片 OCR 判定韓服上線日；優先解析公告正文的販售期間。
- 染色劑選擇箱不下載預覽圖，只保存色碼。
- 搜尋服務失敗時仍保留現有列表抓取結果，不覆寫成空資料。

## Tasks

### Task 1: 建立官方搜尋與分類的失敗測試

- [ ] 新增搜尋結果 HTML 解析、搜尋詞、分類優先序、販售路徑與色碼擷取測試。
- [ ] 先執行相關測試，確認在實作前失敗。

### Task 2: 接入官方搜尋

- [ ] 建立可測試的搜尋結果解析與 request 參數模組。
- [ ] 新增官方搜尋抓取腳本，支援三個官方內容板與分頁。
- [ ] 將搜尋結果合併到候選公告，並擴充列表備援關鍵字及更新板來源。

### Task 3: 建立正文分類與預覽資料

- [ ] 保存完整 `fullText`，不只保存截斷摘要。
- [ ] 依正文與標題建立 `productType`、`relatedTypes`、`shopPath`、`colorCodes`。
- [ ] 保存公告內所有可用預覽圖片，染色劑選擇箱排除預覽圖片下載。

### Task 4: 更新建置與前端搜尋

- [ ] 讓資料建置納入新增欄位且不破壞既有台服比對欄位。
- [ ] 讓前端分類 chip、文字搜尋與圖片檢視讀取 `productType`／公告圖庫。
- [ ] 更新 README 的抓取順序與新資料限制說明。

### Task 5: 驗證

- [ ] 執行 `npm test`、`npm run validate:data`、`git diff --check`。
- [ ] 用 Scrapling/官方瀏覽器確認 3521630、3511363、3311070 的正文欄位與預覽圖標記。
- [ ] 若網路/VPN 只允許瀏覽器而不允許本機 Node，記錄為抓取執行環境限制，不偽造已重新下載的素材。
