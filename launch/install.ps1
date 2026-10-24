# Puts a Waky shortcut on the desktop and in Startup (so it opens when the PC boots).
# Replaces the old v1 "WAKY" shortcuts. Run: powershell -ExecutionPolicy Bypass -File launch\install.ps1
param([switch]$NoStartup)

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$vbs = Join-Path $here "Waky.vbs"
$icon = Join-Path $here "waky.ico"
$shell = New-Object -ComObject WScript.Shell

$desktop = [Environment]::GetFolderPath("Desktop")
# v1 also copied itself to the OneDrive desktop folders; only clean those up.
$desktops = @($desktop, "$env:OneDrive\Рабочий стол", "$env:OneDrive\Desktop") |
    Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
$startup = [Environment]::GetFolderPath("Startup")

$targets = @($desktop)
if (-not $NoStartup) { $targets += $startup }

# Old v1 shortcuts and launchers (the file system ignores case, so this also catches "Waky.lnk").
foreach ($dir in @($desktops) + $startup) {
    foreach ($name in "WAKY.lnk", "WAKY.exe", "WAKY.bat") {
        $old = Join-Path $dir $name
        if (Test-Path $old) { Remove-Item $old -Force; Write-Host "Removed $old" }
    }
}

foreach ($dir in $targets) {
    $lnk = $shell.CreateShortcut((Join-Path $dir "Waky.lnk"))
    $lnk.TargetPath = "$env:WINDIR\System32\wscript.exe"
    $lnk.Arguments = "`"$vbs`""
    $lnk.WorkingDirectory = Split-Path -Parent $here
    $lnk.IconLocation = "$icon,0"
    $lnk.Description = "Waky: prove you got up"
    $lnk.Save()
    Write-Host "Created $(Join-Path $dir 'Waky.lnk')"
}
