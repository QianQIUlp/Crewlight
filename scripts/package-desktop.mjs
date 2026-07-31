import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import {
  copyFile,
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rm,
  rmdir,
  writeFile,
} from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  sep,
  win32,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const companionRoot = join(root, "packages", "companion");
const releaseRoot = join(root, "release");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version;
const mode = process.argv[2];
const windowsSystemRoot = process.env.SystemRoot ?? "C:\\Windows";
const windowsPowerShell = win32.join(
  windowsSystemRoot,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);
const windowsPowerShellDirectory = dirname(windowsPowerShell);

const allowedModes = ["portable", "installer", "windows", "dmg", "linux"];
if (!allowedModes.includes(mode)) {
  throw new Error(
    `Usage: node scripts/package-desktop.mjs <${allowedModes.join("|")}>`,
  );
}

const platform = process.platform;
const arch = process.arch;

// Check compatibility of target mode with host platform
if (mode === "dmg" && platform !== "darwin") {
  throw new Error("dmg mode is only supported on macOS.");
}
if (mode === "linux" && platform !== "linux") {
  throw new Error("linux mode is only supported on Linux.");
}
if (
  (mode === "portable" || mode === "installer" || mode === "windows") &&
  platform !== "win32"
) {
  throw new Error(
    "portable/installer/windows modes are only supported on Windows.",
  );
}

const targetPlatform =
  platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux";
if (arch !== "x64" && arch !== "arm64") {
  throw new Error(
    `Desktop packages require an x64 or arm64 Node runtime; received ${arch}.`,
  );
}
const targetArch = arch;
if (platform === "win32" && targetArch !== "x64") {
  throw new Error(
    `Windows desktop packages are currently defined only for x64; received ${targetArch}.`,
  );
}

const standaloneFolderName = `crewlight-v${version}-${targetPlatform}-${targetArch}`;
const standaloneFolder = join(releaseRoot, standaloneFolderName);
const binaryName = platform === "win32" ? "crewlight.exe" : "crewlight";
const standaloneBinary = join(standaloneFolder, binaryName);
const builderOutput = join(releaseRoot, "desktop-builder");
const desktopAppStage = join(releaseRoot, "desktop-app-stage");
const desktopResources = join(companionRoot, ".desktop-resources");
const legacyDeployShadowRoot = join(companionRoot, "release");
const legacyDeployShadow = join(
  legacyDeployShadowRoot,
  basename(desktopAppStage),
);
const requireFromCompanion = createRequire(join(companionRoot, "package.json"));
const electronBuilderCli = requireFromCompanion.resolve(
  "electron-builder/cli.js",
);
const electronPackageJsonPath = requireFromCompanion.resolve(
  "electron/package.json",
);
const electronPackageRoot = dirname(electronPackageJsonPath);

function commandEnvironment(overrides) {
  const environment = { ...process.env, ...(overrides ?? {}) };
  if (platform !== "win32") {
    return environment;
  }

  const entries = Object.entries(environment).filter(
    (entry) => entry[1] !== undefined,
  );
  entries.sort(([left], [right]) => {
    const leftUppercase = left === left.toUpperCase();
    const rightUppercase = right === right.toUpperCase();
    return Number(leftUppercase) - Number(rightUppercase);
  });
  const normalized = Object.fromEntries(
    entries.map(([key, value]) => [key.toUpperCase(), value]),
  );
  const pathEntries = (normalized.PATH ?? "").split(";").filter(Boolean);
  if (
    !pathEntries.some(
      (entry) =>
        entry.toLowerCase() === windowsPowerShellDirectory.toLowerCase(),
    )
  ) {
    pathEntries.unshift(windowsPowerShellDirectory);
  }
  normalized.PATH = pathEntries.join(";");
  return normalized;
}

function run(command, args, cwd = root, env) {
  execFileSync(command, args, {
    cwd,
    env: commandEnvironment(env),
    stdio: "inherit",
    windowsHide: true,
  });
}

function runPnpm(args, cwd = root, env) {
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli || !isAbsolute(pnpmCli)) {
    throw new Error(
      "Desktop packaging must be started through the pinned pnpm package script.",
    );
  }
  run(process.execPath, [pnpmCli, ...args], cwd, env);
}

async function writeChecksum(artifactPath) {
  const checksum = createHash("sha256")
    .update(await readFile(artifactPath))
    .digest("hex");
  const checksumPath = `${artifactPath}.sha256`;
  await writeFile(checksumPath, `${checksum}  ${basename(artifactPath)}\n`);
  console.log(`Checksum: ${checksumPath}`);
}

async function assertSelfContainedStage(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const entryPath = join(directory, entry.name);
    const info = await lstat(entryPath);
    if (info.isSymbolicLink()) {
      const resolved = await realpath(entryPath);
      const relativeTarget = relative(desktopAppStage, resolved);
      if (
        isAbsolute(relativeTarget) ||
        relativeTarget === ".." ||
        relativeTarget.startsWith(`..${sep}`)
      ) {
        throw new Error(
          `Desktop staging link escapes its self-contained root: ${entryPath}`,
        );
      }
      continue;
    }
    if (info.isDirectory()) {
      await assertSelfContainedStage(entryPath);
    }
  }
}

async function removeLegacyDeployShadow() {
  await rm(legacyDeployShadow, { force: true, recursive: true });
  try {
    await rmdir(legacyDeployShadowRoot);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !("code" in error) ||
      (error.code !== "ENOENT" && error.code !== "ENOTEMPTY")
    ) {
      throw error;
    }
  }
}

async function assertStageRuntimeResolution() {
  const requireFromStage = createRequire(join(desktopAppStage, "package.json"));
  for (const packageName of [
    "@crewlight/cli",
    "@crewlight/daemon",
    "@crewlight/notifier",
    "@crewlight/shared",
    "ssh2",
  ]) {
    const resolved = await realpath(requireFromStage.resolve(packageName));
    const relativeTarget = relative(desktopAppStage, resolved);
    if (
      isAbsolute(relativeTarget) ||
      relativeTarget === ".." ||
      relativeTarget.startsWith(`..${sep}`)
    ) {
      throw new Error(
        `Desktop runtime dependency resolves outside staging: ${packageName}`,
      );
    }
  }
}

async function stageVerifiedElectronDistribution() {
  const electronPackage = JSON.parse(
    await readFile(electronPackageJsonPath, "utf8"),
  );
  const electronVersion = electronPackage.version;
  if (typeof electronVersion !== "string" || electronVersion.length === 0) {
    throw new Error("The installed Electron package has no valid version.");
  }

  const electronArchiveName = `electron-v${electronVersion}-${platform}-${targetArch}.zip`;
  const electronChecksums = JSON.parse(
    await readFile(join(electronPackageRoot, "checksums.json"), "utf8"),
  );
  const electronChecksum = electronChecksums[electronArchiveName];
  if (
    typeof electronChecksum !== "string" ||
    !/^[a-f0-9]{64}$/u.test(electronChecksum)
  ) {
    throw new Error(
      `The installed Electron package has no trusted checksum for ${electronArchiveName}.`,
    );
  }

  const requireFromElectron = createRequire(electronPackageJsonPath);
  const electronGetEntry = requireFromElectron.resolve("@electron/get");
  const { downloadArtifact } = await import(
    pathToFileURL(electronGetEntry).href
  );
  const configuredCacheRoot =
    process.env.electron_config_cache?.trim() ||
    process.env.ELECTRON_CACHE?.trim();
  const electronArchive = await downloadArtifact({
    version: electronVersion,
    artifactName: "electron",
    platform,
    arch: targetArch,
    checksums: {
      [electronArchiveName]: electronChecksum,
    },
    ...(configuredCacheRoot
      ? {
          cacheRoot: configuredCacheRoot,
        }
      : {}),
  });

  const stagedElectronDist = join(desktopAppStage, ".electron-dist");
  await mkdir(stagedElectronDist, { recursive: true });
  await copyFile(
    electronArchive,
    join(stagedElectronDist, electronArchiveName),
  );

  const stagedBuilderConfigPath = join(
    desktopAppStage,
    "electron-builder.json",
  );
  const stagedBuilderConfig = JSON.parse(
    await readFile(stagedBuilderConfigPath, "utf8"),
  );
  stagedBuilderConfig.electronDist = ".electron-dist";
  await writeFile(
    stagedBuilderConfigPath,
    `${JSON.stringify(stagedBuilderConfig, null, 2)}\n`,
  );

  console.log(
    `Electron distribution: ${electronArchiveName} (${electronChecksum})`,
  );
}

// Clean target-specific generated state so stale artifacts cannot satisfy checks.
await Promise.all([
  rm(desktopResources, { force: true, recursive: true }),
  rm(desktopAppStage, { force: true, recursive: true }),
  rm(legacyDeployShadow, { force: true, recursive: true }),
  rm(builderOutput, { force: true, recursive: true }),
]);
await Promise.all([
  mkdir(desktopResources, { recursive: true }),
  mkdir(builderOutput, { recursive: true }),
]);

// Build standalone binary first
runPnpm(["build:standalone"]);
run(process.execPath, [
  join(root, "scripts", "clean-build-output.mjs"),
  "--metadata-only",
]);

// Keep the standalone runtime and its reviewed support tree together. The
// packaged CLI resolves resources relative to its own executable directory.
await Promise.all([
  copyFile(standaloneBinary, join(desktopResources, binaryName)),
  copyFile(
    join(standaloneFolder, "LICENSE"),
    join(desktopResources, "LICENSE"),
  ),
  copyFile(
    join(standaloneFolder, "BUILD-INFO.txt"),
    join(desktopResources, "BUILD-INFO.txt"),
  ),
  copyFile(
    join(standaloneFolder, "CONTENTS.sha256"),
    join(desktopResources, "CONTENTS.sha256"),
  ),
  cp(join(standaloneFolder, "resources"), join(desktopResources, "resources"), {
    recursive: true,
  }),
]);

// electron-builder rejects pnpm workspace links whose real targets live
// outside its application directory. Deploy a production-only, self-contained
// package first so every runtime dependency resolves inside the staging root.
runPnpm([
  "--offline",
  "--filter",
  "@crewlight/companion",
  "deploy",
  "--prod",
  "--legacy",
  "--no-hoist",
  desktopAppStage,
]);
await removeLegacyDeployShadow();
await rm(join(desktopAppStage, ".desktop-resources"), {
  force: true,
  recursive: true,
});
await cp(desktopResources, join(desktopAppStage, ".desktop-resources"), {
  recursive: true,
});
await stageVerifiedElectronDistribution();
await assertSelfContainedStage(desktopAppStage);
await assertStageRuntimeResolution();

if (mode === "portable" || mode === "windows") {
  const portableFolderName = `crewlight-v${version}-windows-x64-desktop`;
  const portableFolder = join(releaseRoot, portableFolderName);
  const portableArchive = join(releaseRoot, `${portableFolderName}.zip`);
  const unpackedDirectory = join(builderOutput, "win-unpacked");

  run(
    process.execPath,
    [
      electronBuilderCli,
      "--projectDir",
      desktopAppStage,
      "--config",
      join(desktopAppStage, "electron-builder.json"),
      "--win",
      "dir",
      "--x64",
      "--publish",
      "never",
    ],
    desktopAppStage,
  );

  await rm(portableFolder, { force: true, recursive: true });
  await cp(unpackedDirectory, portableFolder, { recursive: true });

  run(
    windowsPowerShell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Compress-Archive -Path $env:CREWLIGHT_STAGING -DestinationPath $env:CREWLIGHT_ARCHIVE -CompressionLevel Optimal -Force",
    ],
    root,
    {
      CREWLIGHT_ARCHIVE: portableArchive,
      CREWLIGHT_STAGING: portableFolder,
    },
  );
  await writeChecksum(portableArchive);
  console.log(`Archive: ${portableArchive}`);
}

if (mode === "installer" || mode === "windows") {
  const installerArtifact = join(
    builderOutput,
    `Crewlight-Setup-v${version}.exe`,
  );
  run(
    process.execPath,
    [
      electronBuilderCli,
      "--projectDir",
      desktopAppStage,
      "--config",
      join(desktopAppStage, "electron-builder.json"),
      "--win",
      "nsis",
      "--x64",
      "--publish",
      "never",
    ],
    desktopAppStage,
  );
  await writeChecksum(installerArtifact);
  console.log(`Installer: ${installerArtifact}`);
}

if (mode === "dmg") {
  const dmgTargetArch = targetArch;
  const dmgArtifact = join(
    builderOutput,
    `Crewlight-${version}-${dmgTargetArch}.dmg`,
  );
  run(
    process.execPath,
    [
      electronBuilderCli,
      "--projectDir",
      desktopAppStage,
      "--config",
      join(desktopAppStage, "electron-builder.json"),
      "--mac",
      "dmg",
      `--${dmgTargetArch}`,
      "--publish",
      "never",
    ],
    desktopAppStage,
  );
  console.log(`macOS DMG: ${dmgArtifact}`);
}

if (mode === "linux") {
  const linuxTargetArch = targetArch;
  run(
    process.execPath,
    [
      electronBuilderCli,
      "--projectDir",
      desktopAppStage,
      "--config",
      join(desktopAppStage, "electron-builder.json"),
      "--linux",
      "AppImage",
      "deb",
      `--${linuxTargetArch}`,
      "--publish",
      "never",
    ],
    desktopAppStage,
  );
  console.log("Linux AppImage and deb packages generated.");
}

await rm(desktopAppStage, { force: true, recursive: true });
