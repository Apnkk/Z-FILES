const WIN_ANIM_MS = { close: 280, min: 240, max: 260, restore: 260 };

function resetWindowAnimState() {
  document.body.classList.remove(
    "window-closing",
    "window-minimizing",
    "window-maximizing",
    "window-restoring",
    "window-opening"
  );
  delete document.body.dataset.winAnim;
}

function playWindowOpening() {
  resetWindowAnimState();
  document.body.classList.add("window-opening");
  window.setTimeout(() => document.body.classList.remove("window-opening"), 340);
}

function pulseTrafficButton(button) {
  button.classList.remove("is-pressed");
  void button.offsetWidth;
  button.classList.add("is-pressed");
  button.addEventListener("animationend", () => button.classList.remove("is-pressed"), {
    once: true,
  });
}

function runWindowAction(className, durationMs, button, action) {
  if (document.body.dataset.winAnim) return;
  document.body.dataset.winAnim = "1";
  pulseTrafficButton(button);
  document.body.classList.add(className);
  window.setTimeout(async () => {
    await action();
    if (className !== "window-closing") resetWindowAnimState();
  }, durationMs);
}

function bindWindowButton(id, handler) {
  const button = document.getElementById(id);
  if (!button || button.dataset.winBound) return;
  button.dataset.winBound = "1";

  const onPress = (event) => {
    event.preventDefault();
    event.stopPropagation();
    handler(button);
  };

  button.addEventListener("mousedown", onPress);
  button.addEventListener("click", onPress);
}

function setupWindowControls() {
  if (!window.zfiles?.isElectron) return;

  document.body.classList.add("has-electron");
  document.getElementById("titlebar")?.removeAttribute("hidden");
  document.getElementById("electron-toolbar")?.removeAttribute("hidden");

  bindWindowButton("win-close", (button) =>
    runWindowAction("window-closing", WIN_ANIM_MS.close, button, () => window.zfiles.close())
  );

  bindWindowButton("win-min", (button) =>
    runWindowAction("window-minimizing", WIN_ANIM_MS.min, button, () => window.zfiles.minimize())
  );

  bindWindowButton("win-max", (button) => {
    window.zfiles.isMaximized?.().then((maximized) => {
      runWindowAction(
        maximized ? "window-restoring" : "window-maximizing",
        maximized ? WIN_ANIM_MS.restore : WIN_ANIM_MS.max,
        button,
        () => window.zfiles.maximize()
      );
    });
  });

  const maxButton = document.getElementById("win-max");
  if (maxButton && !maxButton.dataset.maxListen) {
    maxButton.dataset.maxListen = "1";
    window.zfiles.onMaximizedChange?.((maximized) => {
      maxButton.classList.toggle("is-maximized", maximized);
      maxButton.title = maximized ? "Restaurer" : "Agrandir";
    });
    window.zfiles.isMaximized?.().then((maximized) => {
      maxButton.classList.toggle("is-maximized", maximized);
    });
  }

  if (!document.body.dataset.winShowListen) {
    document.body.dataset.winShowListen = "1";
    window.zfiles.onWindowShow?.(() => playWindowOpening());
  }
}

function setupUpdateBanner() {
  if (!window.zfiles?.isElectron) return;

  const banner = document.getElementById("update-banner");
  const title = document.getElementById("update-banner-title");
  const detail = document.getElementById("update-banner-detail");
  const downloadButton = document.getElementById("update-download");
  const laterButton = document.getElementById("update-later");

  if (!banner || banner.dataset.updateBound) return;
  banner.dataset.updateBound = "1";

  let currentUpdate = null;

  const showUpdate = (info) => {
    if (!info) return;
    currentUpdate = info;
    title.textContent = `Z-Files ${info.latestVersion} disponible`;
    detail.textContent = `Version actuelle : ${info.currentVersion}. Télécharge l'installateur pour mettre à jour.`;
    banner.hidden = false;
  };

  downloadButton?.addEventListener("click", () => {
    if (!currentUpdate?.downloadUrl) return;
    window.zfiles.openUpdateDownload(currentUpdate.downloadUrl);
    window.zfilesToast?.("Ouverture du téléchargement…");
  });

  laterButton?.addEventListener("click", () => {
    if (currentUpdate?.latestVersion) {
      window.zfiles.dismissUpdate(currentUpdate.latestVersion);
    }
    banner.hidden = true;
  });

  window.zfiles.onUpdateAvailable?.(showUpdate);
  window.zfiles.getPendingUpdate?.().then((info) => {
    if (info) showUpdate(info);
  });
}

export function initElectronShell() {
  setupWindowControls();
  setupUpdateBanner();
}
