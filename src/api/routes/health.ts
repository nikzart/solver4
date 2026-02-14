import { Hono } from 'hono';
import { isGeminiConfigured } from '../../tools/web-search';
import type { HealthResponse } from '../schemas/response';

const health = new Hono();

health.get('/', async (c) => {
  const response: HealthResponse = {
    status: 'healthy',
    version: '1.0.0',
    services: {
      llm: {
        status: process.env.AZURE_OPENAI_API_KEY ? 'configured' : 'not_configured',
        provider: 'azure-gpt-oss-120b',
      },
      search: {
        status: isGeminiConfigured() ? 'configured' : 'fallback',
        provider: isGeminiConfigured() ? 'gemini-grounded' : 'serper',
      },
    },
    timestamp: new Date().toISOString(),
  };

  // Mark as degraded if LLM not configured
  if (!process.env.AZURE_OPENAI_API_KEY) {
    response.status = 'unhealthy';
  }

  return c.json(response);
});

export default health;
