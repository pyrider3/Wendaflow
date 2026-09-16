param([string]$OutputDirectory = "$PSScriptRoot\backups")
$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$target = Join-Path $OutputDirectory "wendaflow-$stamp.sql"
docker compose -f "$PSScriptRoot\docker-compose.yml" exec -T postgres pg_dump -U wendaflow --clean --if-exists wendaflow > $target
if (-not (Test-Path $target) -or (Get-Item $target).Length -lt 100) { throw 'Backup failed.' }
Write-Host "Backup created: $target"
