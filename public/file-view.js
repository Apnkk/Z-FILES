import { getFileIcon, getFileKind } from "./shared.js";

export function canViewInline(name) {
  const kind = getFileKind(name);
  return kind !== "archive" && kind !== "file";
}

export function viewUrl(name, base = "/api/view") {
  return `${base}/${encodeURIComponent(name)}`;
}

export function downloadUrl(name, base = "/api/download") {
  return `${base}/${encodeURIComponent(name)}`;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderMarkdown(source) {
  let html = escapeHtml(source);

  html = html.replace(/```([\s\S]*?)```/g, (_, code) => `<pre class="md-code-block"><code>${code.trim()}</code></pre>`);
  html = html.replace(/`([^`\n]+)`/g, "<code>$1</code>");
  html = html.replace(/^### (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^## (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^# (.+)$/gm, "<h1>$1</h1>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  html = html.replace(/^(?:-|\*) (.+)$/gm, "<li>$1</li>");
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");
  html = html.replace(/\n{2,}/g, "</p><p>");
  html = `<p>${html}</p>`;
  html = html.replace(/<p><\/p>/g, "");
  html = html.replace(/<p>(<h[123]>)/g, "$1");
  html = html.replace(/(<\/h[123]>)<\/p>/g, "$1");
  html = html.replace(/<p>(<ul>)/g, "$1");
  html = html.replace(/(<\/ul>)<\/p>/g, "$1");
  html = html.replace(/<p>(<pre)/g, "$1");
  html = html.replace(/(<\/pre>)<\/p>/g, "$1");

  return html;
}

export async function renderFileView(container, file, { viewBase = "/api/view", compact = false } = {}) {
  const name = file.name;
  const kind = getFileKind(name);
  const url = viewUrl(name, viewBase);
  container.classList.remove("is-compact", "is-document", "is-media");

  if (kind === "image") {
    container.classList.add("is-media");
    container.innerHTML = `<img src="${url}" alt="${escapeHtml(name)}">`;
    return;
  }

  if (kind === "video") {
    container.classList.add("is-media");
    container.innerHTML = `<video src="${url}" controls autoplay muted playsinline></video>`;
    return;
  }

  if (kind === "audio") {
    container.classList.add("is-media");
    container.innerHTML = `
      <div class="file-view-audio">
        <div class="file-view-audio-icon">${getFileIcon(name)}</div>
        <audio src="${url}" controls autoplay></audio>
      </div>`;
    return;
  }

  if (kind === "pdf") {
    container.classList.add("is-document");
    container.innerHTML = `<iframe src="${url}" title="${escapeHtml(name)}" class="file-view-pdf"></iframe>`;
    return;
  }

  if (kind === "html") {
    container.classList.add("is-document");
    container.innerHTML = `<iframe src="${url}" title="${escapeHtml(name)}" class="file-view-frame" sandbox="allow-scripts allow-same-origin"></iframe>`;
    return;
  }

  if (kind === "markdown" || kind === "text" || kind === "code") {
    container.classList.add("is-document");
    if (compact) container.classList.add("is-compact");
    container.innerHTML = `<div class="file-view-loading">Chargement…</div>`;

    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error("fetch failed");
      const text = await response.text();
      if (kind === "markdown") {
        container.innerHTML = `<article class="file-view-md">${renderMarkdown(text)}</article>`;
      } else {
        container.innerHTML = `<pre class="file-view-code"><code>${escapeHtml(text)}</code></pre>`;
      }
    } catch {
      container.innerHTML = `<div class="file-view-error">Impossible d'afficher ce fichier</div>`;
    }
    return;
  }

  container.innerHTML = `
    <div class="file-view-fallback">
      <span class="file-view-fallback-icon">${getFileIcon(name)}</span>
      <span class="file-view-fallback-name">${escapeHtml(name)}</span>
      <p>Aperçu non disponible — télécharge pour ouvrir</p>
    </div>`;
}
