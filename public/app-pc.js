import { formatSize, getFileKind, getFileIcon, isImageFile } from "./shared.js";
import { initElectronShell } from "./electron-shell.js";

const voidEl = document.getElementById("space-void");
const preview = document.getElementById("preview-card");
const emptyEl = document.getElementById("space-empty");
const countEl = document.getElementById("file-count");
const syncDot = document.getElementById("sync-dot");
const syncLabel = document.getElementById("sync-label");
const burstLayer = document.getElementById("burst-layer");
const refreshBtn = document.getElementById("refresh");
const connectPanel = document.getElementById("connect-panel");

const POLL_INTERVAL_MS = 2500;
const kindColors = {
  image: "#ef4444",
  video: "#dc2626",
  audio: "#b91c1c",
  pdf: "#991b1b",
  file: "#78716c",
};
const kindLabels = {
  image: "Image",
  video: "Vidéo",
  audio: "Audio",
  pdf: "PDF",
  file: "Fichier",
};

let knownFiles = new Map();
let positions = new Map();
let hoverFile = null;
let refreshBusy = false;
let lastCount = 0;
let hasRenderedOnce = false;
let mouse = { x: 0.5, y: 0.5 };

function hashString(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getPosition(name) {
  if (positions.has(name)) return positions.get(name);
  const hash = hashString(name);
  const position = {
    x: 14 + (hash % 7200) / 100,
    y: 12 + ((hash >> 8) % 6800) / 100,
  };
  positions.set(name, position);
  return position;
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

function createDot(file, isNew) {
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
      const trail = document.createElement("span");
      trail.className = "dot-trail";
      dot.appendChild(trail);
      trail.addEventListener("animationend", () => trail.remove(), { once: true });
    });
  }

  dot.addEventListener("mouseenter", () => showPreview(file, dot));
  dot.addEventListener("mouseleave", hidePreviewSoon);
  dot.addEventListener("focus", () => showPreview(file, dot));
  dot.addEventListener("blur", hidePreviewSoon);
  dot.addEventListener("click", () => {
    window.location.href = `/api/download/${encodeURIComponent(file.name)}`;
  });

  return dot;
}

function showPreview(file, anchor) {
  hoverFile = file.name;
  const kind = getFileKind(file.name);
  document.getElementById("preview-kind").textContent = kindLabels[kind] ?? "Fichier";

  const media = document.getElementById("preview-media");
  const url = `/api/download/${encodeURIComponent(file.name)}`;

  if (kind === "image") {
    media.innerHTML = `<img src="${url}" alt="">`;
  } else if (kind === "video") {
    media.innerHTML = `<video src="${url}" muted preload="metadata"></video>`;
    media.querySelector("video")?.play?.().catch(() => {});
  } else {
    media.innerHTML = `<div class="preview-icon">${getFileIcon(file.name)}</div>`;
  }

  document.getElementById("preview-name").textContent = file.name;
  document.getElementById("preview-size").textContent = formatSize(file.size);

  const downloadLink = document.getElementById("preview-dl");
  downloadLink.href = url;
  downloadLink.download = file.name;

  document.getElementById("preview-del").onclick = async () => {
    if (!confirm(`Supprimer « ${file.name} » ?`)) return;
    await fetch(`/api/files/${encodeURIComponent(file.name)}`, { method: "DELETE" });
    preview.hidden = true;
    toast("Signal effacé");
    loadFiles(true);
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
  const names = new Set(files.map((file) => file.name));
  bumpCount(files.length);

  if (!files.length) {
    emptyEl.hidden = false;
    voidEl.querySelectorAll(".space-dot").forEach((dot) => dot.remove());
    knownFiles.clear();
    hasRenderedOnce = true;
    return;
  }

  emptyEl.hidden = true;

  for (const [name, element] of [...knownFiles.entries()]) {
    if (names.has(name)) continue;
    element.classList.add("dot-vanish");
    element.addEventListener("animationend", () => element.remove(), { once: true });
    knownFiles.delete(name);
    positions.delete(name);
  }

  for (const file of files) {
    if (knownFiles.has(file.name)) continue;
    const dot = createDot(file, hasRenderedOnce);
    voidEl.appendChild(dot);
    knownFiles.set(file.name, dot);
  }

  hasRenderedOnce = true;

  if (hoverFile && names.has(hoverFile)) {
    const file = files.find((entry) => entry.name === hoverFile);
    const anchor = knownFiles.get(hoverFile);
    if (file && anchor) showPreview(file, anchor);
  }
}

async function loadFiles(manual = false) {
  if (refreshBusy) return;
  refreshBusy = true;

  if (manual) {
    refreshBtn.classList.add("spinning");
    setTimeout(() => refreshBtn.classList.remove("spinning"), 700);
  }

  setSync("busy", manual ? "Actualisation…" : "Scan…");

  try {
    const response = await fetch("/api/files");
    const files = await response.json();
    renderFiles(files);
    setSync("ok", `${files.length} signal${files.length !== 1 ? "x" : ""} — live`);
  } catch {
    setSync("err", "Connexion perdue");
  } finally {
    refreshBusy = false;
  }
}

async function loadInfo() {
  const response = await fetch("/api/info");
  const data = await response.json();

  document.getElementById("upload-url").textContent = data.uploadUrl;
  document.getElementById("open-send").href = data.uploadUrl;

  const iface = data.interfaces?.[0];
  if (iface) document.getElementById("iface-name").textContent = `(${iface.name})`;

  document.getElementById("qr").src = `/api/qr?t=${Date.now()}`;
  document.getElementById("wifi-hint").hidden = false;

  document.querySelectorAll(".connect-steps li").forEach((item, index) => {
    item.dataset.step = String(index + 1);
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

  function maybeAddShootingStar() {
    if (Math.random() > 0.008) return;
    shooting.push({
      x: Math.random() * width,
      y: Math.random() * height * 0.4,
      len: 60 + Math.random() * 80,
      speed: 8 + Math.random() * 6,
      angle: Math.PI / 4 + (Math.random() - 0.5) * 0.3,
      life: 1,
    });
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
        const x = star.x + parallaxX * (star.r * 0.5);
        const y = star.y + parallaxY * (star.r * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, star.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 200, ${flicker})`;
        ctx.fill();
      }
    }

    maybeAddShootingStar();
    shooting = shooting.filter((star) => {
      star.x += Math.cos(star.angle) * star.speed;
      star.y += Math.sin(star.angle) * star.speed;
      star.life -= 0.025;
      if (star.life <= 0) return false;

      const gradient = ctx.createLinearGradient(
        star.x,
        star.y,
        star.x - Math.cos(star.angle) * star.len,
        star.y - Math.sin(star.angle) * star.len
      );
      gradient.addColorStop(0, `rgba(255, 180, 180, ${star.life})`);
      gradient.addColorStop(1, "rgba(255, 180, 180, 0)");
      ctx.strokeStyle = gradient;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(star.x, star.y);
      ctx.lineTo(star.x - Math.cos(star.angle) * star.len, star.y - Math.sin(star.angle) * star.len);
      ctx.stroke();
      return true;
    });

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
  document.querySelectorAll(".btn").forEach((button) => {
    button.addEventListener("mousemove", (event) => {
      const rect = button.getBoundingClientRect();
      button.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
      button.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
    });
  });

  bindConnectRefresh("toggle-connect", "refresh");
  bindConnectRefresh("toggle-connect-web", "refresh-web");

  document.getElementById("close-connect").addEventListener("click", () => {
    connectPanel.hidden = true;
    document.getElementById("toggle-connect")?.setAttribute("aria-expanded", "false");
    document.getElementById("toggle-connect-web")?.setAttribute("aria-expanded", "false");
  });

  document.getElementById("copy-url").addEventListener("click", async () => {
    await navigator.clipboard.writeText(document.getElementById("upload-url").textContent);
    toast("Lien copié ✓");
  });
}

initElectronShell();
initUi();
initStarfield();
loadInfo();
loadFiles();
setInterval(() => loadFiles(false), POLL_INTERVAL_MS);
