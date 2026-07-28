import type { PublishRequest, PublishResult } from "../types/PublishingTypes";

export interface PublishPreparationInput {
  request: PublishRequest;
  flushProjectSnapshot: () => Promise<void>;
}

export interface PublishPreparationDependencies {
  publishProject: (request: PublishRequest) => Promise<PublishResult>;
}

export async function prepareAndPublishProject(
  input: PublishPreparationInput,
  dependencies: PublishPreparationDependencies,
): Promise<PublishResult> {
  await input.flushProjectSnapshot();
  return dependencies.publishProject(input.request);
}

