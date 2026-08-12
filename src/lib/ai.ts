import { createOpenAI } from "@ai-sdk/openai";

// Configurable AI provider (DeepSeek by default, OpenAI/Qwen-compatible via env):
//   AI_API_KEY   - API key for the chosen provider
//   AI_BASE_URL  - e.g. https://api.deepseek.com/v1 (DeepSeek),
//                  https://api.openai.com/v1 (OpenAI),
//                  https://dashscope.aliyuncs.com/compatible-mode/v1 (Qwen)
//   AI_MODEL     - e.g. deepseek-chat, gpt-4o-mini, qwen-plus
const baseURL = process.env.AI_BASE_URL || "https://api.deepseek.com/v1";
const apiKey = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "";
const modelId = process.env.AI_MODEL || "deepseek-chat";

const provider = createOpenAI({ baseURL, apiKey });

export function getAiModel() {
  return provider.chat(modelId);
}
