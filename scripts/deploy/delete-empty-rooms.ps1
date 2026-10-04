# 刪除正式資料庫裡指定的空房間（沒有成員、沒有擁有者；有任何一間不符合就整個拒絕）。
# 在班級伺服器的容器裡執行 delete-empty-rooms.cjs（傳送方式見 Invoke-ServerNode.ps1）。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：
#   .\scripts\deploy\delete-empty-rooms.ps1 -Codes 713521,869912          # 只列出
#   .\scripts\deploy\delete-empty-rooms.ps1 -Codes 713521,869912 -Apply   # 真的刪除
param(
  [Parameter(Mandatory)] [string[]]$Codes,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-ServerNode.ps1')

$Arguments = ($Codes -join ' ') + $(if ($Apply) { ' --apply' } else { '' })
$Code = Invoke-ServerNode -Path (Join-Path $PSScriptRoot 'delete-empty-rooms.cjs') -Arguments $Arguments
if ($Code -ne 0) { throw '刪除失敗' }
