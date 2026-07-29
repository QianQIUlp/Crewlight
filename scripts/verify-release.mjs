import { execFileSync } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(
  await readFile(join(root, "package.json"), "utf8"),
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
  requiredArtifacts.push(
    join(releaseRoot, `${standaloneName}-desktop.zip`),
    join(releaseRoot, "desktop-builder", `Crewlight-Setup-v${version}.exe`),
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

console.log(`\nCrewlight ${version} release artifacts verified for ${target}:`);
for (const artifact of requiredArtifacts) {
  console.log(`- ${relative(root, artifact)}`);
}
console.log(
  "Desktop GUI launch, installer interaction, native notifications, signing, and notarization remain manual release gates.",
);
