export function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function getFileKind(name) {
  if (/\.(jpe?g|png|gif|webp|heic|bmp|svg)$/i.test(name)) return "image";
  if (/\.(mp4|mov|webm|mkv|avi)$/i.test(name)) return "video";
  if (/\.(mp3|wav|ogg|flac|m4a)$/i.test(name)) return "audio";
  if (/\.pdf$/i.test(name)) return "pdf";
  return "file";
}

export function getFileIcon(name) {
  const kind = getFileKind(name);
  const icons = { image: "🖼", video: "🎬", audio: "🎵", pdf: "📄", file: "📎" };
  return icons[kind] ?? icons.file;
}

export function isImageFile(file) {
  return file.type?.startsWith("image/") || getFileKind(file.name) === "image";
}
