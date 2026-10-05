# 瑪奇 Mobile 時裝未來視

## 這是什麼

這是非官方粉絲網站，將《瑪奇 Mobile》（마비노기 모바일）的韓服公告整理成時裝與商品時間軸，方便查找韓服未來內容與預覽圖片。

網站以韓服上線日期排序，收錄時裝、套組、通行證、樂器、染色劑、造型、髮型、動作與活動等項目；染色劑選擇箱的卡片以色塊縮圖呈現，點擊後可查看完整色碼。

## 資料來源與版權聲明

- 韓服官方公告：https://mabinogimobile.nexon.com/
- 台服官方公告：https://tw.nexon.com/mabinogimobile/
- 資料與圖片僅作為非商業性粉絲整理與瀏覽比對使用，不代表官方立場。
- 圖片與遊戲素材版權屬於 NEXON Co., Ltd. 與 devCAT Co., Ltd.，實際上線內容、時間與活動細節請以官方公告為準。

## 更新資料方法

一般更新只查找新的韓服公告，不重新搜尋或抓取過往公告。執行前請先開啟可連線韓國網站的 VPN。

```bash
# 掃描新公告；只查找上次同步後的新公告，不重新抓取過往公告
# 掃描結果會分成自動收錄、自動排除、待確認三組，不會直接修改正式時間軸
npm run update:kr:scan

# 套用分類器判定明確的新內容
npm run update:kr:apply:auto

# 查看剩下需要人工判斷的公告
npm run update:kr:review

# 確認後，只套用指定公告 ID；這是處理模糊公告的方式
npm run update:kr:apply -- --ids <ID1,ID2>

# 下載這次新增項目的圖片並壓縮成 WebP
MBC_IMAGE_IDS=<ID1,ID2> npm run build:images

# 發布前驗證
npm test && npm run validate:data && git diff --check

# 提交並推送
git add .
git commit -m "data: update Korean timeline"
git push origin main
```

分類器會把維修、伺服器異常、單純再販／復刻與明確的照片活動記入 `kr-sync-state.json` 的排除清單，之後的增量掃描不會再次要求判斷；出現時裝、外觀、動作、樂器或染色等明確線索的公告可由 `--auto` 套用。無法安全判斷的公告會留在待確認清單，仍可用 `--ids` 手動收錄。完成驗證後推送到 `main`，GitHub Pages 會自動更新網站。
