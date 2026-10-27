# SeratoLibraryFSPort

**Serato Library Sync** — a small desktop app that imports a folder tree from disk into
[Serato DJ](https://serato.com/dj) as crates and subcrates.

Every folder becomes a crate, every subfolder a subcrate, and every supported audio/video
file is added to the crate of the folder it sits in. It is a Node.js / Electron port of the
Java tool *itch-sync*, updated to work with **Serato DJ Pro 5**.

![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows-lightgrey)
![Electron](https://img.shields.io/badge/electron-28-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Contents

- [Features](#features)
- [Serato version compatibility](#serato-version-compatibility)
- [Requirements](#requirements)
- [Running from source](#running-from-source)
- [Building a standalone app](#building-a-standalone-app)
- [Using the app](#using-the-app)
- [How it works](#how-it-works)
- [Project structure](#project-structure)
- [Troubleshooting](#troubleshooting)
- [Known limitations](#known-limitations)
- [License](#license)

---

## Features

- Mirrors a folder tree as Serato crates / subcrates (`Parent%%Child` hierarchy).
- Optional **parent crate**: the selected folder itself becomes the top-level crate.
- Optional **clear before sync**: removes existing crate files first.
- Reads track tags (title, artist, album, genre, label, composer, remixer, year, key, BPM,
  comment, length, bitrate, sample rate) so tracks show their metadata in Serato straight
  away, without a manual *Rescan file info*.
- Works with **Serato DJ Pro 5** (SQLite-based library) as well as older versions.
- Refuses to sync while Serato DJ Pro is running, so Serato cannot overwrite the result.
- Supported file types:
  `mp3 wav ogg aif aiff flac aac alac m4a mp4 mov avi flv mpg mpeg dv qtz`

## Serato version compatibility

| Serato DJ Pro | How crates are picked up |
|---|---|
| 2.x – 3.x | Serato reads the `.crate` files in `_Serato_/Subcrates` on every launch. |
| 4.x – 5.x | Serato keeps its library in SQLite (`~/Library/Application Support/Serato/Library/`). It only re-imports the `_Serato_` folder when the **`database V2`** file has changed. |

To support Serato 5, the app also adds every newly synced track to `database V2`
(including its tags). That change makes Serato import the crates on its next launch.

> **Important for Serato 5:** a sync only triggers a re-import when at least one *new*
> track is added to `database V2`. If you only rename or move folders, Serato 5 will not
> notice. The app shows a warning in the log when that happens.

## Requirements

- **Node.js 18 or newer** and **npm** (only needed to run from source or to build)
- macOS or Windows
- Serato DJ Pro installed, with an existing `_Serato_` library folder

## Running from source

```bash
git clone https://github.com/smastrandrikos/SeratoLibraryFSPort.git
cd SeratoLibraryFSPort
npm install
npm start
```

`npm install` downloads Electron and the `music-metadata` tag reader into `node_modules/`
(not committed to git).

## Building a standalone app

The app is packaged with [@electron/packager](https://github.com/electron/packager), run
through `npx`, so nothing extra needs to be installed. Run these from the project folder
after `npm install`.

**macOS (Intel)**

```bash
npx @electron/packager . "Serato Library Sync" --platform=darwin --arch=x64 --out=dist --overwrite --ignore="^/\.claude"
```

**macOS (Apple Silicon)** — use `--arch=arm64`, or `--arch=universal` for a single app that
runs on both.

**Windows** (run on a Windows machine)

```bash
npx @electron/packager . "Serato Library Sync" --platform=win32 --arch=x64 --out=dist --overwrite --ignore="^/\.claude"
```

The result is written to `dist/`, for example
`dist/Serato Library Sync-darwin-x64/Serato Library Sync.app`. Copy the app to
`/Applications` (macOS) or anywhere you like (Windows). `dist/` is ignored by git.

Electron itself is a dev dependency and is not copied into the package; only the app code
and `music-metadata` are bundled (in `app.asar`).

> The build is **not code-signed**. On another Mac, macOS will block it the first time:
> right-click the app → **Open**, or run
> `xattr -dr com.apple.quarantine "/Applications/Serato Library Sync.app"`.

## Using the app

1. **Quit Serato DJ Pro.** The app will not sync while it is running.
2. **Music Library Path** — the folder whose subfolders should become crates,
   e.g. `~/Music/Music 2026`.
3. **Serato Library Path** — the `_Serato_` folder of the drive the music is on:
   - internal drive: `~/Music/_Serato_`
   - external drive: `/Volumes/<drive>/_Serato_`
4. Choose the options:
   - **Clear existing crates before sync** — deletes all `.crate` files in `Crates/` and
     `Subcrates/` and removes `database V2` before writing. *On Serato 5, leave this off
     unless you really want to start from scratch.* Serato rebuilds `database V2` from its
     own library, but it is safer not to delete it.
   - **Include parent crate** — see the example below.
5. Click **Start Sync** and check the log.
6. Start Serato DJ Pro. The crates appear under the Serato library.

### Example

Folder on disk:

```
Music 2026/
├── Indie/
├── Gledd - My Church Is on Fire/
└── VA - SOUL by the SEA, Vol. 1/
```

| Include parent crate | Crates in Serato |
|---|---|
| Off (default) | `Indie`, `Gledd - My Church Is on Fire`, `VA - SOUL by the SEA, Vol. 1` |
| On | `Music 2026` → `Indie`, `Gledd - …`, `VA - …` as subcrates |

When turning the parent crate on for a folder you have synced before, also tick
**Clear existing crates before sync**. Otherwise the old top-level crates stay next to the
new nested ones.

## How it works

1. **Scan** (`src/mediaLibrary.js`) — walks the music folder recursively and collects
   supported files per folder.
2. **Build crates** (`src/itchLibrary.js`) — one crate per folder; the crate name encodes
   the hierarchy with `%%` (e.g. `Music 2026%%Indie`). Each crate holds only the tracks
   directly inside its own folder.
3. **Write crates** (`src/itchCrate.js`) — writes Serato's binary crate format to
   `_Serato_/Subcrates/<name>.crate`. Track paths are stored relative to the volume root
   (`Users/...` on the system drive, without the `/Volumes/<drive>/` prefix on external
   drives).
4. **Update `database V2`** (`src/itchDatabase.js`) — reads the existing `database V2`,
   keeps every existing record byte-for-byte, and appends a record for each track Serato
   does not know yet. Running a sync twice does not create duplicates.
5. **Read tags** (`src/trackTags.js`, `src/id3Text.js`) — tags for the new records are
   formatted the way Serato writes them. MP3 / AIFF / WAV tags are read from the raw ID3
   frames (so values such as `Techno (Peak Time / Driving)` stay intact); FLAC, OGG and M4A
   tags come from `music-metadata`.

On its next launch, Serato 5 sees the changed `database V2`, imports it together with the
crates, and stores everything in its SQLite library.

## Project structure

```
main.js              Electron main process: window, IPC, sync orchestration
preload.js           Exposes a minimal API to the renderer (contextIsolation on)
renderer/            UI: index.html, renderer.js, styles.css
src/
  mediaLibrary.js    Scans the folder tree for supported media files
  itchLibrary.js     Builds the crate hierarchy and writes crates + database V2
  itchCrate.js       Serato .crate writer and path normalisation
  itchDatabase.js    Reads / appends to Serato's "database V2"
  trackTags.js       Reads tags and formats them as database V2 fields
  id3Text.js         Minimal raw ID3v2.3/2.4 text-frame reader
  fileUtils.js       File deletion helpers used by "clear before sync"
```

## Troubleshooting

**"Serato DJ is running" error** — quit Serato DJ Pro completely and sync again.

**Crates do not appear in Serato 5**

- Check the log said `Added N new tracks to database V2`. If it warned that no new tracks
  were added, Serato 5 will not re-import (see [limitations](#known-limitations)).
- Make sure the Serato Library Path is the `_Serato_` folder on the same drive as the music.
- Look in the newest Serato log in `~/Music/_Serato_/Logs/` for a line like
  `Dbv2: Starting DBv2 import of '…/_Serato_/database V2'`.

**Tracks show only their filename** — the file has no readable title tag (the log reports
how many). Tracks that were synced with an older version of this app keep their old
records; use Serato's *Rescan file info* for those.

**Some files are missing from a crate** — check the file extension is in the supported list
above.

## Known limitations

- Serato 5 only re-imports when `database V2` changes, which happens only when new tracks are
  synced. Pure folder renames / moves are not picked up.
- Tags are written only for tracks added to `database V2` for the first time. Existing
  records are never modified.
- Length, bitrate and BPM written by the app can differ slightly from Serato's own values;
  Serato updates them when it analyses the track.
- One Serato library path per sync. For music spread across several drives, run a sync per
  drive with that drive's `_Serato_` folder.
- Builds are unsigned.

## License

[MIT](LICENSE) © 2026 Sotiris Mastrandrikos
