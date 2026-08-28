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

  it("loads ESM renderers and keeps hidden content out of the layout", async () => {
    const desktopHtml = await readFile(
      join(sourceDirectory, "desktop.html"),
      "utf8",
    );
    const companionHtml = await readFile(
      join(sourceDirectory, "index.html"),
      "utf8",
    );
    const css = await readFile(join(sourceDirectory, "desktop.css"), "utf8");
    expect(desktopHtml).toContain(
      '<script src="./desktop-renderer.js" type="module"></script>',
    );
    expect(companionHtml).toContain(
      '<script src="./renderer.js" type="module"></script>',
    );
    expect(desktopHtml).not.toContain("style=");
    expect(css).toContain("[hidden]");
    expect(css).toContain("#lg-svg-defs");
  });

  it("offers grouped single-panel navigation", async () => {
    const desktopRenderer = await readFile(
      join(sourceDirectory, "desktop-renderer.ts"),
      "utf8",
    );
    expect(desktopRenderer).toContain('group: "Inbox"');
    expect(desktopRenderer).toContain('group: "Preferences"');
    expect(desktopRenderer).toContain("button.dataset.panel = panel.id");
    expect(desktopRenderer).toContain(
      "setHidden(`${panel.id}-section`, panel.id !== activePanel)",
    );
  });

  it("keeps recurring attention motion inside the no-preference query", async () => {
    const css = await readFile(join(sourceDirectory, "desktop.css"), "utf8");
    const noPreference = css.indexOf("prefers-reduced-motion: no-preference");
    const attentionAnimation = css.indexOf("animation: pulse-border-desktop");
    expect(noPreference).toBeGreaterThanOrEqual(0);
    expect(attentionAnimation).toBeGreaterThan(noPreference);
  });

  it("uses a theme-aware sidebar surface without a clipped glass layer", async () => {
    const css = await readFile(join(sourceDirectory, "desktop.css"), "utf8");
    expect(css).toContain("--sidebar-surface:");
    expect(css).toContain("background: var(--sidebar-surface)");
    expect(css).toMatch(
      /\.sidebar::before,\s*\.sidebar::after\s*\{\s*display: none;/,
    );
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
    expect(
      main.match(/icon: join\(outputDirectory, "crewlight-icon.png"\)/g),
    ).toHaveLength(2);
  });

  it("keeps local integration setup read-only while preserving inspect and copy", async () => {
    const [bridge, main, renderer, html, installer] = await Promise.all(
      [
        "desktop-bridge.ts",
        "main.ts",
        "desktop-renderer.ts",
        "desktop.html",
        "integration-installer.ts",
      ].map((file) => readFile(join(sourceDirectory, file), "utf8")),
    );
    for (const source of [bridge, main, renderer, html, installer]) {
      expect(source).not.toContain("integration:install");
      expect(source).not.toContain("Install safely");
    }
    expect(html).not.toContain("one-click");
    expect(html).toContain("does not modify");
    expect(bridge).toContain('type: "integration:inspect"');
    expect(bridge).toContain('type: "copy:text"');
    expect(renderer).toContain('type: "integration:inspect"');
    expect(renderer).toContain('type: "copy:text"');
    expect(installer).not.toMatch(/\b(?:copyFile|mkdir|rename|writeFile)\b/u);
  });
});
