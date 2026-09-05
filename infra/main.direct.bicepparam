using './main.bicep'

param profile = 'direct'
param resourceGroupName = 'rg-claude-code-dev'
param workloadName = 'claude-code'
param environmentName = 'dev'
param location = 'eastus2'
param resourceSuffix = 'a1b2c3d4e5f6g'
param manageResourceGroup = true
param foundryProjectName = 'claude-code'
param reuseExistingFoundry = false
param entraOnlyAuthentication = true
param foundryPublicNetworkAccess = 'Enabled'
param keyVaultPublicNetworkAccess = 'Enabled'
param keyVaultNetworkDefaultAction = 'Deny'
param logRetentionInDays = 30
param enableDiagnosticSettings = false
param tags = {
  application: 'claude-code'
  environment: 'dev'
  profile: 'direct'
}
