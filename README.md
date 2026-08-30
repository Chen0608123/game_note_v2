# Game Note

遊戲筆記與紀念收藏網站，使用 GitHub Pages 發布前端，Supabase 提供登入、PostgreSQL 資料庫與圖片儲存。

## 1. 建立 Supabase 專案

1. 到 Supabase 建立新專案。
2. 開啟 **SQL Editor**，貼上並執行 `supabase/schema.sql`。
3. 到 **Project Settings → API**，複製 Project URL 與 Publishable key。
4. 打開 `config.js`，填入這兩個值。Publishable key 可以出現在前端；不可填入 secret 或 service_role key。
5. 到 **Authentication → URL Configuration**，把 GitHub Pages 網址加入 Site URL 與 Redirect URLs，例如 `https://你的帳號.github.io/game_note_v2/`。

若保留電子信箱驗證，使用者註冊後必須先點擊驗證信。開發初期也能在 Supabase 的 Authentication 設定中關閉 Confirm email。

如果曾經自行建立過 `games` 或 `entries` 資料表，並出現 schema cache／缺少欄位錯誤，請在 SQL Editor 執行 `supabase/repair_schema.sql`，它會保留資料表並補齊網站需要的欄位。

## 2. 發布至 GitHub Pages

1. 在 GitHub 建立名為 `game_note_v2` 的 repository。
2. 將此資料夾提交並推送到 `main` 分支。
3. 開啟 repository 的 **Settings → Pages**。
4. 在 Source 選擇 **GitHub Actions**。
5. 等待 Actions 中的 `Deploy Game Note to GitHub Pages` 完成。

每次部署時，GitHub Actions 會自動替 JavaScript、設定檔與樣式加入新的版本號，避免瀏覽器繼續載入舊快取，不需要手動修改版本。

網站網址通常為 `https://你的帳號.github.io/game_note_v2/`。

## 安全說明

- 資料表已啟用 Row Level Security，每位使用者只能操作自己的遊戲與內容。
- 封面圖片限制為 5 MB，且只能上傳到自己的資料夾。
- `config.js` 只能使用 Publishable key 或舊版 anon key，絕對不可提交 service_role／secret key。
- 前端使用頁面內部的 Auth 排隊鎖，避免 Chromium Web Locks 殭屍鎖造成登入永久等待。
