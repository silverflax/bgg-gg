# Deployment Guide for BGG Game Picker

This guide explains how to deploy the BGG Game Picker app to Azure Container Apps using GitHub Actions.

## Prerequisites

- An Azure subscription
- A GitHub repository with this code
- Azure CLI installed locally (for initial setup)

## Initial Setup

### 1. Create Azure Service Principal

Run the following commands in Azure CLI to create a service principal for GitHub Actions:

```bash
# Login to Azure
az login

# Get your subscription ID
az account show --query id -o tsv

# Create a service principal with Contributor role
# Replace <subscription-id> with your actual subscription ID
az ad sp create-for-rbac \
  --name "github-actions-bgg-gg" \
  --role contributor \
  --scopes /subscriptions/<subscription-id> \
  --sdk-auth
```

This will output a JSON object like:

```json
{
  "clientId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "clientSecret": "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "subscriptionId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "tenantId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "activeDirectoryEndpointUrl": "https://login.microsoftonline.com",
  "resourceManagerEndpointUrl": "https://management.azure.com/",
  ...
}
```

### 2. Configure GitHub Secrets

Go to your GitHub repository → Settings → Secrets and variables → Actions

Add the following repository secrets:

| Secret Name | Value |
|-------------|-------|
| `AZURE_CREDENTIALS` | The entire JSON output from step 1 |
| `AZURE_SUBSCRIPTION_ID` | Your Azure subscription ID (from the JSON above) |

### 3. First Deployment (Two-Phase Process)

For the **first deployment**, you need to deploy infrastructure before container apps can be created:

**Phase 1 - Deploy Infrastructure:**
1. Go to your GitHub repository → Actions
2. Select "Build and Deploy to Azure Container Apps"
3. Click "Run workflow"
4. Set `deploy_infrastructure` to `true`
5. Select environment (usually `prod`)
6. Click "Run workflow"

This creates:
- Resource group: `rg-bgg-gg-prod`
- Azure Container Registry
- Container Apps Environment
- Log Analytics Workspace

**Phase 2 - Build Images & Deploy Apps:**
The workflow automatically continues to:
- Build and push Docker images to ACR
- Deploy the Container Apps with those images

**Note:** On first deployment, both phases run automatically when `deploy_infrastructure=true`.

### 4. Subsequent Deployments

After the initial deployment, any push to `main` will automatically:
- Build new Docker images
- Push to Azure Container Registry
- Update the Container Apps with new images

## Manual Deployment

You can also deploy manually using Azure CLI:

```bash
# Login to Azure
az login

# Deploy infrastructure
az deployment sub create \
  --location australiaeast \
  --template-file infra/main.bicep \
  --parameters infra/parameters.prod.json

# Get ACR credentials
RESOURCE_GROUP="rg-bgg-gg-prod"
ACR_NAME=$(az acr list -g $RESOURCE_GROUP --query "[0].name" -o tsv)
az acr login --name $ACR_NAME

# Build and push images
ACR_LOGIN_SERVER=$(az acr show -n $ACR_NAME --query "loginServer" -o tsv)

docker build -t $ACR_LOGIN_SERVER/bgg-gg-backend:latest ./backend
docker push $ACR_LOGIN_SERVER/bgg-gg-backend:latest

docker build -t $ACR_LOGIN_SERVER/bgg-gg-frontend:latest ./frontend
docker push $ACR_LOGIN_SERVER/bgg-gg-frontend:latest

# Update container apps
az containerapp update \
  --name bgg-gg-backend \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_LOGIN_SERVER/bgg-gg-backend:latest

az containerapp update \
  --name bgg-gg-frontend \
  --resource-group $RESOURCE_GROUP \
  --image $ACR_LOGIN_SERVER/bgg-gg-frontend:latest
```

## Local Development

For local development, use Docker Compose:

```bash
docker-compose up --build
```

This will:
- Start the backend at http://localhost:4000
- Start the frontend at http://localhost:3000

The local setup uses file-based caching in the `./cache` directory.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                 Azure Container Apps Environment            │
│                                                             │
│  ┌─────────────────────┐      ┌─────────────────────┐      │
│  │   Frontend (nginx)  │      │   Backend (Node.js) │      │
│  │   Port 3000         │─────>│   Port 4000         │      │
│  │   External Ingress  │ /api │   Internal Ingress  │      │
│  └─────────────────────┘      └─────────────────────┘      │
│                                         │                   │
└─────────────────────────────────────────│───────────────────┘
                                          │
                                          v
                              ┌───────────────────────┐
                              │  BoardGameGeek API    │
                              │  (External)           │
                              └───────────────────────┘
```

## Troubleshooting

### Backend container keeps restarting

1. Check container logs:
   ```bash
   az containerapp logs show \
     --name bgg-gg-backend \
     --resource-group rg-bgg-gg-prod \
     --follow
   ```

2. The backend now uses in-memory caching as a fallback if filesystem permissions fail.

### Frontend can't reach backend

1. Check the BACKEND_URL environment variable in the frontend container:
   ```bash
   az containerapp show \
     --name bgg-gg-frontend \
     --resource-group rg-bgg-gg-prod \
     --query "properties.template.containers[0].env"
   ```

2. The backend URL should be: `http://bgg-gg-backend.internal.<environment-domain>`

### Images not updating

1. Verify images were pushed to ACR:
   ```bash
   az acr repository list --name <acr-name> -o table
   az acr repository show-tags --name <acr-name> --repository bgg-gg-backend -o table
   ```

2. Force a new revision:
   ```bash
   az containerapp revision restart \
     --name bgg-gg-backend \
     --resource-group rg-bgg-gg-prod \
     --revision <revision-name>
   ```

## Resource Costs

Azure Container Apps uses a consumption-based pricing model:
- **vCPU**: ~$0.000024 per vCPU-second
- **Memory**: ~$0.000003 per GiB-second
- **Requests**: First 2 million requests/month free

With `minReplicas: 0`, containers scale to zero when not in use, minimizing costs.

## Cleanup

To delete all resources:

```bash
az group delete --name rg-bgg-gg-prod --yes --no-wait
```

This will delete all resources in the resource group including:
- Container Registry
- Container Apps Environment
- Container Apps
- Log Analytics Workspace

