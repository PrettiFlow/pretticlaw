import fs from "node:fs";
import path from "node:path";

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

const root = process.cwd();
copyRecursive(path.join(root, "src", "templates"), path.join(root, "dist", "templates"));
copyRecursive(path.join(root, "src", "skills"), path.join(root, "dist", "skills"));
copyRecursive(path.join(root, "src", "dashboard"), path.join(root, "dist", "dashboard"));
