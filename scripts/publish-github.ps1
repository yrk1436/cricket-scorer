# Publish cricket-scorer to GitHub (run once after: gh auth login)
# Repo: https://github.com/<your-user>/cricket-scorer

$ErrorActionPreference = "Stop"
Set-Location (Split-Path $PSScriptRoot -Parent)

$repoName = "cricket-scorer"
$desc = "Informal cricket scoring — Next.js + Supabase, mobile-first live scorer"

if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
  Write-Host "Install GitHub CLI: https://cli.github.com/" -ForegroundColor Yellow
  exit 1
}

gh auth status 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Run: gh auth login" -ForegroundColor Yellow
  exit 1
}

$owner = (gh api user --jq .login)
Write-Host "GitHub user: $owner"

$exists = gh repo view "$owner/$repoName" 2>$null
if ($LASTEXITCODE -ne 0) {
  gh repo create $repoName --public --description $desc --source=. --remote=origin --push
} else {
  git remote remove origin 2>$null
  git remote add origin "https://github.com/$owner/$repoName.git"
  git push -u origin main
}

Write-Host ""
Write-Host "Done: https://github.com/$owner/$repoName" -ForegroundColor Green
Write-Host "Then link Vercel: npx vercel git connect" -ForegroundColor Cyan
