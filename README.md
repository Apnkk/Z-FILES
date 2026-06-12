<p align="center">
  <img src="assets/icon.png" alt="Z-Files" width="120" height="120">
</p>

<h1 align="center">Z-Files</h1>

<p align="center">
  Application desktop de transfert local <strong>téléphone → PC</strong> pour Windows.<br>
  Même WiFi. Sans cloud. Sans compte.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-blue" alt="Version" />
  <img src="https://img.shields.io/badge/platform-Windows-0078D6" alt="Platform" />
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License" />
</p>

---

## Téléchargement

Télécharge la dernière version sur **[Releases](https://github.com/Apnkk/Z-FILES/releases)** :

| **Setup** (Recommandé) | Installateur Windows | ~82 MB |
| **Portable** | Sans installation | ~82 MB |

---

## Installation

### Option 1 : Setup (Recommandé)

1. Télécharge `Z-Files-Setup-(version).exe`
2. Exécute le fichier
3. Suis l'installation
4. Lance Z-Files depuis le menu démarrer ou le bureau

### Option 2 : Portable

1. Télécharge `Z-Files-Portable-(version).exe`
2. Place-le où tu veux
3. Double-clique pour lancer

> **Prérequis :** PC et téléphone sur le **même réseau WiFi** (4G désactivée sur le téléphone).

---

## Fonctionnalités

- **Transfert WiFi local** — Aucune donnée envoyée sur Internet
- **QR code** — Connexion en un scan depuis le téléphone
- **Interface espace** — Fichiers affichés comme des points flottants
- **Aperçu instantané** — Images, vidéos et PDF au survol
- **Temps réel** — Les fichiers apparaissent dès l'envoi
- **Mises à jour auto** — Notification quand une nouvelle version est disponible
- **App native** — Fenêtre Electron avec barre de titre custom et animations
- **Dossier local** — Fichiers reçus dans `%APPDATA%\z-files\received\`

---

## Utilisation

1. Lance **Z-Files** sur ton PC
2. Clique sur **Connexion** → QR code + lien affichés
3. Sur ton **téléphone** (même WiFi) :
   - Scanne le QR code, **ou**
   - Ouvre le lien dans le navigateur
4. Envoie tes fichiers → ils apparaissent sur le PC

```
┌─────────────┐      WiFi local       ┌─────────────┐
│  Téléphone  │  ──────────────────►  │     PC      │
│  /send      │    port 4789          │  Dashboard  │
└─────────────┘                       └─────────────┘
```

**Limites :** 500 Mo max / fichier · 20 fichiers max / envoi

---

## 🔄 Mises à jour automatiques

Z-Files vérifie **[GitHub Releases](https://github.com/Apnkk/Z-FILES/releases)** au démarrage, puis toutes les **6 heures**.

Si une nouvelle version est disponible (ex. **v2.0.0**) :

1. Une **bannière** s'affiche dans l'app
2. Clique **Télécharger** → ouverture de l'installateur
3. **Plus tard** masque la notification pour cette version

Vérification manuelle : clic droit sur l'icône dans la barre des tâches → **Rechercher une mise à jour…**

---

## Compatibilité

- Windows 10 (64-bit)
- Windows 11 (64-bit)

---

## Sécurité

- **100 % local** — Aucun cloud, aucun compte requis
- **Réseau LAN uniquement** — Le serveur n'est accessible que sur ton WiFi
- **Données privées** — Tes fichiers restent sur ton PC
- **Open source** — Code visible sur ce dépôt

> Windows peut afficher un avertissement SmartScreen au premier lancement (exe non signé). C'est normal sans certificat de signature.

---

## Développement

```bash
git clone https://github.com/Apnkk/Z-FILES.git
cd Z-FILES
npm install
npm run app      # Lancer en dev
npm run build    # Générer les .exe dans dist/
```

| Commande | Description |
|----------|-------------|
| `npm run app` | Application Electron |
| `npm run build` | Build installateur + portable |
| `npm start` | Serveur Node seul |

### Publier une version

```bash
npm version 2.0.0 --no-git-tag-version
git add package.json package-lock.json
git commit -m "Release v2.0.0"
git tag v2.0.0
git push origin main && git push origin v2.0.0
```

GitHub Actions build et attache les `.exe` à la release automatiquement.

---

## Support

En cas de problème, ouvre une **[issue](https://github.com/Apnkk/Z-FILES/issues)**.

---

<p align="center">
  © 2026 Z-Files — Développé avec ❤️ par <a href="https://github.com/Apnkk">Ares</a>
</p>
