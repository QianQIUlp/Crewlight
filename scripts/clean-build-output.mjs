import { access, readdir, rm } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const mode = process.argv[2] ?? "--all";
if (mode !== "--all" && mode !== "--metadata-only") {
  throw new Error(
    "Usage: node scripts/clean-build-output.mjs [--all|--metadata-only]",
  );
}

async function packageDirectories(parent) {
  const directories = [];
  for (const entry of await readdir(parent, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      continue;
    }
    const directory = join(parent, entry.name);
    try {
      await access(join(directory, "package.json"));
      directories.push(directory);
    } catch {
      // This directory is a package group rather than a workspace package.
    }
  }
  return directories;
}

const workspacePackages = [
  ...(await packageDirectories(join(root, "packages"))),
  ...(await packageDirectories(join(root, "packages", "adapters"))),
  ...(await packageDirectories(join(root, "apps"))),
];

for (const packageDirectory of workspacePackages) {
  const dist = join(packageDirectory, "dist");
  const relativeTarget = relative(root, dist);
  if (
    isAbsolute(relativeTarget) ||
    relativeTarget.startsWith("..") ||
    relativeTarget.split(/[\\/]/u).at(-1) !== "dist"
  ) {
    throw new Error(`Refusing to clean an unsafe build path: ${dist}`);
  }
  if (mode === "--metadata-only") {
    await rm(join(dist, ".tsbuildinfo"), { force: true });
  } else {
    await rm(dist, { force: true, recursive: true });
  }
}
