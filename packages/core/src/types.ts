import type { z } from "zod";

import type {
  agentEventInputSchema,
  agentEventSchema,
  agentSessionSchema,
  agentSourceSchema,
  agentStatusSchema,
  agentSurfaceSchema,
  urgencySchema,
} from "./schemas.js";

export type AgentStatus = z.infer<typeof agentStatusSchema>;
export type AgentSource = z.infer<typeof agentSourceSchema>;
export type AgentSurface = z.infer<typeof agentSurfaceSchema>;
export type Urgency = z.infer<typeof urgencySchema>;
export type AgentEventInput = z.infer<typeof agentEventInputSchema>;
export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentSession = z.infer<typeof agentSessionSchema>;
