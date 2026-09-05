@description('Azure region for API Management.')
param location string

@description('Globally unique API Management service name.')
param serviceName string

@description('API Management publisher display name.')
param publisherName string

@description('API Management publisher email.')
param publisherEmail string

@description('API Management SKU name.')
param skuName string

@description('API Management capacity.')
param capacity int

@description('Public network access for API Management.')
param publicNetworkAccess string

@description('Log Analytics workspace resource ID for diagnostics.')
param logAnalyticsWorkspaceId string

@description('Enable the API Management diagnostic setting.')
param enableDiagnosticSettings bool

@description('Tags applied to API Management.')
param tags object

resource service 'Microsoft.ApiManagement/service@2024-05-01' = {
  name: serviceName
  location: location
  tags: tags
  identity: {
    type: 'SystemAssigned'
  }
  sku: {
    name: skuName
    capacity: capacity
  }
  properties: {
    publisherEmail: publisherEmail
    publisherName: publisherName
    publicNetworkAccess: publicNetworkAccess
    virtualNetworkType: 'None'
    developerPortalStatus: 'Disabled'
  }
}

resource diagnostics 'Microsoft.Insights/diagnosticSettings@2021-05-01-preview' = if (enableDiagnosticSettings) {
  name: 'send-to-log-analytics'
  scope: service
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

output serviceId string = service.id
output serviceName string = service.name
output principalId string = service.identity.principalId
output gatewayUrl string = service.properties.gatewayUrl
