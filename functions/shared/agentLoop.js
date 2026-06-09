/**
 * Generic agent loop for tool-calling LLM agents (PEP-297).
 *
 * Manages the conversation array, calls OpenRouter with tool definitions,
 * handles tool_calls in responses, and returns when the LLM produces
 * final content without tool calls.
 *
 * Reusable across any agent CF — digest, scheduler, etc.
 */

import {
  getOpenRouterKey,
  OPENROUTER_ENDPOINT,
} from "./openrouter.js";
import { buildChatBody } from "./openai.js";

const MAX_ITERATIONS = 15;

/**
 * Run an agent loop until the LLM returns final content.
 *
 * @param {Object} opts
 * @param {Object[]} opts.messages     - Initial messages array [system, user]
 * @param {Object[]} opts.tools        - Tool definitions (OpenAI format)
 * @param {Function} opts.toolExecutor - async (name, args) => result
 * @param {Object}   opts.model        - { model, temperature, maxTokens }
 * @param {Object}   [opts.trace]      - Langfuse span for tracing (optional)
 * @param {number}   [opts.maxIterations] - Safety limit (default 15)
 * @returns {{ content: string, toolCallLog: Object[], iterations: number }}
 */
export async function runAgentLoop({
  messages,
  tools,
  toolExecutor,
  model,
  trace,
  maxIterations = MAX_ITERATIONS,
}) {
  const apiKey = getOpenRouterKey();
  if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

  const toolCallLog = [];
  let iteration = 0;

  while (iteration < maxIterations) {
    iteration++;

    const body = buildChatBody({
      model: model.model,
      messages,
      temperature: model.temperature,
      max_completion_tokens: model.maxTokens,
    });

    // Add tools to request body
    if (tools && tools.length > 0) {
      body.tools = tools;
    }

    const generation = trace?.generation({
      name: `agent-iteration-${iteration}`,
      model: model.model,
      input: messages[messages.length - 1],
    });

    const response = await fetch(OPENROUTER_ENDPOINT, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      generation?.end({ output: errText, level: "ERROR" });
      throw new Error(
        `LLM error: ${response.status} — ${errText?.slice?.(0, 200)}`
      );
    }

    const json = await response.json();
    const choice = json?.choices?.[0]?.message;
    if (!choice) {
      generation?.end({ output: "no choice in response", level: "ERROR" });
      throw new Error("LLM returned no choice");
    }

    // Append assistant message to conversation
    messages.push(choice);

    const usage = {
      input: json?.usage?.prompt_tokens,
      output: json?.usage?.completion_tokens,
    };

    // Check for tool calls
    if (choice.tool_calls && choice.tool_calls.length > 0) {
      generation?.end({ output: { toolCalls: choice.tool_calls.map((tc) => tc.function.name) }, usage });

      for (const tc of choice.tool_calls) {
        const fnName = tc.function.name;
        let fnArgs;
        try {
          fnArgs = JSON.parse(tc.function.arguments);
        } catch {
          fnArgs = {};
        }

        const toolSpan = trace?.span({ name: `tool-${fnName}`, input: fnArgs });
        let result;
        try {
          result = await toolExecutor(fnName, fnArgs);
          toolSpan?.end({ output: result });
        } catch (err) {
          result = { error: err.message };
          toolSpan?.end({ output: result, level: "ERROR" });
        }

        toolCallLog.push({ name: fnName, args: fnArgs, result });

        messages.push({
          role: "tool",
          tool_call_id: tc.id,
          content: JSON.stringify(result),
        });
      }

      continue; // Next iteration
    }

    // No tool calls — final content
    const content = choice.content?.trim();
    if (!content) {
      generation?.end({ output: "empty content", level: "ERROR" });
      throw new Error("LLM returned empty final content");
    }

    generation?.end({ output: content, usage });

    return { content, toolCallLog, iterations: iteration };
  }

  throw new Error(`Agent loop exceeded max iterations (${maxIterations})`);
}
