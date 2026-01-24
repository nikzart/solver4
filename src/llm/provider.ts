/**
 * GPT OSS 120B Provider
 * Custom LLM provider for the reasoning model
 */

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMResponse {
  content: string;
  reasoning: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[] }>;
    required?: string[];
  };
}

interface GPTOSSConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_CONFIG: Partial<GPTOSSConfig> = {
  baseUrl: 'https://ignise321-0284-resource.services.ai.azure.com/models/chat/completions',
  model: 'gpt-oss-120b',
  maxTokens: 4096,
  temperature: 0.1,
};

export class GPTOSSProvider {
  private config: GPTOSSConfig;

  constructor(config: Partial<GPTOSSConfig>) {
    this.config = {
      ...DEFAULT_CONFIG,
      ...config,
    } as GPTOSSConfig;
  }

  async generate(
    messages: LLMMessage[],
    options?: {
      temperature?: number;
      maxTokens?: number;
      tools?: ToolDefinition[];
      jsonSchema?: Record<string, unknown>;
    }
  ): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}?api-version=2024-05-01-preview`;

    const requestBody: Record<string, unknown> = {
      model: this.config.model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      max_tokens: options?.maxTokens ?? this.config.maxTokens,
      temperature: options?.temperature ?? this.config.temperature,
    };

    // Add JSON schema response format if provided
    if (options?.jsonSchema) {
      requestBody.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'exam_response',
          strict: true,
          schema: options.jsonSchema,
        },
      };
    }

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((tool) => ({
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      }));
      requestBody.tool_choice = 'auto';
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': this.config.apiKey,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API Error (${response.status}): ${errorText}`);
    }

    const data = await response.json();
    const choice = data.choices?.[0];

    if (!choice) {
      throw new Error('No response from LLM');
    }

    return {
      content: choice.message?.content || '',
      reasoning: choice.message?.reasoning_content || '',
      usage: {
        promptTokens: data.usage?.prompt_tokens || 0,
        completionTokens: data.usage?.completion_tokens || 0,
        totalTokens: data.usage?.total_tokens || 0,
      },
    };
  }

  async generateWithTools(
    messages: LLMMessage[],
    tools: ToolDefinition[],
    executeToolCallback: (name: string, args: Record<string, unknown>) => Promise<string>,
    options?: {
      temperature?: number;
      maxTokens?: number;
      maxToolCalls?: number;
    }
  ): Promise<LLMResponse> {
    const maxToolCalls = options?.maxToolCalls ?? 5;
    let currentMessages = [...messages];
    let toolCallCount = 0;
    let finalResponse: LLMResponse | null = null;
    let accumulatedReasoning = '';

    while (toolCallCount < maxToolCalls) {
      const url = `${this.config.baseUrl}?api-version=2024-05-01-preview`;

      const requestBody: Record<string, unknown> = {
        model: this.config.model,
        messages: currentMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        max_tokens: options?.maxTokens ?? this.config.maxTokens,
        temperature: options?.temperature ?? this.config.temperature,
        tools: tools.map((tool) => ({
          type: 'function',
          function: {
            name: tool.name,
            description: tool.description,
            parameters: tool.parameters,
          },
        })),
        tool_choice: 'auto',
      };

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.config.apiKey,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LLM API Error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];

      if (!choice) {
        throw new Error('No response from LLM');
      }

      // Accumulate reasoning
      if (choice.message?.reasoning_content) {
        accumulatedReasoning += choice.message.reasoning_content + '\n';
      }

      // Check if there are tool calls
      const toolCalls = choice.message?.tool_calls;
      if (!toolCalls || toolCalls.length === 0) {
        // No more tool calls, return final response
        finalResponse = {
          content: choice.message?.content || '',
          reasoning: accumulatedReasoning,
          usage: {
            promptTokens: data.usage?.prompt_tokens || 0,
            completionTokens: data.usage?.completion_tokens || 0,
            totalTokens: data.usage?.total_tokens || 0,
          },
        };
        break;
      }

      // Process tool calls
      for (const toolCall of toolCalls) {
        toolCallCount++;
        const functionName = toolCall.function?.name;
        const functionArgs = JSON.parse(toolCall.function?.arguments || '{}');

        // Execute the tool
        const toolResult = await executeToolCallback(functionName, functionArgs);

        // Add assistant message with tool call
        currentMessages.push({
          role: 'assistant',
          content: JSON.stringify({
            tool_calls: [
              {
                id: toolCall.id,
                type: 'function',
                function: {
                  name: functionName,
                  arguments: toolCall.function?.arguments,
                },
              },
            ],
          }),
        });

        // Add tool result
        currentMessages.push({
          role: 'user',
          content: `Tool "${functionName}" returned: ${toolResult}`,
        });
      }
    }

    return (
      finalResponse || {
        content: 'Max tool calls reached',
        reasoning: accumulatedReasoning,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }
    );
  }
}

// Singleton instance
let providerInstance: GPTOSSProvider | null = null;

export function getProvider(): GPTOSSProvider {
  if (!providerInstance) {
    const apiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('AZURE_OPENAI_API_KEY environment variable is required');
    }
    providerInstance = new GPTOSSProvider({
      apiKey,
    });
  }
  return providerInstance;
}
