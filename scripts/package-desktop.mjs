import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const companionRoot = join(root, "packages", "companion");
const releaseRoot = join(root, "release");
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version;
const mode = process.argv[2];

const allowedModes = ["portable", "installer", "dmg", "linux"];
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
if ((mode === "portable" || mode === "installer") && platform !== "win32") {
  throw new Error("portable/installer modes are only supported on Windows.");
}

const targetPlatform =
  platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux";
const targetArch = arch === "arm64" ? "arm64" : "x64";

const standaloneFolderName = `crewlight-v${version}-${targetPlatform}-${targetArch}`;
const standaloneFolder = join(releaseRoot, standaloneFolderName);
const binaryName = platform === "win32" ? "crewlight.exe" : "crewlight";
const standaloneBinary = join(standaloneFolder, binaryName);
const builderOutput = join(releaseRoot, "desktop-builder");
const desktopResources = join(companionRoot, ".desktop-resources");

function run(command, args, cwd = root, env) {
  execFileSync(command, args, {
    cwd,
    env: env ? { ...process.env, ...env } : process.env,
    stdio: "inherit",
  });
}

function runPnpm(args, cwd = root, env) {
  if (process.platform === "win32") {
    run("cmd.exe", ["/d", "/s", "/c", "pnpm", ...args], cwd, env);
    return;
  }
  run("pnpm", args, cwd, env);
}

// Clean and recreate resources folder
await rm(desktopResources, { force: true, recursive: true });
await mkdir(desktopResources, { recursive: true });

// Build standalone binary first
runPnpm(["build:standalone"]);

// Copy the standalone binary to extra resources
await cp(standaloneBinary, join(desktopResources, binaryName));

if (mode === "portable") {
  const portableFolderName = `crewlight-v${version}-windows-x64-desktop`;
  const portableFolder = join(releaseRoot, portableFolderName);
  const portableArchive = join(releaseRoot, `${portableFolderName}.zip`);
  const unpackedDirectory = join(builderOutput, "win-unpacked");

  runPnpm(
    [
      "--filter",
      "@crewlight/companion",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.json",
      "--win",
      "dir",
      "--x64",
    ],
    companionRoot,
  );

  await rm(portableFolder, { force: true, recursive: true });
  await cp(unpackedDirectory, portableFolder, { recursive: true });

  run(
    "powershell.exe",
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
  console.log(`Archive: ${portableArchive}`);
} else if (mode === "installer") {
  const installerArtifact = join(
    builderOutput,
    `Crewlight-Setup-v${version}.exe`,
  );
  runPnpm(
    [
      "--filter",
      "@crewlight/companion",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.json",
      "--win",
      "nsis",
      "--x64",
    ],
    companionRoot,
  );
  console.log(`Installer: ${installerArtifact}`);
} else if (mode === "dmg") {
  const dmgTargetArch = arch === "arm64" ? "arm64" : "x64";
  const dmgArtifact = join(
    builderOutput,
    `Crewlight-${version}-${dmgTargetArch}.dmg`,
  );
  runPnpm(
    [
      "--filter",
      "@crewlight/companion",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.json",
      "--mac",
      "dmg",
      `--${dmgTargetArch}`,
    ],
    companionRoot,
  );
  console.log(`macOS DMG: ${dmgArtifact}`);
} else if (mode === "linux") {
  const linuxTargetArch = arch === "arm64" ? "arm64" : "x64";
  runPnpm(
    [
      "--filter",
      "@crewlight/companion",
      "exec",
      "electron-builder",
      "--config",
      "electron-builder.json",
      "--linux",
      "AppImage",
      "deb",
      `--${linuxTargetArch}`,
    ],
    companionRoot,
  );
  console.log("Linux AppImage and deb packages generated.");
}
