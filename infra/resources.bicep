// Azure Container Apps Resources
// This module deploys all resources within a resource group

@description('Base name for all resources')
param appName string

@description('Azure region for resources')
param location string

@description('Environment (dev, staging, prod)')
param environment string

@description('Unique suffix for globally unique names')
param resourceSuffix string

@description('Container image tag')
param imageTag string

@description('Deploy container apps (set to false for initial infrastructure-only deployment)')
param deployContainerApps bool = true

@description('BGG API access token for authentication')
@secure()
param bggAccessToken string = ''

// Naming conventions
var acrName = replace('acr${appName}${resourceSuffix}', '-', '')
var logAnalyticsName = 'log-${appName}-${environment}'
var containerEnvName = 'cae-${appName}-${environment}'
// Simple app names for cleaner URLs (e.g., bgg-gg-backend.<id>.australiaeast.azurecontainerapps.io)
var backendAppName = '${appName}-backend'
var frontendAppName = '${appName}-frontend'

// Container Registry
resource acr 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: acrName
  location: location
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: true
    publicNetworkAccess: 'Enabled'
  }
  tags: {
    application: appName
    environment: environment
  }
}

// Log Analytics Workspace (required for Container Apps)
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
  tags: {
    application: appName
    environment: environment
  }
}

// Container Apps Environment
resource containerEnv 'Microsoft.App/managedEnvironments@2023-05-01' = {
  name: containerEnvName
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
  tags: {
    application: appName
    environment: environment
  }
}

// Backend Container App (only deploy if deployContainerApps is true)
resource backendApp 'Microsoft.App/containerApps@2023-05-01' = if (deployContainerApps) {
  name: backendAppName
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: false // Internal only - accessed via frontend
        targetPort: 4000
        transport: 'http'
        allowInsecure: true // Internal traffic only
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
        {
          name: 'bgg-access-token'
          value: bggAccessToken
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'backend'
          image: '${acr.properties.loginServer}/${appName}-backend:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'PORT'
              value: '4000'
            }
            {
              name: 'CACHE_PATH'
              value: '/cache'
            }
            {
              name: 'BGG_ACCESS_TOKEN'
              secretRef: 'bgg-access-token'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 4000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 4000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    application: appName
    environment: environment
  }
}

// Frontend Container App (only deploy if deployContainerApps is true)
resource frontendApp 'Microsoft.App/containerApps@2023-05-01' = if (deployContainerApps) {
  name: frontendAppName
  location: location
  properties: {
    managedEnvironmentId: containerEnv.id
    configuration: {
      ingress: {
        external: true // Public facing
        targetPort: 3000
        transport: 'http'
      }
      registries: [
        {
          server: acr.properties.loginServer
          username: acr.listCredentials().username
          passwordSecretRef: 'acr-password'
        }
      ]
      secrets: [
        {
          name: 'acr-password'
          value: acr.listCredentials().passwords[0].value
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'frontend'
          image: '${acr.properties.loginServer}/${appName}-frontend:${imageTag}'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            {
              // Use internal FQDN for backend service
              name: 'BACKEND_URL'
              value: 'http://${backendAppName}.internal.${containerEnv.properties.defaultDomain}'
            }
          ]
          probes: [
            {
              type: 'Liveness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 10
              periodSeconds: 30
            }
            {
              type: 'Readiness'
              httpGet: {
                path: '/health'
                port: 3000
              }
              initialDelaySeconds: 5
              periodSeconds: 10
            }
          ]
        }
      ]
      scale: {
        minReplicas: 0
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '100'
              }
            }
          }
        ]
      }
    }
  }
  tags: {
    application: appName
    environment: environment
  }
  dependsOn: [
    backendApp // Ensure backend is created first for FQDN reference
  ]
}

// Outputs
output containerRegistryName string = acr.name
output containerRegistryLoginServer string = acr.properties.loginServer
output frontendUrl string = deployContainerApps ? 'https://${frontendApp.properties.configuration.ingress.fqdn}' : 'Not deployed'
output backendUrl string = deployContainerApps ? 'http://${backendApp.properties.configuration.ingress.fqdn}' : 'Not deployed'
output backendInternalUrl string = deployContainerApps ? 'http://${backendAppName}.internal.${containerEnv.properties.defaultDomain}' : 'Not deployed'
