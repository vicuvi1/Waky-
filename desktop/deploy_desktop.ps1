$desktop = [Environment]::GetFolderPath('Desktop')
$exeSource = "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\WAKY.exe"
$exeDest = Join-Path $desktop "WAKY.exe"
$batDest = Join-Path $desktop "WAKY.bat"
$lnkDest = Join-Path $desktop "WAKY.lnk"
$icoPath = "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\waky.ico"

# 1. Copy WAKY.exe to Desktop
Copy-Item $exeSource $exeDest -Force
Write-Output "Copied WAKY.exe to Desktop: $(Test-Path $exeDest)"

# 2. Update WAKY.bat on Desktop
$batContent = "@echo off`r`nstart """" ""$exeSource"""
Set-Content -Path $batDest -Value $batContent -Encoding ASCII
Write-Output "Updated WAKY.bat on Desktop: $(Test-Path $batDest)"

# 3. Create WAKY.lnk shortcut on Desktop
$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($lnkDest)
$Shortcut.TargetPath = $exeDest
$Shortcut.WorkingDirectory = "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop"
$Shortcut.IconLocation = "$icoPath,0"
$Shortcut.Description = "WAKY - Spartan Dawn Wake-Up Protocol"
$Shortcut.Save()
Write-Output "Created WAKY.lnk on Desktop pointing to WAKY.exe: $(Test-Path $lnkDest)"

# 4. Also create launch.vbs in project directory
$vbsContent = @"
Set wshShell = CreateObject("WScript.Shell")
wshShell.Run """" & "$exeSource" & """", 1, False
"@
Set-Content -Path "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\launch.vbs" -Value $vbsContent -Encoding ASCII
Set-Content -Path "C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\WAKY.bat" -Value $batContent -Encoding ASCII

Write-Output "All WAKY Desktop launchers successfully configured!"
