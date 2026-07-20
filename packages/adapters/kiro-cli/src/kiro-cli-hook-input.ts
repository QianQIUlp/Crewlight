import { z } from "zod";

export const kiroCliHookInputSchema = z
  .object({
    hook_event_name: z.string().min(1),
    session_id: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    tool_name: z.string().min(1).optional(),
    notification_type: z.string().min(1).optional(),
  })
  .passthrough();

export type KiroCliHookInput = z.infer<typeof kiroCliHookInputSchema>;
