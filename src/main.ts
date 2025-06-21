import * as core from '@actions/core'
import { DefaultAzureCredential } from '@azure/identity'
import { ContainerAppsAPIClient } from '@azure/arm-appcontainers'
import { ActionConfig, parseConfig } from './config.js'

const userAgentPrefix = 'gh-damienpontifex-wait-for-container-app'

function createContainerAppsClient(
  config: ActionConfig
): ContainerAppsAPIClient {
  const credentials = new DefaultAzureCredential()

  return new ContainerAppsAPIClient(credentials, config.subscriptionId, {
    userAgentOptions: {
      userAgentPrefix: userAgentPrefix
    }
  })
}

async function containerAppsToWaitFor(
  config: ActionConfig,
  client: ContainerAppsAPIClient
): Promise<string[]> {
  if (config.containerAppName) {
    core.debug(
      `Waiting for container app ${config.containerAppName} in resource group ${config.resourceGroupName}`
    )
    return [config.containerAppName]
  }

  const resArray = [];
  const apps = client.containerApps.listByResourceGroup(
    config.resourceGroupName
  )
  for await (const app of apps) {
    resArray.push(app.name)
  }
  core.debug(
    `Waiting for container apps in resource group ${config.resourceGroupName}: ${resArray.join(', ')}`
  )
  return resArray
}

type AppsToRevisions = { [key: string]: string[] }
async function revisionsToWaitFor(
  config: ActionConfig,
  apps: string[],
  client: ContainerAppsAPIClient
): Promise<AppsToRevisions> {
  const appsToRevisions: AppsToRevisions = {}
  for (const app of apps) {
    const revisions = client.containerAppsRevisions.listRevisions(
      config.resourceGroupName,
      app
    )
    for await (const revision of revisions) {
      if (revision.runningState !== 'Activating') {
        continue
      }

      if (!appsToRevisions[app]) {
        appsToRevisions[app] = []
      }
      appsToRevisions[app].push(revision.name || '')
    }
    if (!appsToRevisions[app]) {
      core.info(
        `No activating revisions needing to be waited for were found for container app ${app} in resource group ${config.resourceGroupName}`
      )
    }
  }
  return appsToRevisions
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const config = parseConfig()
    const client = createContainerAppsClient(config)
    const apps = await containerAppsToWaitFor(config, client)
    const appRevisions = await revisionsToWaitFor(config, apps, client)

    // Iterate through the revisions and wait for them to finish activating
    // If a revision is still activating, log the time it has been activating
    // If a revision is not activating, remove it from the list
    while (Object.keys(appRevisions).length > 0) {
      for (const [appName, revisions] of Object.entries(appRevisions)) {
        for (const revision of revisions) {
          const rev = await client.containerAppsRevisions.getRevision(
            config.resourceGroupName,
            appName,
            revision
          )
          if (rev.runningState === 'Activating') {
            const activatingForDuration = Math.floor(
              (new Date().getTime() - rev.createdTime!.getTime()) / 1000
            )
            core.info(
              `Revision ${revision} of container app ${appName} in resource group ${config.resourceGroupName} still activating for ${activatingForDuration} seconds`
            )
          } else {
            core.info(
              `Revision ${revision} of container app ${appName} in resource group ${config.resourceGroupName} is in state ${rev.runningState}`
            )
            delete appRevisions[appName] // Remove from the list if it's not activating
          }
        }
      }

      if (Object.keys(appRevisions).length > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * config.checkInterval)
        ) // Wait before checking again
      }
    }

    core.debug(
      `All container apps in resource group ${config.resourceGroupName} are no longer activating`
    )

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
