export const NOTIFIER_KINDS = ["console", "os", "none"] as const;

export type NotifierKind = (typeof NOTIFIER_KINDS)[number];

export function isNotifierKind(value: unknown): value is NotifierKind {
  return (
    typeof value === "string" && NOTIFIER_KINDS.includes(value as NotifierKind)
  );
}
