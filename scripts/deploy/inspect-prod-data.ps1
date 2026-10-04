# 唯讀檢查正式資料庫（A5 上線前）：資料表版本、班級分類（改版前的測試房間、沒有擁有者的真房間、老師帳號的班級）、
# 孩子帳號數、Google 綁孩子與綁房間的筆數、大人帳號數。整段在 READ ONLY 交易裡，不會改任何東西；
# 只印筆數、班級代碼與名稱、日期，不印孩子的暱稱與 email。
# 在班級伺服器的容器裡執行 inspect-prod-data.cjs（傳送方式見 Invoke-ServerNode.ps1）。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：
#   .\scripts\deploy\inspect-prod-data.ps1
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-ServerNode.ps1')

$Code = Invoke-ServerNode -Path (Join-Path $PSScriptRoot 'inspect-prod-data.cjs')
if ($Code -ne 0) { throw '檢查失敗' }
