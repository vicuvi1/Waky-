$gdriveRoot = "G:\My Drive"
$appsFolder = Join-Path $gdriveRoot "Apps"
$wakyFolder = Join-Path $appsFolder "WAKY"
$backupFolder = Join-Path $wakyFolder "backup"

$src = "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop"

if (-not (Test-Path $gdriveRoot)) {
    Write-Warning "Google Drive (G:\My Drive) not found. Please ensure Google Drive is running."
    exit 1
}

New-Item -ItemType Directory -Path $backupFolder -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $backupFolder "rolling_backups") -Force | Out-Null

# 1. Sync App Files to G:\My Drive\Apps\WAKY
Copy-Item "$src\WAKY.exe" "$wakyFolder\WAKY.exe" -Force
Copy-Item "$src\index.html" "$wakyFolder\index.html" -Force
Copy-Item "$src\Program.cs" "$wakyFolder\Program.cs" -Force
Copy-Item "$src\waky.ico" "$wakyFolder\waky.ico" -Force
Copy-Item "$src\waky.png" "$wakyFolder\waky.png" -Force

# 2. Sync Database & Backup Files to G:\My Drive\Apps\WAKY\backup
Copy-Item "$src\wake_records.json" "$backupFolder\wake_records.json" -Force
Copy-Item "$src\waky_config.json" "$backupFolder\waky_config.json" -Force
Copy-Item "$src\deleted_dates.json" "$backupFolder\deleted_dates.json" -Force

if (Test-Path "$src\backups") {
    Copy-Item "$src\backups\*" "$backupFolder\rolling_backups" -Force
}

# Timestamp verification
$now = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
Set-Content -Path "$backupFolder\last_sync.txt" -Value "Last synced successfully to Google Drive: $now" -Encoding UTF8

Write-Host "========================================" -ForegroundColor Green
Write-Host "✅ WAKY GOOGLE DRIVE BACKUP SYNCHRONIZED!" -ForegroundColor Green
Write-Host "Location: $backupFolder" -ForegroundColor Cyan
Write-Host "Timestamp: $now" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Green
