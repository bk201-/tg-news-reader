import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Must mock config before importing openaiClient
vi.mock('../config.js', () => ({
  AZURE_OPENAI_ENDPOINT: '',
  AZURE_OPENAI_KEY: '',
  AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
  OPENAI_API_KEY: '',
}));

describe('openaiClient', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('isAiConfigured returns false when no keys set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_KEY: '',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: '',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(false);
  });

  it('isAiConfigured returns true when Azure keys set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: 'https://example.openai.azure.com/',
      AZURE_OPENAI_KEY: 'key-123',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: '',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(true);
  });

  it('isAiConfigured returns true when OpenAI key set', async () => {
    vi.doMock('../config.js', () => ({
      AZURE_OPENAI_ENDPOINT: '',
      AZURE_OPENAI_KEY: '',
      AZURE_OPENAI_DEPLOYMENT: 'gpt-4o-mini',
      OPENAI_API_KEY: 'sk-test',
    }));
    const { isAiConfigured } = await import('./openaiClient.js');
    expect(isAiConfigured()).toBe(true);
  });
});
