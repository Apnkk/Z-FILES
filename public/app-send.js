import { formatSize, getFileIcon, isImageFile } from "./shared.js";

const form = document.getElementById("upload-form");
const input = document.getElementById("file-input");
const drop = document.getElementById("drop-area");
const queue = document.getElementById("queue");
const sendBtn = document.getElementById("send-btn");
const status = document.getElementById("status");
const progressWrap = document.getElementById("progress-wrap");
const progressFill = document.getElementById("progress-fill");
const progressLabel = document.getElementById("progress-label");
const successBurst = document.getElementById("success-burst");

let selected = [];

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
  if (!selected.length) {
    queue.hidden = true;
    sendBtn.disabled = true;
    return;
  }

  queue.hidden = false;
  sendBtn.disabled = false;
  queue.innerHTML = selected
    .map((file, index) => {
      const thumb = isImageFile(file)
        ? `<img class="queue-thumb" src="${URL.createObjectURL(file)}" alt="">`
        : `<div class="queue-icon">${getFileIcon(file.name)}</div>`;
      return `
        <li class="queue-item" style="--qi:${index}">
          ${thumb}
          <div class="queue-meta">
            <div class="queue-name">${file.name}</div>
            <div class="queue-size">${formatSize(file.size)}</div>
          </div>
          <button type="button" class="queue-remove" data-i="${index}" aria-label="Retirer">×</button>
        </li>`;
    })
    .join("");

  queue.querySelectorAll(".queue-remove").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selected.splice(Number(button.dataset.i), 1);
      renderQueue();
    });
  });
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
    for (const file of files) body.append("files", file);

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

drop.addEventListener("click", () => input.click());

drop.addEventListener("mousemove", (event) => {
  const rect = drop.getBoundingClientRect();
  drop.style.setProperty("--mx", `${((event.clientX - rect.left) / rect.width) * 100}%`);
  drop.style.setProperty("--my", `${((event.clientY - rect.top) / rect.height) * 100}%`);
});

input.addEventListener("change", () => {
  addFiles(input.files);
  input.value = "";
});

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

  sendBtn.disabled = true;
  status.hidden = true;
  progressWrap.hidden = false;
  progressFill.style.width = "0%";
  progressLabel.textContent = "Transmission…";

  try {
    const data = await uploadFiles(selected);
    const count = data.files.length;
    progressFill.style.width = "100%";
    spawnSuccessBurst();
    showStatus(`${count} fichier${count > 1 ? "s" : ""} reçu${count > 1 ? "s" : ""} sur le PC ✓`, true);
    selected = [];
    renderQueue();
  } catch (err) {
    showStatus(err.message || "Échec de l'envoi", false);
    sendBtn.disabled = false;
  }

  setTimeout(() => {
    progressWrap.hidden = true;
  }, 600);
});
