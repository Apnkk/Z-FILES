import { formatSize, getFileIcon, isImageFile, uploadDisplayName, escapeHtml } from "./shared.js";

const form = document.getElementById("upload-form");
const input = document.getElementById("file-input");
const folderInput = document.getElementById("folder-input");
const drop = document.getElementById("drop-area");
const queue = document.getElementById("queue");
const sendBtn = document.getElementById("send-btn");
const status = document.getElementById("status");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const successBurst = document.getElementById("success-burst");
const cameraInput = document.getElementById("camera-input");
const flashInput = document.getElementById("flash-input");
const flashBtn = document.getElementById("btn-flash");

let selected = [];
let flashBusy = false;
const thumbUrls = new Map();

function normalizePhoto(file, prefix = "photo") {
  const type = file.type || "image/jpeg";
  const ext = type.includes("jpeg") ? "jpg" : type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
  const hasName = file.name && !/^image\.(jpe?g|png|heic)$/i.test(file.name);
  if (hasName) return file;
  return new File([file], `${prefix}-${Date.now()}.${ext}`, {
    type,
    lastModified: file.lastModified || Date.now(),
  });
}

function takeFiles(fileInput) {
  const files = Array.from(fileInput.files || []);
  fileInput.value = "";
  return files;
}

async function snapshotFromInput(fileInput, prefix = "photo") {
  await new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });

  const raw = Array.from(fileInput.files || []);
  fileInput.value = "";
  if (!raw.length) return [];

  const files = [];
  for (const file of raw) {
    try {
      const buffer = await file.arrayBuffer();
      if (!buffer.byteLength) continue;
      const type = file.type || "image/jpeg";
      const ext = type.includes("jpeg") ? "jpg" : type.split("/")[1]?.replace("jpeg", "jpg") || "jpg";
      const hasName = file.name && !/^image\.(jpe?g|png|heic)$/i.test(file.name);
      const name = hasName ? file.name : `${prefix}-${Date.now()}.${ext}`;
      files.push(
        new File([buffer], name, {
          type,
          lastModified: file.lastModified || Date.now(),
        })
      );
    } catch {
      /* skip unreadable capture */
    }
  }
  return files;
}

function bindFileInput(fileInput, handler) {
  fileInput.addEventListener("change", () => {
    const files = takeFiles(fileInput);
    if (files.length) handler(files);
  });
}

function bindCaptureInput(fileInput, handler, prefix = "photo") {
  let busy = false;
  fileInput.addEventListener("change", async () => {
    if (busy) return;
    busy = true;
    try {
      const files = await snapshotFromInput(fileInput, prefix);
      if (files.length) await handler(files);
    } finally {
      busy = false;
    }
  });
}

function revokeThumbUrls() {
  for (const url of thumbUrls.values()) URL.revokeObjectURL(url);
  thumbUrls.clear();
}

function spawnSuccessBurst() {
  successBurst.hidden = false;
  successBurst.innerHTML = "";
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const colors = ["#dc2626", "#ef4444", "#991b1b", "#fca5a5"];

  for (let i = 0; i < 24; i += 1) {
    const particle = document.createElement("div");
    particle.className = "success-particle";
    particle.style.left = `${centerX}px`;
    particle.style.top = `${centerY}px`;
    particle.style.background = colors[i % colors.length];
    const angle = (Math.PI * 2 * i) / 24;
    const distance = 80 + Math.random() * 120;
    particle.style.setProperty("--sx", `${Math.cos(angle) * distance}px`);
    particle.style.setProperty("--sy", `${Math.sin(angle) * distance}px`);
    successBurst.appendChild(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }

  setTimeout(() => {
    successBurst.hidden = true;
  }, 900);
}

function renderQueue() {
  revokeThumbUrls();

  if (!selected.length) {
    queue.hidden = true;
    sendBtn.disabled = true;
    queue.innerHTML = "";
    return;
  }

  queue.hidden = false;
  sendBtn.disabled = false;
  queue.innerHTML = selected
    .map((file, index) => {
      const label = uploadDisplayName(file);
      const thumb = isImageFile(file)
        ? (() => {
            const url = URL.createObjectURL(file);
            thumbUrls.set(index, url);
            return `<img class="queue-thumb" src="${url}" alt="">`;
          })()
        : `<div class="queue-icon">${getFileIcon(label)}</div>`;
      return `
        <li class="queue-item" style="--qi:${index}">
          ${thumb}
          <div class="queue-meta">
            <div class="queue-name">${escapeHtml(label)}</div>
            <div class="queue-size">${formatSize(file.size)}</div>
          </div>
          <button type="button" class="queue-remove" data-i="${index}" aria-label="Retirer">×</button>
        </li>`;
    })
    .join("");
}

function addFiles(fileList) {
  for (const file of fileList) selected.push(file);
  renderQueue();
}

function showStatus(message, ok) {
  status.hidden = false;
  status.textContent = message;
  status.className = `status ${ok ? "ok" : "err"}`;
}

function uploadFiles(files) {
  return new Promise((resolve, reject) => {
    const body = new FormData();
    for (const file of files) {
      if (!file.size) {
        reject(new Error("Fichier vide — réessaye"));
        return;
      }
      body.append("files", file, uploadDisplayName(file));
    }

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const percent = Math.round((event.loaded / event.total) * 100);
      progressFill.style.width = `${percent}%`;
      progressLabel.textContent = `Transmission… ${percent}%`;
    };

    xhr.onload = () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 400) reject(new Error(data.error || "Erreur"));
        else resolve(data);
      } catch {
        reject(new Error("Réponse invalide"));
      }
    };

    xhr.onerror = () => reject(new Error("Connexion perdue"));
    xhr.send(body);
  });
}

queue.addEventListener("click", (event) => {
  const button = event.target.closest(".queue-remove");
  if (!button) return;
  event.preventDefault();
  event.stopPropagation();
  const index = Number(button.dataset.i);
  if (Number.isNaN(index) || index < 0 || index >= selected.length) return;
  selected.splice(index, 1);
  renderQueue();
});

drop.addEventListener("click", () => input.click());

drop.addEventListener("mousemove", (event) => {
  const rect = drop.getBoundingClientRect();
  drop.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  drop.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
});

bindFileInput(input, (files) => addFiles(files));
bindFileInput(folderInput, (files) => {
  addFiles(files);
  showStatus(`${files.length} fichier${files.length > 1 ? "s" : ""} du dossier ✓`, true);
});

document.getElementById("btn-folder").addEventListener("click", () => folderInput.click());

drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("dragover");
});

drop.addEventListener("dragleave", () => drop.classList.remove("dragover"));

drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("dragover");
  if (event.dataTransfer?.files?.length) addFiles(event.dataTransfer.files);
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selected.length) return;
  await runUpload(selected);
});

async function runUpload(files, { flash = false } = {}) {
  if (!files.length) return;

  if (flash) {
    flashBusy = true;
    flashBtn.classList.add("is-busy");
    flashInput.disabled = true;
  } else {
    sendBtn.disabled = true;
  }

  status.hidden = true;
  progressWrap.hidden = false;
  progressFill.style.width = "0%";
  progressLabel.textContent = flash ? "Flash…" : "Transmission…";

  try {
    const data = await uploadFiles(files);
    const count = data.files.length;
    progressFill.style.width = "100%";
    spawnSuccessBurst();
    showStatus(
      flash
        ? `Flash ✓ ${count} photo${count > 1 ? "s" : ""} sur le PC`
        : `${count} fichier${count > 1 ? "s" : ""} reçu${count > 1 ? "s" : ""} sur le PC ✓`,
      true
    );
    selected = [];
    renderQueue();
  } catch (err) {
    showStatus(err.message || "Échec de l'envoi", false);
    if (!flash) sendBtn.disabled = selected.length > 0;
  } finally {
    if (flash) {
      flashBusy = false;
      flashBtn.classList.remove("is-busy");
      flashInput.disabled = false;
    }
    setTimeout(() => {
      progressWrap.hidden = true;
    }, 600);
  }
}

document.getElementById("btn-camera").addEventListener("click", () => cameraInput.click());
document.getElementById("btn-flash").addEventListener("click", () => {
  if (flashBusy) return;
  flashInput.click();
});

bindCaptureInput(cameraInput, (files) => {
  addFiles(files);
  showStatus(`${files.length} photo${files.length > 1 ? "s" : ""} prête${files.length > 1 ? "s" : ""} — Envoyer sur le PC`, true);
  sendBtn.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

bindCaptureInput(flashInput, async (files) => {
  if (flashBusy) return;
  await runUpload(files, { flash: true });
}, "flash");

document.getElementById("btn-paste").addEventListener("click", async () => {
  if (!navigator.clipboard?.read) {
    showStatus("Coller non supporté sur ce navigateur", false);
    return;
  }

  try {
    const items = await navigator.clipboard.read();
    const blobs = [];

    for (const item of items) {
      for (const type of item.types) {
        if (!type.startsWith("image/")) continue;
        const blob = await item.getType(type);
        const ext = type.split("/")[1]?.replace("jpeg", "jpg") || "png";
        blobs.push(new File([blob], `collage-${Date.now()}.${ext}`, { type }));
      }
    }

    if (!blobs.length) {
      showStatus("Aucune image dans le presse-papier", false);
      return;
    }

    addFiles(blobs);
    showStatus(`${blobs.length} image${blobs.length > 1 ? "s" : ""} collée${blobs.length > 1 ? "s" : ""} ✓`, true);
  } catch {
    showStatus("Autorise l'accès au presse-papier", false);
  }
});
