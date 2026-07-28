import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const sourceDirectory = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "src",
);

describe("desktop accessibility regressions", () => {
  it("uses a labelled modal dialog and no dead npm install command", async () => {
    const html = await readFile(join(sourceDirectory, "desktop.html"), "utf8");
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="remote-install-title"');
    expect(html).not.toContain("npm install -g @crewlight/cli");
    expect(html).toContain("same-version Crewlight release artifact");
  });

  it("does not prefix an already-versioned label with a second v", async () => {
    const html = await readFile(join(sourceDirectory, "desktop.html"), "utf8");
    expect(html).not.toContain('v<span id="sidebar-version"');
  });

  it("keeps recurring attention motion inside the no-preference query", async () => {
    const css = await readFile(join(sourceDirectory, "desktop.css"), "utf8");
    const noPreference = css.indexOf("prefers-reduced-motion: no-preference");
    const attentionAnimation = css.indexOf("animation: pulse-border-desktop");
    expect(noPreference).toBeGreaterThanOrEqual(0);
    expect(attentionAnimation).toBeGreaterThan(noPreference);
  });

  it("uses native disclosure buttons and preserves their state across polls", async () => {
    const desktopRenderer = await readFile(
      join(sourceDirectory, "desktop-renderer.ts"),
      "utf8",
    );
    const companionRenderer = await readFile(
      join(sourceDirectory, "renderer.ts"),
      "utf8",
    );
    for (const renderer of [desktopRenderer, companionRenderer]) {
      expect(renderer).toContain("session-detail-toggle");
      expect(renderer).toContain("data-disclosure-id");
      expect(renderer).not.toContain('setAttribute("role", "button")');
    }
    expect(desktopRenderer).toContain("replacement?.focus()");
    expect(companionRenderer).toContain("replacement?.focus()");
  });

  it("enforces single-instance and managed-service desktop lifecycle policy", async () => {
    const main = await readFile(join(sourceDirectory, "main.ts"), "utf8");
    expect(main).toContain("app.requestSingleInstanceLock()");
    expect(main).toContain("await serviceManager.dispose()");
    expect(main).toContain("getCompanionDismissAction(trayAvailable)");
    expect(main).toContain("canStopManagedService(serviceState)");
  });
});
