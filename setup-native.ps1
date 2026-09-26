$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
git submodule update --init --recursive
if ($LASTEXITCODE -ne 0) { throw 'WAHA source checkout failed.' }
$nativePatch = Join-Path $PSScriptRoot 'patches\waha-native.patch'
git -C waha apply --reverse --check $nativePatch 2>$null
if ($LASTEXITCODE -ne 0) {
  git -C waha apply --check $nativePatch
  if ($LASTEXITCODE -ne 0) { throw 'WAHA has conflicting local changes; the native patch cannot be applied safely.' }
  git -C waha apply $nativePatch
  if ($LASTEXITCODE -ne 0) { throw 'WAHA native patch failed.' }
}
npm.cmd install
if ($LASTEXITCODE -ne 0) { throw 'Sender dependency installation failed.' }
node scripts/setup.mjs
$env:PUPPETEER_SKIP_DOWNLOAD = 'true'
$env:PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD = '1'
Push-Location (Join-Path $PSScriptRoot 'waha')
try {
  corepack.cmd yarn install
  if ($LASTEXITCODE -ne 0) { throw 'WAHA dependency installation failed.' }
  corepack.cmd yarn build
  if ($LASTEXITCODE -ne 0) { throw 'WAHA compilation failed.' }
} finally { Pop-Location }
Write-Host 'Native setup complete. Run .\start.ps1 to start the services.'
