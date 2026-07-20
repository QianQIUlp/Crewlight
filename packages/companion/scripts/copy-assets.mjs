import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(
  fileURLToPath(new URL("../package.json", import.meta.url)),
);
const sourceDirectory = join(packageRoot, "src");
const outputDirectory = join(packageRoot, "dist");

await mkdir(outputDirectory, { recursive: true });
await Promise.all([
  ...["index.html", "styles.css", "desktop.html", "desktop.css"].map((file) =>
    copyFile(join(sourceDirectory, file), join(outputDirectory, file)),
  ),
  copyFile(
    join(packageRoot, "assets", "crewlight-icon.png"),
    join(outputDirectory, "crewlight-icon.png"),
  ),
]);
