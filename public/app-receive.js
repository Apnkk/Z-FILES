import { formatSize, getFileKind, getFileIcon, escapeHtml } from "./shared.js";
import { downloadUrl, renderFileView, viewUrl } from "./file-view.js";

const grid = document.getElementById("receive-grid");
const empty = document.getElementById("receive-empty");
const lightbox = document.getElementById("receive-lightbox");
const lightboxMedia = document.getElementById("receive-lightbox-media");
const lightboxName = document.getElementById("receive-lightbox-name");
const lightboxDl = document.getElementById("receive-lightbox-dl");
const lightboxDel = document.getElementById("receive-lightbox-del");

let filesCache = [];
let lightboxToken = 0;
let currentFile = null;

function fileViewUrl(name) {
  return viewUrl(name, "/api/outbox/view");
}

function fileDownloadUrl(name) {
  return downloadUrl(name, "/api/outbox/download");
}

async function deleteOutboxFile(name) {
  const response = await fetch(`/api/outbox/files/${encodeURIComponent(name)}`, { method: "DELETE" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Suppression impossible");
}

function openLightbox(file) {
  currentFile = file;
  lightboxName.textContent = file.name;
  lightboxDl.href = fileDownloadUrl(file.name);
  lightboxDl.download = file.name.split("/").pop();

  const token = ++lightboxToken;
  renderFileView(lightboxMedia, file, { viewBase: "/api/outbox/view" }).then(() => {
    if (token !== lightboxToken) return;
  });

  lightbox.hidden = false;
}

function closeLightbox() {
  lightbox.hidden = true;
  lightboxMedia.innerHTML = "";
  currentFile = null;
  lightboxToken += 1;
}

function renderFiles(files) {
  filesCache = files;
  empty.hidden = files.length > 0;
  grid.innerHTML = files
    .map((file) => {
      const kind = getFileKind(file.name);
      const thumb =
        kind === "image"
          ? `<img src="${fileViewUrl(file.name)}" alt="" loading="lazy">`
          : `<div class="receive-tile-icon">${getFileIcon(file.name)}</div>`;
      return `
        <button type="button" class="receive-tile kind-${kind}" data-name="${escapeHtml(file.name)}">
          ${thumb}
          <span class="receive-tile-name">${escapeHtml(file.name.split("/").pop())}</span>
          <span class="receive-tile-size">${formatSize(file.size)}</span>
        </button>`;
    })
    .join("");

  grid.querySelectorAll(".receive-tile").forEach((tile) => {
    tile.addEventListener("click", () => {
      const name = tile.dataset.name;
      const file = filesCache.find((entry) => entry.name === name);
      if (file) openLightbox(file);
    });
  });
}

async function loadOutbox() {
  try {
    const response = await fetch("/api/outbox/files", { cache: "no-store" });
    const files = await response.json();
    renderFiles(files);
  } catch {
    empty.hidden = false;
    empty.querySelector("p").textContent = "Connexion perdue";
  }
}

document.getElementById("receive-lightbox-close").addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (event) => {
  if (event.target === lightbox) closeLightbox();
});

lightboxDel?.addEventListener("click", async () => {
  if (!currentFile) return;
  const label = currentFile.name.split("/").pop();
  if (!confirm(`Retirer « ${label} » de la réception ?`)) return;

  try {
    await deleteOutboxFile(currentFile.name);
    closeLightbox();
    loadOutbox();
  } catch (err) {
    alert(err.message || "Suppression impossible");
  }
});

loadOutbox();
setInterval(loadOutbox, 2000);
