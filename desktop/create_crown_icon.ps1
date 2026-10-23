Add-Type -AssemblyName System.Drawing

$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

$g.Clear([System.Drawing.Color]::Transparent)

# 1. Dark Imperial Obsidian Shield Base
$shieldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 11, 13, 20))
$g.FillEllipse($shieldBrush, 8, 8, 240, 240)

# 2. Golden Imperial Ring
$goldRingPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 234, 179, 8)), 10
$g.DrawEllipse($goldRingPen, 16, 16, 224, 224)

# 3. Inner Royal Crimson Velvet Glow
$velvetBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 120, 13, 13))
$g.FillEllipse($velvetBrush, 36, 36, 184, 184)

# 4. Royal Velvet Cap (behind the crown)
$capBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 168, 26, 26))
$g.FillPie($capBrush, 64, 76, 128, 120, 180, 180)

# 5. Golden Sovereign King's Crown Body (5-Point Imperial Crown)
# Points: Center is highest, 2 intermediate, 2 outer
$goldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 245, 158, 11))
$crownPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 253, 224, 71)), 3

# Crown Base Band
$bandBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 217, 119, 6))
$g.FillRectangle($bandBrush, 58, 156, 140, 24)
$g.DrawRectangle($crownPen, 58, 156, 140, 24)

# Crown Spikes / Peaks Polygon
$pLeftOuter    = New-Object System.Drawing.PointF 58, 96
$vLeftInner    = New-Object System.Drawing.PointF 82, 136
$pLeftMid      = New-Object System.Drawing.PointF 98, 76
$vCenterLeft   = New-Object System.Drawing.PointF 114, 134
$pCenterHigh   = New-Object System.Drawing.PointF 128, 56   # King apex
$vCenterRight  = New-Object System.Drawing.PointF 142, 134
$pRightMid     = New-Object System.Drawing.PointF 158, 76
$vRightInner   = New-Object System.Drawing.PointF 174, 136
$pRightOuter   = New-Object System.Drawing.PointF 198, 96
$pRightBase    = New-Object System.Drawing.PointF 198, 156
$pLeftBase     = New-Object System.Drawing.PointF 58, 156

[System.Drawing.PointF[]]$crownPoints = @(
    $pLeftOuter, $vLeftInner, $pLeftMid, $vCenterLeft,
    $pCenterHigh,
    $vCenterRight, $pRightMid, $vRightInner, $pRightOuter,
    $pRightBase, $pLeftBase
)

$g.FillPolygon($goldBrush, $crownPoints)
$g.DrawPolygon($crownPen, $crownPoints)

# 6. Crown Jewels (Ruby & Emerald Gems on Base Band)
$rubyBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 239, 68, 68))
$emeraldBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 16, 185, 129))
$gemPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), 1.5

# 5 jewels on the band
$g.FillEllipse($rubyBrush, 72, 162, 12, 12)
$g.DrawEllipse($gemPen, 72, 162, 12, 12)

$g.FillEllipse($emeraldBrush, 98, 162, 12, 12)
$g.DrawEllipse($gemPen, 98, 162, 12, 12)

$g.FillEllipse($rubyBrush, 122, 160, 16, 16) # Center big ruby
$g.DrawEllipse($gemPen, 122, 160, 16, 16)

$g.FillEllipse($emeraldBrush, 146, 162, 12, 12)
$g.DrawEllipse($gemPen, 146, 162, 12, 12)

$g.FillEllipse($rubyBrush, 172, 162, 12, 12)
$g.DrawEllipse($gemPen, 172, 162, 12, 12)

# 7. Pearl / Jewel Orbs on Peak Tips
$pearlBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 254, 240, 138))
$pearlPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 255, 255, 255)), 1.5

# Left outer orb
$g.FillEllipse($pearlBrush, 52, 90, 12, 12)
$g.DrawEllipse($pearlPen, 52, 90, 12, 12)

# Left mid orb
$g.FillEllipse($pearlBrush, 92, 70, 13, 13)
$g.DrawEllipse($pearlPen, 92, 70, 13, 13)

# Center apex King jewel (Diamond/Cross top)
$g.FillEllipse($pearlBrush, 120, 48, 16, 16)
$g.DrawEllipse($pearlPen, 120, 48, 16, 16)
$g.FillEllipse($rubyBrush, 124, 52, 8, 8)

# Right mid orb
$g.FillEllipse($pearlBrush, 152, 70, 13, 13)
$g.DrawEllipse($pearlPen, 152, 70, 13, 13)

# Right outer orb
$g.FillEllipse($pearlBrush, 192, 90, 12, 12)
$g.DrawEllipse($pearlPen, 192, 90, 12, 12)

# Save Icon
$icoPath = 'C:\Users\victo\.gemini\antigravity\scratch\WakyDesktop\waky.ico'
$hIcon = $bmp.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream $icoPath, ([System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()
$g.Dispose()
$bmp.Dispose()
Write-Output "King Crown Icon generated at: $icoPath (Exists: $(Test-Path $icoPath))"
