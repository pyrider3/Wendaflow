param([Parameter(Mandatory=$true)][string]$BackupFile)
$ErrorActionPreference = 'Stop'
if (-not (Test-Path $BackupFile)) { throw "Backup not found: $BackupFile" }
Get-Content -Raw $BackupFile | docker compose -f "$PSScriptRoot\docker-compose.yml" exec -T postgres psql -U wendaflow -d wendaflow
Write-Host 'Restore complete. Restart the API: docker compose restart api'
