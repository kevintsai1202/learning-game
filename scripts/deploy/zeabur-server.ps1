# 把班級伺服器重新部署到 Zeabur（直接上傳，不經過 GitHub）。
#
# 只上傳伺服器建置需要的檔案（git archive 匯出已 commit 的 package.json、lock 檔、Dockerfile、server/、src/、tsconfig），
# 不會把 .env 的金鑰、public/ 的音檔、node_modules 傳上去；沒 commit 的改動不會部署。
# Zeabur 看到 Dockerfile 就照它建置。專案與服務 ID 見 server/CLAUDE.md 的「Zeabur 部署」。
#
# 執行（PowerShell 7，專案根目錄；Zeabur CLI 要先登入：npx zeabur@latest auth status）：
#   .\scripts\deploy\zeabur-server.ps1
$ErrorActionPreference = 'Stop'

# learning-island 專案（神奇網路裝置上）與 class-server 服務
$ProjectId = '6ac070128ae74b28932b917f'
$ServiceId = '6ac0724e3eaaf9d7d3e1d390'
# 上傳的檔案清單（伺服器建置用到的全部）
$Files = @('package.json', 'package-lock.json', 'Dockerfile', '.dockerignore', 'tsconfig.json', 'server', 'src')

$Export = Join-Path ([IO.Path]::GetTempPath()) 'learning-island-zeabur-server'
if (Test-Path $Export) { Remove-Item -Recurse -Force $Export }
New-Item -ItemType Directory -Force $Export | Out-Null
$Tar = "$Export.tar"
git archive --format=tar -o $Tar HEAD @Files
if ($LASTEXITCODE -ne 0) { throw 'git archive 失敗' }
tar -xf $Tar -C $Export
Remove-Item $Tar
if (Test-Path (Join-Path $Export '.env')) { throw '匯出目錄裡出現 .env，停止上傳' }
Write-Host "上傳內容：$((Get-ChildItem -Recurse -File $Export).Count) 個檔案（commit $(git rev-parse --short HEAD)）"

Push-Location $Export
try {
  npx -y zeabur@latest deploy --project-id $ProjectId --service-id $ServiceId --json -i=false
  if ($LASTEXITCODE -ne 0) { throw 'zeabur deploy 失敗' }
} finally {
  Pop-Location
  Remove-Item -Recurse -Force $Export
}
Write-Host '已送出部署；建置與啟動紀錄：npx zeabur@latest deployment log --service-id' $ServiceId '-t runtime -i=false'
