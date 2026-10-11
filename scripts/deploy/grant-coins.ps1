# 給正式資料庫裡的某個孩子金幣（測試用；使用者要求時才跑）。預設只看，加 -Apply 才寫入。
# 名字轉成 base64（UTF-8）再送進容器，中文不會經過 Windows 命令列變亂碼。邏輯在 grant-coins.cjs。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入）：
#   .\scripts\deploy\grant-coins.ps1 -Name 狗狗 -Coins 2000          # 先看找到誰、現在幾枚
#   .\scripts\deploy\grant-coins.ps1 -Name 狗狗 -Coins 2000 -Apply   # 真的給
param(
  [Parameter(Mandatory)] [string]$Name,
  [Parameter(Mandatory)] [int]$Coins,
  [switch]$Apply
)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Invoke-ServerNode.ps1')

$NameB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($Name))
$Arguments = "--name-b64 $NameB64 --coins $Coins" + $(if ($Apply) { ' --apply' } else { '' })
$Code = Invoke-ServerNode -Path (Join-Path $PSScriptRoot 'grant-coins.cjs') -Arguments $Arguments
if ($Code -ne 0) { throw '給金幣失敗' }
