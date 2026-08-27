import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const releaseRoot = process.env.CREWLIGHT_RELEASE_ROOT
  ? join(root, process.env.CREWLIGHT_RELEASE_ROOT)
  : join(root, "release");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const policy = JSON.parse(
  await readFile(join(root, "release-policy.json"), "utf8"),
);
const version = packageJson.version;

async function filesIn(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    const nested = await Promise.all(
      entries.map(async (entry) => {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) return filesIn(path);
        return [path];
      }),
    );
    return nested.flat();
  } catch {
    return [];
  }
}

function isPrimaryArtifact(path) {
  const name = basename(path);
  if (name.endsWith(".sha256") || name === "release-manifest.json")
    return false;
  if (name.startsWith(`crewlight-v${version}-`)) {
    return /\.(zip|tar\.gz)$/u.test(name);
  }
  return /^(?:Crewlight-\d+\.\d+\.\d+-(?:x64|arm64)\.(?:AppImage|deb|dmg)|crewlight-v\d+\.\d+\.\d+-windows-x64-installer\.exe)$/u.test(
    name,
  );
}

function targetFor(name) {
  const target = name.match(
    /(?:v\d+\.\d+\.\d+-)?(windows-x64|linux-x64|macos-arm64|macos-x64)/u,
  )?.[1];
  if (target) return target;
  if (name.endsWith("-arm64.dmg")) return "macos-arm64";
  if (name.endsWith("-x64.dmg")) return "macos-x64";
  if (name.endsWith(".AppImage") || name.endsWith(".deb")) return "linux-x64";
  return "unknown";
}

function kindFor(name) {
  if (name.includes("-desktop.zip")) return "desktop-portable";
  if (name.endsWith("-installer.exe")) return "desktop-installer";
  if (name.endsWith(".AppImage")) return "desktop-appimage";
  if (name.endsWith(".deb")) return "desktop-deb";
  if (name.endsWith(".dmg")) return "desktop-dmg";
  return "standalone-cli";
}

function tierFor(target) {
  return policy.platforms?.[target]?.tier ?? "Preview";
}

function signatureFor(target) {
  return policy.platforms?.[target]?.signatureStatus ?? "unknown";
}

const allFiles = await filesIn(releaseRoot);
const primaryFiles = allFiles.filter(isPrimaryArtifact);
if (primaryFiles.length === 0) {
  throw new Error(
    `No distributable release artifacts found under ${releaseRoot}.`,
  );
}

if (process.argv.includes("--verify")) {
  const manifestPath = join(releaseRoot, "release-manifest.json");
  const existing = JSON.parse(await readFile(manifestPath, "utf8"));
  const expected = new Set(
    existing.artifacts?.flatMap((artifact) => [
      artifact.filename,
      artifact.sidecar,
    ]) ?? [],
  );
  const actualPrimary = new Set(
    primaryFiles.map((path) =>
      relative(releaseRoot, path).replaceAll("\\", "/"),
    ),
  );
  const expectedPrimary = new Set(
    existing.artifacts?.map((artifact) => artifact.filename) ?? [],
  );
  if (
    actualPrimary.size !== expectedPrimary.size ||
    [...actualPrimary].some((name) => !expectedPrimary.has(name))
  ) {
    throw new Error(
      "Release manifest does not match the exact distributable file set.",
    );
  }
  for (const artifact of existing.artifacts ?? []) {
    const path = join(releaseRoot, artifact.filename);
    const content = await readFile(path);
    const sha256 = createHash("sha256").update(content).digest("hex");
    if (
      sha256 !== artifact.sha256 ||
      (await stat(path)).size !== artifact.size
    ) {
      throw new Error(
        `Release manifest hash or size mismatch for ${artifact.filename}.`,
      );
    }
    const sidecar = join(releaseRoot, artifact.sidecar);
    if (
      (await readFile(sidecar, "utf8")) !== `${sha256}  ${basename(path)}\n`
    ) {
      throw new Error(
        `Release checksum sidecar mismatch for ${artifact.filename}.`,
      );
    }
  }
  if (process.env.CREWLIGHT_RELEASE_AGGREGATE === "true") {
    const standalone = existing.artifacts.filter(
      (artifact) => artifact.kind === "standalone-cli",
    ).length;
    const desktop = existing.artifacts.filter(
      (artifact) => artifact.kind !== "standalone-cli",
    ).length;
    if (
      standalone !== policy.artifacts?.standalone ||
      desktop !== policy.artifacts?.desktop
    ) {
      throw new Error(
        `Release manifest expected ${policy.artifacts?.standalone} standalone and ${policy.artifacts?.desktop} Desktop artifacts, found ${standalone} and ${desktop}.`,
      );
    }
  }
  const actualFiles = new Set(
    (await filesIn(releaseRoot))
      .map((path) => relative(releaseRoot, path).replaceAll("\\", "/"))
      .filter((name) => expected.has(name) || name === "release-manifest.json"),
  );
  if (actualFiles.size !== expected.size + 1) {
    throw new Error(
      "Release manifest does not match the exact checksum file set.",
    );
  }
  console.log(`Release manifest verified: ${relative(root, manifestPath)}`);
  process.exit(0);
}

const commit =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
const nodeVersion = policy.supplyChain?.nodeVersion;
const workflowRun = process.env.GITHUB_RUN_ID ?? "local";
const artifacts = [];
for (const path of primaryFiles.sort()) {
  const content = await readFile(path);
  const metadata = await stat(path);
  const name = basename(path);
  const target = targetFor(name);
  const sha256 = createHash("sha256").update(content).digest("hex");
  const sidecar = `${path}.sha256`;
  await writeFile(sidecar, `${sha256}  ${name}\n`, "utf8");
  artifacts.push({
    version,
    commit,
    target,
    kind: kindFor(name),
    tier: tierFor(target),
    filename: relative(releaseRoot, path).replaceAll("\\", "/"),
    size: metadata.size,
    sha256,
    signatureStatus: signatureFor(target),
    nodeVersion,
    workflowRun,
    sidecar: relative(releaseRoot, sidecar).replaceAll("\\", "/"),
  });
}

const manifest = {
  version,
  commit,
  workflowRun,
  generatedAt: new Date().toISOString(),
  artifacts,
};
const manifestPath = join(releaseRoot, "release-manifest.json");
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

console.log(`Release manifest: ${relative(root, manifestPath)}`);
