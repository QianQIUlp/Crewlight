export const PROMPT_PREVIEW_TASK_TITLE_LIMIT = 60;

export function formatPromptPreviewTaskTitle(
  prompt: string | undefined,
): string | undefined {
  const normalized = prompt?.trim().replace(/\s+/gu, " ");
  if (!normalized) {
    return undefined;
  }

  const codePoints = Array.from(normalized);
  if (codePoints.length <= PROMPT_PREVIEW_TASK_TITLE_LIMIT) {
    return normalized;
  }

  return `${codePoints
    .slice(0, PROMPT_PREVIEW_TASK_TITLE_LIMIT - 1)
    .join("")}…`;
}
