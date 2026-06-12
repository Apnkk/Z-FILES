import fs from "fs";
import path from "path";

const MIME_TYPES = {
  ".pdf": "application/pdf",
  ".md": "text/markdown; charset=utf-8",
  ".markdown": "text/markdown; charset=utf-8",
  ".mdx": "text/markdown; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".log": "text/plain; charset=utf-8",
  ".csv": "text/csv; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".cjs": "text/javascript; charset=utf-8",
  ".ts": "text/plain; charset=utf-8",
  ".jsx": "text/plain; charset=utf-8",
  ".tsx": "text/plain; charset=utf-8",
  ".yaml": "text/yaml; charset=utf-8",
  ".yml": "text/yaml; charset=utf-8",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".heic": "image/heic",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
};

export function getMimeType(filename) {
  const ext = path.extname(String(filename).split("/").pop() || "").toLowerCase();
  return MIME_TYPES[ext] || "application/octet-stream";
}

export function sendInlineFile(res, filePath, filename) {
  const type = getMimeType(filename);
  const safeName = path.basename(filename).replace(/[^\w.\-() ]+/g, "_") || "file";
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", `inline; filename="${safeName}"`);
  res.sendFile(filePath);
}

export function sanitizeRelativePath(original) {
  const parts = String(original || "file")
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.replace(/[^\w.\-() ]+/g, "_").trim())
    .filter((part) => part && part !== "." && part !== "..");
  return parts.join("/") || "file";
}

export function uniqueFilename(original, directory) {
  const base = path.basename(original).replace(/[^\w.\-() ]+/g, "_");
  const ext = path.extname(base);
  const stem = path.basename(base, ext).slice(0, 80) || "file";
  let candidate = `${stem}${ext}`;
  let index = 1;

  while (fs.existsSync(path.join(directory, candidate))) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  return candidate;
}

export function resolveUploadRelativePath(original, directory) {
  const safe = sanitizeRelativePath(original);
  const parts = safe.split("/");
  const base = parts.pop() || "file";
  const subDir = parts.length ? path.join(directory, ...parts) : directory;
  fs.mkdirSync(subDir, { recursive: true });
  const unique = uniqueFilename(base, subDir);
  parts.push(unique);
  return parts.join("/");
}

export function resolveFilePath(directory, filename) {
  const safe = sanitizeRelativePath(filename);
  if (!safe) return null;
  const full = path.resolve(directory, ...safe.split("/"));
  const root = path.resolve(directory);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}

export function listDirectoryFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  const out = [];

  function walk(currentDir, prefix) {
    for (const name of fs.readdirSync(currentDir)) {
      if (name === ".gitkeep") continue;
      const full = path.join(currentDir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) {
        walk(full, rel);
        continue;
      }
      out.push({
        name: rel.replace(/\\/g, "/"),
        size: stat.size,
        mtime: stat.mtimeMs,
        isImage: /\.(jpe?g|png|gif|webp|heic|bmp|svg)$/i.test(name),
      });
    }
  }

  walk(directory, "");
  return out.sort((a, b) => b.mtime - a.mtime);
}

export function createDiskStorage(directory) {
  return {
    destination: (_req, _file, cb) => cb(null, directory),
    filename: (_req, file, cb) => {
      try {
        const relative = resolveUploadRelativePath(file.originalname, directory);
        cb(null, relative.replace(/\//g, path.sep));
      } catch (err) {
        cb(err);
      }
    },
  };
}
