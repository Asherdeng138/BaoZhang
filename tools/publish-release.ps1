# 一键发布：把已构建、已测试的 APK / EXE / ZIP 上传为 GitHub 正式发布版。
# 前提（只需一次）：winget install --id GitHub.cli ，然后 gh auth login 用你自己的账号登录。
# 不上传签名文件、密码或发票数据；只上传下面列出的三个安装包和哈希清单。
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$repo = 'Asherdeng138/ExpenseClaims'

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw '未找到 GitHub CLI。请先运行：winget install --id GitHub.cli' }
cmd /c "gh auth status >nul 2>nul"
if ($LASTEXITCODE -ne 0) { throw '尚未登录 GitHub。请先运行：gh auth login' }

$av = (Select-String -Path 'app/build.gradle' -Pattern "versionName '([^']+)'").Matches[0].Groups[1].Value
$dv = (Get-Content 'desktop/package.json' -Raw -Encoding UTF8 | ConvertFrom-Json).version
$tag = "v$av-$dv"
$files = @("output/BaoZhang-$av.apk", "desktop/release/BaoZhang-Desktop-$dv.exe", "desktop/release/BaoZhang-Desktop-$dv.zip")
foreach ($f in $files) { if (-not (Test-Path $f)) { throw "缺少文件：$f（请先运行构建脚本）" } }
$notes = "output/发布说明-$av-$dv.md"
if (-not (Test-Path $notes)) { throw "缺少发布说明：$notes" }

# 计算真实哈希，并要求发布说明里写的哈希与实际文件一致
$sums = foreach ($f in $files) { '{0}  {1}' -f (Get-FileHash $f -Algorithm SHA256).Hash.ToLower(), (Split-Path $f -Leaf) }
$noteText = Get-Content $notes -Raw -Encoding UTF8
foreach ($line in $sums) { if (-not $noteText.Contains($line.Split(' ')[0])) { throw "发布说明中的哈希与实际文件不一致：$line" } }
$sumFile = "output/SHA256SUMS-$av-$dv.txt"
$sums | Set-Content $sumFile -Encoding Ascii

cmd /c "gh release view $tag --repo $repo >nul 2>nul"
if ($LASTEXITCODE -eq 0) { throw "发布 $tag 已存在，未做任何修改。" }

Write-Host "正在发布 $tag（安装包较大，请耐心等待）..."
gh release create $tag @files $sumFile --repo $repo --target main --title "Android $av / Windows $dv" --notes-file $notes --latest
if ($LASTEXITCODE -ne 0) { throw '发布失败，请查看上面的错误信息。' }
"$(Get-Date -Format s) published $tag" | Add-Content 'output/publish-release.log'
Write-Host "已发布：https://github.com/$repo/releases/tag/$tag"
