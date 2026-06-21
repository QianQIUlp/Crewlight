import { z } from "zod";

export const claudeHookInputSchema = z
  .object({
    cwd: z.string().min(1).optional(),
    error: z.string().min(1).optional(),
    error_details: z.string().min(1).optional(),
    error_type: z.string().min(1).optional(),
    hook_event_name: z.string().min(1),
    last_assistant_message: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    notification_type: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    tool_name: z.string().min(1).optional(),
  })
  .passthrough();

export type ClaudeHookInput = z.infer<typeof claudeHookInputSchema>;
