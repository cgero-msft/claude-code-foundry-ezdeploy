@description('Existing Microsoft Foundry AIServices account name.')
param foundryAccountName string

@description('Existing Key Vault name.')
param keyVaultName string

@description('Deployment orchestration identity principal ID.')
param deploymentIdentityPrincipalId string

@description('Runtime workload identity principal ID.')
param runtimeIdentityPrincipalId string

@description('Whether API Management is deployed.')
param deployApiManagement bool

@description('Existing API Management service name.')
param apiManagementName string

@description('API Management system-assigned identity principal ID.')
param apiManagementPrincipalId string

var cognitiveServicesUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  'a97b65f3-24c7-4388-baec-2e87135dc908'
)
var cognitiveServicesContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '25fbc0a9-bd7c-42a3-aa1a-3b75d497ee68'
)
var keyVaultSecretsUserRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '4633458b-17de-408a-b874-0445c86b69e6'
)
var apiManagementServiceContributorRoleDefinitionId = subscriptionResourceId(
  'Microsoft.Authorization/roleDefinitions',
  '312a565d-c81f-4fd8-895a-4e21e48d571c'
)

resource foundryAccount 'Microsoft.CognitiveServices/accounts@2025-06-01' existing = {
  name: foundryAccountName
}

resource keyVault 'Microsoft.KeyVault/vaults@2024-11-01' existing = {
  name: keyVaultName
}

resource apiManagement 'Microsoft.ApiManagement/service@2024-05-01' existing = if (deployApiManagement) {
  name: apiManagementName
}

resource deploymentFoundryContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, deploymentIdentityPrincipalId, cognitiveServicesContributorRoleDefinitionId)
  scope: foundryAccount
  properties: {
    principalId: deploymentIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesContributorRoleDefinitionId
  }
}

resource runtimeFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(foundryAccount.id, runtimeIdentityPrincipalId, cognitiveServicesUserRoleDefinitionId)
  scope: foundryAccount
  properties: {
    principalId: runtimeIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleDefinitionId
  }
}

resource runtimeKeyVaultSecretsUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, runtimeIdentityPrincipalId, keyVaultSecretsUserRoleDefinitionId)
  scope: keyVault
  properties: {
    principalId: runtimeIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: keyVaultSecretsUserRoleDefinitionId
  }
}

resource apiManagementFoundryUser 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployApiManagement) {
  name: guid(foundryAccount.id, apiManagementPrincipalId, cognitiveServicesUserRoleDefinitionId)
  scope: foundryAccount
  properties: {
    principalId: apiManagementPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: cognitiveServicesUserRoleDefinitionId
  }
}

resource deploymentApiManagementContributor 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployApiManagement) {
  name: guid(apiManagement.id, deploymentIdentityPrincipalId, apiManagementServiceContributorRoleDefinitionId)
  scope: apiManagement
  properties: {
    principalId: deploymentIdentityPrincipalId
    principalType: 'ServicePrincipal'
    roleDefinitionId: apiManagementServiceContributorRoleDefinitionId
  }
}
