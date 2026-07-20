import { z } from "zod";

export const geminiHookInputSchema = z
  .object({
    hook_event_name: z.string().min(1),
    session_id: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    gemini_pid: z.number().optional(),
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    tool_name: z.string().min(1).optional(),
    notification_type: z.string().min(1).optional(),
  })
  .passthrough();

export type GeminiHookInput = z.infer<typeof geminiHookInputSchema>;
