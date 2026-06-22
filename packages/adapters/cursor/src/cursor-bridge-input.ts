import { z } from "zod";

const optionalText = z.string().trim().min(1).optional().catch(undefined);
const optionalTimestamp = z.number().int().nonnegative().optional();

export const cursorBridgeInputSchema = z.object({
  event: z.string().trim().min(1),
  surface: z.enum(["ide-extension", "desktop", "manual"]).optional(),
  sessionId: optionalText,
  workspaceName: optionalText,
  projectPath: optionalText,
  title: optionalText,
  message: optionalText,
  timestamp: optionalTimestamp,
});

export type CursorBridgeInput = z.infer<typeof cursorBridgeInputSchema>;
