[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$Tests = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $Tests
$Infra = Join-Path $Root 'infra'
$Main = Join-Path $Infra 'main.bicep'
$DirectParameters = Join-Path $Infra 'main.direct.bicepparam'
$ApimParameters = Join-Path $Infra 'main.apim-governed.bicepparam'

$RequiredFiles = @(
    $Main
    $DirectParameters
    $ApimParameters
    (Join-Path $Infra 'modules\monitoring.bicep')
    (Join-Path $Infra 'modules\identities.bicep')
    (Join-Path $Infra 'modules\key-vault.bicep')
    (Join-Path $Infra 'modules\foundry.bicep')
    (Join-Path $Infra 'modules\api-management.bicep')
    (Join-Path $Infra 'modules\rbac.bicep')
)

foreach ($Path in $RequiredFiles) {
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "Required Bicep scaffold file is missing: $Path"
    }
}

$Az = Get-Command az -ErrorAction SilentlyContinue
if ($Az) {
    Write-Host 'Compiling Bicep templates with Azure CLI...'
    & $Az.Source bicep build --file $Main --stdout | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "az bicep build failed for $Main with exit code $LASTEXITCODE."
    }

    foreach ($ParameterFile in @($DirectParameters, $ApimParameters)) {
        & $Az.Source bicep build-params --file $ParameterFile --stdout | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "az bicep build-params failed for $ParameterFile with exit code $LASTEXITCODE."
        }
    }

    Write-Host 'Bicep compilation passed.'
}
else {
    Write-Warning 'Azure CLI is unavailable; compilation was skipped.'
}

Write-Host 'Running static Bicep regression checks...'

$AllBicep = ($RequiredFiles | ForEach-Object { Get-Content -LiteralPath $_ -Raw }) -join "`n"
$MainContent = Get-Content -LiteralPath $Main -Raw
$FoundryContent = Get-Content -LiteralPath (Join-Path $Infra 'modules\foundry.bicep') -Raw
$KeyVaultContent = Get-Content -LiteralPath (Join-Path $Infra 'modules\key-vault.bicep') -Raw
$RbacContent = Get-Content -LiteralPath (Join-Path $Infra 'modules\rbac.bicep') -Raw

$Assertions = [ordered]@{
    'subscription target scope' = $MainContent -match "targetScope\s*=\s*'subscription'"
    'resource group resource' = $MainContent -match "Microsoft\.Resources/resourceGroups@"
    'conditional resource group management' = $MainContent -match "resource\s+deploymentResourceGroup.+if\s*\(manageResourceGroup\)"
    'reserved deterministic suffix' = $MainContent -match "param\s+resourceSuffix\s+string"
    'Key Vault suffix is not truncated' = $MainContent -match "keyVaultName\s+string\s*=\s*toLower\('\$\{take\(.+,\s*11\)\}\$\{resourceSuffix\}'\)"
    'direct profile' = $MainContent -match "'direct'"
    'APIM-governed profile' = $MainContent -match "'apim-governed'"
    'conditional APIM module' = $MainContent -match "module\s+apiManagement.+if\s*\(deployApiManagement\)"
    'conditional Foundry creation' = $MainContent -match "module\s+foundry.+if\s*\(!reuseExistingFoundry\)"
    'diagnostic settings parameter' = $MainContent -match 'enableDiagnosticSettings'
    'AIServices account' = $FoundryContent -match "kind:\s*'AIServices'"
    'Foundry project resource' = $FoundryContent -match 'Microsoft\.CognitiveServices/accounts/projects@'
    'Entra-only option' = $FoundryContent -match 'disableLocalAuth:\s*disableLocalAuth'
    'explicit Foundry public access' = $FoundryContent -match 'publicNetworkAccess:\s*publicNetworkAccess'
    'Key Vault RBAC' = $KeyVaultContent -match 'enableRbacAuthorization:\s*true'
    'Key Vault purge protection' = $KeyVaultContent -match 'enablePurgeProtection:\s*true'
    'diagnostic settings' = ([regex]::Matches($AllBicep, 'Microsoft\.Insights/diagnosticSettings@').Count -ge 3)
    'conditional diagnostic settings' = ([regex]::Matches($AllBicep, 'if \(enableDiagnosticSettings\)').Count -ge 3)
    'deterministic RBAC names' = $RbacContent -match 'name:\s*guid\('
    'no model deployments' = $AllBicep -notmatch 'accounts/deployments@'
    'no secret resources' = $AllBicep -notmatch 'vaults/secrets@'
}

$Failures = $Assertions.GetEnumerator() | Where-Object { -not $_.Value }
if ($Failures) {
    $Names = ($Failures | ForEach-Object Key) -join ', '
    throw "Static Bicep regression checks failed: $Names"
}

Write-Host 'Static Bicep regression checks passed.'
