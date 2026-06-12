import { formatSize, getFileKind, getFileIcon, uploadDisplayName } from "./shared.js";
import { initElectronShell } from "./electron-shell.js";
import { canViewInline, downloadUrl, renderFileView, viewUrl } from "./file-view.js";

const voidEl = document.getElementById("space-void");
const preview = document.getElementById("preview-card");
const emptyEl = document.getElementById("space-empty");
const countEl = document.getElementById("file-count");
const syncDot = document.getElementById("sync-dot");
const syncLabel = document.getElementById("sync-label");
const burstLayer = document.getElementById("burst-layer");
const refreshBtn = document.getElementById("refresh");
const connectPanel = document.getElementById("connect-panel");
const dropOverlay = document.getElementById("space-drop-overlay");
const pcFileInput = document.getElementById("pc-file-input");
const phoneFileInput = document.getElementById("phone-file-input");
const galleryPortal = document.getElementById("gallery-portal");

const POLL_INTERVAL_MS = 1000;
const BATCH_GAP_MS = 120000;
const kindColors = {
  image: "#ef4444",
  video: "#dc2626",
  audio: "#b91c1c",
  pdf: "#991b1b",
  markdown: "#b45309",
  html: "#c2410c",
  text: "#a16207",
  code: "#92400e",
  archive: "#78716c",
  file: "#78716c",
};
const kindLabels = {
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  pdf: "PDF",
  markdown: "Markdown",
  html: "HTML",
  text: "Texte",
  code: "Code",
  archive: "Archive",
  file: "Fichier",
};

let knownNodes = new Map();
let positions = new Map();
let hoverFile = null;
let refreshBusy = false;
let refreshPending = false;
let lastCount = 0;
let lastRevision = -1;
let hasRenderedOnce = false;
let mouse = { x: 0.5, y: 0.5 };
let allFilesCache = [];
let galleryFiles = [];
let galleryIndex = 0;
let galleryRenderToken = 0;
let previewRenderToken = 0;

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getPosition(key) {
  if (positions.has(key)) return positions.get(key);
  const hash = hashString(key);
  const position = {
    x: 14 + (hash % 7200) / 100,
    y: 12 + ((hash >> 8) % 6800) / 100,
  };
  positions.set(key, position);
  return position;
}

function fileViewUrl(name) {
  return viewUrl(name, "/api/view");
}

function fileDownloadUrl(name) {
  return downloadUrl(name, "/api/download");
}

async function deleteFile(name) {
  const response = await fetch(`/api/files/${encodeURIComponent(name)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Suppression impossible");
  return data;
}

function toast(message) {
  const element = document.getElementById("toast");
  element.textContent = message;
  element.hidden = false;
  clearTimeout(element._timer);
  element._timer = setTimeout(() => {
    element.hidden = true;
  }, 2800);
}

window.zfilesToast = toast;

function setSync(state, label) {
  syncDot.className = `sync-dot sync-${state}`;
  syncLabel.textContent = label;
}

function spawnBurst(x, y, color = "#dc2626") {
  for (let i = 0; i < 14; i += 1) {
    const particle = document.createElement("div");
    particle.className = "burst-particle";
    particle.style.left = `${x}px`;
    particle.style.top = `${y}px`;
    particle.style.background = color;
    const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.4;
    const distance = 40 + Math.random() * 50;
    particle.style.setProperty("--bx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--by", `${Math.sin(angle) * distance}px`);
    burstLayer.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
}

function groupIntoBatches(files) {
  const sorted = [...files].sort((a, b) => a.mtime - b.mtime);
  const batches = [];
  let current = [];

  for (const file of sorted) {
    const last = current[current.length - 1];
    if (last && file.mtime - last.mtime > BATCH_GAP_MS) {
      batches.push(current);
      current = [];
    }
    current.push(file);
  }

  if (current.length) batches.push(current);
  return batches;
}

function batchKey(batch) {
  return batch.map((file) => file.name).join("|");
}

function openGalleryForFiles(files, startIndex = 0) {
  if (!files.length) {
    toast("Aucun fichier à afficher");
    return;
  }
  galleryFiles = files;
  galleryIndex = Math.max(0, Math.min(startIndex, files.length - 1));
  galleryPortal.hidden = false;
  renderGallery();
}

function closeGallery() {
  galleryPortal.hidden = true;
  galleryFiles = [];
}

function renderGallery() {
  const file = galleryFiles[galleryIndex];
  if (!file) return;

  const token = ++galleryRenderToken;

  document.getElementById("gallery-title").textContent =
    galleryFiles.length > 1 ? "Visionneuse" : file.name.split("/").pop();
  document.getElementById("gallery-counter").textContent =
    `${galleryIndex + 1} / ${galleryFiles.length} · ${formatSize(file.size)}`;

  const dl = document.getElementById("gallery-dl");
  if (dl) {
    dl.href = fileDownloadUrl(file.name);
    dl.download = file.name.split("/").pop();
  }

  const main = document.getElementById("gallery-main");
  renderFileView(main, file, { viewBase: "/api/view" }).then(() => {
    if (token !== galleryRenderToken) return;
  });

  const strip = document.getElementById("gallery-strip");
  strip.innerHTML = galleryFiles
    .map((entry, index) => {
      const entryKind = getFileKind(entry.name);
      const inner =
        entryKind === "image"
          ? `<img src="${fileViewUrl(entry.name)}" alt="">`
          : `<div class="gallery-thumb-icon">${getFileIcon(entry.name)}</div>`;
      return `<button type="button" class="gallery-thumb${index === galleryIndex ? " is-active" : ""}" data-i="${index}">${inner}</button>`;
    })
    .join("");

  strip.querySelectorAll(".gallery-thumb").forEach((button) => {
    button.addEventListener("click", () => {
      galleryIndex = Number(button.dataset.i);
      renderGallery();
    });
  });

  document.getElementById("gallery-prev").disabled = galleryIndex <= 0;
  document.getElementById("gallery-next").disabled = galleryIndex >= galleryFiles.length - 1;
}

async function pushFilesToPhone(names) {
  const response = await fetch("/api/outbox/push", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Échec envoi");
  return data;
}

async function uploadLocalFiles(fileList) {
  const body = new FormData();
  for (const file of fileList) body.append("files", file, uploadDisplayName(file));

  const response = await fetch("/api/upload", { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Échec import");
  return data;
}

async function uploadToPhone(fileList) {
  const body = new FormData();
  for (const file of fileList) body.append("files", file, uploadDisplayName(file));

  const response = await fetch("/api/outbox/upload", { method: "POST", body });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Échec envoi tel");
  return data;
}

function openPhonePicker() {
  phoneFileInput.click();
}

function createDot(file, isNew, onOpen) {
  const kind = getFileKind(file.name);
  const position = getPosition(file.name);
  const hash = hashString(file.name);

  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = `space-dot kind-${kind}${isNew ? " dot-new" : ""}`;
  dot.style.left = `${position.x}%`;
  dot.style.top = `${position.y}%`;
  dot.style.setProperty("--float-dur", `${5 + (hash % 40) / 10}s`);
  dot.style.setProperty("--float-delay", `${-(hash % 30) / 10}s`);
  dot.dataset.name = file.name;
  dot.setAttribute("aria-label", file.name);
  dot.innerHTML = `<span class="dot-core"></span><span class="dot-glow"></span>`;

  if (isNew) {
    requestAnimationFrame(() => {
      const rect = dot.getBoundingClientRect();
      spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, kindColors[kind]);
    });
  }

  dot.addEventListener("mouseenter", () => showPreview(file, dot));
  dot.addEventListener("mouseleave", hidePreviewSoon);
  dot.addEventListener("focus", () => showPreview(file, dot));
  dot.addEventListener("blur", hidePreviewSoon);
  dot.addEventListener("click", (event) => {
    event.stopPropagation();
    onOpen();
  });

  return dot;
}

function createClusterDot(batch, isNew) {
  const key = batchKey(batch);
  const position = getPosition(key);
  const images = batch.filter((file) => getFileKind(file.name) === "image");
  const dominant = images[0] ?? batch[0];
  const kind = getFileKind(dominant.name);

  const dot = document.createElement("button");
  dot.type = "button";
  dot.className = `space-dot is-cluster kind-${kind}${isNew ? " dot-new" : ""}`;
  dot.style.left = `${position.x}%`;
  dot.style.top = `${position.y}%`;
  dot.dataset.key = key;
  dot.setAttribute("aria-label", `${batch.length} fichiers`);
  dot.innerHTML = `<span class="dot-core"></span><span class="cluster-badge">${batch.length}</span>`;

  if (isNew) {
    requestAnimationFrame(() => {
      const rect = dot.getBoundingClientRect();
      spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, kindColors[kind]);
    });
  }

  dot.addEventListener("click", (event) => {
    event.stopPropagation();
    const viewable = batch.filter((file) => canViewInline(file.name));
    const pool = viewable.length ? viewable : batch;
    const startIndex = Math.max(0, pool.findIndex((file) => file.name === dominant.name));
    openGalleryForFiles(pool, startIndex);
  });

  return dot;
}

function showPreview(file, anchor) {
  hoverFile = file.name;
  const kind = getFileKind(file.name);
  document.getElementById("preview-kind").textContent = kindLabels[kind] ?? "Fichier";

  const media = document.getElementById("preview-media");
  const token = ++previewRenderToken;
  renderFileView(media, file, { viewBase: "/api/view", compact: true }).then(() => {
    if (token !== previewRenderToken) return;
  });

  document.getElementById("preview-name").textContent = file.name;
  document.getElementById("preview-size").textContent = formatSize(file.size);

  const downloadLink = document.getElementById("preview-dl");
  downloadLink.href = fileDownloadUrl(file.name);
  downloadLink.download = file.name.split("/").pop();

  document.getElementById("preview-phone").onclick = async () => {
    try {
      await pushFilesToPhone([file.name]);
      toast("Envoyé au téléphone ✓");
    } catch (err) {
      toast(err.message);
    }
  };

  document.getElementById("preview-del").onclick = async () => {
    if (!confirm(`Supprimer « ${file.name.split("/").pop()} » ?`)) return;
    try {
      await deleteFile(file.name);
      preview.hidden = true;
      toast("Fichier supprimé ✓");
      loadFiles(true);
    } catch (err) {
      toast(err.message || "Suppression impossible");
    }
  };

  preview.hidden = false;
  requestAnimationFrame(() => positionPreview(anchor));
}

function positionPreview(anchor) {
  const rect = anchor.getBoundingClientRect();
  const cardWidth = 270;
  let left = rect.left + rect.width / 2 - cardWidth / 2;
  let top = rect.top - 220;
  if (top < 70) top = rect.bottom + 16;
  left = Math.max(12, Math.min(left, window.innerWidth - cardWidth - 12));
  top = Math.max(70, Math.min(top, window.innerHeight - 260));
  preview.style.left = `${left}px`;
  preview.style.top = `${top}px`;
}

let hideTimer;
function hidePreviewSoon() {
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    if (!preview.matches(":hover")) {
      preview.hidden = true;
      hoverFile = null;
    }
  }, 150);
}

preview.addEventListener("mouseenter", () => clearTimeout(hideTimer));
preview.addEventListener("mouseleave", () => {
  preview.hidden = true;
  hoverFile = null;
});

function bumpCount(count) {
  countEl.textContent = count === 1 ? "1 signal" : `${count} signaux`;
  if (count !== lastCount) {
    countEl.classList.remove("bump");
    void countEl.offsetWidth;
    countEl.classList.add("bump");
    lastCount = count;
  }
}

function renderFiles(files) {
  const prevNames = new Set(allFilesCache.map((file) => file.name));
  allFilesCache = files;
  const names = new Set(files.map((file) => file.name));
  bumpCount(files.length);

  const added = files.filter((file) => !prevNames.has(file.name));
  if (added.length && hasRenderedOnce) {
    toast(`${added.length} signal${added.length > 1 ? "x" : ""} reçu${added.length > 1 ? "s" : ""} ✓`);
  }

  if (!files.length) {
    emptyEl.hidden = false;
    voidEl.querySelectorAll(".space-dot").forEach((dot) => dot.remove());
    knownNodes.clear();
    hasRenderedOnce = true;
    return;
  }

  emptyEl.hidden = true;
  const batches = groupIntoBatches(files);
  const nextKeys = new Set();

  for (const batch of batches) {
    const key = batch.length > 1 ? batchKey(batch) : batch[0].name;
    nextKeys.add(key);
  }

  for (const [key, element] of [...knownNodes.entries()]) {
    if (nextKeys.has(key)) continue;
    element.classList.add("dot-vanish");
    element.addEventListener("animationend", () => element.remove(), { once: true });
    knownNodes.delete(key);
    positions.delete(key);
  }

  for (const batch of batches) {
    const key = batch.length > 1 ? batchKey(batch) : batch[0].name;
    if (knownNodes.has(key)) continue;

    const isNew = hasRenderedOnce;
    let node;

    if (batch.length > 1) {
      node = createClusterDot(batch, isNew);
    } else {
      const file = batch[0];
      node = createDot(file, isNew, () => {
        const viewable = files.filter((entry) => canViewInline(entry.name));
        const sameKind = viewable.filter((entry) => getFileKind(entry.name) === getFileKind(file.name));
        const pool = sameKind.length > 1 ? sameKind : viewable.length ? viewable : [file];
        openGalleryForFiles(pool, Math.max(0, pool.findIndex((entry) => entry.name === file.name)));
      });
    }

    voidEl.appendChild(node);
    knownNodes.set(key, node);
  }

  hasRenderedOnce = true;
}

async function loadFiles(manual = false) {
  if (refreshBusy) {
    refreshPending = true;
    return;
  }
  refreshBusy = true;

  if (manual) {
    refreshBtn?.classList.add("spinning");
    setTimeout(() => refreshBtn?.classList.remove("spinning"), 700);
  }

  setSync("busy", manual ? "Actualisation…" : "Scan…");

  try {
    const response = await fetch("/api/files", { cache: "no-store" });
    const payload = await response.json();
    const files = payload.files ?? payload;
    const revision = payload.revision ?? files.length;

    if (revision !== lastRevision || manual) {
      lastRevision = revision;
      renderFiles(files);
    }

    setSync("ok", `${files.length} signal${files.length !== 1 ? "x" : ""} — live`);
  } catch {
    setSync("err", "Connexion perdue");
  } finally {
    refreshBusy = false;
    if (refreshPending) {
      refreshPending = false;
      loadFiles(false);
    }
  }
}

async function loadInfo() {
  const response = await fetch("/api/info");
  const data = await response.json();

  document.getElementById("upload-url").textContent = data.uploadUrl;
  document.getElementById("receive-url").textContent = data.receiveUrl;
  document.getElementById("open-send").href = data.uploadUrl;

  const iface = data.interfaces?.[0];
  if (iface) {
    document.getElementById("iface-name").textContent = `(${iface.name} · port ${data.port})`;
  }

  const refreshQr = (page = "send") => {
    document.getElementById("qr").src = `/api/qr?page=${page}&t=${Date.now()}`;
    document.querySelectorAll(".qr-tab").forEach((tab) => {
      tab.classList.toggle("is-active", tab.dataset.page === page);
    });
  };

  document.querySelectorAll(".qr-tab").forEach((tab) => {
    tab.addEventListener("click", () => refreshQr(tab.dataset.page));
  });

  refreshQr("send");
  document.getElementById("wifi-hint").hidden = false;
}

function initDropZone() {
  const showDrop = (visible) => {
    voidEl.classList.toggle("is-dragover", visible);
    dropOverlay.hidden = !visible;
  };

  ["dragenter", "dragover"].forEach((eventName) => {
    voidEl.addEventListener(eventName, (event) => {
      event.preventDefault();
      showDrop(true);
    });
  });

  voidEl.addEventListener("dragleave", (event) => {
    if (!voidEl.contains(event.relatedTarget)) showDrop(false);
  });

  voidEl.addEventListener("drop", async (event) => {
    event.preventDefault();
    showDrop(false);
    if (!event.dataTransfer?.files?.length) return;
    try {
      setSync("busy", "Import…");
      await uploadLocalFiles(event.dataTransfer.files);
      toast("Fichiers ajoutés ✓");
      loadFiles(true);
    } catch (err) {
      toast(err.message);
      setSync("err", "Import échoué");
    }
  });
}

function bindFilePicker(...buttonIds) {
  const openPicker = () => pcFileInput.click();
  buttonIds.forEach((id) => {
    document.getElementById(id)?.addEventListener("click", openPicker);
  });

  pcFileInput.addEventListener("change", async () => {
    if (!pcFileInput.files?.length) return;
    try {
      await uploadLocalFiles(pcFileInput.files);
      toast("Fichiers ajoutés ✓");
      loadFiles(true);
    } catch (err) {
      toast(err.message);
    }
    pcFileInput.value = "";
  });
}

function bindFolderPicker(...buttonIds) {
  const folderInput = document.getElementById("pc-folder-input");
  if (!folderInput) return;

  const openPicker = () => folderInput.click();
  buttonIds.forEach((id) => {
    document.getElementById(id)?.addEventListener("click", openPicker);
  });

  folderInput.addEventListener("change", async () => {
    if (!folderInput.files?.length) return;
    try {
      await uploadLocalFiles(folderInput.files);
      toast(`${folderInput.files.length} fichiers du dossier ✓`);
      loadFiles(true);
    } catch (err) {
      toast(err.message);
    }
    folderInput.value = "";
  });
}

function bindPhonePicker(...buttonIds) {
  buttonIds.forEach((id) => {
    document.getElementById(id)?.addEventListener("click", openPhonePicker);
  });

  phoneFileInput.addEventListener("change", async () => {
    if (!phoneFileInput.files?.length) return;
    try {
      setSync("busy", "Envoi tel…");
      const data = await uploadToPhone(phoneFileInput.files);
      toast(`${data.files.length} fichier${data.files.length > 1 ? "s" : ""} → téléphone ✓`);
      setSync("ok", "Prêt sur le tel — Recevoir");
    } catch (err) {
      toast(err.message);
      setSync("err", "Envoi tel échoué");
    }
    phoneFileInput.value = "";
  });
}

function bindGalleryControls() {
  document.getElementById("gallery-close").addEventListener("click", closeGallery);
  document.querySelector(".gallery-backdrop").addEventListener("click", closeGallery);
  document.getElementById("gallery-prev").addEventListener("click", () => {
    if (galleryIndex > 0) {
      galleryIndex -= 1;
      renderGallery();
    }
  });
  document.getElementById("gallery-next").addEventListener("click", () => {
    if (galleryIndex < galleryFiles.length - 1) {
      galleryIndex += 1;
      renderGallery();
    }
  });
  document.getElementById("gallery-phone").addEventListener("click", async () => {
    const file = galleryFiles[galleryIndex];
    if (!file) return;
    try {
      await pushFilesToPhone([file.name]);
      toast("Envoyé au téléphone ✓");
    } catch (err) {
      toast(err.message);
    }
  });

  document.getElementById("gallery-delete").addEventListener("click", async () => {
    const file = galleryFiles[galleryIndex];
    if (!file) return;
    const label = file.name.split("/").pop();
    if (!confirm(`Supprimer « ${label} » ?`)) return;

    try {
      await deleteFile(file.name);
      toast("Fichier supprimé ✓");
      galleryFiles.splice(galleryIndex, 1);

      if (!galleryFiles.length) {
        closeGallery();
        loadFiles(true);
        return;
      }

      if (galleryIndex >= galleryFiles.length) galleryIndex = galleryFiles.length - 1;
      renderGallery();
      loadFiles(true);
    } catch (err) {
      toast(err.message || "Suppression impossible");
    }
  });

  const openAllPhotos = () => {
    const viewable = allFilesCache.filter((file) => canViewInline(file.name));
    openGalleryForFiles(viewable.length ? viewable : allFilesCache, 0);
  };

  document.getElementById("open-gallery")?.addEventListener("click", openAllPhotos);
  document.getElementById("open-gallery-web")?.addEventListener("click", openAllPhotos);

  window.addEventListener("keydown", (event) => {
    if (galleryPortal.hidden) return;
    if (event.key === "Escape") closeGallery();
    if (event.key === "ArrowLeft") document.getElementById("gallery-prev").click();
    if (event.key === "ArrowRight") document.getElementById("gallery-next").click();
    if (event.key === "Delete") document.getElementById("gallery-delete").click();
  });
}

function initStarfield() {
  const canvas = document.getElementById("starfield");
  const ctx = canvas.getContext("2d");
  let width = 0;
  let height = 0;
  let layers = [];
  let shooting = [];
  let frame = 0;

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    layers = [
      { n: Math.floor((width * height) / 12000), speed: 0.0004, size: [0.3, 0.8], alpha: 0.35 },
      { n: Math.floor((width * height) / 8000), speed: 0.0008, size: [0.5, 1.2], alpha: 0.55 },
      { n: Math.floor((width * height) / 5000), speed: 0.0012, size: [0.8, 1.8], alpha: 0.85 },
    ].map((config) => ({
      ...config,
      stars: Array.from({ length: config.n }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: config.size[0] + Math.random() * (config.size[1] - config.size[0]),
        phase: Math.random() * Math.PI * 2,
      })),
    }));
  }

  function draw() {
    frame += 1;
    ctx.fillStyle = "#030303";
    ctx.fillRect(0, 0, width, height);
    const parallaxX = (mouse.x - 0.5) * 20;
    const parallaxY = (mouse.y - 0.5) * 20;

    for (const layer of layers) {
      for (const star of layer.stars) {
        const flicker = layer.alpha * (0.6 + Math.sin(frame * layer.speed * 60 + star.phase) * 0.4);
        ctx.beginPath();
        ctx.arc(star.x + parallaxX * (star.r * 0.5), star.y + parallaxY * (star.r * 0.5), star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 200, ${flicker})`;
        ctx.fill();
      }
    }

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("mousemove", (event) => {
    mouse.x = event.clientX / window.innerWidth;
    mouse.y = event.clientY / window.innerHeight;
  });
  draw();
}

function bindConnectRefresh(connectId, refreshId) {
  document.getElementById(connectId).addEventListener("click", () => {
    const open = connectPanel.hidden;
    connectPanel.hidden = !open;
    document.getElementById(connectId).setAttribute("aria-expanded", String(open));
    const otherId = connectId === "toggle-connect" ? "toggle-connect-web" : "toggle-connect";
    document.getElementById(otherId)?.setAttribute("aria-expanded", String(open));
  });
  document.getElementById(refreshId).addEventListener("click", () => loadFiles(true));
}

function initUi() {
  bindConnectRefresh("toggle-connect", "refresh");
  bindConnectRefresh("toggle-connect-web", "refresh-web");
  bindFilePicker("add-files", "add-files-web");
  bindFolderPicker("add-folder", "add-folder-web");
  bindPhonePicker("send-to-phone", "send-to-phone-web");
  initDropZone();
  bindGalleryControls();

  document.getElementById("close-connect").addEventListener("click", () => {
    connectPanel.hidden = true;
    document.getElementById("toggle-connect")?.setAttribute("aria-expanded", "false");
    document.getElementById("toggle-connect-web")?.setAttribute("aria-expanded", "false");
  });

  document.getElementById("copy-url").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("upload-url").textContent);
    toast("Lien envoi copié ✓");
  });

  document.getElementById("copy-receive-url").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("receive-url").textContent);
    toast("Lien réception copié ✓");
  });
}

initElectronShell();
initUi();
initStarfield();
loadInfo();
loadFiles();
setInterval(() => loadFiles(false), POLL_INTERVAL_MS);
