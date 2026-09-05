targetScope = 'subscription'

@description('Resource group created or reused for the deployment.')
param resourceGroupName string

@description('Deployment profile. direct omits API Management; apim-governed deploys it as the managed ingress tier.')
@allowed([
  'direct'
  'apim-governed'
])
param profile string = 'direct'

@description('Short workload identifier used in resource names.')
@minLength(2)
@maxLength(20)
param workloadName string = 'claude-code'

@description('Environment identifier used in resource names and tags.')
@minLength(2)
@maxLength(10)
param environmentName string = 'dev'

@description('Azure region for all regional resources.')
param location string

@description('Stable lowercase alphanumeric suffix reserved in generated resource names.')
@minLength(13)
@maxLength(13)
param resourceSuffix string = uniqueString(subscription().id, resourceGroupName)

@description('Create or update resource-group tags. Set false to preserve an unrelated existing resource group.')
param manageResourceGroup bool = true

@description('Globally unique Microsoft Foundry AIServices account name.')
@minLength(3)
@maxLength(64)
param foundryAccountName string = toLower(take('aif-${workloadName}-${environmentName}-${uniqueString(subscription().id, resourceGroupName)}', 64))

@description('Foundry project name.')
@minLength(2)
@maxLength(64)
param foundryProjectName string = 'claude-code'

@description('Reuse an existing Foundry account and let the engine validate it instead of managing it with Bicep.')
param reuseExistingFoundry bool = false

@description('Disable API-key authentication on the Foundry account and require Microsoft Entra ID.')
param entraOnlyAuthentication bool = true

@description('Public network access for the Foundry account. Disabled requires separately managed private connectivity.')
@allowed([
  'Enabled'
  'Disabled'
])
param foundryPublicNetworkAccess string = 'Enabled'

@description('Globally unique Key Vault name.')
@minLength(3)
@maxLength(24)
param keyVaultName string = toLower('${take('kv${replace(workloadName, '-', '')}${replace(environmentName, '-', '')}', 11)}${resourceSuffix}')

@description('Public network access for Key Vault. Disabled requires separately managed private connectivity.')
@allowed([
  'Enabled'
  'Disabled'
])
param keyVaultPublicNetworkAccess string = 'Enabled'

@description('Default Key Vault firewall action when public network access is enabled.')
@allowed([
  'Allow'
  'Deny'
])
param keyVaultNetworkDefaultAction string = 'Deny'

@description('Log Analytics workspace name.')
param logAnalyticsWorkspaceName string = 'log-${workloadName}-${environmentName}'

@description('Log Analytics retention in days.')
@minValue(30)
@maxValue(730)
param logRetentionInDays int = 30

@description('Workspace-based Application Insights component name.')
param applicationInsightsName string = 'appi-${workloadName}-${environmentName}'

@description('Enable diagnostic settings on resources that support the configured Log Analytics workspace.')
param enableDiagnosticSettings bool = true

@description('User-assigned identity used by deployment orchestration.')
param deploymentIdentityName string = 'id-${workloadName}-${environmentName}-deploy'

@description('User-assigned identity used by deployed runtime workloads.')
param runtimeIdentityName string = 'id-${workloadName}-${environmentName}-runtime'

@description('Globally unique API Management service name. Used only by the apim-governed profile.')
@minLength(1)
@maxLength(50)
param apiManagementName string = toLower(take('apim-${workloadName}-${environmentName}-${uniqueString(subscription().id, resourceGroupName)}', 50))

@description('API Management publisher display name. Used only by the apim-governed profile.')
param apiManagementPublisherName string = 'Platform Engineering'

@description('API Management publisher email. Used only by the apim-governed profile.')
param apiManagementPublisherEmail string = 'platform-team@example.com'

@description('API Management SKU. Developer is a safe non-production default; select a production SKU deliberately.')
@allowed([
  'Developer'
  'BasicV2'
  'StandardV2'
  'Premium'
])
param apiManagementSkuName string = 'Developer'

@description('API Management capacity.')
@minValue(1)
param apiManagementCapacity int = 1

@description('Public network access for API Management. Disabled requires separately managed private connectivity.')
@allowed([
  'Enabled'
  'Disabled'
])
param apiManagementPublicNetworkAccess string = 'Enabled'

@description('Additional tags applied to all resources.')
param tags object = {}

var deployApiManagement = profile == 'apim-governed'
resource deploymentResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = if (manageResourceGroup) {
  name: resourceGroupName
  location: location
  tags: commonTags
}

var commonTags = union({
  workload: workloadName
  environment: environmentName
  deploymentProfile: profile
  managedBy: 'bicep'
}, tags)

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    applicationInsightsName: applicationInsightsName
    logRetentionInDays: logRetentionInDays
    tags: commonTags
  }
  dependsOn: [
    deploymentResourceGroup
  ]
}

module identities 'modules/identities.bicep' = {
  name: 'identities'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    deploymentIdentityName: deploymentIdentityName
    runtimeIdentityName: runtimeIdentityName
    tags: commonTags
  }
  dependsOn: [
    deploymentResourceGroup
  ]
}

module keyVault 'modules/key-vault.bicep' = {
  name: 'key-vault'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    keyVaultName: keyVaultName
    tenantId: subscription().tenantId
    publicNetworkAccess: keyVaultPublicNetworkAccess
    networkDefaultAction: keyVaultNetworkDefaultAction
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    enableDiagnosticSettings: enableDiagnosticSettings
    tags: commonTags
  }
  dependsOn: [
    deploymentResourceGroup
  ]
}

module foundry 'modules/foundry.bicep' = if (!reuseExistingFoundry) {
  name: 'foundry'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    accountName: foundryAccountName
    projectName: foundryProjectName
    disableLocalAuth: entraOnlyAuthentication
    publicNetworkAccess: foundryPublicNetworkAccess
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    enableDiagnosticSettings: enableDiagnosticSettings
    tags: commonTags
  }
  dependsOn: [
    deploymentResourceGroup
  ]
}

module apiManagement 'modules/api-management.bicep' = if (deployApiManagement) {
  name: 'api-management'
  scope: resourceGroup(resourceGroupName)
  params: {
    location: location
    serviceName: apiManagementName
    publisherName: apiManagementPublisherName
    publisherEmail: apiManagementPublisherEmail
    skuName: apiManagementSkuName
    capacity: apiManagementCapacity
    publicNetworkAccess: apiManagementPublicNetworkAccess
    logAnalyticsWorkspaceId: monitoring.outputs.logAnalyticsWorkspaceId
    enableDiagnosticSettings: enableDiagnosticSettings
    tags: commonTags
  }
  dependsOn: [
    deploymentResourceGroup
  ]
}

module rbac 'modules/rbac.bicep' = {
  name: 'rbac'
  scope: resourceGroup(resourceGroupName)
  params: {
    foundryAccountName: foundryAccountName
    keyVaultName: keyVaultName
    deploymentIdentityPrincipalId: identities.outputs.deploymentPrincipalId
    runtimeIdentityPrincipalId: identities.outputs.runtimePrincipalId
    deployApiManagement: deployApiManagement
    apiManagementName: apiManagementName
    apiManagementPrincipalId: deployApiManagement ? apiManagement!.outputs.principalId : ''
  }
  dependsOn: [
    deploymentResourceGroup
    foundry
    keyVault
  ]
}

output deploymentProfile string = profile
output resourceGroupId string = subscriptionResourceId('Microsoft.Resources/resourceGroups', resourceGroupName)
output resourceGroupName string = resourceGroupName
output foundryAccountId string = resourceId(resourceGroupName, 'Microsoft.CognitiveServices/accounts', foundryAccountName)
output foundryAccountName string = foundryAccountName
output foundryEndpoint string = 'https://${foundryAccountName}.services.ai.azure.com/'
output foundryAnthropicEndpoint string = 'https://${foundryAccountName}.services.ai.azure.com/anthropic'
output foundryAccountPrincipalId string = reuseExistingFoundry ? '' : foundry!.outputs.accountPrincipalId
output foundryProjectId string = resourceId(resourceGroupName, 'Microsoft.CognitiveServices/accounts/projects', foundryAccountName, foundryProjectName)
output foundryProjectName string = foundryProjectName
output foundryProjectEndpoint string = 'https://${foundryAccountName}.services.ai.azure.com/api/projects/${foundryProjectName}'
output foundryProjectPrincipalId string = reuseExistingFoundry ? '' : foundry!.outputs.projectPrincipalId
output deploymentIdentityId string = identities.outputs.deploymentIdentityId
output deploymentIdentityClientId string = identities.outputs.deploymentClientId
output deploymentIdentityPrincipalId string = identities.outputs.deploymentPrincipalId
output runtimeIdentityId string = identities.outputs.runtimeIdentityId
output runtimeIdentityClientId string = identities.outputs.runtimeClientId
output runtimeIdentityPrincipalId string = identities.outputs.runtimePrincipalId
output keyVaultId string = keyVault.outputs.keyVaultId
output keyVaultUri string = keyVault.outputs.keyVaultUri
output logAnalyticsWorkspaceId string = monitoring.outputs.logAnalyticsWorkspaceId
output applicationInsightsId string = monitoring.outputs.applicationInsightsId
output applicationInsightsConnectionString string = monitoring.outputs.applicationInsightsConnectionString
output apiManagementId string = deployApiManagement ? apiManagement!.outputs.serviceId : ''
output apiManagementGatewayUrl string = deployApiManagement ? apiManagement!.outputs.gatewayUrl : ''
output apiManagementPrincipalId string = deployApiManagement ? apiManagement!.outputs.principalId : ''
