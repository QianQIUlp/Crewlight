import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const policy = JSON.parse(
  await readFile(join(root, "release-policy.json"), "utf8"),
);
const targetPlatform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : "linux";
const target = `${targetPlatform}-${process.arch}`;
const archive = policy.supplyChain?.nodeArchives?.[target];
if (!archive?.file || !archive.sha256) {
  throw new Error(`No pinned Node archive exists for ${target}.`);
}

const cache = join(root, "release", ".verified-node", target);
const archivePath = join(cache, archive.file);
const licensePath = join(cache, "LICENSE");
const extractedRoot = join(cache, "extracted");
const archiveRootPlatform =
  targetPlatform === "windows"
    ? "win"
    : targetPlatform === "macos"
      ? "darwin"
      : "linux";
const archiveRoot = `node-v${policy.supplyChain.nodeVersion}-${archiveRootPlatform}-${process.arch}`;
const binaryPath = join(
  extractedRoot,
  archiveRoot,
  process.platform === "win32" ? "node.exe" : "bin/node",
);
await mkdir(cache, { recursive: true });

let archiveBytes;
try {
  archiveBytes = await readFile(archivePath);
} catch {
  const url = `https://nodejs.org/dist/v${policy.supplyChain.nodeVersion}/${archive.file}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Could not download the pinned Node archive (${response.status}).`,
    );
  }
  archiveBytes = Buffer.from(await response.arrayBuffer());
  await writeFile(archivePath, archiveBytes, { flag: "wx" }).catch(
    async (error) => {
      if (error?.code !== "EEXIST") throw error;
      archiveBytes = await readFile(archivePath);
    },
  );
}

const actualHash = createHash("sha256").update(archiveBytes).digest("hex");
if (actualHash !== archive.sha256) {
  throw new Error(
    `Node archive hash mismatch for ${target}; expected ${archive.sha256}.`,
  );
}

let needsExtraction = false;
try {
  await readFile(licensePath);
  await stat(binaryPath);
} catch {
  needsExtraction = true;
}
if (needsExtraction) {
  if (process.platform === "win32") {
    execFileSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        `Expand-Archive -LiteralPath '${archivePath.replaceAll("'", "''")}' -DestinationPath '${extractedRoot.replaceAll("'", "''")}' -Force; Copy-Item -LiteralPath (Join-Path '${extractedRoot.replaceAll("'", "''")}' '${archiveRoot}/LICENSE') -Destination '${licensePath.replaceAll("'", "''")}' -Force`,
      ],
      { cwd: root, stdio: "inherit" },
    );
  } else {
    const license = execFileSync(
      "tar",
      ["-xOf", archivePath, `${archiveRoot}/LICENSE`],
      { cwd: root },
    );
    const binary = execFileSync(
      "tar",
      ["-xOf", archivePath, `${archiveRoot}/bin/node`],
      { cwd: root },
    );
    await mkdir(join(extractedRoot, archiveRoot, "bin"), {
      recursive: true,
    });
    await writeFile(licensePath, license);
    await writeFile(binaryPath, binary);
    await chmod(binaryPath, 0o755);
  }
}

const extractedLicense = await readFile(licensePath, "utf8");
if (!extractedLicense.trim()) {
  throw new Error("The pinned Node archive produced an empty LICENSE.");
}
await stat(binaryPath);

const envLines = [
  `CREWLIGHT_NODE_ARCHIVE_PATH=${archivePath}`,
  `CREWLIGHT_NODE_LICENSE_PATH=${licensePath}`,
  `CREWLIGHT_NODE_BINARY_PATH=${binaryPath}`,
];
if (process.env.GITHUB_ENV) {
  await writeFile(process.env.GITHUB_ENV, `${envLines.join("\n")}\n`, {
    encoding: "utf8",
    flag: "a",
  });
}
console.log(envLines.join("\n"));
