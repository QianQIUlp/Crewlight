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
const releasePolicy = JSON.parse(
  await readFile(join(root, "release-policy.json"), "utf8"),
);
const version = packageJson.version;
const platform = process.platform;
const architecture = process.arch;
const requiredNodeVersion = releasePolicy.supplyChain?.nodeVersion;

const targetPlatform =
  platform === "win32" ? "windows" : platform === "darwin" ? "macos" : "linux";
if (architecture !== "x64" && architecture !== "arm64") {
  throw new Error(
    `Standalone release builds require an x64 or arm64 Node runtime; received ${architecture}.`,
  );
}
const targetArch = architecture;

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

if (process.versions.node !== requiredNodeVersion) {
  throw new Error(
    `Standalone release builds require Node ${requiredNodeVersion}; received ${process.version}.`,
  );
}

const expectedNodeArchive =
  releasePolicy.supplyChain?.nodeArchives?.[currentTarget];
const verifiedNodeCache = join(
  root,
  "release",
  ".verified-node",
  currentTarget,
);
const verifiedNodeArchivePath =
  process.env.CREWLIGHT_NODE_ARCHIVE_PATH ??
  (expectedNodeArchive?.file
    ? join(verifiedNodeCache, expectedNodeArchive.file)
    : undefined);
const verifiedNodeLicensePath =
  process.env.CREWLIGHT_NODE_LICENSE_PATH ?? join(verifiedNodeCache, "LICENSE");
const verifiedNodeBinaryPath =
  process.env.CREWLIGHT_NODE_BINARY_PATH ??
  join(
    verifiedNodeCache,
    "extracted",
    expectedNodeArchive?.file?.endsWith("win-x64.zip")
      ? `node-v${requiredNodeVersion}-win-x64`
      : `node-v${requiredNodeVersion}-${
          targetPlatform === "macos" ? "darwin" : targetPlatform
        }-${targetArch}`,
    targetPlatform === "windows" ? "node.exe" : "bin/node",
  );
if (
  !expectedNodeArchive?.sha256 ||
  !verifiedNodeArchivePath ||
  !verifiedNodeLicensePath ||
  !verifiedNodeBinaryPath
) {
  throw new Error(
    "Standalone release builds require a verified Node archive, binary, and extracted LICENSE (CREWLIGHT_NODE_ARCHIVE_PATH, CREWLIGHT_NODE_BINARY_PATH, and CREWLIGHT_NODE_LICENSE_PATH).",
  );
}
const verifiedNodeArchiveHash = createHash("sha256")
  .update(await readFile(verifiedNodeArchivePath))
  .digest("hex");
if (verifiedNodeArchiveHash !== expectedNodeArchive.sha256) {
  throw new Error(
    `Verified Node archive hash mismatch for ${currentTarget}; expected ${expectedNodeArchive.sha256}.`,
  );
}
const verifiedNodeLicense = await readFile(verifiedNodeLicensePath, "utf8");
if (!verifiedNodeLicense.trim()) {
  throw new Error("The verified Node archive LICENSE is empty.");
}
const verifiedNodeVersion = execFileSync(
  verifiedNodeBinaryPath,
  ["--version"],
  {
    cwd: root,
    encoding: "utf8",
  },
).trim();
if (verifiedNodeVersion !== `v${requiredNodeVersion}`) {
  throw new Error(
    `Verified Node binary version mismatch; expected v${requiredNodeVersion}, received ${verifiedNodeVersion}.`,
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

await mkdir(releaseDirectory, { recursive: true });
await Promise.all([
  rm(stagingDirectory, { force: true, recursive: true }),
  rm(workDirectory, { force: true, recursive: true }),
  rm(archivePath, { force: true }),
  rm(checksumPath, { force: true }),
]);
await mkdir(stagingDirectory, { recursive: true });
await mkdir(workDirectory, { recursive: true });

await build({
  bundle: true,
  define: {
    CREWLIGHT_BUILD_VERSION: JSON.stringify(version),
  },
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

execFileSync(
  verifiedNodeBinaryPath,
  ["--experimental-sea-config", seaConfigPath],
  {
    cwd: root,
    stdio: "inherit",
  },
);

await copyFile(verifiedNodeBinaryPath, binaryPath);

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
  ...(platform === "darwin" ? { machoSegmentName: "NODE_SEA" } : {}),
});
if (platform === "darwin") {
  execFileSync("codesign", ["--sign", "-", binaryPath], {
    cwd: root,
    stdio: "inherit",
  });
  execFileSync("codesign", ["--verify", binaryPath], {
    cwd: root,
    stdio: "inherit",
  });
}
if (platform !== "win32") {
  await chmod(binaryPath, 0o755);
}

await copyFile(verifiedNodeLicensePath, join(stagingDirectory, "LICENSE"));
await copyFile(
  join(root, "LICENSE"),
  join(stagingDirectory, "CREWLIGHT-LICENSE"),
);
await writeFile(
  join(stagingDirectory, "BUILD-INFO.txt"),
  [
    `Crewlight version: ${version}`,
    `Node version: ${process.version}`,
    `Node archive: ${expectedNodeArchive.file}`,
    `Node archive SHA256: ${verifiedNodeArchiveHash}`,
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
