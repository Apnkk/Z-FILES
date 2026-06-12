import {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
  shell,
  ipcMain,
  screen,
} from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { startServer } from "../server/index.js";
import { DEFAULT_PORT } from "../server/constants.js";
import {
  checkForUpdates,
  dismissUpdate,
  getPendingUpdate,
  openUpdateDownload,
  startUpdateScheduler,
} from "./updater.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || DEFAULT_PORT;

Menu.setApplicationMenu(null);

let mainWindow = null;
let tray = null;
let serverInfo = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : path.join(__dirname, "..");
}

function getReceivedDir() {
  return path.join(app.getPath("userData"), "received");
}

function loadAppIcon() {
  const iconPath = path.join(getAppRoot(), "assets", "icon.png");
  const icon = nativeImage.createFromPath(iconPath);
  return icon.isEmpty() ? nativeImage.createEmpty() : icon;
}

function buildTrayMenu() {
  return Menu.buildFromTemplate([
    { label: "Ouvrir Z-Files", click: () => focusMainWindow() },
    { label: "Dossier des fichiers", click: () => shell.openPath(getReceivedDir()) },
    { label: "Rechercher une mise à jour…", click: () => checkForUpdates({ silent: false }) },
    { type: "separator" },
    {
      label: "Quitter",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

function createTray() {
  const icon = loadAppIcon();
  tray = new Tray(icon.isEmpty() ? icon : icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("Z-Files");
  tray.setContextMenu(buildTrayMenu());
  tray.on("double-click", focusMainWindow);
}

function focusMainWindow() {
  if (!mainWindow) return;
  mainWindow.show();
  mainWindow.focus();
}

function getWindowBounds() {
  const { workArea } = screen.getPrimaryDisplay();
  const maxWidth = Math.floor(workArea.width * 0.92);
  const maxHeight = Math.floor(workArea.height * 0.92);

  const width = Math.min(1920, maxWidth);
  const height = Math.min(1000, maxHeight);
  const minWidth = Math.min(900, maxWidth);
  const minHeight = Math.min(580, maxHeight);

  return {
    width,
    height,
    minWidth,
    minHeight,
    x: workArea.x + Math.round((workArea.width - width) / 2),
    y: workArea.y + Math.round((workArea.height - height) / 2),
  };
}

function createWindow() {
  const bounds = getWindowBounds();

  mainWindow = new BrowserWindow({
    ...bounds,
    show: false,
    frame: false,
    thickFrame: false,
    backgroundColor: "#030303",
    title: "Z-Files",
    icon: loadAppIcon(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.setMenu(null);
  mainWindow.setMenuBarVisibility(false);

  mainWindow.on("maximize", () => {
    mainWindow.webContents.send("window:maximized-changed", true);
  });

  mainWindow.on("unmaximize", () => {
    mainWindow.webContents.send("window:maximized-changed", false);
  });

  mainWindow.webContents.on("did-finish-load", () => {
    mainWindow.webContents.send("window:maximized-changed", mainWindow.isMaximized());
    const pending = getPendingUpdate();
    if (pending) mainWindow.webContents.send("update:available", pending);
  });

  mainWindow.loadURL(`http://localhost:${serverInfo.port}`);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
    mainWindow.webContents.send("window:shown");
  });

  mainWindow.on("show", () => {
    if (mainWindow.webContents.isLoading()) return;
    mainWindow.webContents.send("window:shown");
  });

  mainWindow.on("close", () => {
    if (!quitting) {
      quitting = true;
      app.quit();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function getOutboxDir() {
  return path.join(app.getPath("userData"), "outbox");
}

async function bootServer() {
  serverInfo = await startServer({
    root: getAppRoot(),
    receivedDir: getReceivedDir(),
    outboxDir: getOutboxDir(),
    port: PORT,
    quiet: true,
  });
}

function registerIpcHandlers() {
  ipcMain.handle("window:minimize", () => {
    mainWindow?.minimize();
    return true;
  });

  ipcMain.handle("window:maximize", () => {
    if (!mainWindow) return false;
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
    return mainWindow.isMaximized();
  });

  ipcMain.handle("window:close", () => {
    quitting = true;
    app.quit();
    return true;
  });

  ipcMain.handle("window:is-maximized", () => mainWindow?.isMaximized() ?? false);
  ipcMain.handle("zfiles:open-received", () => shell.openPath(getReceivedDir()));
  ipcMain.handle("update:check", () => checkForUpdates({ silent: false }));
  ipcMain.handle("update:get-pending", () => getPendingUpdate());
  ipcMain.handle("update:open-download", (_event, url) => openUpdateDownload(url));
  ipcMain.handle("update:dismiss", (_event, version) => {
    dismissUpdate(version);
    return true;
  });
}

registerIpcHandlers();

app.whenReady().then(async () => {
  try {
    await bootServer();
    createWindow();
    createTray();
    startUpdateScheduler(mainWindow);
  } catch (err) {
    console.error("[Z-Files] Startup failed:", err);
    app.quit();
  }
});

app.on("before-quit", () => {
  quitting = true;
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("will-quit", () => {
  serverInfo?.server?.close();
  tray?.destroy();
});
