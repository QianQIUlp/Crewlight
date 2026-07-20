import { z } from "zod";

export const openclawHookInputSchema = z
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

export type OpenclawHookInput = z.infer<typeof openclawHookInputSchema>;
