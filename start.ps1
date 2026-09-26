$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
node scripts/setup.mjs
node --env-file=.env scripts/start-native.mjs
