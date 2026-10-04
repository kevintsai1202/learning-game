# 清掉正式資料庫裡 e2e 建的測試資料（A5 上線後用）：
# - e2e 的大人帳號（帳號名稱 e2e_ 開頭、email 是「帳號名稱@example.com」、密碼 teach1234，三個都符合才算），
#   連同它的班級、班上的角色、名下的角色、權杖與綁定；
# - 改版前用管理密碼 teach123 建的測試房間。
# 真正的資料不會動；測試班級裡有別人家長名下的角色時整個拒絕（結束代碼 2）。資料表還是改版前的版本時也拒絕。
# 把 purge-test-rooms.cjs 送進 Zeabur 上班級伺服器的容器執行（容器裡有 node、pg 與 DATABASE_URL）：
# 用 base64 送過去、在容器裡還原成 /app 底下的檔案（放 /app 才找得到 /app/node_modules/pg），執行完就刪掉。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：
#   .\scripts\deploy\purge-test-rooms.ps1           # 只列出
#   .\scripts\deploy\purge-test-rooms.ps1 -Apply    # 真的刪除
param([switch]$Apply)
$ErrorActionPreference = 'Stop'

# island-server 服務（見 server/CLAUDE.md 的「Zeabur 部署」）
$ServiceId = '6ac096ec3eaaf9d7d3e1def7'
$Script = Get-Content -Raw -Encoding utf8 (Join-Path $PSScriptRoot 'purge-test-rooms.cjs')
$B64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Script))
$Target = '/app/.purge-test-rooms.cjs'
$Flag = if ($Apply) { ' --apply' } else { '' }
$Shell = "echo $B64 | base64 -d > $Target && node $Target$Flag; rc=`$?; rm -f $Target; exit `$rc"
# '--' 要加引號：PowerShell 會把沒加引號的 -- 當成自己的參數結尾記號吃掉，CLI 就會把 -c 當成自己的參數
npx -y zeabur@latest service exec --id $ServiceId -i=false '--' sh -c $Shell
if ($LASTEXITCODE -eq 2) { throw '拒絕刪除（安全檢查）：請看上面的說明，人工確認後再處理' }
if ($LASTEXITCODE -ne 0) { throw '清理失敗' }
