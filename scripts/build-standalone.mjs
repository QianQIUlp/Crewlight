import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";
import postject from "postject";

const { inject } = postject;
const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const version = packageJson.version;
const platform = process.platform;
const architecture = process.arch;
const nodeMajor = Number(process.versions.node.split(".")[0]);

const targetPlatform =
  platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux";
const targetArch = architecture === "arm64" ? "arm64" : "x64";

const verifiedTargets = [
  "linux-x64",
  "linux-arm64",
  "windows-x64",
  "macos-x64",
  "macos-arm64",
];
const currentTarget = `${targetPlatform}-${targetArch}`;

if (!verifiedTargets.includes(currentTarget)) {
  throw new Error(
    `Standalone release builds are verified only for ${verifiedTargets.join(", ")}, not ${platform}/${architecture}.`,
  );
}

if (nodeMajor !== 22) {
  throw new Error(
    `Standalone release builds require an available Node 22.x runtime; received ${process.version}.`,
  );
}

const artifactName = `crewlight-v${version}-${targetPlatform}-${targetArch}`;
const releaseDirectory = join(root, "release");
const stagingDirectory = join(releaseDirectory, artifactName);
const workDirectory = join(releaseDirectory, ".work");
const bundlePath = join(workDirectory, "crewlight.cjs");
const seaConfigPath = join(workDirectory, "sea-config.json");
const seaBlobPath = join(workDirectory, "crewlight.blob");
const binaryName = platform === "win32" ? "crewlight.exe" : "crewlight";
const binaryPath = join(stagingDirectory, binaryName);
const archiveExtension = platform === "win32" ? ".zip" : ".tar.gz";
const archivePath = join(
  releaseDirectory,
  `${artifactName}${archiveExtension}`,
);
const checksumPath = `${archivePath}.sha256`;
const commit =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();

console.log(`Building Crewlight ${version} standalone binary`);
console.log(`Node runtime: ${process.version}`);
console.log(`Target: ${platform}/${architecture}`);

await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(stagingDirectory, { recursive: true });
await mkdir(workDirectory, { recursive: true });

await build({
  bundle: true,
  entryPoints: [join(root, "packages/cli/dist/standalone.js")],
  format: "cjs",
  legalComments: "none",
  logLevel: "info",
  outfile: bundlePath,
  platform: "node",
  sourcemap: false,
  target: "node22",
});

await writeFile(
  seaConfigPath,
  `${JSON.stringify(
    {
      main: bundlePath,
      output: seaBlobPath,
      disableExperimentalSEAWarning: true,
      useCodeCache: false,
      useSnapshot: false,
    },
    null,
    2,
  )}\n`,
);

execFileSync(process.execPath, ["--experimental-sea-config", seaConfigPath], {
  cwd: root,
  stdio: "inherit",
});

await copyFile(process.execPath, binaryPath);

if (platform === "win32") {
  const located = spawnSync("where.exe", ["signtool.exe"], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (located.status === 0) {
    const removed = spawnSync("signtool.exe", ["remove", "/s", binaryPath], {
      encoding: "utf8",
      stdio: "inherit",
    });
    if (removed.status !== 0) {
      console.warn(
        "signtool could not remove the Node executable signature; continuing with the expected postject signature warning.",
      );
    }
  } else {
    console.warn(
      "signtool is unavailable; continuing with the expected postject signature warning.",
    );
  }
}

await inject(binaryPath, "NODE_SEA_BLOB", await readFile(seaBlobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});
if (platform !== "win32") {
  await chmod(binaryPath, 0o755);
}

await copyFile(join(root, "LICENSE"), join(stagingDirectory, "LICENSE"));
await writeFile(
  join(stagingDirectory, "BUILD-INFO.txt"),
  [
    `Crewlight version: ${version}`,
    `Node version: ${process.version}`,
    `Platform: ${targetPlatform}`,
    `Architecture: ${architecture}`,
    `Commit: ${commit}`,
    "",
  ].join("\n"),
);

if (platform === "win32") {
  execFileSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "Compress-Archive -Path (Join-Path $env:CREWLIGHT_STAGING '*') -DestinationPath $env:CREWLIGHT_ARCHIVE -CompressionLevel Optimal -Force",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        CREWLIGHT_ARCHIVE: archivePath,
        CREWLIGHT_STAGING: stagingDirectory,
      },
      stdio: "inherit",
    },
  );
} else {
  execFileSync(
    "tar",
    ["-czf", archivePath, "-C", releaseDirectory, artifactName],
    {
      cwd: root,
      stdio: "inherit",
    },
  );
}

const checksum = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(checksumPath, `${checksum}  ${basename(archivePath)}\n`);
await rm(workDirectory, { force: true, recursive: true });

console.log(`Archive: ${archivePath}`);
console.log(`Checksum: ${checksumPath}`);
console.log(`Build info: ${join(stagingDirectory, "BUILD-INFO.txt")}`);
