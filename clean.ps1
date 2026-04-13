# Clean up script for osms_extractor
# Deletes data/, extractor/extracted, and extractor/wz_files directories

$ErrorActionPreference = 'Stop'

$paths = @(
    "data",
    "extractor\extracted",
    "extractor\wz_files"
)

foreach ($path in $paths) {
    if (Test-Path $path) {
        Write-Host "Deleting $path ..."
        Remove-Item -Recurse -Force $path
    } else {
        Write-Host "$path does not exist. Skipping."
    }
}

Write-Host "Cleanup complete."
