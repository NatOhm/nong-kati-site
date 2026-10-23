# ─── Build deploy-bundle.zip for the Plesk File Manager (GUI) route ────────
# Windows/Git Bash counterpart to deploy-hostatom.sh's bundling step, for the
# subscription where Plesk -> SSH Access is "Forbidden".
#
#   1. runs `next build` unless -NoBuild is given
#   2. stages ONLY Linux-portable artifacts (.next minus cache, public, prisma,
#      package.json, package-lock.json, next.config.js, server.js)
#   3. zips them with FORWARD-SLASH entry names
#   4. verifies the zip by extracting it and diffing against the stage
#
# NEVER ships node_modules or .env: runtime env lives in
# Plesk -> Node.js -> Custom environment variables.
#
# Usage (from the repo root):
#   powershell -NoProfile -ExecutionPolicy Bypass -File .make-bundle.ps1
#   powershell -NoProfile -ExecutionPolicy Bypass -File .make-bundle.ps1 -NoBuild
# ───────────────────────────────────────────────────────────────────────────
param([switch]$NoBuild)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
Add-Type -AssemblyName System.IO.Compression

$root    = (Get-Location).Path
$stage   = Join-Path $root '.deploy-stage'
$zipPath = Join-Path $root 'deploy-bundle.zip'
$verify  = Join-Path $root '.verify-bundle.ps1'

if (-not $NoBuild) {
    Write-Output '>> next build'
    $env:NEXT_PUBLIC_SITE_URL = 'https://nongkatistore.com'
    & npm run build
    if ($LASTEXITCODE -ne 0) { Write-Output "BUILD FAILED ($LASTEXITCODE)"; exit 1 }
}

# ── Stage ─────────────────────────────────────────────────────────────────
if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
if (Test-Path -LiteralPath $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
New-Item -ItemType Directory -Path $stage | Out-Null

Copy-Item -Recurse -Force -LiteralPath (Join-Path $root '.next') -Destination (Join-Path $stage '.next')
Remove-Item -Recurse -Force -LiteralPath (Join-Path $stage '.next\cache')   # build cache: huge, unused at runtime
Copy-Item -Recurse -Force -LiteralPath (Join-Path $root 'public')  -Destination (Join-Path $stage 'public')
Copy-Item -Recurse -Force -LiteralPath (Join-Path $root 'prisma')  -Destination (Join-Path $stage 'prisma')
foreach ($f in 'package.json', 'package-lock.json', 'next.config.js', 'server.js') {
    Copy-Item -Force -LiteralPath (Join-Path $root $f) -Destination (Join-Path $stage $f)
}

$secret = @(Get-ChildItem -Recurse -File -Force -LiteralPath $stage |
            Where-Object { $_.Name -like '.env*' })
if ($secret.Count -gt 0) {
    Write-Output ("REFUSING TO PACK: " + $secret.Count + " env file(s) in stage")
    $secret | ForEach-Object { Write-Output ('  ' + $_.FullName) }
    exit 1
}

# ── Pack ──────────────────────────────────────────────────────────────────
# Entry names MUST use "/" (ZIP APPNOTE). .NET Framework's
# ZipFile.CreateFromDirectory writes "\" on Windows, which Plesk's extractor
# turns into flat literal filenames — so entries are added explicitly.
$z    = [System.IO.Compression.ZipFile]::Open($zipPath, 'Create')
$n    = 0
$fail = 0
foreach ($f in (Get-ChildItem -Recurse -File -Force -LiteralPath $stage)) {
    $rel = $f.FullName.Substring($stage.Length + 1).Replace([char]92, [char]47)
    try {
        [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
            $z, $f.FullName, $rel, [System.IO.Compression.CompressionLevel]::Optimal) | Out-Null
        $n++
    } catch {
        $fail++
        Write-Output ("FAILED " + $rel + " :: " + $_.Exception.Message)
    }
}
$z.Dispose()
Write-Output ("PACKED=" + $n + " FAILED=" + $fail + " BYTES=" + (Get-Item -LiteralPath $zipPath).Length)
if ($fail -gt 0) { exit 1 }

# ── Verify ────────────────────────────────────────────────────────────────
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $verify
if ($LASTEXITCODE -ne 0) { Write-Output 'VERIFICATION FAILED'; exit 1 }

Remove-Item -Recurse -Force -LiteralPath $stage
Write-Output ("OK " + $zipPath + " (stage cleaned)")
exit 0
