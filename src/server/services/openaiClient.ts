import OpenAI, { AzureOpenAI } from 'openai';
import { AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_KEY, AZURE_OPENAI_DEPLOYMENT, OPENAI_API_KEY } from '../config.js';

export const DIGEST_DEPLOYMENT = AZURE_OPENAI_DEPLOYMENT;

/** Returns true when at least one AI provider is configured. */
export function isAiConfigured(): boolean {
  return !!(AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) || !!OPENAI_API_KEY;
}

/**
 * Creates an OpenAI-compatible client.
 * - If AZURE_OPENAI_ENDPOINT + AZURE_OPENAI_KEY are set → Azure OpenAI
 * - Otherwise → direct OpenAI API via OPENAI_API_KEY
 */
export function createOpenAiClient(): OpenAI {
  if (AZURE_OPENAI_ENDPOINT && AZURE_OPENAI_KEY) {
    return new AzureOpenAI({
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiKey: AZURE_OPENAI_KEY,
      apiVersion: '2024-12-01-preview',
      deployment: AZURE_OPENAI_DEPLOYMENT,
    });
  }
  return new OpenAI({ apiKey: OPENAI_API_KEY });
}
