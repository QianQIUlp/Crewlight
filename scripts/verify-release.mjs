import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
);
const releasePolicy = JSON.parse(
  await readFile(join(root, "release-policy.json"), "utf8"),
);
const version = packageJson.version;
const platform =
  process.platform === "win32"
    ? "windows"
    : process.platform === "darwin"
      ? "macos"
      : process.platform === "linux"
        ? "linux"
        : process.platform;
const target = `${platform}-${process.arch}`;

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
  if (process.platform === "win32") {
    execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm", script], {
      cwd: root,
      stdio: "inherit",
    });
    return;
  }
  execFileSync("pnpm", [script], { cwd: root, stdio: "inherit" });
}

async function verifyWindowsNotifierHelper() {
  const notifierPackage = join(
    root,
    "packages",
    "notifier",
    "node_modules",
    "node-notifier",
    "package.json",
  );
  const notifierVersion = JSON.parse(
    await readFile(notifierPackage, "utf8"),
  ).version;
  if (notifierVersion !== releasePolicy.supplyChain.nodeNotifierVersion) {
    throw new Error(
      `node-notifier version mismatch; expected ${releasePolicy.supplyChain.nodeNotifierVersion}.`,
    );
  }
  const helper = join(
    root,
    "packages",
    "notifier",
    "node_modules",
    "node-notifier",
    "vendor",
    "snoreToast",
    "snoretoast-x64.exe",
  );
  const content = await readFile(helper);
  const hash = createHash("sha256").update(content).digest("hex");
  if (hash !== releasePolicy.supplyChain.snoreToastX64Sha256) {
    throw new Error(
      `SnoreToast hash mismatch; expected ${releasePolicy.supplyChain.snoreToastX64Sha256}.`,
    );
  }
  const license = await readFile(join(dirname(helper), "LICENSE"), "utf8");
  if (!license.includes("LESSER GENERAL PUBLIC LICENSE")) {
    throw new Error("SnoreToast LGPL license file is missing or unexpected.");
  }
  const signature = spawnSync(
    "powershell.exe",
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-Command",
      `$signature = Get-AuthenticodeSignature -LiteralPath '${helper.replaceAll("'", "''")}'; [pscustomobject]@{ Status = $signature.Status.ToString(); Subject = if ($null -eq $signature.SignerCertificate) { '' } else { $signature.SignerCertificate.Subject } } | ConvertTo-Json -Compress`,
    ],
    { encoding: "utf8" },
  );
  if (signature.status !== 0 || !signature.stdout.trim()) {
    console.warn(
      "SnoreToast Authenticode could not be inspected; continuing with an unsigned helper warning.",
    );
    return;
  }
  const result = JSON.parse(signature.stdout);
  if (result.Status === "NotSigned" || result.Status === "UnknownError") {
    console.warn(
      "SnoreToast is not Authenticode-signed on this runner; Crewlight remains unsigned.",
    );
    return;
  }
  if (result.Status !== "Valid") {
    throw new Error(`SnoreToast Authenticode status is ${result.Status}.`);
  }
  const subject = result.Subject ?? "";
  if (!subject.includes(releasePolicy.supplyChain.snoreToastSigner)) {
    throw new Error(
      "SnoreToast Authenticode signer does not match the release contract.",
    );
  }
}

runPnpm(plan.packageScript);
runPnpm(plan.smokeScript);

const releaseRoot = join(root, "release");
const standaloneName = `crewlight-v${version}-${target}`;
const standaloneExtension = platform === "windows" ? ".zip" : ".tar.gz";
const requiredArtifacts = [
  join(releaseRoot, `${standaloneName}${standaloneExtension}`),
  join(releaseRoot, `${standaloneName}${standaloneExtension}.sha256`),
  join(releaseRoot, standaloneName, "BUILD-INFO.txt"),
];

if (platform === "windows") {
  await verifyWindowsNotifierHelper();
  requiredArtifacts.push(
    join(releaseRoot, `${standaloneName}-desktop.zip`),
    join(
      releaseRoot,
      "desktop-builder",
      `crewlight-v${version}-windows-x64-installer.exe`,
    ),
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

for (const artifact of requiredArtifacts) {
  const artifactStat = await stat(artifact);
  if (artifactStat.size === 0) {
    throw new Error(`Release artifact is empty: ${artifact}`);
  }
}

runPnpm("release:manifest");
runPnpm("release:manifest:verify");

console.log(`\nCrewlight ${version} release artifacts verified for ${target}:`);
for (const artifact of requiredArtifacts) {
  console.log(`- ${relative(root, artifact)}`);
}
console.log(
  "Desktop GUI launch, installer interaction, native notifications, signing, and notarization remain manual release gates.",
);
