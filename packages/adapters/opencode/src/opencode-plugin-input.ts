import { z } from "zod";

const optionalText = z.string().min(1).optional().catch(undefined);
const optionalTimestamp = z
  .number()
  .int()
  .nonnegative()
  .optional()
  .catch(undefined);

const statusSchema = z
  .union([
    z.string().min(1),
    z.object({
      type: z.string().min(1).optional().catch(undefined),
    }),
  ])
  .optional()
  .catch(undefined);

export const openCodePluginInputSchema = z.object({
  cwd: optionalText,
  directory: optionalText,
  projectPath: optionalText,
  timestamp: optionalTimestamp,
  event: z
    .object({
      type: optionalText,
      timestamp: optionalTimestamp,
      properties: z
        .object({
          sessionID: optionalText,
          sessionId: optionalText,
          timestamp: optionalTimestamp,
          status: statusSchema,
          info: z
            .object({
              id: optionalText,
            })
            .optional()
            .catch(undefined),
        })
        .optional()
        .catch(undefined),
    })
    .optional()
    .catch(undefined),
});

export type OpenCodePluginInput = z.infer<typeof openCodePluginInputSchema>;
