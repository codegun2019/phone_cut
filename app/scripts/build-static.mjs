import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(appDir, "dist");
fs.rmSync(outDir, { recursive: true, force: true });
fs.cpSync(path.join(appDir, "public"), outDir, { recursive: true });
const libOut = path.join(outDir, "lib");
fs.mkdirSync(libOut, { recursive: true });
for (const name of ["names.js", "phones.js", "split-text.js"]) {
  fs.copyFileSync(path.join(appDir, "lib", name), path.join(libOut, name));
}
console.log(`static site ready at ${outDir}`);
