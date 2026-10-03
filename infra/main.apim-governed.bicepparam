using './main.bicep'

param profile = 'apim-governed'
param resourceGroupName = 'rg-claude-code-prod'
param workloadName = 'claude-code'
param environmentName = 'prod'
param location = 'eastus2'
param resourceSuffix = 'a1b2c3d4e5f6g'
param manageResourceGroup = true
param foundryProjectName = 'claude-code'
param reuseExistingFoundry = false
param entraOnlyAuthentication = true
param foundryPublicNetworkAccess = 'Enabled'
param keyVaultPublicNetworkAccess = 'Enabled'
param keyVaultNetworkDefaultAction = 'Deny'
param logRetentionInDays = 90
param enableDiagnosticSettings = true
param apiManagementPublisherName = 'Platform Engineering'
param apiManagementPublisherEmail = 'platform-team@example.com'
param apiManagementSkuName = 'StandardV2'
param apiManagementCapacity = 1
param apiManagementPublicNetworkAccess = 'Enabled'
param tags = {
  application: 'claude-code'
  environment: 'prod'
  profile: 'apim-governed'
}
