const fs = require('fs');
const path = require('path');

const MEDIA_EXTENSIONS = /\.(mp3|wav|ogg|aif|aiff|flac|aac|alac|mov|mp4|m4a|avi|flv|mpg|mpeg|dv|qtz)$/i;

class MediaLibrary {
  constructor(directory) {
    this.directory = directory;
    this._tracks = [];
    this._children = [];
  }

  static readFrom(mediaLibraryPath) {
    const root = new MediaLibrary('.');
    root._collectAll(mediaLibraryPath);
    return root;
  }

  _collectAll(dirPath) {
    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isFile() && MEDIA_EXTENSIONS.test(entry.name.trim())) {
        this._tracks.push(path.join(dirPath, entry.name));
      }
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const child = new MediaLibrary(entry.name);
        child._collectAll(path.join(dirPath, entry.name));
        this._children.push(child);
      }
    }

    // Maintain sorted order (mirrors Java's TreeSet behaviour)
    this._tracks.sort();
    this._children.sort((a, b) => a.directory.localeCompare(b.directory));
  }

  getTracks() {
    return this._tracks;
  }

  getChildren() {
    return this._children;
  }

  getTotalNumberOfTracks() {
    let count = this._tracks.length;
    for (const child of this._children) count += child.getTotalNumberOfTracks();
    return count;
  }

  getTotalNumberOfDirectories() {
    let count = this._children.length;
    for (const child of this._children) count += child.getTotalNumberOfDirectories();
    return count;
  }
}

module.exports = { MediaLibrary };
