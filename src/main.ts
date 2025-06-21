import * as core from '@actions/core'
import { DefaultAzureCredential } from '@azure/identity';
import { ContainerAppsAPIClient } from '@azure/arm-appcontainers';
import { ActionConfig, parseConfig } from './config.js';

const userAgentPrefix = "gh-damienpontifex-wait-for-container-app";

function createContainerAppsClient(config: ActionConfig): ContainerAppsAPIClient {
  const credentials = new DefaultAzureCredential();

  return new ContainerAppsAPIClient(credentials, config.subscriptionId, {
    userAgentOptions: {
      userAgentPrefix: userAgentPrefix,
    },
    // additionalPolicies: [debugLoggingPolicy],
    // Use a recent API version to take advantage of error improvements
    // apiVersion: "2024-03-01",
    // endpoint: endpoints[config.environment],
  });
}

async function containerAppsToWaitFor(config: ActionConfig, client: ContainerAppsAPIClient): Promise<string[]> {
  if (!!config.containerAppName) {
    core.debug(`Waiting for container app ${config.containerAppName} in resource group ${config.resourceGroupName}`);
    return [config.containerAppName];
  }

  const resArray = new Array();
  const apps = client.containerApps.listByResourceGroup(config.resourceGroupName);
  for await (const app of apps) {
    resArray.push(app.name);
  }
  core.debug(`Waiting for container apps in resource group ${config.resourceGroupName}: ${resArray.join(', ')}`);
  return resArray;
}

type AppsToRevisions = { [key: string]: string[] };
async function revisionsToWaitFor(config: ActionConfig, apps: string[], client: ContainerAppsAPIClient): Promise<AppsToRevisions> {
  const appsToRevisions: AppsToRevisions = {};
  for (const app of apps) {
    const revisions = client.containerAppsRevisions.listRevisions(config.resourceGroupName, app);
    for await (const revision of revisions) {
      if (revision.runningState === 'Stopped' || revision.runningState === 'Running') {
        continue;
      }

      if (!appsToRevisions[app]) {
        appsToRevisions[app] = [];
      }
      appsToRevisions[app].push(revision.name || '');
    }
    if (!appsToRevisions[app]) {
      core.info(`No activating revisions needing to be waited for were found for container app ${app} in resource group ${config.resourceGroupName}`);
    }
  }
  return appsToRevisions;
}

/**
 * The main function for the action.
 *
 * @returns Resolves when the action is complete.
 */
export async function run(): Promise<void> {
  try {
    const config = parseConfig();
    // Debug logs are only output if the `ACTIONS_STEP_DEBUG` secret is true
    core.debug(`Condition for container app ${config.containerAppName} in resource group ${config.resourceGroupName}`);

    const client = createContainerAppsClient(config);
    const apps = await containerAppsToWaitFor(config, client);

    const appRevisions = await revisionsToWaitFor(config, apps, client);

    while (!!appRevisions) {
      for (const [appName, revisions] of Object.entries(appRevisions)) {
        for (const revision of revisions) {
          const rev = await client.containerAppsRevisions.getRevision(config.resourceGroupName, appName, revision);
          if (rev.runningState === 'Activating') {
            const now = new Date();
            core.info(`Revision ${revision} of container app ${appName} in resource group ${config.resourceGroupName} still activating after ${now.getTime() - rev.createdTime!.getTime()} seconds`);
          } else {
            core.info(`Revision ${revision} of container app ${appName} in resource group ${config.resourceGroupName} is in state ${rev.runningState}`);
            delete appRevisions[appName]; // Remove from the list if it's not activating
          }
        }
      }
    }

    // Set outputs for other workflow steps to use
    core.setOutput('time', new Date().toTimeString())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}
