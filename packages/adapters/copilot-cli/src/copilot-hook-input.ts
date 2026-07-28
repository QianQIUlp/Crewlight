import { z } from "zod";

export const copilotHookInputSchema = z
  .object({
    hook_event_name: z.string().min(1),
    session_id: z.string().min(1).optional(),
    sessionId: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    tool_name: z.string().min(1).optional(),
    notification_type: z.string().min(1).optional(),
    recoverable: z.boolean().optional(),
  })
  .passthrough();

export type CopilotHookInput = z.infer<typeof copilotHookInputSchema>;
