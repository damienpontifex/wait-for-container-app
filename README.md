# Wait for Azure Container App Action

When changing a container app image via Azure Bicep, the control plain deployment will complete regardless of the status of the new revision. This waits for that new revision to be running to ensure the deployment was successful of both the azure resources and application.

## Usage

### Waiting for all containers in resource group
```yaml
- uses: damienpontifex/wait-for-container-app@main
  with:
    subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
    resource-group-name: my-resource-group
```

### Waiting on a specific container app
```yaml
- uses: damienpontifex/wait-for-container-app@main
  with:
    subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
    resource-group-name: my-resource-group
    container-app-name: my-container-app
```
