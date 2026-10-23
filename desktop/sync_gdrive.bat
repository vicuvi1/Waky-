@echo off
title WAKY - Google Drive Sync
echo Syncing WAKY to Google Drive (G:\My Drive\Apps\WAKY\backup)...
powershell -ExecutionPolicy Bypass -File "%~dp0sync_gdrive.ps1"
pause
