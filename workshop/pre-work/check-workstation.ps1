<#
.SYNOPSIS
    Read-only pre-workshop check for Claude Code on Microsoft Foundry (Windows).

.DESCRIPTION
    Checks Azure CLI, Azure sign-in, Claude Code, Git Bash or WSL, and existing Claude Code
    configuration that could conflict with the workshop setup. It changes nothing and never
    prints secret values.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File .\check-workstation.ps1

.EXAMPLE
    pwsh -ExecutionPolicy Bypass -File .\check-workstation.ps1 -TenantId <workshop-tenant-id>
#>
[CmdletBinding()]
param(
    # Tenant that will host your Foundry resource, if your facilitator gave you one.
    [string]$TenantId,
    # Facilitator: minimum Claude Code version for the workshop (oldest version tested with Foundry).
    [string]$MinClaudeVersion = '2.1.294'
)

$ErrorActionPreference = 'Continue'
$MinAzVersion = [version]'2.83.0'
$script:Results = New-Object System.Collections.Generic.List[object]

function Add-Result {
    param([string]$Status, [string]$Check, [string]$Detail)
    $script:Results.Add([pscustomobject]@{ Status = $Status; Check = $Check; Detail = $Detail })
    $color = switch ($Status) { 'PASS' { 'Green' } 'WARN' { 'Yellow' } 'FAIL' { 'Red' } default { 'Gray' } }
    Write-Host ("[{0}] {1}: {2}" -f $Status, $Check, $Detail) -ForegroundColor $color
}

function Get-VersionFromText {
    param([string]$Text)
    if ($Text -match '(\d+\.\d+\.\d+)') { return [version]$Matches[1] }
    return $null
}

Write-Host 'Claude Code on Microsoft Foundry: pre-workshop workstation check (read-only)'
Write-Host ''

# Azure CLI
$signedIn = $false
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Add-Result 'FAIL' 'Azure CLI' 'Not installed. Install from https://aka.ms/installazurecli, then open a new terminal.'
}
else {
    $azVersion = $null
    try { $azVersion = Get-VersionFromText (((az version -o json 2>$null) -join "`n" | ConvertFrom-Json).'azure-cli') } catch { }
    if (-not $azVersion) {
        Add-Result 'WARN' 'Azure CLI' 'Installed, but the version could not be read.'
    }
    elseif ($azVersion -lt $MinAzVersion) {
        Add-Result 'WARN' 'Azure CLI' "$azVersion is older than $MinAzVersion. Run 'az upgrade'."
    }
    else {
        Add-Result 'PASS' 'Azure CLI' "$azVersion."
    }

    $account = $null
    try { $account = (az account show -o json 2>$null) -join "`n" | ConvertFrom-Json } catch { }
    if (-not $account) {
        Add-Result 'WARN' 'Azure sign-in' "Not signed in. Run 'az login' (or 'az login --tenant <tenant-id>') before the workshop."
    }
    else {
        $signedIn = $true
        if ($TenantId -and ($account.tenantId -ne $TenantId)) {
            Add-Result 'WARN' 'Azure sign-in' "Signed in to a different tenant than the one provided. Run 'az login --tenant $TenantId'."
        }
        else {
            Add-Result 'PASS' 'Azure sign-in' 'Signed in.'
        }
    }

    if ($signedIn) {
        $null = az account get-access-token --resource https://ai.azure.com --query expiresOn -o tsv 2>$null
        if ($LASTEXITCODE -eq 0) {
            Add-Result 'PASS' 'Foundry token' 'Your sign-in can get a token for Microsoft Foundry.'
        }
        else {
            Add-Result 'FAIL' 'Foundry token' "Couldn't get a token for https://ai.azure.com. Re-run 'az login'; if it persists, Conditional Access may block it. Tell your facilitator."
        }
    }
}

# Claude Code
$claude = Get-Command claude -ErrorAction SilentlyContinue
$claudeOffPath = Join-Path $HOME '.local\bin\claude.exe'
if (-not $claude -and (Test-Path $claudeOffPath)) {
    Add-Result 'FAIL' 'Claude Code' "Installed in $HOME\.local\bin, but that folder isn't on your PATH. Run: [Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';' + `"`$HOME\.local\bin`", 'User'). Then restart your terminal (restart VS Code if you use its terminal)."
}
elseif (-not $claude) {
    Add-Result 'FAIL' 'Claude Code' "Not found on PATH. Install with 'irm https://claude.ai/install.ps1 | iex', then open a new terminal."
}
else {
    $claudeVersion = Get-VersionFromText ((& claude --version 2>$null) -join ' ')
    $claudePath = $claude.Source
    if (-not $claudeVersion) {
        Add-Result 'WARN' 'Claude Code' 'Installed, but the version could not be read.'
    }
    elseif ($MinClaudeVersion -and ($claudeVersion -lt [version]$MinClaudeVersion)) {
        Add-Result 'FAIL' 'Claude Code' "$claudeVersion is older than the workshop minimum $MinClaudeVersion. Run 'claude update'."
    }
    else {
        Add-Result 'PASS' 'Claude Code' "$claudeVersion. Run 'claude update' the day before the workshop."
    }
    if ($claudePath -match 'node_modules|\\npm\\') {
        Add-Result 'WARN' 'Claude Code install method' "Installed with npm, which is deprecated and doesn't auto-update. Run 'claude install' to switch to the native installer."
    }
}

# Git Bash or WSL (Claude Code needs a POSIX shell on Windows)
$bashCandidates = @()
if ($env:CLAUDE_CODE_GIT_BASH_PATH) { $bashCandidates += $env:CLAUDE_CODE_GIT_BASH_PATH }
$git = Get-Command git -ErrorAction SilentlyContinue
if ($git) { $bashCandidates += Join-Path (Split-Path (Split-Path $git.Source)) 'bin\bash.exe' }
$bashCandidates += Join-Path $env:ProgramFiles 'Git\bin\bash.exe'
$gitBash = $bashCandidates | Where-Object { $_ -and (Test-Path $_) } | Select-Object -First 1
$hasWsl = $false
if (Get-Command wsl.exe -ErrorAction SilentlyContinue) {
    $distros = (wsl.exe -l -q 2>$null) -join '' -replace "`0", ''
    $hasWsl = ($LASTEXITCODE -eq 0) -and ($distros.Trim().Length -gt 0)
}
if ($gitBash) {
    Add-Result 'PASS' 'Git Bash / WSL' 'Git Bash found.'
}
elseif ($hasWsl) {
    Add-Result 'PASS' 'Git Bash / WSL' 'WSL with a Linux distribution found.'
}
else {
    Add-Result 'FAIL' 'Git Bash / WSL' 'Neither found. Install Git for Windows (https://gitforwindows.org/) or WSL2.'
}

# Existing configuration that can conflict with Foundry mode (names only, never values)
$conflictVars = 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL', 'CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX'
$foundryVars = 'CLAUDE_CODE_USE_FOUNDRY', 'ANTHROPIC_FOUNDRY_RESOURCE', 'ANTHROPIC_FOUNDRY_BASE_URL', 'ANTHROPIC_FOUNDRY_API_KEY'
$found = @{}
foreach ($name in ($conflictVars + $foundryVars)) {
    $scopes = @('User', 'Machine') | Where-Object { [Environment]::GetEnvironmentVariable($name, $_) }
    if (-not $scopes -and [Environment]::GetEnvironmentVariable($name, 'Process')) { $scopes = @('this session') }
    if ($scopes) { $found[$name] = @($scopes) }
}
$conflicts = $conflictVars | Where-Object { $found.ContainsKey($_) }
$foundrySet = $foundryVars | Where-Object { $found.ContainsKey($_) }
if ($conflicts) {
    Add-Result 'WARN' 'Environment variables' ("Set: {0}. These can override Foundry mode; we'll handle them in the workshop." -f (($conflicts | ForEach-Object { "$_ ($($found[$_] -join '/'))" }) -join ', '))
}
if ($found.ContainsKey('ANTHROPIC_FOUNDRY_RESOURCE') -and $found.ContainsKey('ANTHROPIC_FOUNDRY_BASE_URL')) {
    Add-Result 'FAIL' 'Foundry variables' 'Both ANTHROPIC_FOUNDRY_RESOURCE and ANTHROPIC_FOUNDRY_BASE_URL are set; Claude Code rejects that. Remove one.'
}
elseif ($foundrySet) {
    Add-Result 'INFO' 'Foundry variables' ("Already set: {0}. The workshop will replace them with your new resource." -f ($foundrySet -join ', '))
}
if (-not $conflicts -and -not $foundrySet) {
    Add-Result 'PASS' 'Environment variables' 'No conflicting Claude variables set.'
}

$settingsPath = Join-Path $HOME '.claude\settings.json'
if (Test-Path $settingsPath) {
    $settings = $null
    try { $settings = Get-Content $settingsPath -Raw | ConvertFrom-Json } catch { }
    if (-not $settings) {
        Add-Result 'WARN' 'Claude settings.json' "$settingsPath isn't valid JSON."
    }
    else {
        $notes = @()
        if ($settings.PSObject.Properties.Name -contains 'apiKeyHelper') { $notes += 'apiKeyHelper' }
        if ($settings.env) {
            $envNames = $settings.env.PSObject.Properties.Name | Where-Object { $_ -match '^(ANTHROPIC_|CLAUDE_CODE_USE_)' }
            if ($envNames) { $notes += "env: $($envNames -join ', ')" }
        }
        if ($notes) {
            Add-Result 'WARN' 'Claude settings.json' ("Contains {0}. These may override Foundry mode; bring this up at the workshop." -f ($notes -join '; '))
        }
        else {
            Add-Result 'PASS' 'Claude settings.json' 'No provider overrides found.'
        }
    }
}

$managedSettings = Join-Path $env:ProgramFiles 'ClaudeCode\managed-settings.json'
if (Test-Path $managedSettings) {
    Add-Result 'WARN' 'Managed settings' 'Your organization manages Claude Code settings, which override personal settings. Tell your facilitator.'
}

# Script execution policy (affects the generated installer)
$policy = @('MachinePolicy', 'UserPolicy') | ForEach-Object { Get-ExecutionPolicy -Scope $_ } | Where-Object { $_ -in 'Restricted', 'AllSigned' }
if ($policy) {
    Add-Result 'WARN' 'Execution policy' 'Group Policy restricts PowerShell scripts, so the generated installer may be blocked. You can set the environment variables by hand instead.'
}
else {
    Add-Result 'PASS' 'Execution policy' 'Scripts can run with -ExecutionPolicy Bypass.'
}

# VS Code extension (optional)
if (Get-Command code -ErrorAction SilentlyContinue) {
    $extensions = code --list-extensions 2>$null
    if ($extensions -contains 'anthropic.claude-code') {
        Add-Result 'PASS' 'VS Code extension' 'Claude Code extension installed (optional).'
    }
    else {
        Add-Result 'INFO' 'VS Code extension' 'Claude Code extension not installed (optional).'
    }
}

$pass = @($script:Results | Where-Object Status -eq 'PASS').Count
$warn = @($script:Results | Where-Object Status -eq 'WARN').Count
$fail = @($script:Results | Where-Object Status -eq 'FAIL').Count

Write-Host ''
Write-Host ("========== Summary: {0} PASS, {1} WARN, {2} FAIL ==========" -f $pass, $warn, $fail)
Write-Host ''
Write-Host 'If you ask your facilitator for help, share only the block below. It contains no IDs or secrets.'
Write-Host ''
Write-Host '----- COPY FROM HERE -----'
Write-Host ("Claude on Foundry pre-work: workstation check, Windows ({0})" -f (Get-Date).ToUniversalTime().ToString('yyyy-MM-dd'))
foreach ($result in $script:Results) {
    Write-Host ("{0,-4}  {1}: {2}" -f $result.Status, $result.Check, $result.Detail)
}
Write-Host ("Result: {0} PASS, {1} WARN, {2} FAIL" -f $pass, $warn, $fail)
Write-Host '----- COPY TO HERE -----'

if ($fail -gt 0) { exit 1 }
exit 0
