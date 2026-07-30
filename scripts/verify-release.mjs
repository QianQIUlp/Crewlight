import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "win32") {
  process.umask(0o022);
}

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

async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function assertMode(path, expectedMode) {
  const actualMode = (await stat(path)).mode & 0o777;
  if (actualMode !== expectedMode) {
    throw new Error(
      `Expected ${relative(root, path)} mode ${expectedMode.toString(8)}, received ${actualMode.toString(8)}.`,
    );
  }
}

async function verifyUnixStandalonePermissions(standaloneDirectory) {
  await Promise.all([
    assertMode(standaloneDirectory, 0o755),
    assertMode(join(standaloneDirectory, "crewlight"), 0o755),
    assertMode(join(standaloneDirectory, "LICENSE"), 0o644),
    assertMode(join(standaloneDirectory, "BUILD-INFO.txt"), 0o644),
  ]);
}

async function verifyLinuxPackageTree(
  packageRoot,
  desktopEntry,
  verifyDirectoryModes,
) {
  const resources = join(packageRoot, "resources");
  const modeChecks = [
    assertMode(join(packageRoot, "Crewlight"), 0o755),
    assertMode(join(resources, "app.asar"), 0o644),
    assertMode(join(resources, "crewlight-cli", "crewlight"), 0o755),
    assertMode(desktopEntry, 0o644),
  ];
  if (verifyDirectoryModes) {
    modeChecks.push(
      assertMode(packageRoot, 0o755),
      assertMode(resources, 0o755),
      assertMode(join(resources, "crewlight-cli"), 0o755),
    );
  }
  await Promise.all(modeChecks);

  const macNotifier = join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "node-notifier",
    "vendor",
    "mac.noindex",
  );
  if (await pathExists(macNotifier)) {
    throw new Error(
      `${relative(root, packageRoot)} contains the macOS-only terminal-notifier bundle.`,
    );
  }
}

async function verifyLinuxDesktopPackages(appImage, deb) {
  const verificationRoot = join(releaseRoot, ".verify-linux-desktop");
  const appImageExtractionRoot = join(verificationRoot, "appimage");
  const debExtractionRoot = join(verificationRoot, "deb");

  await rm(verificationRoot, { force: true, recursive: true });
  await Promise.all([
    mkdir(appImageExtractionRoot, { recursive: true }),
    mkdir(debExtractionRoot, { recursive: true }),
  ]);

  try {
    execFileSync(appImage, ["--appimage-extract"], {
      cwd: appImageExtractionRoot,
      stdio: "ignore",
    });
    execFileSync("dpkg-deb", ["--extract", deb, debExtractionRoot], {
      cwd: root,
      stdio: "inherit",
    });

    await verifyLinuxPackageTree(
      join(appImageExtractionRoot, "squashfs-root"),
      join(appImageExtractionRoot, "squashfs-root", "Crewlight.desktop"),
      false,
    );
    await verifyLinuxPackageTree(
      join(debExtractionRoot, "opt", "Crewlight"),
      join(
        debExtractionRoot,
        "usr",
        "share",
        "applications",
        "Crewlight.desktop",
      ),
      true,
    );
  } finally {
    await rm(verificationRoot, { force: true, recursive: true });
  }
}

async function verifyMacDesktopPermissions(appBundle) {
  const contents = join(appBundle, "Contents");
  const resources = join(contents, "Resources");
  await Promise.all([
    assertMode(appBundle, 0o755),
    assertMode(contents, 0o755),
    assertMode(join(contents, "MacOS", "Crewlight"), 0o755),
    assertMode(resources, 0o755),
    assertMode(join(resources, "app.asar"), 0o644),
    assertMode(join(resources, "crewlight-cli"), 0o755),
    assertMode(join(resources, "crewlight-cli", "crewlight"), 0o755),
  ]);

  const terminalNotifier = join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "node-notifier",
    "vendor",
    "mac.noindex",
    "terminal-notifier.app",
    "Contents",
    "MacOS",
    "terminal-notifier",
  );
  if (await pathExists(terminalNotifier)) {
    await assertMode(terminalNotifier, 0o755);
  }
}

async function verifyWindowsPortableArchive(portableArchive, portableName) {
  const verificationRoot = join(
    releaseRoot,
    ".verify-windows-portable",
    portableName,
    portableName,
  );

  await rm(join(releaseRoot, ".verify-windows-portable"), {
    force: true,
    recursive: true,
  });
  await mkdir(verificationRoot, { recursive: true });

  try {
    execFileSync(
      "powershell.exe",
      [
        "-NoLogo",
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "Expand-Archive -LiteralPath $env:CREWLIGHT_ARCHIVE -DestinationPath $env:CREWLIGHT_EXTRACT -Force",
      ],
      {
        cwd: root,
        env: {
          ...process.env,
          CREWLIGHT_ARCHIVE: portableArchive,
          CREWLIGHT_EXTRACT: verificationRoot,
        },
        stdio: "inherit",
      },
    );

    const requiredWindowsFiles = [
      join(verificationRoot, "Crewlight.exe"),
      join(
        verificationRoot,
        "resources",
        "app.asar.unpacked",
        "node_modules",
        "node-notifier",
        "vendor",
        "snoreToast",
        "snoretoast-x64.exe",
      ),
    ];
    for (const requiredFile of requiredWindowsFiles) {
      if (!(await pathExists(requiredFile))) {
        throw new Error(
          `Windows portable archive is missing ${relative(verificationRoot, requiredFile)} at its expected path.`,
        );
      }
    }

    const macNotifier = join(
      verificationRoot,
      "resources",
      "app.asar.unpacked",
      "node_modules",
      "node-notifier",
      "vendor",
      "mac.noindex",
    );
    if (await pathExists(macNotifier)) {
      throw new Error(
        "Windows portable archive contains the macOS-only terminal-notifier bundle.",
      );
    }
  } finally {
    await rm(join(releaseRoot, ".verify-windows-portable"), {
      force: true,
      recursive: true,
    });
  }
}

runPnpm(plan.packageScript);
runPnpm(plan.smokeScript);

const releaseRoot = join(root, "release");
const standaloneName = `crewlight-v${version}-${target}`;
const standaloneExtension = platform === "windows" ? ".zip" : ".tar.gz";
const standaloneDirectory = join(releaseRoot, standaloneName);
const requiredArtifacts = [
  join(releaseRoot, `${standaloneName}${standaloneExtension}`),
  join(releaseRoot, `${standaloneName}${standaloneExtension}.sha256`),
  join(standaloneDirectory, "BUILD-INFO.txt"),
];

if (platform !== "windows") {
  await verifyUnixStandalonePermissions(standaloneDirectory);
}

if (platform === "windows") {
  const portableName = `${standaloneName}-desktop`;
  const portableArchive = join(releaseRoot, `${portableName}.zip`);
  requiredArtifacts.push(
    portableArchive,
    join(
      releaseRoot,
      "desktop-builder",
      `crewlight-v${version}-windows-x64-installer.exe`,
    ),
  );

  await verifyWindowsPortableArchive(portableArchive, portableName);
} else if (platform === "macos") {
  const macOutput = process.arch === "arm64" ? "mac-arm64" : "mac";
  await verifyMacDesktopPermissions(
    join(releaseRoot, "desktop-builder", macOutput, "Crewlight.app"),
  );
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
  const appImage = join(desktopOutput, appImages[0]);
  const deb = join(desktopOutput, debs[0]);
  requiredArtifacts.push(appImage, deb);
  await verifyLinuxDesktopPackages(appImage, deb);
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
