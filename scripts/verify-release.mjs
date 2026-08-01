import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join, relative, win32 } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version;
const windowsSystemRoot = process.env.SystemRoot ?? "C:\\Windows";
const windowsPowerShell = win32.join(
  windowsSystemRoot,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "linux"
        ? "linux"
        : process.platform;
const target = `${platform}-${process.arch}`;
const WINDOWS_TOASTER_SHA256 =
  "42d20792498514562cfd6fd8221b4abb59229e893073fc59fbfc83f884a2401b";

const releasePlans = {
  "linux-x64": {
    packageScript: "package:desktop:linux",
    smokeScript: "smoke:standalone",
  },
  "macos-arm64": {
    packageScript: "package:desktop:dmg",
    smokeScript: "smoke:standalone",
  },
  "macos-x64": {
    packageScript: "package:desktop:dmg",
    smokeScript: "smoke:standalone",
  },
  "windows-x64": {
    packageScript: "package:desktop:windows",
    smokeScript: "smoke:standalone:windows",
  },
};

const plan = releasePlans[target];
if (!plan) {
  throw new Error(
    `Current-platform release verification supports ${Object.keys(releasePlans).join(", ")}; received ${target}.`,
  );
}

function runPnpm(script) {
  console.log(`\n> pnpm ${script}`);
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli || !isAbsolute(pnpmCli)) {
    throw new Error(
      "Release verification must be started through the pinned pnpm package script.",
    );
  }
  execFileSync(process.execPath, [pnpmCli, script], {
    cwd: root,
    stdio: "inherit",
    windowsHide: true,
  });
}

runPnpm(plan.packageScript);
runPnpm(plan.smokeScript);

const releaseRoot = join(root, "release");
const standaloneName = `crewlight-v${version}-${target}`;
const standaloneExtension = platform === "windows" ? ".zip" : ".tar.gz";
const contentManifestRoots = [join(releaseRoot, standaloneName)];
const windowsDesktopRoots = [];
const requiredArtifacts = [
  join(releaseRoot, `${standaloneName}${standaloneExtension}`),
  join(releaseRoot, `${standaloneName}${standaloneExtension}.sha256`),
  join(releaseRoot, standaloneName, "BUILD-INFO.txt"),
  join(releaseRoot, standaloneName, "CONTENTS.sha256"),
];

if (platform === "windows") {
  const portableName = `${standaloneName}-desktop`;
  const portableRoot = join(releaseRoot, portableName);
  const builderCliRoot = join(
    releaseRoot,
    "desktop-builder",
    "win-unpacked",
    "resources",
    "crewlight-cli",
  );
  contentManifestRoots.push(
    join(portableRoot, "resources", "crewlight-cli"),
    builderCliRoot,
  );
  windowsDesktopRoots.push(
    portableRoot,
    join(releaseRoot, "desktop-builder", "win-unpacked"),
  );
  const requiredSupportPaths = [
    "resources/snoretoast-x64.exe",
    "resources/THIRD-PARTY-NOTICES.txt",
    "resources/licenses/Node.js-22-LICENSE.txt",
    "resources/licenses/node-notifier-10.0.1-LICENSE.txt",
    "resources/licenses/SnoreToast-0.7.0-LGPL-3.0.txt",
    "resources/licenses/SnoreToast-0.7.0-SOURCE.txt",
  ];
  requiredArtifacts.push(
    join(releaseRoot, `${portableName}.zip`),
    join(releaseRoot, `${portableName}.zip.sha256`),
    join(releaseRoot, "desktop-builder", `Crewlight-Setup-v${version}.exe`),
    join(
      releaseRoot,
      "desktop-builder",
      `Crewlight-Setup-v${version}.exe.sha256`,
    ),
    join(portableRoot, "resources", "crewlight-cli", "CONTENTS.sha256"),
    join(builderCliRoot, "CONTENTS.sha256"),
    ...requiredSupportPaths.flatMap((path) => [
      join(releaseRoot, standaloneName, path),
      join(portableRoot, "resources", "crewlight-cli", path),
      join(builderCliRoot, path),
    ]),
  );
} else if (platform === "macos") {
  requiredArtifacts.push(
    join(
      releaseRoot,
      "desktop-builder",
      `Crewlight-${version}-${process.arch}.dmg`,
    ),
  );
} else {
  const desktopOutput = join(releaseRoot, "desktop-builder");
  const entries = await readdir(desktopOutput);
  const appImages = entries.filter(
    (entry) =>
      entry.startsWith(`Crewlight-${version}-`) && entry.endsWith(".AppImage"),
  );
  const debs = entries.filter(
    (entry) =>
      entry.startsWith(`Crewlight-${version}-`) && entry.endsWith(".deb"),
  );
  if (appImages.length !== 1 || debs.length !== 1) {
    throw new Error(
      `Expected exactly one Linux AppImage and one deb, found ${appImages.length} AppImage and ${debs.length} deb artifacts.`,
    );
  }
  requiredArtifacts.push(
    join(desktopOutput, appImages[0]),
    join(desktopOutput, debs[0]),
  );
}

async function verifyChecksum(checksumPath) {
  const checksumText = (await readFile(checksumPath, "utf8")).trim();
  const match = /^([a-f\d]{64})\s{2}(.+)$/iu.exec(checksumText);
  if (!match) {
    throw new Error(`Invalid checksum file: ${checksumPath}`);
  }
  const artifactPath = checksumPath.slice(0, -".sha256".length);
  if (match[2] !== artifactPath.split(/[\\/]/u).at(-1)) {
    throw new Error(`Checksum filename does not match ${artifactPath}.`);
  }
  const actual = createHash("sha256")
    .update(await readFile(artifactPath))
    .digest("hex");
  if (actual !== match[1].toLowerCase()) {
    throw new Error(`Checksum mismatch for ${artifactPath}.`);
  }
}

async function listRelativeFiles(directory, prefix = "") {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listRelativeFiles(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    } else {
      throw new Error(`Unsupported release entry: ${absolutePath}`);
    }
  }
  return files;
}

async function verifyContentManifest(directory) {
  const manifestPath = join(directory, "CONTENTS.sha256");
  const manifestLines = (await readFile(manifestPath, "utf8"))
    .trim()
    .split(/\r?\n/u)
    .filter(Boolean);
  const expected = new Map();
  for (const line of manifestLines) {
    const match = /^([a-f\d]{64})\s{2}(.+)$/iu.exec(line);
    if (
      !match ||
      match[2] === "CONTENTS.sha256" ||
      match[2].startsWith("/") ||
      match[2].includes("..") ||
      match[2].includes("\\")
    ) {
      throw new Error(`Invalid content manifest line in ${manifestPath}.`);
    }
    expected.set(match[2], match[1].toLowerCase());
  }
  const actualFiles = (await listRelativeFiles(directory)).filter(
    ({ relativePath }) => relativePath !== "CONTENTS.sha256",
  );
  if (actualFiles.length !== expected.size) {
    throw new Error(`Content manifest entry count mismatch in ${directory}.`);
  }
  for (const file of actualFiles) {
    const expectedHash = expected.get(file.relativePath);
    const actualHash = createHash("sha256")
      .update(await readFile(file.absolutePath))
      .digest("hex");
    if (actualHash !== expectedHash) {
      throw new Error(
        `Content manifest mismatch: ${join(directory, file.relativePath)}`,
      );
    }
  }
}

function loadAsarListPackage() {
  const companionRequire = createRequire(
    join(root, "packages", "companion", "package.json"),
  );
  const electronBuilderRequire = createRequire(
    companionRequire.resolve("electron-builder/package.json"),
  );
  const appBuilderRequire = createRequire(
    electronBuilderRequire.resolve("app-builder-lib/package.json"),
  );
  return appBuilderRequire("@electron/asar").listPackage;
}

async function verifyDesktopVendorBoundary(directory) {
  const forbidden = (path) => {
    const normalized = path.replace(/\\/gu, "/").toLowerCase();
    return (
      normalized.includes("/node_modules/node-notifier/vendor/") ||
      normalized.includes("/mac.noindex/") ||
      normalized.includes("snoretoast-x86") ||
      /(^|\/)notifu[^/]*$/u.test(normalized)
    );
  };
  const diskEntries = (await listRelativeFiles(directory)).map(
    ({ relativePath }) => `/${relativePath}`,
  );
  const asarPath = join(directory, "resources", "app.asar");
  const asarEntries = loadAsarListPackage()(asarPath, { isPack: false });
  const rejected = [...diskEntries, ...asarEntries].filter(forbidden);
  if (rejected.length > 0) {
    throw new Error(
      `Windows desktop package contains unreviewed notifier vendor assets: ${rejected.slice(0, 5).join(", ")}`,
    );
  }
}

let verificationTemp;
try {
  if (platform === "windows") {
    verificationTemp = await mkdtemp(
      join(tmpdir(), "crewlight-release-verify-"),
    );
    const portableName = `${standaloneName}-desktop`;
    const archivePath = join(releaseRoot, `${portableName}.zip`);
    execFileSync(
      windowsPowerShell,
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:CREWLIGHT_VERIFY_ARCHIVE -DestinationPath $env:CREWLIGHT_VERIFY_DESTINATION -Force",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CREWLIGHT_VERIFY_ARCHIVE: archivePath,
          CREWLIGHT_VERIFY_DESTINATION: verificationTemp,
        },
        stdio: "inherit",
      },
    );
    const archiveRoots = await readdir(verificationTemp, {
      withFileTypes: true,
    });
    if (
      archiveRoots.length !== 1 ||
      !archiveRoots[0].isDirectory() ||
      archiveRoots[0].name !== portableName
    ) {
      throw new Error(
        "Windows portable archive must contain exactly its named desktop directory.",
      );
    }
    const extractedDesktopRoot = join(verificationTemp, portableName);
    contentManifestRoots.push(
      join(extractedDesktopRoot, "resources", "crewlight-cli"),
    );
    windowsDesktopRoots.push(extractedDesktopRoot);
  }

  for (const artifact of requiredArtifacts) {
    const artifactStat = await stat(artifact);
    if (artifactStat.size === 0) {
      throw new Error(`Release artifact is empty: ${artifact}`);
    }
  }
  for (const artifact of requiredArtifacts.filter(
    (path) => path.endsWith(".sha256") && !path.endsWith("CONTENTS.sha256"),
  )) {
    await verifyChecksum(artifact);
  }
  const baselineManifest = await readFile(
    join(contentManifestRoots[0], "CONTENTS.sha256"),
  );
  for (const directory of contentManifestRoots) {
    await verifyContentManifest(directory);
    const manifest = await readFile(join(directory, "CONTENTS.sha256"));
    if (!manifest.equals(baselineManifest)) {
      throw new Error(`CLI content manifest differs in ${directory}.`);
    }
  }

  if (platform === "windows") {
    const helperPaths = requiredArtifacts.filter((path) =>
      path.endsWith("snoretoast-x64.exe"),
    );
    for (const helperPath of helperPaths) {
      const hash = createHash("sha256")
        .update(await readFile(helperPath))
        .digest("hex");
      if (hash !== WINDOWS_TOASTER_SHA256) {
        throw new Error(
          `Windows notification helper integrity check failed: ${helperPath}`,
        );
      }
    }
    for (const directory of windowsDesktopRoots) {
      await verifyDesktopVendorBoundary(directory);
    }
  }

  console.log(
    `\nCrewlight ${version} release artifacts verified for ${target}:`,
  );
  for (const artifact of requiredArtifacts) {
    console.log(`- ${relative(root, artifact)}`);
  }
  console.log(
    "Desktop GUI launch, installer interaction, native notifications, signing, and notarization remain manual release gates.",
  );
} finally {
  if (verificationTemp) {
    await rm(verificationTemp, { force: true, recursive: true });
  }
}
