Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

$g.Clear([System.Drawing.Color]::Transparent)

# Dark Spartan Obsidian Base
$darkBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 12, 14, 18))
$g.FillEllipse($darkBrush, 8, 8, 240, 240)

# Golden Solar Ring
$goldPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 245, 158, 11)), 10
$g.DrawEllipse($goldPen, 16, 16, 224, 224)

# Radiant Dawn Glow
$dawnBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
$g.FillEllipse($dawnBrush, 36, 36, 184, 184)

# Golden Spartan Sun / Bell Emblem
$sunBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 253, 224, 71))
$p1 = New-Object System.Drawing.PointF 128, 60
$p2 = New-Object System.Drawing.PointF 70, 192
$p3 = New-Object System.Drawing.PointF 104, 192
$p4 = New-Object System.Drawing.PointF 128, 130
$p5 = New-Object System.Drawing.PointF 152, 192
$p6 = New-Object System.Drawing.PointF 186, 192

[System.Drawing.PointF[]]$points = @($p1, $p2, $p3, $p4, $p5, $p6)
$g.FillPolygon($sunBrush, $points)

# Alarm Hammer / Crown at the top
$g.FillEllipse($sunBrush, 112, 34, 32, 20)

$icoPath = 'C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\waky.ico'
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$g.Dispose()
$bmp.Dispose()
Write-Output "Icon created at: $icoPath (Exists: $(Test-Path $icoPath))"
