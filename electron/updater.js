import { app, shell, dialog } from "electron";
import fs from "fs";
import path from "path";
import { getUpdateConfig, isUpdateConfigured } from "./update-config.js";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 8000;
const GITHUB_API = "https://api.github.com";

let pendingUpdate = null;
let checkTimer = null;
let mainWindow = null;

function dismissFilePath() {
  return path.join(app.getPath("userData"), "update-dismiss.json");
}

function readDismissedVersion() {
  try {
    const data = JSON.parse(fs.readFileSync(dismissFilePath(), "utf8"));
    return data.version ?? null;
  } catch {
    return null;
  }
}

function writeDismissedVersion(version) {
  fs.writeFileSync(
    dismissFilePath(),
    JSON.stringify({ version, dismissedAt: Date.now() }, null, 2)
  );
}

function parseVersion(version) {
  return String(version)
    .replace(/^v/i, "")
    .split(".")
    .map((part) => Number.parseInt(part, 10) || 0);
}

export function isVersionNewer(latest, current) {
  const a = parseVersion(latest);
  const b = parseVersion(current);

  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    const left = a[i] ?? 0;
    const right = b[i] ?? 0;
    if (left > right) return true;
    if (left < right) return false;
  }

  return false;
}

function pickSetupAsset(assets = []) {
  return (
    assets.find((asset) => /setup/i.test(asset.name) && asset.name.endsWith(".exe")) ??
    assets.find((asset) => asset.name.endsWith(".exe")) ??
    null
  );
}

async function githubFetch(pathname) {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "Z-Files-Updater",
  };

  if (process.env.GH_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GH_TOKEN}`;
  }

  const response = await fetch(`${GITHUB_API}${pathname}`, { headers });
  return response;
}

async function fetchLatestRelease(owner, repo) {
  const latestResponse = await githubFetch(`/repos/${owner}/${repo}/releases/latest`);

  if (latestResponse.status === 404) {
    const listResponse = await githubFetch(`/repos/${owner}/${repo}/releases?per_page=5`);
    if (!listResponse.ok) throw new Error(`GitHub API ${listResponse.status}`);
    const releases = await listResponse.json();
    return releases.find((release) => !release.draft && !release.prerelease) ?? null;
  }

  if (!latestResponse.ok) throw new Error(`GitHub API ${latestResponse.status}`);
  return latestResponse.json();
}

function notifyRenderer(updateInfo) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("update:available", updateInfo);
  }
}

export async function checkForUpdates({ silent = false } = {}) {
  if (!isUpdateConfigured()) {
    if (!silent) {
      await dialog.showMessageBox({
        type: "warning",
        title: "Z-Files",
        message: "Mises à jour non configurées",
        detail: "Le dépôt GitHub n'est pas défini dans package.json.",
      });
    }
    return null;
  }

  const { owner, repo, currentVersion } = getUpdateConfig();

  try {
    const release = await fetchLatestRelease(owner, repo);
    if (!release) return null;

    const latestVersion = String(release.tag_name ?? release.name ?? "").replace(/^v/i, "");
    if (!latestVersion || !isVersionNewer(latestVersion, currentVersion)) {
      pendingUpdate = null;
      if (!silent) {
        await dialog.showMessageBox({
          type: "info",
          title: "Z-Files",
          message: "Tu utilises déjà la dernière version.",
          detail: `Version installée : ${currentVersion}`,
        });
      }
      return null;
    }

    const setupAsset = pickSetupAsset(release.assets);
    const updateInfo = {
      currentVersion,
      latestVersion,
      releaseName: release.name || `v${latestVersion}`,
      releaseNotes: release.body ?? "",
      releasePage: release.html_url,
      downloadUrl: setupAsset?.browser_download_url ?? release.html_url,
      downloadName: setupAsset?.name ?? `Z-Files-Setup-${latestVersion}.exe`,
    };

    pendingUpdate = updateInfo;

    if (readDismissedVersion() === latestVersion) {
      return null;
    }

    notifyRenderer(updateInfo);
    return updateInfo;
  } catch (err) {
    console.error("[Z-Files] Update check failed:", err.message);
    if (!silent) {
      await dialog.showMessageBox({
        type: "error",
        title: "Z-Files",
        message: "Impossible de vérifier les mises à jour",
        detail: err.message,
      });
    }
    return null;
  }
}

export function getPendingUpdate() {
  if (!pendingUpdate) return null;
  if (readDismissedVersion() === pendingUpdate.latestVersion) return null;
  return pendingUpdate;
}

export function dismissUpdate(version) {
  writeDismissedVersion(version);
}

export async function openUpdateDownload(url) {
  if (url) await shell.openExternal(url);
}

export function startUpdateScheduler(window) {
  mainWindow = window;

  const runAutoCheck = () => {
    if (!app.isPackaged && !process.env.ZFILES_FORCE_UPDATE_CHECK) return;
    checkForUpdates({ silent: true });
  };

  setTimeout(runAutoCheck, STARTUP_DELAY_MS);
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(runAutoCheck, CHECK_INTERVAL_MS);
}
