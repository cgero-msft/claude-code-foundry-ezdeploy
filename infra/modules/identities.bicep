@description('Azure region for managed identities.')
param location string

@description('Deployment orchestration identity name.')
param deploymentIdentityName string

@description('Runtime workload identity name.')
param runtimeIdentityName string

@description('Tags applied to managed identities.')
param tags object

resource deploymentIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: deploymentIdentityName
  location: location
  tags: tags
}

resource runtimeIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2024-11-30' = {
  name: runtimeIdentityName
  location: location
  tags: tags
}

output deploymentIdentityId string = deploymentIdentity.id
output deploymentClientId string = deploymentIdentity.properties.clientId
output deploymentPrincipalId string = deploymentIdentity.properties.principalId
output runtimeIdentityId string = runtimeIdentity.id
output runtimeClientId string = runtimeIdentity.properties.clientId
output runtimePrincipalId string = runtimeIdentity.properties.principalId
