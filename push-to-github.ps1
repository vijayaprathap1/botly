# Pushes this folder to https://github.com/vijayaprathap1/botly (private).
# Run once from this folder:  powershell -ExecutionPolicy Bypass -File .\push-to-github.ps1
$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
  Write-Host "Git is not installed. Install it from https://git-scm.com/download/win, then run this again." -ForegroundColor Red
  exit 1
}

if (-not (Test-Path ".git")) { git init | Out-Null }
git add -A

# Safety: never upload secrets.
$staged = git diff --cached --name-only
$secret = $staged | Where-Object { $_ -match '(^|/)\.env(\..*)?$' -and $_ -ne '.env.example' }
if ($secret) {
  Write-Host "STOP: these secret files were about to be uploaded: $secret" -ForegroundColor Red
  git reset | Out-Null
  exit 1
}

git -c user.useConfigOnly=false commit -m "Botly: phases 1-3" 2>$null | Out-Null
git branch -M main
$remotes = git remote
if ($remotes -contains "origin") { git remote set-url origin https://github.com/vijayaprathap1/botly.git }
else { git remote add origin https://github.com/vijayaprathap1/botly.git }

Write-Host "Pushing... (a GitHub sign-in window may open the first time)" -ForegroundColor Cyan
git push -u origin main
Write-Host "Done: https://github.com/vijayaprathap1/botly" -ForegroundColor Green
