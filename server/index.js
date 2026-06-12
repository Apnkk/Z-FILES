import express from "express";
import multer from "multer";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  DEFAULT_PORT,
  MAX_FILE_SIZE,
  MAX_FILES_PER_UPLOAD,
  MAX_PORT_RETRIES,
} from "./constants.js";
import { getNetworkInterfaces, getPreferredLocalIp, scoreNetworkInterface } from "./network.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function uniqueFilename(original, receivedDir) {
  const base = path.basename(original).replace(/[^\w.\-() ]+/g, "_");
  const ext = path.extname(base);
  const stem = path.basename(base, ext).slice(0, 80) || "file";
  let candidate = `${stem}${ext}`;
  let index = 1;

  while (fs.existsSync(path.join(receivedDir, candidate))) {
    candidate = `${stem} (${index})${ext}`;
    index += 1;
  }
  return candidate;
}

function resolveFilePath(receivedDir, filename) {
  const safe = path.basename(filename);
  const full = path.resolve(receivedDir, safe);
  const root = path.resolve(receivedDir);
  if (full !== root && !full.startsWith(`${root}${path.sep}`)) return null;
  return full;
}

export function createApp({ root, receivedDir, port }) {
  const publicDir = path.join(root, "public");
  fs.mkdirSync(receivedDir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: (_req, _file, cb) => cb(null, receivedDir),
      filename: (_req, file, cb) => cb(null, uniqueFilename(file.originalname, receivedDir)),
    }),
    limits: { fileSize: MAX_FILE_SIZE },
  });

  const app = express();
  app.use(express.json());
  app.use(express.static(publicDir));

  app.get("/api/info", (_req, res) => {
    const ip = getPreferredLocalIp();
    const interfaces = getNetworkInterfaces()
      .map(({ name, ip: address }) => ({
        name,
        ip: address,
        score: scoreNetworkInterface(name, address),
      }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score);

    res.json({
      ip,
      port,
      url: `http://${ip}:${port}`,
      uploadUrl: `http://${ip}:${port}/send`,
      receivedDir,
      interfaces,
    });
  });

  app.get("/api/qr", async (_req, res) => {
    const ip = getPreferredLocalIp();
    const url = `http://${ip}:${port}/send`;
    try {
      const png = await QRCode.toBuffer(url, { width: 280, margin: 2 });
      res.type("png").send(png);
    } catch {
      res.status(500).json({ error: "QR generation failed" });
    }
  });

  app.get("/api/files", (_req, res) => {
    const files = fs
      .readdirSync(receivedDir)
      .filter((name) => name !== ".gitkeep")
      .map((name) => {
        const full = path.join(receivedDir, name);
        const stat = fs.statSync(full);
        return {
          name,
          size: stat.size,
          mtime: stat.mtimeMs,
          isImage: /\.(jpe?g|png|gif|webp|heic|bmp|svg)$/i.test(name),
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    res.json(files);
  });

  app.post("/api/upload", upload.array("files", MAX_FILES_PER_UPLOAD), (req, res) => {
    const saved = (req.files ?? []).map((file) => ({
      name: file.filename,
      size: file.size,
      original: file.originalname,
    }));

    if (!saved.length) {
      return res.status(400).json({ error: "Aucun fichier reçu" });
    }

    res.json({ ok: true, files: saved });
  });

  app.get("/api/download/:name", (req, res) => {
    const full = resolveFilePath(receivedDir, req.params.name);
    if (!full || !fs.existsSync(full)) return res.status(404).send("Not found");
    res.download(full);
  });

  app.delete("/api/files/:name", (req, res) => {
    const full = resolveFilePath(receivedDir, req.params.name);
    if (!full || !fs.existsSync(full)) return res.status(404).json({ error: "Not found" });
    fs.unlinkSync(full);
    res.json({ ok: true });
  });

  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  app.get("/send", (_req, res) => res.sendFile(path.join(publicDir, "send.html")));

  return app;
}

export function startServer(options = {}) {
  const root = options.root ?? path.join(__dirname, "..");
  const receivedDir = options.receivedDir ?? path.join(root, "received");
  const basePort = options.port ?? (Number(process.env.PORT) || DEFAULT_PORT);
  const quiet = options.quiet ?? false;

  function listen(port) {
    const app = createApp({ root, receivedDir, port });
    return new Promise((resolve, reject) => {
      const server = app.listen(port, "0.0.0.0", () => {
        const ip = getPreferredLocalIp();
        if (!quiet) {
          console.log("");
          console.log("  Z-Files — transfert local tel → PC");
          console.log("  ───────────────────────────────────");
          console.log(`  PC (dashboard) : http://localhost:${port}`);
          console.log(`  Téléphone      : http://${ip}:${port}/send`);
          console.log(`  Dossier        : ${receivedDir}`);
          console.log("");
        }
        resolve({ server, port, receivedDir, ip, url: `http://localhost:${port}` });
      });
      server.on("error", reject);
    });
  }

  return (async () => {
    for (let attempt = 0; attempt < MAX_PORT_RETRIES; attempt += 1) {
      const port = basePort + attempt;
      try {
        return await listen(port);
      } catch (err) {
        if (err.code !== "EADDRINUSE" || attempt === MAX_PORT_RETRIES - 1) throw err;
      }
    }
    return null;
  })();
}

const isDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectRun) {
  startServer().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
