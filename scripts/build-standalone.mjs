import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join, resolve, win32 } from "node:path";
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
const windowsSystemRoot = process.env.SystemRoot ?? "C:\\Windows";
const windowsWhere = win32.join(windowsSystemRoot, "System32", "where.exe");
const windowsPowerShell = win32.join(
  windowsSystemRoot,
  "System32",
  "WindowsPowerShell",
  "v1.0",
  "powershell.exe",
);

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
const resourcesDirectory = join(stagingDirectory, "resources");
const licensesDirectory = join(resourcesDirectory, "licenses");
const archiveExtension = platform === "win32" ? ".zip" : ".tar.gz";
const archivePath = join(
  releaseDirectory,
  `${artifactName}${archiveExtension}`,
);
const checksumPath = `${archivePath}.sha256`;

function readBuildMetadata(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    return undefined;
  }
  if (value.length > 160 || /[\0\r\n]/u.test(value)) {
    throw new Error(`${name} must be a single line of at most 160 characters.`);
  }
  return value;
}

function locateWindowsExecutable(name) {
  const located = spawnSync(windowsWhere, [name], {
    cwd: dirname(process.execPath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  if (located.status !== 0 || typeof located.stdout !== "string") {
    return undefined;
  }
  return located.stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .find((line) => win32.isAbsolute(line));
}

function gitOutput(args) {
  const command =
    platform === "win32" ? locateWindowsExecutable("git.exe") : "git";
  if (!command) {
    return undefined;
  }
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  return result.status === 0 && typeof result.stdout === "string"
    ? result.stdout.trim()
    : undefined;
}

const commit =
  readBuildMetadata("GITHUB_SHA") ??
  gitOutput(["rev-parse", "HEAD"]) ??
  "unavailable";
const requestedSourceState = readBuildMetadata("CREWLIGHT_BUILD_STATE");
const gitStatus =
  requestedSourceState === undefined
    ? gitOutput(["status", "--porcelain", "--untracked-files=normal"])
    : undefined;
const sourceState =
  requestedSourceState ??
  (gitStatus === undefined
    ? "source state unavailable"
    : gitStatus
      ? "dirty local worktree (not for public release)"
      : "clean local worktree");

const WINDOWS_TOASTER_SHA256 =
  "42d20792498514562cfd6fd8221b4abb59229e893073fc59fbfc83f884a2401b";

function safeNoticeName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/gu, "-");
}

async function findThirdPartyPackage(inputPath) {
  let directory = dirname(resolve(root, inputPath));
  while (directory.startsWith(root)) {
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8"),
      );
      if (
        typeof manifest.name === "string" &&
        typeof manifest.version === "string" &&
        !manifest.name.startsWith("@crewlight/")
      ) {
        return { directory, manifest };
      }
    } catch {
      // Keep walking toward the dependency package root.
    }
    const parent = dirname(directory);
    if (parent === directory) {
      break;
    }
    directory = parent;
  }
  return undefined;
}

async function writeThirdPartyNotices(bundleInputs, extraNotices = []) {
  const packages = new Map();
  for (const inputPath of Object.keys(bundleInputs)) {
    if (!inputPath.includes("node_modules")) {
      continue;
    }
    const dependency = await findThirdPartyPackage(inputPath);
    if (!dependency) {
      throw new Error(
        `Unable to identify the third-party package for bundle input ${inputPath}.`,
      );
    }
    packages.set(
      `${dependency.manifest.name}@${dependency.manifest.version}`,
      dependency,
    );
  }

  await mkdir(licensesDirectory, { recursive: true });
  const notices = [
    "Crewlight third-party notices",
    "",
    "The following third-party packages are included in the standalone runtime bundle.",
    "Their license texts are provided in resources/licenses.",
    "",
  ];
  for (const [key, dependency] of [...packages.entries()].sort(
    ([left], [right]) => left.localeCompare(right),
  )) {
    const entries = await readdir(dependency.directory);
    const licenseName = entries
      .filter((entry) => /^(license|copying)(\..*)?$/iu.test(entry))
      .sort((left, right) => {
        const leftExact = /^(license|copying)$/iu.test(left) ? 0 : 1;
        const rightExact = /^(license|copying)$/iu.test(right) ? 0 : 1;
        return leftExact - rightExact || left.localeCompare(right);
      })[0];
    let licenseText;
    let copiedLicenseName = licenseName;
    if (licenseName) {
      licenseText = await readFile(
        join(dependency.directory, licenseName),
        "utf8",
      );
    } else if (key === "growly@1.3.0") {
      const readme = await readFile(
        join(dependency.directory, "README.md"),
        "utf8",
      );
      const marker = "## License ##";
      const markerIndex = readme.indexOf(marker);
      if (markerIndex === -1) {
        throw new Error(
          "The reviewed growly@1.3.0 README license section is missing.",
        );
      }
      licenseText = readme.slice(markerIndex + marker.length).trim();
      copiedLicenseName = "README-License";
    } else {
      throw new Error(`No license file was found for bundled package ${key}.`);
    }
    const licenseFile = `${safeNoticeName(key)}-${safeNoticeName(copiedLicenseName)}.txt`;
    await writeFile(
      join(licensesDirectory, licenseFile),
      `${licenseText.trim()}\n`,
    );
    const repository =
      typeof dependency.manifest.repository === "string"
        ? dependency.manifest.repository
        : dependency.manifest.repository?.url;
    notices.push(
      `${key}`,
      `License: ${String(dependency.manifest.license ?? "see copied license")}`,
      `License file: resources/licenses/${licenseFile}`,
      ...(typeof repository === "string"
        ? [`Source: ${repository.replace(/^git\+/u, "")}`]
        : []),
      "",
    );
  }
  for (const notice of extraNotices) {
    notices.push(...notice, "");
  }
  await writeFile(
    join(resourcesDirectory, "THIRD-PARTY-NOTICES.txt"),
    `${notices.join("\n")}\n`,
  );
}

async function listFilesRecursively(directory, prefix = "") {
  const files = [];
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    const absolutePath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listFilesRecursively(absolutePath, relativePath)));
    } else if (entry.isFile()) {
      files.push({ absolutePath, relativePath });
    } else {
      throw new Error(
        `Standalone staging contains an unsupported filesystem entry: ${absolutePath}`,
      );
    }
  }
  return files;
}

async function writeContentManifest() {
  const files = (await listFilesRecursively(stagingDirectory))
    .filter(({ relativePath }) => relativePath !== "CONTENTS.sha256")
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath));
  const lines = [];
  for (const file of files) {
    const hash = createHash("sha256")
      .update(await readFile(file.absolutePath))
      .digest("hex");
    lines.push(`${hash}  ${file.relativePath}`);
  }
  await writeFile(
    join(stagingDirectory, "CONTENTS.sha256"),
    `${lines.join("\n")}\n`,
  );
}

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

const bundleResult = await build({
  bundle: true,
  entryPoints: [join(root, "packages/cli/dist/standalone.js")],
  format: "cjs",
  legalComments: "none",
  logLevel: "info",
  outfile: bundlePath,
  platform: "node",
  sourcemap: false,
  target: "node22",
  metafile: true,
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
  const located = spawnSync(windowsWhere, ["signtool.exe"], {
    cwd: dirname(process.execPath),
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    windowsHide: true,
  });
  if (located.status === 0) {
    const signtoolPath = located.stdout
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find(Boolean);
    const removed =
      signtoolPath && win32.isAbsolute(signtoolPath)
        ? spawnSync(signtoolPath, ["remove", "/s", binaryPath], {
            encoding: "utf8",
            stdio: "inherit",
            windowsHide: true,
          })
        : { status: 1 };
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

await copyFile(join(root, "LICENSE"), join(stagingDirectory, "LICENSE"));
await mkdir(licensesDirectory, { recursive: true });
const nodeLicenseSource = join(dirname(process.execPath), "LICENSE");
try {
  await copyFile(
    nodeLicenseSource,
    join(licensesDirectory, "Node.js-22-LICENSE.txt"),
  );
} catch {
  throw new Error(
    `The Node ${process.version} runtime license was not found beside ${process.execPath}; refusing to package an incomplete runtime.`,
  );
}
const extraNotices = [
  [
    `Node.js@${process.version} (embedded SEA runtime)`,
    "License and bundled third-party notices: resources/licenses/Node.js-22-LICENSE.txt",
    "Source: https://github.com/nodejs/node",
  ],
];
if (platform === "win32") {
  const requireFromNotifier = createRequire(
    join(root, "packages", "notifier", "package.json"),
  );
  const nodeNotifierRoot = dirname(
    requireFromNotifier.resolve("node-notifier/package.json"),
  );
  const nodeNotifierManifest = JSON.parse(
    await readFile(join(nodeNotifierRoot, "package.json"), "utf8"),
  );
  if (nodeNotifierManifest.version !== "10.0.1") {
    throw new Error(
      `The Windows notification helper allowlist requires node-notifier 10.0.1, received ${String(nodeNotifierManifest.version)}.`,
    );
  }
  const snoreToastRoot = join(nodeNotifierRoot, "vendor", "snoreToast");
  const snoreToastBinary = join(snoreToastRoot, "snoretoast-x64.exe");
  const snoreToastBytes = await readFile(snoreToastBinary);
  const snoreToastHash = createHash("sha256")
    .update(snoreToastBytes)
    .digest("hex");
  if (snoreToastHash !== WINDOWS_TOASTER_SHA256) {
    throw new Error(
      `Unexpected SnoreToast x64 SHA-256: ${snoreToastHash}. Refusing to package an unreviewed helper.`,
    );
  }
  execFileSync(
    windowsPowerShell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      "$signature = Get-AuthenticodeSignature -LiteralPath $env:CREWLIGHT_TOASTER_SOURCE; if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notlike '*K Desktop Environment*') { throw 'SnoreToast Authenticode validation failed.' }",
    ],
    {
      cwd: root,
      env: {
        ...process.env,
        CREWLIGHT_TOASTER_SOURCE: snoreToastBinary,
      },
      stdio: "inherit",
    },
  );
  await mkdir(licensesDirectory, { recursive: true });
  await copyFile(
    snoreToastBinary,
    join(resourcesDirectory, "snoretoast-x64.exe"),
  );
  await copyFile(
    join(snoreToastRoot, "LICENSE"),
    join(licensesDirectory, "SnoreToast-0.7.0-LGPL-3.0.txt"),
  );
  await writeFile(
    join(licensesDirectory, "SnoreToast-0.7.0-SOURCE.txt"),
    [
      "SnoreToast 0.7.0 source and corresponding-source information",
      "",
      "Upstream project: https://github.com/KDE/snoretoast",
      "Release tag: https://github.com/KDE/snoretoast/releases/tag/v0.7.0",
      "Source archive: https://github.com/KDE/snoretoast/archive/refs/tags/v0.7.0.tar.gz",
      `Packaged x64 helper SHA-256: ${WINDOWS_TOASTER_SHA256}`,
      "",
    ].join("\n"),
  );
  extraNotices.push([
    "SnoreToast@0.7.0 (Windows x64 notification helper)",
    "License: LGPL-3.0",
    "License file: resources/licenses/SnoreToast-0.7.0-LGPL-3.0.txt",
    "Source information: resources/licenses/SnoreToast-0.7.0-SOURCE.txt",
    `Packaged helper SHA-256: ${WINDOWS_TOASTER_SHA256}`,
  ]);
}
await writeThirdPartyNotices(bundleResult.metafile.inputs, extraNotices);
await writeFile(
  join(stagingDirectory, "BUILD-INFO.txt"),
  [
    `Crewlight version: ${version}`,
    `Node version: ${process.version}`,
    `Platform: ${targetPlatform}`,
    `Architecture: ${architecture}`,
    `Commit: ${commit}`,
    `Source state: ${sourceState}`,
    "",
  ].join("\n"),
);
await writeContentManifest();

if (platform === "win32") {
  execFileSync(
    windowsPowerShell,
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
