# ─── Verify deploy-bundle.zip before it goes to Plesk ──────────────────────
# Two modes, both hard assertions (no soft passes):
#   - stage present  -> round-trip diff the extracted archive against it
#                       (this is what .make-bundle.ps1 runs, right after packing)
#   - stage absent   -> self-contained structural checks instead, because the
#                       maker deletes the stage on success
# Always asserted: entry-name separators, secret-shaped entries, extraction
# layout, critical files at their real paths.
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .verify-bundle.ps1
# Exit 0 = PASS, 1 = FAIL.
# ───────────────────────────────────────────────────────────────────────────
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

$zipPath = (Resolve-Path 'deploy-bundle.zip').Path
$root    = (Get-Location).Path
$stage   = Join-Path $root '.deploy-stage'
$stageExists = Test-Path -LiteralPath $stage
$tmp     = Join-Path $root '.bundle-check'

if (Test-Path -LiteralPath $tmp) { Remove-Item -LiteralPath $tmp -Recurse -Force }
New-Item -ItemType Directory -Path $tmp | Out-Null

# 1. Entry names must use "/" (ZIP APPNOTE). "\" would make Plesk's extractor
#    create flat files with literal backslashes instead of a directory tree.
$z = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
$bad = 0
$names = @()
foreach ($e in $z.Entries) {
    $names += $e.FullName
    if ($e.FullName.Contains([char]92)) { $bad++ }
}
$z.Dispose()
Write-Output ('ENTRIES=' + $names.Count)
Write-Output ('BACKSLASH_ENTRY_NAMES=' + $bad)

# 2. No secret-shaped entry may ever ship.
$secretHits = @($names | Where-Object { $_ -match '(^|/)\.env' -or $_ -match '(^|/)secrets?\.' })
Write-Output ('SECRET_SHAPED_ENTRIES=' + $secretHits.Count)

# 3. Extract exactly as Plesk's File Manager would.
[System.IO.Compression.ZipFile]::ExtractToDirectory($zipPath, $tmp)

function Get-Rel($dir) {
    @(Get-ChildItem -Recurse -File -Force -LiteralPath $dir | ForEach-Object {
        $_.FullName.Substring($dir.Length + 1).Replace([char]92, [char]47)
    } | Sort-Object)
}

$got = Get-Rel $tmp
Write-Output ('EXTRACTED_FILES=' + $got.Count)

# 4. Flat/mangled names mean a broken archive (a literal "\" or a file whose
#    name contains a path separator that was never split).
$flat = @($got | Where-Object { $_.Contains([char]92) })
Write-Output ('FLAT_MANGLED_FILES=' + $flat.Count)

# 5. Critical files must exist at their real paths after extraction.
$presenceOk = $true
foreach ($k in 'server.js', 'package.json', 'package-lock.json', 'next.config.js',
               'prisma/schema.prisma', '.next/BUILD_ID') {
    $p = Join-Path $tmp ($k -replace '/', [string][char]92)
    $ok = Test-Path -LiteralPath $p
    if (-not $ok) { $presenceOk = $false }
    Write-Output ('PRESENT ' + $k + ' = ' + $ok)
}

# 6. Layout: the archive must contain exactly the seven staged top-level entries.
$expectedTop = @('.next', 'next.config.js', 'package-lock.json', 'package.json',
                 'prisma', 'public', 'server.js')
$top = @($names | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)
$topMissing = @($expectedTop | Where-Object { $top -notcontains $_ })
$topExtra   = @($top | Where-Object { $expectedTop -notcontains $_ })
Write-Output ('TOP_MISSING=' + $topMissing.Count)
Write-Output ('TOP_EXTRA=' + $topExtra.Count)

# 7. Round-trip diff — only meaningful while the maker's stage still exists.
$diffOk = $true
$mode = 'STRUCTURAL'
if ($stageExists) {
    $mode = 'ROUNDTRIP'
    $want = Get-Rel $stage
    $missing = @($want | Where-Object { $got -notcontains $_ })
    $extra   = @($got   | Where-Object { $want -notcontains $_ })
    Write-Output ('STAGE_FILES=' + $want.Count)
    Write-Output ('MISSING_AFTER_EXTRACT=' + $missing.Count)
    if ($missing.Count -gt 0) { $missing | Select-Object -First 10 | ForEach-Object { Write-Output ('  MISSING ' + $_) } }
    Write-Output ('EXTRA_AFTER_EXTRACT=' + $extra.Count)
    if ($extra.Count -gt 0) { $extra | Select-Object -First 10 | ForEach-Object { Write-Output ('  EXTRA ' + $_) } }
    $diffOk = ($missing.Count -eq 0) -and ($extra.Count -eq 0)
} else {
    Write-Output 'STAGE=absent (maker deletes it on success) — round-trip diff skipped, structural checks above apply'
}
Write-Output ('MODE=' + $mode)

Remove-Item -LiteralPath $tmp -Recurse -Force

$ok = ($bad -eq 0) -and ($secretHits.Count -eq 0) -and ($flat.Count -eq 0) -and
      $presenceOk -and ($topMissing.Count -eq 0) -and ($topExtra.Count -eq 0) -and
      $diffOk -and ($got.Count -gt 0)
Write-Output ('RESULT=' + $(if ($ok) { 'PASS' } else { 'FAIL' }))
if ($ok) { exit 0 } else { exit 1 }
