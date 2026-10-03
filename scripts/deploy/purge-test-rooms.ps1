# 清掉正式資料庫裡 e2e 建的測試房間（管理密碼 teach123 的房間；真正的房間不會動）。
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
if ($LASTEXITCODE -ne 0) { throw '清理失敗' }
