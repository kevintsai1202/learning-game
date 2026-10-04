# 在 Zeabur 上班級伺服器的容器裡執行一支本機的 Node 腳本（CommonJS，.cjs）：
# 容器裡有 node、pg 與 DATABASE_URL；把腳本 gzip 再 base64 送過去，在容器裡還原成 /app 底下的暫存檔
# （放 /app 才找得到 /app/node_modules/pg），執行完就刪掉。
# 先壓縮：Windows 上 npx 會經過 cmd.exe，命令列上限 8191 字元，6KB 的腳本直接 base64 就超過了。
#
# 用法（其他腳本裡）：. (Join-Path $PSScriptRoot 'Invoke-ServerNode.ps1'); Invoke-ServerNode -Path <腳本> -Arguments '--apply'
# 回傳容器裡 node 的結束代碼。

function Invoke-ServerNode {
  param(
    [Parameter(Mandatory)] [string]$Path,
    [string]$Arguments = ''
  )
  # island-server 服務（見 server/CLAUDE.md 的「Zeabur 部署」）
  $ServiceId = '6ac096ec3eaaf9d7d3e1def7'
  $Bytes = [IO.File]::ReadAllBytes((Resolve-Path $Path))
  $Buffer = [IO.MemoryStream]::new()
  $Gzip = [IO.Compression.GZipStream]::new($Buffer, [IO.Compression.CompressionLevel]::Optimal)
  $Gzip.Write($Bytes, 0, $Bytes.Length)
  $Gzip.Dispose()
  $B64 = [Convert]::ToBase64String($Buffer.ToArray())
  $Target = "/app/.$([IO.Path]::GetFileName($Path))"
  $Tail = if ($Arguments) { " $Arguments" } else { '' }
  $Shell = "echo $B64 | base64 -d | gunzip > $Target && node $Target$Tail; rc=`$?; rm -f $Target; exit `$rc"
  # '--' 要加引號：PowerShell 會把沒加引號的 -- 當成自己的參數結尾記號吃掉，CLI 就會把 -c 當成自己的參數。
  # 輸出直接送到畫面（Out-Host）：不然會變成函式回傳值的一部分，呼叫的一方拿到的就不只是結束代碼
  npx -y zeabur@latest service exec --id $ServiceId -i=false '--' sh -c $Shell | Out-Host
  return $LASTEXITCODE
}
