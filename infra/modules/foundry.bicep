@description('Azure region for the Microsoft Foundry resources.')
param location string

@description('Globally unique AIServices account name.')
param accountName string

@description('Foundry project name.')
param projectName string

@description('Disable local API-key authentication.')
param disableLocalAuth bool

@description('Public network access for the Foundry account.')
param publicNetworkAccess string

@description('Log Analytics workspace resource ID for diagnostics.')
param logAnalyticsWorkspaceId string

@description('Enable the Foundry diagnostic setting.')
param enableDiagnosticSettings bool

@description('Tags applied to Microsoft Foundry resources.')
param tags object

resource account 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: accountName
  location: location
  kind: 'AIServices'
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: 'S0'
  }
  properties: {
    allowProjectManagement: true
    customSubDomainName: accountName
    disableLocalAuth: disableLocalAuth
    publicNetworkAccess: publicNetworkAccess
    networkAcls: {
      bypass: 'AzureServices'
      defaultAction: publicNetworkAccess == 'Enabled' ? 'Allow' : 'Deny'
      ipRules: []
      virtualNetworkRules: []
    }
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: account
  name: projectName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: projectName
    description: 'Microsoft Foundry project for ${accountName}.'
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnosticSettings) {
  name: 'send-to-log-analytics'
  scope: account
  properties: {
    workspaceId: logAnalyticsWorkspaceId
    logs: [
      {
        categoryGroup: 'allLogs'
        enabled: true
      }
    ]
    metrics: [
      {
        category: 'AllMetrics'
        enabled: true
      }
    ]
  }
}

output accountId string = account.id
output accountName string = account.name
output accountEndpoint string = account.properties.endpoint
output accountPrincipalId string = account.identity.principalId
output projectId string = project.id
output projectName string = project.name
output projectPrincipalId string = project.identity.principalId
output projectEndpoint string = 'https://${accountName}.services.ai.azure.com/api/projects/${projectName}'
