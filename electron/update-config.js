import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readPackageJson() {
  const candidates = [
    path.join(__dirname, "..", "package.json"),
    path.join(process.resourcesPath ?? "", "app.asar", "package.json"),
    path.join(process.resourcesPath ?? "", "app", "package.json"),
  ];

  for (const file of candidates) {
    try {
      if (fs.existsSync(file)) {
        return JSON.parse(fs.readFileSync(file, "utf8"));
      }
    } catch {
      continue;
    }
  }

  return {};
}

function parseGitHubRepo(url = "") {
  const cleaned = String(url)
    .replace(/^git\+/, "")
    .replace(/^github:/, "https://github.com/")
    .replace(/\.git$/, "")
    .trim();

  const match = cleaned.match(/github\.com[/:]([^/]+)\/([^/]+)/i);
  if (!match) return null;
  return { owner: match[1], repo: match[2] };
}

export function getUpdateConfig() {
  const pkg = readPackageJson();
  const fromEnv =
    process.env.ZFILES_GH_OWNER && process.env.ZFILES_GH_REPO
      ? { owner: process.env.ZFILES_GH_OWNER, repo: process.env.ZFILES_GH_REPO }
      : null;

  const fromRepo = parseGitHubRepo(pkg.repository?.url ?? pkg.repository ?? "");
  const repo = fromEnv ?? fromRepo;

  return {
    owner: repo?.owner ?? "",
    repo: repo?.repo ?? "",
    currentVersion: pkg.version ?? "0.0.0",
  };
}

export function isUpdateConfigured() {
  const { owner, repo } = getUpdateConfig();
  return Boolean(owner && repo);
}
