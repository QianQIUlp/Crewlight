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

if (process.platform !== "win32") {
  throw new Error(
    "Desktop packaging is currently supported only on Windows. Use the Windows CI job or a local Windows workstation.",
  );
}

if (mode !== "portable" && mode !== "installer") {
  throw new Error(
    "Usage: node scripts/package-desktop.mjs <portable|installer>",
  );
}

const portableFolderName = `crewlight-v${version}-windows-x64-desktop`;
const portableFolder = join(releaseRoot, portableFolderName);
const portableArchive = join(releaseRoot, `${portableFolderName}.zip`);
const standaloneFolder = join(releaseRoot, `crewlight-v${version}-windows-x64`);
const standaloneBinary = join(standaloneFolder, "crewlight.exe");
const builderOutput = join(releaseRoot, "desktop-builder");
const unpackedDirectory = join(builderOutput, "win-unpacked");
const desktopResources = join(companionRoot, ".desktop-resources");
const installerArtifact = join(
  builderOutput,
  `Crewlight-Setup-v${version}.exe`,
);

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

await rm(desktopResources, { force: true, recursive: true });
await mkdir(desktopResources, { recursive: true });

runPnpm(["build:standalone"]);

await cp(standaloneBinary, join(desktopResources, "crewlight.exe"));

if (mode === "portable") {
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
} else {
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
}
