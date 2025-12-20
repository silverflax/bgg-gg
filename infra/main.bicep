// Azure Container Apps Infrastructure for BGG Game Picker
// Deploy with: az deployment sub create --location <location> --template-file main.bicep --parameters appName=<name>

targetScope = 'subscription'

@description('Base name for all resources')
param appName string = 'bgg-gg'

@description('Azure region for resources')
param location string = 'australiaeast'

@description('Environment (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'prod'

@description('Container image tag')
param imageTag string = 'latest'

@description('Deploy container apps (set to false for initial infrastructure-only deployment)')
param deployContainerApps bool = true

@description('BGG API access token for authentication')
@secure()
param bggAccessToken string = ''

// Generate unique suffix for globally unique names
var resourceSuffix = uniqueString(subscription().subscriptionId, appName, environment)
var resourceGroupName = 'rg-${appName}-${environment}'

// Resource Group
resource rg 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: {
    application: appName
    environment: environment
  }
}

// Deploy all resources into the resource group
module resources 'resources.bicep' = {
  name: 'resources-${environment}'
  scope: rg
  params: {
    appName: appName
    location: location
    environment: environment
    resourceSuffix: resourceSuffix
    imageTag: imageTag
    deployContainerApps: deployContainerApps
    bggAccessToken: bggAccessToken
  }
}

// Outputs for CI/CD pipeline
output resourceGroupName string = rg.name
output containerRegistryName string = resources.outputs.containerRegistryName
output containerRegistryLoginServer string = resources.outputs.containerRegistryLoginServer
output frontendUrl string = deployContainerApps ? resources.outputs.frontendUrl : 'Not deployed yet'
output backendUrl string = deployContainerApps ? resources.outputs.backendUrl : 'Not deployed yet'
