<p align="center">
  <img src="assets/icon.png" alt="Z-Files" width="120" height="120">
</p>

<h1 align="center">Z-Files</h1>

<p align="center">
  Transfert local <strong>téléphone ↔ PC</strong> sur Windows.<br>
  Même WiFi. Sans cloud. Sans compte.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.3.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Téléchargement

Dernière version sur **[Releases](https://github.com/Apnkk/Z-FILES/releases)** :

| Fichier | Description |
|---------|-------------|
| **Z-Files-Setup-x.x.x.exe** | Installateur (recommandé) |
| **Z-Files-Portable-x.x.x.exe** | Sans installation |

> PC et téléphone sur le **même WiFi** — 4G/5G désactivée sur le téléphone.

---

## Fonctionnalités

### PC (dashboard)
- Interface **espace** — fichiers = points lumineux par type
- **Glisser-déposer** fichiers, dossiers, ZIP
- **Visionneuse intégrée** — PDF, Markdown, code, images, vidéo, audio
- **Supprimer / télécharger / envoyer au tel** depuis la visionneuse
- Sync temps réel (~1 s) + toast à chaque nouveau fichier

### Téléphone → PC (`/send`)
- Envoi fichiers, **ZIP**, **dossiers entiers**
- **Photo** (file d'attente) · **Flash** (envoi direct) · **Coller** image
- Barre de progression + confirmation

### PC → Téléphone (`/receive`)
- Grille des fichiers en attente sur le tel
- **Aperçu inline** (PDF, MD, images…)
- Télécharger ou retirer de la file

### Général
- QR code **Envoi** et **Réception** dans le panneau Connexion
- Détection IP WiFi (ignore VPN type Radmin)
- Mises à jour auto via GitHub Releases
- Fichiers reçus : `%APPDATA%\z-files\received\`

---

## Utilisation rapide

```
1. Lance Z-Files sur le PC
2. Connexion → scanne le QR (Envoi ou Réception)
3. Tel → PC : /send  |  PC → Tel : /receive
4. Clic sur un fichier PC → visionneuse
```

```
┌─────────────┐      WiFi local        ┌─────────────┐
│  Téléphone  │  ◄──────────────────►  │     PC      │
│ /send       │      port 4789         │  Dashboard  │
│ /receive    │                        │             │
└─────────────┘                        └─────────────┘
```

---

## Formats visualisables dans le navigateur

| Type | Extensions |
|------|------------|
| Images | jpg, png, gif, webp, heic, svg… |
| Vidéo / Audio | mp4, mov, webm, mp3, wav… |
| PDF | pdf |
| Markdown | md, markdown, mdx |
| Code / texte | txt, json, js, ts, css, py, html… |
| Archives | zip, rar, 7z (téléchargement) |

---

## Mises à jour automatiques

Vérification au démarrage + toutes les 6 h sur [GitHub Releases](https://github.com/Apnkk/Z-FILES/releases).

Tray → **Rechercher une mise à jour…** pour forcer.

---

## Développement

```bash
git clone https://github.com/Apnkk/Z-FILES.git
cd Z-FILES
npm install
npm run app      # Electron + serveur
npm run build    # .exe dans dist/
npm start        # Serveur seul (debug web)
```

| Commande | Rôle |
|----------|------|
| `npm run app` | App desktop |
| `npm run build` | Installateur + portable |
| `npm run dev` | Serveur avec hot reload |

### Release

```bash
npm version 1.3.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v1.3.0"
git tag v1.3.0
git push origin main && git push origin v1.3.0
```

---

## Compatibilité

- Windows 10 / 11 (64-bit)
- Navigateur mobile : Chrome, Safari, Firefox (dernières versions)

---

## Sécurité

- 100 % local — aucun cloud
- Serveur LAN uniquement (`0.0.0.0` sur ton réseau)
- Chemins fichiers sanitizés côté serveur

---

<p align="center">
  © 2026 Z-Files — <a href="https://github.com/Apnkk">Ares</a>
</p>
