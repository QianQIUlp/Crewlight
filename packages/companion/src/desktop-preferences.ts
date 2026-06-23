import { readFile, rm, writeFile } from "node:fs/promises";

export const DESKTOP_PREFERENCES_VERSION = 1;
export const DESKTOP_THEMES = ["system", "light", "dark"] as const;
export const DESKTOP_ACCENTS = ["teal", "amber", "azure"] as const;
export const DESKTOP_DENSITIES = ["comfortable", "compact"] as const;
export const DESKTOP_SECTIONS = [
  "home",
  "doctor",
  "agents",
  "companion",
  "demo",
  "appearance",
  "settings",
  "about",
] as const;
export const INTEGRATION_IDS = [
  "claude-code",
  "codex",
  "cursor",
  "opencode",
  "manual",
] as const;

export type DesktopTheme = (typeof DESKTOP_THEMES)[number];
export type DesktopAccent = (typeof DESKTOP_ACCENTS)[number];
export type DesktopDensity = (typeof DESKTOP_DENSITIES)[number];
export type DesktopSection = (typeof DESKTOP_SECTIONS)[number];
export type PreferredIntegration = (typeof INTEGRATION_IDS)[number];

export interface DesktopPreferences {
  version: number;
  theme: DesktopTheme;
  accent: DesktopAccent;
  density: DesktopDensity;
  lastSection: DesktopSection;
  companionVisibilityPreference: boolean;
  serviceAutoStart: boolean;
  preferredIntegration?: PreferredIntegration;
  onboardingCompleted: boolean;
}

export interface DesktopPreferencesStore {
  clear(): Promise<void>;
  load(): Promise<DesktopPreferences>;
  save(preferences: DesktopPreferences): Promise<void>;
}

export const DEFAULT_DESKTOP_PREFERENCES: DesktopPreferences = {
  version: DESKTOP_PREFERENCES_VERSION,
  theme: "system",
  accent: "teal",
  density: "comfortable",
  lastSection: "home",
  companionVisibilityPreference: false,
  serviceAutoStart: false,
  onboardingCompleted: false,
};

function isTheme(value: unknown): value is DesktopTheme {
  return (
    typeof value === "string" &&
    (DESKTOP_THEMES as readonly string[]).includes(value)
  );
}

function isAccent(value: unknown): value is DesktopAccent {
  return (
    typeof value === "string" &&
    (DESKTOP_ACCENTS as readonly string[]).includes(value)
  );
}

function isDensity(value: unknown): value is DesktopDensity {
  return (
    typeof value === "string" &&
    (DESKTOP_DENSITIES as readonly string[]).includes(value)
  );
}

function isSection(value: unknown): value is DesktopSection {
  return (
    typeof value === "string" &&
    (DESKTOP_SECTIONS as readonly string[]).includes(value)
  );
}

function isIntegration(value: unknown): value is PreferredIntegration {
  return (
    typeof value === "string" &&
    (INTEGRATION_IDS as readonly string[]).includes(value)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function sanitizeDesktopPreferences(value: unknown): DesktopPreferences {
  if (!isRecord(value)) {
    return { ...DEFAULT_DESKTOP_PREFERENCES };
  }

  return {
    version: DESKTOP_PREFERENCES_VERSION,
    theme: isTheme(value.theme)
      ? value.theme
      : DEFAULT_DESKTOP_PREFERENCES.theme,
    accent: isAccent(value.accent)
      ? value.accent
      : DEFAULT_DESKTOP_PREFERENCES.accent,
    density: isDensity(value.density)
      ? value.density
      : DEFAULT_DESKTOP_PREFERENCES.density,
    lastSection: isSection(value.lastSection)
      ? value.lastSection
      : DEFAULT_DESKTOP_PREFERENCES.lastSection,
    companionVisibilityPreference:
      typeof value.companionVisibilityPreference === "boolean"
        ? value.companionVisibilityPreference
        : DEFAULT_DESKTOP_PREFERENCES.companionVisibilityPreference,
    serviceAutoStart:
      typeof value.serviceAutoStart === "boolean"
        ? value.serviceAutoStart
        : DEFAULT_DESKTOP_PREFERENCES.serviceAutoStart,
    ...(isIntegration(value.preferredIntegration)
      ? { preferredIntegration: value.preferredIntegration }
      : {}),
    onboardingCompleted:
      typeof value.onboardingCompleted === "boolean"
        ? value.onboardingCompleted
        : DEFAULT_DESKTOP_PREFERENCES.onboardingCompleted,
  };
}

export function serializeDesktopPreferences(
  preferences: DesktopPreferences,
): string {
  const safe = sanitizeDesktopPreferences(preferences);
  return `${JSON.stringify(safe, null, 2)}\n`;
}

export function createDesktopPreferencesStore(
  filePath: string,
): DesktopPreferencesStore {
  return {
    clear: async () => {
      await rm(filePath, { force: true });
    },
    load: async () => {
      try {
        const raw = await readFile(filePath, "utf8");
        return sanitizeDesktopPreferences(JSON.parse(raw));
      } catch {
        return { ...DEFAULT_DESKTOP_PREFERENCES };
      }
    },
    save: async (preferences) => {
      await writeFile(
        filePath,
        serializeDesktopPreferences(preferences),
        "utf8",
      );
    },
  };
}
