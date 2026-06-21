import { z } from "zod";

export const codexHookInputSchema = z.object({
  cwd: z.string().min(1).optional().catch(undefined),
  hook_event_name: z.string().min(1).optional().catch(undefined),
  prompt: z.string().min(1).optional().catch(undefined),
  session_id: z.string().min(1).optional().catch(undefined),
  tool_name: z.string().min(1).optional().catch(undefined),
});

export type CodexHookInput = z.infer<typeof codexHookInputSchema>;
