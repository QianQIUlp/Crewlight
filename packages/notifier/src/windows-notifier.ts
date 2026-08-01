import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { win32 } from "node:path";

export const WINDOWS_TOASTER_SHA256 =
  "42d20792498514562cfd6fd8221b4abb59229e893073fc59fbfc83f884a2401b";
export const WINDOWS_TOASTER_RESOURCE_PATH = [
  "resources",
  "snoretoast-x64.exe",
] as const;

export interface WindowsNotifierRuntime {
  execPath: string;
  isSea(): boolean;
  platform: NodeJS.Platform;
}

export interface WindowsNotifierAssetRuntime {
  readFile(path: string): Promise<Buffer>;
  stat(path: string): Promise<{ isFile(): boolean; size: number }>;
}

const defaultAssetRuntime: WindowsNotifierAssetRuntime = {
  readFile,
  stat,
};

export function resolveWindowsToasterPath(
  runtime: WindowsNotifierRuntime,
): string | undefined {
  if (runtime.platform !== "win32" || !runtime.isSea()) {
    return undefined;
  }

  return win32.join(
    win32.dirname(runtime.execPath),
    ...WINDOWS_TOASTER_RESOURCE_PATH,
  );
}

export async function isUsableWindowsToasterAsset(
  path: string,
  runtime: WindowsNotifierAssetRuntime = defaultAssetRuntime,
): Promise<boolean> {
  try {
    const asset = await runtime.stat(path);
    if (!asset.isFile() || asset.size === 0) {
      return false;
    }
    const hash = createHash("sha256")
      .update(await runtime.readFile(path))
      .digest("hex");
    return hash === WINDOWS_TOASTER_SHA256;
  } catch {
    return false;
  }
}
