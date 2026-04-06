import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const hash = execSync("git rev-parse --short HEAD").toString().trim();
const timestamp = new Date().toISOString();

writeFileSync(
  "generated/build-version.ts",
  `export const BUILD_COMMIT = "${hash}";\nexport const BUILD_TIME = "${timestamp}";\n`,
);

console.log(`[stamp-version] ${hash} at ${timestamp}`);
