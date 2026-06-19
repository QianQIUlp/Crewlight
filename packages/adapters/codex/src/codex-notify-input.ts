import { z } from "zod";

export const codexNotifyInputSchema = z
  .object({
    cwd: z.string().min(1).optional(),
    "input-messages": z.array(z.string()).optional(),
    "last-assistant-message": z.string().optional(),
    "thread-id": z.string().min(1).optional(),
    "turn-id": z.string().min(1).optional(),
    type: z.string().min(1),
  })
  .passthrough();

export type CodexNotifyInput = z.infer<typeof codexNotifyInputSchema>;
