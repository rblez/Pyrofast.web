export type Role = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ChatMessage {
  role: Role;
  content: string;
  toolCalls?: ToolCall[];
  toolCallId?: string;
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>) => Promise<string>;
}

export interface ProviderResponse {
  message: ChatMessage;
  finishReason: "stop" | "tool_calls";
}

export interface ModelProvider {
  complete: (messages: ChatMessage[], tools: Tool[]) => Promise<ProviderResponse>;
}

export interface RunOptions {
  provider: ModelProvider;
  tools: Tool[];
  messages: ChatMessage[];
  maxSteps?: number;
}

export interface RunResult {
  messages: ChatMessage[];
  steps: number;
  finishReason: "stop" | "max_steps";
}
