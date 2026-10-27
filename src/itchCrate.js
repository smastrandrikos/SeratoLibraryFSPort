const fs = require('fs');

const DEFAULT_COLUMNS = ['song', 'artist', 'album', 'length'];
const DEFAULT_VERSION = '81.0';
const DEFAULT_SORTING = 'song';
const DEFAULT_SORTING_REV = 256;

// Write a string as UTF-16 Big-Endian (matches Java's DataOutputStream.writeChars)
function utf16be(str) {
  const buf = Buffer.alloc(str.length * 2);
  for (let i = 0; i < str.length; i++) {
    buf.writeUInt16BE(str.charCodeAt(i), i * 2);
  }
  return buf;
}

// Write a 4-byte big-endian unsigned integer (matches Java's DataOutputStream.writeInt)
function uint32be(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32BE(value >>> 0, 0);
  return buf;
}

// Write an N-byte big-endian unsigned integer (matches Java's ItchOutputStream.writeLong)
function uintNbe(value, bytes) {
  const buf = Buffer.alloc(bytes);
  let v = value;
  for (let i = bytes - 1; i >= 0; i--) {
    buf[i] = v & 0xff;
    v = Math.floor(v / 256);
  }
  return buf;
}

// Mirrors Java's getUniformTrackName:
//   - Convert backslashes to forward slashes (Windows paths)
//   - Strip Windows drive letter (e.g. C:/)
//   - Strip macOS /Volumes/<name>/ prefix
//   - Strip the leading slash (Serato stores paths relative to the volume root)
function uniformTrackName(name) {
  name = name.replace(/\\/g, '/');
  name = name.replace(/^[a-zA-Z]:\//, '');
  name = name.replace(/^\/Volumes\/[^/]+\//, '');
  name = name.replace(/^\//, '');
  return name;
}

class ItchCrate {
  constructor() {
    this.version = DEFAULT_VERSION;
    this.sorting = DEFAULT_SORTING;
    this.sortingRev = DEFAULT_SORTING_REV;
    this.columns = [...DEFAULT_COLUMNS];
    this.tracks = [];
  }

  addTracks(tracks) {
    this.tracks.push(...tracks);
  }

  writeTo(filePath) {
    const ascii = (s) => Buffer.from(s, 'ascii');
    const b1 = (v) => Buffer.from([v]);

    const chunks = [];

    // ── Header ──────────────────────────────────────────────────────────────
    // vrsn \x00 \x00 <version UTF-16BE> "/Serato ScratchLive Crate" UTF-16BE
    chunks.push(ascii('vrsn'));
    chunks.push(b1(0));
    chunks.push(b1(0));
    chunks.push(utf16be(this.version));
    chunks.push(utf16be('/Serato ScratchLive Crate'));

    // ── Sort block ───────────────────────────────────────────────────────────
    // osrt <size> tvcn <size> <sorting UTF-16BE> brev <sortingRev 5-bytes BE>
    // size = 4(tvcn) + 4(tvcn size) + sorting.len*2 + 4(brev) + 5(brev val) = 17 + sorting.len*2
    chunks.push(ascii('osrt'));
    chunks.push(uint32be(this.sorting.length * 2 + 17));
    chunks.push(ascii('tvcn'));
    chunks.push(uint32be(this.sorting.length * 2));
    chunks.push(utf16be(this.sorting));
    chunks.push(ascii('brev'));
    chunks.push(uintNbe(this.sortingRev, 5));

    // ── Column blocks ────────────────────────────────────────────────────────
    // ovct <size> tvcn <size> <col UTF-16BE> tvcw \x00\x00\x00\x02 \x00 \x30
    // size = 4(tvcn) + 4(tvcn size) + col.len*2 + 4(tvcw) + 4(tvcw size) + 1 + 1 = 18 + col.len*2
    for (const col of this.columns) {
      chunks.push(ascii('ovct'));
      chunks.push(uint32be(col.length * 2 + 18));
      chunks.push(ascii('tvcn'));
      chunks.push(uint32be(col.length * 2));
      chunks.push(utf16be(col));
      chunks.push(ascii('tvcw'));
      chunks.push(uint32be(2));
      chunks.push(b1(0));
      chunks.push(b1(48)); // 0x30
    }

    // ── Track blocks ─────────────────────────────────────────────────────────
    // otrk <size> ptrk <size> <track UTF-16BE>
    // size = 4(ptrk) + 4(ptrk size) + track.len*2 = 8 + track.len*2
    for (const trackRaw of this.tracks) {
      const track = uniformTrackName(trackRaw);
      chunks.push(ascii('otrk'));
      chunks.push(uint32be(track.length * 2 + 8));
      chunks.push(ascii('ptrk'));
      chunks.push(uint32be(track.length * 2));
      chunks.push(utf16be(track));
    }

    fs.writeFileSync(filePath, Buffer.concat(chunks));
  }
}

module.exports = { ItchCrate, uniformTrackName, utf16be, uint32be };
