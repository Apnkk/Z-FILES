import express from "express";
import multer from "multer";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { DEFAULT_PORT, MAX_PORT_RETRIES } from "./constants.js";
import { getNetworkInterfaces, getPreferredLocalIp, scoreNetworkInterface } from "./network.js";
import {
  createDiskStorage,
  listDirectoryFiles,
  resolveFilePath,
  resolveUploadRelativePath,
  sanitizeRelativePath,
  sendInlineFile,
} from "./files.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function nestedParam(req, prefix) {
  const raw = req.url.split("?")[0].slice(prefix.length);
  return sanitizeRelativePath(decodeURIComponent(raw));
}

function uploadArray(upload, field) {
  return (req, res, next) => {
    upload.array(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || "Upload échoué" });
      next();
    });
  };
}

function buildFileRoutes(app, { receivedDir, outboxDir, getRevision, bumpRevision }) {
  fs.mkdirSync(receivedDir, { recursive: true });
  fs.mkdirSync(outboxDir, { recursive: true });

  const uploadReceived = multer({ storage: multer.diskStorage(createDiskStorage(receivedDir)) });
  const uploadOutbox = multer({ storage: multer.diskStorage(createDiskStorage(outboxDir)) });

  app.get("/api/files", (_req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
      revision: getRevision(),
      files: listDirectoryFiles(receivedDir),
    });
  });

  app.post("/api/upload", uploadArray(uploadReceived, "files"), (req, res) => {
    const saved = (req.files ?? [])
      .filter((file) => file.size > 0)
      .map((file) => ({
        name: file.filename,
        size: file.size,
        original: file.originalname,
      }));

    if (!saved.length) {
      return res.status(400).json({ error: "Aucun fichier reçu (photo vide ou refusée)" });
    }

    bumpRevision();
    res.json({ ok: true, revision: getRevision(), files: saved });
  });

  app.get("/api/view/*", (req, res) => {
    const name = nestedParam(req, "/api/view/");
    const full = resolveFilePath(receivedDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).send("Not found");
    sendInlineFile(res, full, name);
  });

  app.get("/api/download/*", (req, res) => {
    const name = nestedParam(req, "/api/download/");
    const full = resolveFilePath(receivedDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).send("Not found");
    res.download(full);
  });

  app.delete("/api/files/*", (req, res) => {
    const name = nestedParam(req, "/api/files/");
    const full = resolveFilePath(receivedDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).json({ error: "Not found" });
    fs.unlinkSync(full);
    bumpRevision();
    res.json({ ok: true, revision: getRevision() });
  });

  app.get("/api/outbox/files", (_req, res) => {
    res.json(listDirectoryFiles(outboxDir));
  });

  app.post("/api/outbox/upload", uploadArray(uploadOutbox, "files"), (req, res) => {
    const saved = (req.files ?? []).map((file) => ({
      name: file.filename,
      size: file.size,
      original: file.originalname,
    }));

    if (!saved.length) {
      return res.status(400).json({ error: "Aucun fichier envoyé" });
    }

    res.json({ ok: true, files: saved });
  });

  app.post("/api/outbox/push", express.json(), (req, res) => {
    const names = Array.isArray(req.body?.names) ? req.body.names : [];
    const pushed = [];

    for (const name of names) {
      const source = resolveFilePath(receivedDir, name);
      if (!source || !fs.existsSync(source)) continue;
      const relative = resolveUploadRelativePath(name, outboxDir);
      const dest = path.join(outboxDir, ...relative.split("/"));
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(source, dest);
      pushed.push({ name: relative.replace(/\\/g, "/"), source: name });
    }

    if (!pushed.length) {
      return res.status(400).json({ error: "Aucun fichier transféré" });
    }

    res.json({ ok: true, files: pushed });
  });

  app.get("/api/outbox/view/*", (req, res) => {
    const name = nestedParam(req, "/api/outbox/view/");
    const full = resolveFilePath(outboxDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).send("Not found");
    sendInlineFile(res, full, name);
  });

  app.get("/api/outbox/download/*", (req, res) => {
    const name = nestedParam(req, "/api/outbox/download/");
    const full = resolveFilePath(outboxDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).send("Not found");
    res.download(full);
  });

  app.delete("/api/outbox/files/*", (req, res) => {
    const name = nestedParam(req, "/api/outbox/files/");
    const full = resolveFilePath(outboxDir, name);
    if (!full || !fs.existsSync(full)) return res.status(404).json({ error: "Not found" });
    fs.unlinkSync(full);
    res.json({ ok: true });
  });
}

export function createApp({ root, receivedDir, outboxDir, port }) {
  const publicDir = path.join(root, "public");
  const app = express();
  let filesRevision = 0;
  const getRevision = () => filesRevision;
  const bumpRevision = () => {
    filesRevision += 1;
  };

  app.use(express.json());
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }
    next();
  });
  app.use(express.static(publicDir));

  buildFileRoutes(app, { receivedDir, outboxDir, getRevision, bumpRevision });

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

    const base = `http://${ip}:${port}`;
    res.json({
      ip,
      port,
      url: base,
      uploadUrl: `${base}/send`,
      receiveUrl: `${base}/receive`,
      receivedDir,
      outboxDir,
      interfaces,
    });
  });

  app.get("/api/qr", async (req, res) => {
    const ip = getPreferredLocalIp();
    const target = req.query.page === "receive" ? "receive" : "send";
    const url = `http://${ip}:${port}/${target}`;
    try {
      const png = await QRCode.toBuffer(url, { width: 280, margin: 2 });
      res.type("png").send(png);
    } catch {
      res.status(500).json({ error: "QR generation failed" });
    }
  });

  app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
  app.get("/send", (_req, res) => res.sendFile(path.join(publicDir, "send.html")));
  app.get("/receive", (_req, res) => res.sendFile(path.join(publicDir, "receive.html")));

  return app;
}

export function startServer(options = {}) {
  const root = options.root ?? path.join(__dirname, "..");
  const receivedDir = options.receivedDir ?? path.join(root, "received");
  const outboxDir = options.outboxDir ?? path.join(root, "outbox");
  const basePort = options.port ?? (Number(process.env.PORT) || DEFAULT_PORT);
  const quiet = options.quiet ?? false;

  function listen(port) {
    const app = createApp({ root, receivedDir, outboxDir, port });
    return new Promise((resolve, reject) => {
      const server = app.listen(port, "0.0.0.0", () => {
        const ip = getPreferredLocalIp();
        if (!quiet) {
          console.log("");
          console.log("  Z-Files — transfert local");
          console.log("  ───────────────────────────────────");
          console.log(`  PC (dashboard) : http://localhost:${port}`);
          console.log(`  Tel → PC       : http://${ip}:${port}/send`);
          console.log(`  PC → Tel       : http://${ip}:${port}/receive`);
          console.log(`  Dossier PC     : ${receivedDir}`);
          console.log("");
        }
        resolve({ server, port, receivedDir, outboxDir, ip, url: `http://localhost:${port}` });
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
