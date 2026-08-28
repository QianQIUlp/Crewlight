import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const policy = JSON.parse(
  await readFile(join(root, "release-policy.json"), "utf8"),
);
const rootPackage = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);

function fail(message) {
  throw new Error(`Release contract: ${message}`);
}

async function workspacePackageFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (["node_modules", "dist", ".git", ".astro"].includes(entry.name)) {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await workspacePackageFiles(path)));
    } else if (
      entry.name === "package.json" &&
      path !== join(root, "package.json")
    ) {
      files.push(path);
    }
  }
  return files;
}

if (!/^\d+\.\d+\.\d+$/u.test(rootPackage.version)) {
  fail("root package version is not semver-like");
}
for (const packagePath of await workspacePackageFiles(join(root, "packages"))) {
  const workspacePackage = JSON.parse(await readFile(packagePath, "utf8"));
  if (workspacePackage.version !== rootPackage.version) {
    fail(
      `${packagePath} version ${workspacePackage.version} does not match root ${rootPackage.version}`,
    );
  }
}
const sitePackagePath = join(root, "apps", "site", "package.json");
const sitePackage = JSON.parse(await readFile(sitePackagePath, "utf8"));
if (sitePackage.version !== rootPackage.version) {
  fail(`${sitePackagePath} version does not match root ${rootPackage.version}`);
}

const cliAppSource = await readFile(
  join(root, "packages", "cli", "src", "app.ts"),
  "utf8",
);
if (
  !cliAppSource.includes("createRequire(import.meta.url)") ||
  cliAppSource.includes(`v${rootPackage.version}`)
) {
  fail("CLI display version must come from the root package version");
}
const ciSource = await readFile(
  join(root, ".github", "workflows", "ci.yml"),
  "utf8",
);
if (ciSource.includes(rootPackage.version)) {
  fail("CI must interpolate the root version instead of hardcoding it");
}

const readProjectText = (relativePath) =>
  readFile(join(root, relativePath), "utf8");
const readme = await readProjectText("README.md");
const readmeZh = await readProjectText("README.zh-CN.md");
const siteContent = await readProjectText("apps/site/src/content.ts");
const changelog = await readProjectText("CHANGELOG.md");
const releaseChecklist = await readProjectText(
  "docs/release-checklist-v0.5.md",
);
if (policy.lifecycle !== "candidate" && policy.lifecycle !== "released") {
  fail("lifecycle must be candidate or released");
}
if (policy.lifecycle === "candidate") {
  if (
    !readme.toLowerCase().includes("candidate") ||
    !readmeZh.includes("候选") ||
    !siteContent.toLowerCase().includes("candidate") ||
    !siteContent.includes("候选") ||
    !changelog.includes("Unreleased") ||
    !releaseChecklist.includes("Candidate")
  ) {
    fail("candidate lifecycle is not reflected consistently in release copy");
  }
} else if (!changelog.includes(`## v${rootPackage.version}`)) {
  fail("released lifecycle must be reflected in CHANGELOG");
}
if (
  policy.lifecycle === "released" &&
  policy.latestPublished !== rootPackage.version
) {
  fail("released policy must point latestPublished at the root version");
}
for (const target of ["windows-x64", "linux-x64", "macos-arm64", "macos-x64"]) {
  const entry = policy.platforms?.[target];
  if (!entry?.tier || !entry.signatureStatus) {
    fail(`missing platform policy for ${target}`);
  }
}
if (policy.supplyChain?.nodeVersion !== "22.23.2") {
  fail("Node release input must stay pinned to 22.23.2");
}
if (
  policy.supplyChain?.nodeArchive !==
    "https://nodejs.org/en/download/archive/v22.23.2" ||
  policy.supplyChain?.nodeShasums !==
    "https://nodejs.org/dist/v22.23.2/SHASUMS256.txt.asc"
) {
  fail("Node archive and checksum sources must remain official and pinned");
}
const expectedNodeArchives = {
  "linux-x64":
    "d60acfe00a2932254bb0ad20e01b0d74397a0875595de719654b214f4b03f307",
  "windows-x64":
    "1177b4137ba5adaa56354ae40f1080c7450e8ae09cecb47da459d1c52ac99f97",
  "macos-arm64":
    "61130f394c1630d211dd50aecc4353d379480f36d3ac913cd85dbba1aed585c6",
  "macos-x64":
    "58e99022c2ff89395576cc7fd4d98cea24bb68081475d5f88b801ee8729fb026",
};
for (const [target, hash] of Object.entries(expectedNodeArchives)) {
  const archive = policy.supplyChain?.nodeArchives?.[target];
  if (!archive?.file || archive.sha256 !== hash) {
    fail(`Node archive/hash is not pinned for ${target}`);
  }
}
if (policy.supplyChain?.nodeLicenseSource !== "verified-archive") {
  fail("Node license must come from the verified archive");
}
if (
  policy.supplyChain?.nodeNotifierVersion !== "10.0.1" ||
  policy.supplyChain?.snoreToastVersion !== "0.7.0"
) {
  fail(
    "native notification dependencies are not pinned to the release contract",
  );
}
if (
  policy.supplyChain?.snoreToastLicense !== "LGPL-3.0" ||
  policy.supplyChain?.snoreToastSource !==
    "https://github.com/mikaelbr/node-notifier/tree/v10.0.1/vendor/snoreToast" ||
  !/^[a-f0-9]{64}$/u.test(policy.supplyChain?.snoreToastX64Sha256 ?? "") ||
  policy.supplyChain?.snoreToastSigner !== "K Desktop Environment e.V."
) {
  fail("SnoreToast source, license, x64 hash, and signer are required");
}

const contract = {
  version: rootPackage.version,
  lifecycle: policy.lifecycle,
  latestPublished: policy.latestPublished,
  platforms: policy.platforms,
  artifacts: policy.artifacts,
  supplyChain: policy.supplyChain,
};

const shouldWrite = process.argv.includes("--write");
if (shouldWrite) {
  await writeFile(
    join(root, "release-contract.json"),
    `${JSON.stringify(contract, null, 2)}\n`,
    "utf8",
  );
}
console.log(JSON.stringify(contract, null, 2));
