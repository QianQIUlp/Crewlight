import { chmod, lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

export async function normalizePackagePermissions(path) {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) {
    return;
  }

  const specialBits = entry.mode & 0o7000;
  if (entry.isDirectory()) {
    await chmod(path, specialBits | 0o755);
    const children = await readdir(path);
    for (const child of children) {
      await normalizePackagePermissions(join(path, child));
    }
    return;
  }

  if (entry.isFile()) {
    const ordinaryBits = entry.mode & 0o111 ? 0o755 : 0o644;
    await chmod(path, specialBits | ordinaryBits);
  }
}

export default async function normalizePackagePermissionsAfterPack(context) {
  if (context.electronPlatformName === "win32") {
    return;
  }

  process.umask(0o022);
  await normalizePackagePermissions(context.appOutDir);
}
