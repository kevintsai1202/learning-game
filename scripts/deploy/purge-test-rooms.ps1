# 清掉正式資料庫裡 e2e 建的測試資料（A5 上線後用）：
# - e2e 的大人帳號（帳號名稱 e2e_ 開頭、email 是「帳號名稱@example.com」、密碼 teach1234，三個都符合才算），
#   連同它的班級、班上的角色、名下的角色、權杖與綁定；
# - 改版前用管理密碼 teach123 建的測試房間。
# 真正的資料不會動；測試班級裡有別人家長名下的角色時整個拒絕（結束代碼 2）。資料表還是改版前的版本時也拒絕。
# 在班級伺服器的容器裡執行 purge-test-rooms.cjs（傳送方式見 Invoke-ServerNode.ps1）。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：
#   .\scripts\deploy\purge-test-rooms.ps1           # 只列出
#   .\scripts\deploy\purge-test-rooms.ps1 -Apply    # 真的刪除
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-ServerNode.ps1')

$Code = Invoke-ServerNode -Path (Join-Path $PSScriptRoot 'purge-test-rooms.cjs') -Arguments $(if ($Apply) { '--apply' } else { '' })
if ($Code -eq 2) { throw '拒絕刪除（安全檢查）：請看上面的說明，人工確認後再處理' }
if ($Code -ne 0) { throw '清理失敗' }
