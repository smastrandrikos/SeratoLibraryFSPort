const fs = require('fs');
const path = require('path');
const { ItchCrate } = require('./itchCrate');
const { ItchDatabase } = require('./itchDatabase');
const { readTrackTags } = require('./trackTags');
const { deleteAllFilesInDirectory, deleteFile } = require('./fileUtils');

class ItchLibrary {
  constructor() {
    this._crateFileName = new Map(); // ItchCrate → filename string
    this._root = null;
    this._crates = [];     // level 1
    this._subCrates = [];  // level 2+
  }

  // parentCrateName: when set, the selected folder itself becomes the top-level
  // crate (holding its own tracks) and its folders become subcrates beneath it
  static createFrom(fsLibrary, parentCrateName = null) {
    const lib = new ItchLibrary();
    if (parentCrateName) {
      lib._buildLibrary(fsLibrary, 1, parentCrateName);
    } else {
      lib._buildLibrary(fsLibrary, 0, '');
    }
    return lib;
  }

  // Recursively mirrors Java's buildLibrary (includeSubcrateTracks = false):
  // each crate contains only the tracks directly inside its own directory.
  _buildLibrary(fsLibrary, level, crateName) {
    const crate = new ItchCrate();
    crate.addTracks(fsLibrary.getTracks()); // direct tracks only

    for (const child of fsLibrary.getChildren()) {
      const nextName = crateName.length > 0
        ? `${crateName}%%${child.directory}`
        : child.directory;
      this._buildLibrary(child, level + 1, nextName);
    }

    if (level === 0) {
      this._root = crate; // root is built but never written to disk
    } else if (level === 1) {
      this._crates.push(crate);
    } else {
      this._subCrates.push(crate);
    }

    this._crateFileName.set(crate, `${crateName}.crate`);
  }

  async writeTo(itchLibraryPath, clearLibraryBeforeSync) {
    if (clearLibraryBeforeSync) {
      deleteAllFilesInDirectory(path.join(itchLibraryPath, 'Crates'));
      deleteAllFilesInDirectory(path.join(itchLibraryPath, 'Subcrates'));
      deleteFile(path.join(itchLibraryPath, 'database V2'));
    }

    // Both crates and subcrates are written to the Subcrates/ folder
    // (mirrors Java — Serato uses %% in filenames to encode hierarchy)
    for (const crate of [...this._crates, ...this._subCrates]) {
      const fileName = this._crateFileName.get(crate);
      const crateFile = path.join(itchLibraryPath, 'Subcrates', fileName);
      fs.mkdirSync(path.dirname(crateFile), { recursive: true });
      crate.writeTo(crateFile);
    }

    // Register the tracks in "database V2" so Serato DJ 4+/5 notices the change
    // and re-imports the crates on its next launch. Tags are read here because
    // Serato's import only shows what the database record contains.
    const databaseFile = path.join(itchLibraryPath, 'database V2');
    const database = ItchDatabase.readFrom(databaseFile);
    let addedTracks = 0;
    let untaggedTracks = 0;
    const allCrates = [this._root, ...this._crates, ...this._subCrates].filter(Boolean);
    for (const crate of allCrates) {
      for (const track of crate.tracks) {
        if (database.hasTrack(track)) continue;
        const tags = await readTrackTags(track);
        if (!tags.tsng) untaggedTracks++;
        database.addTrack(track, tags);
        addedTracks++;
      }
    }
    if (addedTracks > 0) database.writeTo(databaseFile);
    return { addedTracks, untaggedTracks };
  }

  getTotalNumberOfCrates() {
    return this._crates.length;
  }

  getTotalNumberOfSubCrates() {
    return this._subCrates.length;
  }
}

module.exports = { ItchLibrary };
