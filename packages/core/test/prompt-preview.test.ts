import { describe, expect, it } from "vitest";

import {
  formatPromptPreviewTaskTitle,
  PROMPT_PREVIEW_TASK_TITLE_LIMIT,
} from "../src/index.js";

describe("prompt preview task titles", () => {
  it("normalizes whitespace and removes newlines", () => {
    expect(formatPromptPreviewTaskTitle("  查看\n\nAGENTS.md\t并总结  ")).toBe(
      "查看 AGENTS.md 并总结",
    );
  });

  it("omits empty prompts", () => {
    expect(formatPromptPreviewTaskTitle(undefined)).toBeUndefined();
    expect(formatPromptPreviewTaskTitle(" \n\t ")).toBeUndefined();
  });

  it("keeps prompts at the Unicode code-point limit", () => {
    const prompt = "界".repeat(PROMPT_PREVIEW_TASK_TITLE_LIMIT);

    expect(formatPromptPreviewTaskTitle(prompt)).toBe(prompt);
    expect(Array.from(prompt)).toHaveLength(PROMPT_PREVIEW_TASK_TITLE_LIMIT);
  });

  it("truncates by Unicode code points with an ellipsis", () => {
    const prompt = "😀".repeat(PROMPT_PREVIEW_TASK_TITLE_LIMIT + 10);
    const title = formatPromptPreviewTaskTitle(prompt);

    expect(title).toBe(`${"😀".repeat(PROMPT_PREVIEW_TASK_TITLE_LIMIT - 1)}…`);
    expect(Array.from(title ?? "")).toHaveLength(
      PROMPT_PREVIEW_TASK_TITLE_LIMIT,
    );
  });
});
