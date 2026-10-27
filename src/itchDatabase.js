const fs = require('fs');
const path = require('path');
const { uniformTrackName, utf16be, uint32be } = require('./itchCrate');
const { fileType } = require('./trackTags');

const HEADER_VERSION = '2.0/Serato Scratch LIVE Database';

// Serato DJ 4+/5 keeps its library in SQLite and only re-imports the legacy
// _Serato_ folder (including Subcrates/) when the "database V2" file changes.
// Adding records for newly synced tracks changes the file, which makes Serato
// pick up the crates on its next launch.
//
// Existing otrk records are kept byte-for-byte; only missing tracks are appended.
class ItchDatabase {
  constructor() {
    this._records = []; // raw otrk payloads (Buffer)
    this._paths = new Set(); // matching keys of every pfil in _records
  }

  static readFrom(filePath) {
    const db = new ItchDatabase();
    if (!fs.existsSync(filePath)) return db;

    const buf = fs.readFileSync(filePath);
    let offset = 0;
    while (offset + 8 <= buf.length) {
      const tag = buf.toString('ascii', offset, offset + 4);
      const size = buf.readUInt32BE(offset + 4);
      const payload = buf.subarray(offset + 8, offset + 8 + size);
      offset += 8 + size;
      if (tag === 'otrk') db._addRecord(Buffer.from(payload));
    }
    return db;
  }

  hasTrack(trackRaw) {
    return this._paths.has(matchKey(uniformTrackName(trackRaw)));
  }

  // Appends a record for the track; tags is a map of text fields (tsng, tart, ...)
  addTrack(trackRaw, tags = {}) {
    const now = Math.floor(Date.now() / 1000);
    this._addRecord(buildTrackRecord(uniformTrackName(trackRaw), tags, now));
  }

  writeTo(filePath) {
    const chunks = [field('vrsn', utf16be(HEADER_VERSION))];
    for (const record of this._records) {
      chunks.push(field('otrk', record));
    }
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, Buffer.concat(chunks));
  }

  _addRecord(record) {
    this._records.push(record);
    const pfil = readField(record, 'pfil');
    if (pfil) this._paths.add(matchKey(utf16beToString(pfil)));
  }
}

// macOS may hand back decomposed (NFD) names, and Serato matches case-insensitively
function matchKey(track) {
  return track.normalize('NFC').toLowerCase();
}

// <tag> <4-byte BE size> <payload>
function field(tag, payload) {
  return Buffer.concat([Buffer.from(tag, 'ascii'), uint32be(payload.length), payload]);
}

function readField(record, wanted) {
  let offset = 0;
  while (offset + 8 <= record.length) {
    const tag = record.toString('ascii', offset, offset + 4);
    const size = record.readUInt32BE(offset + 4);
    if (tag === wanted) return record.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size;
  }
  return null;
}

function utf16beToString(buf) {
  return Buffer.from(buf).swap16().toString('utf16le');
}

// ttyp = file type, pfil = path, then the tag text fields,
// tadd/uadd = date added (string / uint32). Field order matches Serato's own export.
// Serato's DBv2 import does not read tags from the file, so they must be included here.
function buildTrackRecord(track, tags, now) {
  const chunks = [
    field('ttyp', utf16be(fileType(track))),
    field('pfil', utf16be(track)),
  ];
  for (const [tag, value] of Object.entries(tags)) {
    chunks.push(field(tag, utf16be(value)));
  }
  chunks.push(field('tadd', utf16be(String(now))));
  chunks.push(field('uadd', uint32be(now)));
  return Buffer.concat(chunks);
}

module.exports = { ItchDatabase };
