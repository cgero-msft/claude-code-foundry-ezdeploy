[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Tests = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Tests
$Engine = Join-Path $Root 'scripts\ezdeploy-engine.sh'
$Wizard = Join-Path $Root 'wizard\index.html'
$EngineTests = Join-Path $Tests 'engine-regression.sh'
$WizardTests = Join-Path $Tests 'wizard-regression.js'
$CatalogTests = Join-Path $Tests 'catalog-generator-regression.js'
$CatalogGenerator = Join-Path $Root 'scripts\generate-model-catalog.js'

foreach ($Path in @($Engine, $Wizard, $EngineTests, $WizardTests, $CatalogTests, $CatalogGenerator)) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required test input is missing: $Path"
    }
}

$Node = Get-Command node -ErrorAction SilentlyContinue
if (-not $Node) {
    throw 'Node.js is required to execute the wizard regression tests.'
}

$GitBashCandidates = @(
    'C:\Program Files\Git\bin\bash.exe',
    'C:\Program Files\Git\usr\bin\bash.exe'
)
$GitBash = $GitBashCandidates |
    Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } |
    Select-Object -First 1

Write-Host 'Running catalog generator regression tests with Node.js...'
& $Node.Source $CatalogTests $CatalogGenerator
if ($LASTEXITCODE -ne 0) {
    throw "Catalog generator regression tests failed with exit code $LASTEXITCODE."
}

Write-Host 'Running wizard regression tests with Node.js...'
& $Node.Source $WizardTests $Wizard
if ($LASTEXITCODE -ne 0) {
    throw "Wizard regression tests failed with exit code $LASTEXITCODE."
}

if (-not $GitBash) {
    Write-Warning 'Git Bash is unavailable. Engine regression tests were not run; install Git for Windows and rerun this file.'
    exit 2
}

Write-Host 'Running engine regression tests with Git Bash and a fake Azure CLI...'
& $GitBash $EngineTests $Engine
if ($LASTEXITCODE -ne 0) {
    throw "Engine regression tests failed with exit code $LASTEXITCODE."
}

Write-Host 'EZDeploy local regression suite passed.'
