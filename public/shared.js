export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function getFileKind(name) {
  const base = String(name).split("/").pop() || name;
  if (/\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(base)) return "image";
  if (/\.svg$/i.test(base)) return "image";
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(base)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(base)) return "audio";
  if (/\.pdf$/i.test(base)) return "pdf";
  if (/\.(md|markdown|mdx)$/i.test(base)) return "markdown";
  if (/\.(html?)$/i.test(base)) return "html";
  if (/\.(txt|log|csv)$/i.test(base)) return "text";
  if (/\.(json|js|mjs|cjs|ts|tsx|jsx|css|scss|less|xml|yaml|yml|toml|ini|py|rb|go|rs|java|c|cpp|h|hpp|sh|bat|ps1|sql)$/i.test(base)) {
    return "code";
  }
  if (/\.(zip|rar|7z|tar|gz|tgz|bz2)$/i.test(base)) return "archive";
  return "file";
}

export function getFileIcon(name) {
  const kind = getFileKind(name);
  const icons = {
    image: "🖼",
    video: "🎬",
    audio: "🎵",
    pdf: "📄",
    markdown: "📝",
    html: "🌐",
    text: "📃",
    code: "💻",
    archive: "🗜",
    file: "📎",
  };
  return icons[kind] ?? icons.file;
}

export function isImageFile(file) {
  const name = file.webkitRelativePath || file.name;
  return file.type?.startsWith("image/") || getFileKind(name) === "image";
}

export function uploadDisplayName(file) {
  return file.webkitRelativePath || file.name;
}

export function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
