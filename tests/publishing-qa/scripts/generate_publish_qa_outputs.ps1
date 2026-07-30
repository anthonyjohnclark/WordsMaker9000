param(
    [string]$AppDataRoot = (Join-Path $env:APPDATA "WordsMaker9000"),
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\.."))

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $OutputPath = Join-Path $repoRoot "tests\publishing-qa\output\generated-$timestamp"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $repoRoot $OutputPath
}

$appDataFull = [System.IO.Path]::GetFullPath($AppDataRoot)
$outputFull = [System.IO.Path]::GetFullPath($OutputPath)
$projectsRoot = Join-Path $appDataFull "Dev_Projects"

if (-not (Test-Path -LiteralPath $projectsRoot -PathType Container)) {
    throw "Publish QA projects were not found at $projectsRoot. Run tests\publishing-qa\scripts\create_publish_test_projects.ps1 first."
}

if (Test-Path -LiteralPath $outputFull) {
    $existing = @(Get-ChildItem -LiteralPath $outputFull -Force)
    if ($existing.Count -gt 0) {
        throw "Output directory must be empty: $outputFull"
    }
} else {
    New-Item -ItemType Directory -Path $outputFull -Force | Out-Null
}

$manifestPath = Join-Path $repoRoot "src-tauri\Cargo.toml"
$cargoArguments = @(
    "run",
    "--manifest-path", $manifestPath,
    "--example", "publish_qa"
)
$cargoArguments += @(
    "--",
    "--app-data", $appDataFull,
    "--output", $outputFull
)

Write-Output "Generating Publish QA artifacts..."
Write-Output "Source projects: $projectsRoot"
Write-Output "Inspection output: $outputFull"
Write-Output ""

& cargo @cargoArguments
if ($LASTEXITCODE -ne 0) {
    throw "Publish QA generation failed with exit code $LASTEXITCODE. Inspect any qa-results.json written to $outputFull."
}

Write-Output ""
Write-Output "Publish QA artifacts are ready for inspection:"
Write-Output $outputFull
