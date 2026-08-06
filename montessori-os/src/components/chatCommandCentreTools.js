import {
  DEFAULT_CHAT_TOOL_IDS,
  TOOL_CATALOG_META,
} from '../../../functions/config/toolCatalog.js';

export const CHAT_TOOL_OPTIONS = TOOL_CATALOG_META.filter((tool) => tool.scope === 'student');

export function normalizeChatAllowedTools(value) {
  const requested = Array.isArray(value) ? value : DEFAULT_CHAT_TOOL_IDS;
  const selected = new Set(requested);

  return CHAT_TOOL_OPTIONS
    .filter((tool) => selected.has(tool.id))
    .filter((tool) => !tool.prerequisites?.length
      || tool.prerequisites.every((prerequisite) => selected.has(prerequisite)))
    .map((tool) => tool.id);
}

export function isValidChatAllowedTools(value) {
  if (!Array.isArray(value) || new Set(value).size !== value.length) return false;
  const normalized = normalizeChatAllowedTools(value);
  return normalized.length === value.length && normalized.every((id) => value.includes(id));
}

export function sameChatAllowedTools(left, right) {
  return left.length === right.length && left.every((id) => right.includes(id));
}

export function toggleChatAllowedTool(value, toolId) {
  const current = normalizeChatAllowedTools(value);
  if (!CHAT_TOOL_OPTIONS.some((tool) => tool.id === toolId)) return current;

  const selected = new Set(current);
  if (selected.has(toolId)) {
    selected.delete(toolId);
    let removedDependent;
    do {
      removedDependent = false;
      for (const tool of CHAT_TOOL_OPTIONS) {
        if (selected.has(tool.id)
          && tool.prerequisites?.some((prerequisite) => !selected.has(prerequisite))) {
          selected.delete(tool.id);
          removedDependent = true;
        }
      }
    } while (removedDependent);
  } else {
    const tool = CHAT_TOOL_OPTIONS.find((option) => option.id === toolId);
    if (tool.prerequisites?.some((prerequisite) => !selected.has(prerequisite))) return current;
    selected.add(toolId);
  }

  return CHAT_TOOL_OPTIONS.filter((tool) => selected.has(tool.id)).map((tool) => tool.id);
}
