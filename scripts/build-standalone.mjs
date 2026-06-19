import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
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

if (platform !== "linux" || architecture !== "x64") {
  throw new Error(
    `Standalone release builds are verified only for linux/x64, not ${platform}/${architecture}.`,
  );
}

if (nodeMajor !== 22) {
  throw new Error(
    `Standalone release builds require an available Node 22.x runtime; received ${process.version}.`,
  );
}

const artifactName = `agentpulse-v${version}-linux-x64`;
const releaseDirectory = join(root, "release");
const stagingDirectory = join(releaseDirectory, artifactName);
const workDirectory = join(releaseDirectory, ".work");
const bundlePath = join(workDirectory, "agentpulse.cjs");
const seaConfigPath = join(workDirectory, "sea-config.json");
const seaBlobPath = join(workDirectory, "agentpulse.blob");
const binaryPath = join(stagingDirectory, "agentpulse");
const archivePath = join(releaseDirectory, `${artifactName}.tar.gz`);
const checksumPath = `${archivePath}.sha256`;
const commit =
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();

console.log(`Building AgentPulse ${version} standalone binary`);
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
await inject(binaryPath, "NODE_SEA_BLOB", await readFile(seaBlobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
});
await chmod(binaryPath, 0o755);

await copyFile(join(root, "LICENSE"), join(stagingDirectory, "LICENSE"));
await writeFile(
  join(stagingDirectory, "BUILD-INFO.txt"),
  [
    `AgentPulse version: ${version}`,
    `Node version: ${process.version}`,
    `Platform: ${platform}`,
    `Architecture: ${architecture}`,
    `Commit: ${commit}`,
    "",
  ].join("\n"),
);

execFileSync(
  "tar",
  ["-czf", archivePath, "-C", releaseDirectory, artifactName],
  {
    cwd: root,
    stdio: "inherit",
  },
);

const checksum = createHash("sha256")
  .update(await readFile(archivePath))
  .digest("hex");
await writeFile(checksumPath, `${checksum}  ${basename(archivePath)}\n`);
await rm(workDirectory, { force: true, recursive: true });

console.log(`Archive: ${archivePath}`);
console.log(`Checksum: ${checksumPath}`);
console.log(`Build info: ${join(stagingDirectory, "BUILD-INFO.txt")}`);
