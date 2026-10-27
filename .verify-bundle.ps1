# ─── Verify deploy-bundle.zip before it goes to Plesk ──────────────────────
# Two modes, both hard assertions (no soft passes):
#   - stage present  -> round-trip diff the extracted archive against it
#                       (this is what .make-bundle.ps1 runs, right after packing)
#   - stage absent   -> self-contained structural checks instead, because the
#                       maker deletes the stage on success
# Always asserted: entry-name separators, secret-shaped entries, extraction
# layout, critical files at their real paths, and a PROVENANCE STAMP that
# names a real commit (audit finding 1, 2026-10-27).
#
# Why the stamp is asserted: production reported gitSha `dbe8acd` while
# serving `b057e55`'s routes, because stamp-git-sha.mjs used to write HEAD
# onto a build made from an uncommitted tree. A bundle whose .next/GIT_SHA
# ends in `-dirty` therefore describes code that exists in NO commit — packing
# it would ship a build nobody can name, roll back, or diff. Refusing here (at
# pack time, on your machine) is the cheapest possible place to catch it.
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
               'prisma/schema.prisma', '.next/BUILD_ID', '.next/GIT_SHA', '.htaccess') {
    $p = Join-Path $tmp ($k -replace '/', [string][char]92)
    $ok = Test-Path -LiteralPath $p
    if (-not $ok) { $presenceOk = $false }
    Write-Output ('PRESENT ' + $k + ' = ' + $ok)
}
if (-not $presenceOk -and -not (Test-Path -LiteralPath (Join-Path $tmp '.htaccess'))) {
    Write-Output 'REJECTED: no .htaccess in the bundle — the source-tree files in httpdocs become downloadable again (see the file header for the 200-vs-403 evidence).'
}

# 6. Provenance: the stamp must name a real commit, not a dirty working tree.
$stampOk = $true
$stampPath = Join-Path $tmp ('.next/GIT_SHA' -replace '/', [string][char]92)
if (Test-Path -LiteralPath $stampPath) {
    $stamp = (Get-Content -LiteralPath $stampPath -Raw).Trim()
    $isDirty = $stamp.EndsWith('-dirty')
    $looksLikeSha = $stamp -match '^[0-9a-f]{7,40}(-dirty)?$'
    Write-Output ('GIT_SHA=' + $stamp)
    Write-Output ('GIT_SHA_DIRTY=' + $isDirty)
    if ($isDirty) {
        $stampOk = $false
        Write-Output 'REJECTED: this bundle was built from an uncommitted working tree, so it does not match ANY commit. Commit, then rebuild.'
    } elseif (-not $looksLikeSha) {
        $stampOk = $false
        Write-Output ('REJECTED: GIT_SHA is not a commit id: ' + $stamp)
    }
} else {
    $stampOk = $false
    Write-Output 'REJECTED: no .next/GIT_SHA in the bundle — run a build through `npm run build` (stamp-git-sha.mjs), not a bare `next build`.'
}

# 7. Layout: the archive must contain exactly the staged top-level entries.
$expectedTop = @('.next', '.htaccess', 'next.config.js', 'package-lock.json', 'package.json',
               'prisma', 'public', 'server.js', 'server-bootstrap.js')

$top = @($names | ForEach-Object { ($_ -split '/')[0] } | Sort-Object -Unique)
$topMissing = @($expectedTop | Where-Object { $top -notcontains $_ })
$topExtra   = @($top | Where-Object { $expectedTop -notcontains $_ })
Write-Output ('TOP_MISSING=' + $topMissing.Count)
Write-Output ('TOP_EXTRA=' + $topExtra.Count)

# 8. Round-trip diff — only meaningful while the maker's stage still exists.
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
      $diffOk -and ($got.Count -gt 0) -and $stampOk
Write-Output ('RESULT=' + $(if ($ok) { 'PASS' } else { 'FAIL' }))
if ($ok) { exit 0 } else { exit 1 }
