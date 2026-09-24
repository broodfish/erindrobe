# 瑪奇 Mobile 時裝未來視

非官方粉絲網站:整理韓服「마비노기 모바일 (Mabinogi Mobile)」歷來的時裝上線時間軸,並比對台服「瑪奇 Mobile」是否已發行對應內容。

線上瀏覽:部署在 GitHub Pages 後即可直接開啟 `index.html`（純靜態網站,無需建置流程）。

## 這是什麼

- 依時間軸呈現韓服官方公告中的時裝、幸運盒、套組、通行證、樂器、染色劑選擇箱、新造型與活動商品
- 每筆資料附官方公告中的宣傳圖與預覽圖(已下載並轉為 WebP 壓縮,不使用外部連結；染色劑選擇箱改以色碼色票呈現)
- 自動比對台服是否已發行相同時裝(比對方式:兩服共用同一組 CloudFront 圖片 UUID 路徑,即代表台服重複使用了韓服的美術資源,可視為同一項時裝)
- 可依細分類篩選（時裝幸運盒／寵物幸運盒／傳說時裝／套組／通行證／活動時裝／聯名時裝／商店時裝／樂器／染色劑選擇箱／新造型／特殊活動抽獎盒），也可只看「台服尚未發行」的項目

## 資料來源與版權聲明

- 韓服公告:https://mabinogimobile.nexon.com/
- 台服公告:https://tw.nexon.com/mabinogimobile/
- 所有圖片版權屬於 NEXON Co., Ltd. & devCAT CO., LTD.,本站僅作為非商業性質的粉絲資訊整理,不代表官方立場。實際上線內容、時間與活動細節請以官方公告為準。

### 已知限制

- 韓服官網對台灣 IP 有地區限制,資料是透過韓國出口的網路連線取得;若未來連線方式失效,`npm run scrape:kr-lists` 系列腳本可能需要調整。
- 台服上線時間才 2 個月(2026-07-22 上線),因此「台服已發行」的比對目前樣本數還很少,會隨台服更新持續增加。
- 「套組時裝」等尚未在台服公告的項目,名稱維持韓文原名,不強加未經官方確認的中文譯名,避免誤導。
- **台服比對方法與限制**:台服不一定會按照韓服原本的組合、順序或時間點發行同一批項目(同一週在韓服一起出的幾個項目,台服可能分開、甚至不同順序上線)。因此:
  - **套組時裝(傳說級)**:採用逐一核對台服公告標題(搜尋「傳說時裝裝備『...』」公告)得到的verified 對照表(`scripts/build-dataset.js` 內的 `LEGENDARY_TW_MAP`),準確度高,但需要在台服公告後手動/半自動更新對照表。
  - **幸運箱/通行證/其他商城**:採用宣傳圖素材的 CloudFront UUID 比對——但台服通常會用全新 UUID 重新上傳自己的宣傳橫幅,只有部分角色立繪等素材會沿用韓服原檔,所以這個方法**容易漏判**(判定「未發行」不代表台服真的没有),不會誤判成「已發行」。請以台服官方公告為準。

## 專案結構

```
index.html            主頁面
css/style.css          樣式
js/app.js               前端邏輯(讀取 data/fashion.json 並渲染)
data/fashion.json      最終資料集(前端實際使用)
data/raw/              抓取的原始清單/明細(留作可追溯紀錄)
assets/fashion-web/    已下載並壓縮的宣傳圖(WebP)
scripts/               抓取與整理資料用的 Node.js 腳本
```

## 重新產生資料(如需更新)

需要 Node.js 18+（使用內建 `fetch`）與 Playwright（會自動下載 Chromium）。

```bash
npm install
npx playwright install chromium

# 1) 抓韓服公告/更新/活動清單（需要韓國出口 IP，否則會被導向到空白頁）
npm run scrape:kr-lists

# 2) 使用韓服官網「標題＋內容」搜尋發現候選公告（需韓國出口 IP）
npm run scrape:kr-search

# 3) 合併官網搜尋結果、列表備援與更新板，篩出候選公告
npm run filter:kr-candidates

# 4) 抓每篇候選公告的完整正文與所有宣傳／預覽圖網址
npm run scrape:kr-details

# 5) 抓台服公告清單與明細（台灣 IP 可直接執行）
npm run scrape:tw-lists
npm run scrape:tw-details

# 6) 整理成最終資料集 data/fashion.json（含分類、正文販售日、預覽圖、色碼與台服比對）
npm run build:dataset

# 7) 下載宣傳圖／預覽圖並壓縮成 WebP（染色劑選擇箱改用色碼，不下載色盤）
npm run build:images

# 本地預覽
npm run serve
# 開瀏覽器看 http://localhost:8080
```

## 每週增量更新(建議流程)

一般更新只需要查找新的韓服公告，不會重新搜尋或重新抓取過往公告。執行前請先開啟韓國出口 VPN:

```bash
# 1) 掃描新公告；只寫入 pending，不會改動正式時間軸
npm run update:kr:scan

# 2) 查看待確認公告的 ID、標題、官方連結與圖片數量
npm run update:kr:review
# 也可以查看 data/raw/kr-pending-report.md

# 3) 確認公告後，只套用指定 ID
npm run update:kr:apply -- --ids <ID1,ID2>

# 4) 下載與壓縮這次新增卡片的圖片
MBC_IMAGE_IDS=<ID1,ID2> npm run build:images

# 5) 發布前驗證
npm test && npm run validate:data && git diff --check
```

`update:kr:apply` 會同步更新累積原始資料、候選清單與 `data/fashion.json`；只有明確使用 `--all` 才會套用全部 pending。歷史公告需要回補時，才使用完整抓取流程或指定公告 ID 的手動處理方式。

## 部署到 GitHub Pages

這是純靜態網站,不需要建置流程:

1. 建立 GitHub repo 並推送本專案(`node_modules/` 已在 `.gitignore`,不會被提交)
2. 到 repo 的 **Settings → Pages**
3. **Source** 選擇 `Deploy from a branch`,Branch 選 `main` / `(root)`
4. 儲存後等幾分鐘,GitHub 會提供網址(例如 `https://<username>.github.io/<repo>/`)

## 授權

程式碼可自由使用;圖片素材版權屬於 NEXON / devCAT,請勿移作商業用途。
