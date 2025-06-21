import * as core from "@actions/core";

export type ActionConfig = {
  subscriptionId: string;
  resourceGroupName: string;
  containerAppName: string | undefined;
  waitForState: string;
};

function getInput(
  inputName: string,
  allowedValues?: string[],
  throwOnMissing = true,
): string | undefined {
  const inputValue = core.getInput(inputName)?.trim();
  if (!inputValue) {
    if (throwOnMissing) {
      throw new Error(
        `Action input '${inputName}' is required but not provided`,
      );
    } else {
      return;
    }
  }

  if (allowedValues && !allowedValues.includes(inputValue)) {
    throw new Error(
      `Action input '${inputName}' must be one of the following values: '${allowedValues.join(`', '`)}'`,
    );
  }

  return inputValue;
}
export function parseConfig(): ActionConfig {
  const subscriptionId = getInput("subscription-id") as string;
  const resourceGroupName = getInput("resource-group-name") as string;
  const containerAppName = getInput("container-app-name", [], false);
  const waitForState = getInput("wait-for-state") as string;

  return {
    subscriptionId,
    resourceGroupName,
    containerAppName,
    waitForState,
  };
}
