import { z } from "zod";

export const codewhaleHookInputSchema = z
  .object({
    event: z.string().min(1).optional(),
    hook_event_name: z.string().min(1).optional(),
    session_id: z.string().min(1).optional(),
    workspace: z.string().min(1).optional(),
    cwd: z.string().min(1).optional(),
    status: z.string().min(1).optional(),
    title: z.string().min(1).optional(),
    message: z.string().min(1).optional(),
    tool_name: z.string().min(1).optional(),
    notification_type: z.string().min(1).optional(),
  })
  .passthrough()
  .refine(
    (input) => input.event !== undefined || input.hook_event_name !== undefined,
  );

export type CodewhaleHookInput = z.infer<typeof codewhaleHookInputSchema>;
