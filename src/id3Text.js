const fs = require('fs');

// Minimal ID3v2.3/2.4 reader for text frames (TIT2, TPE1, TCON, ...).
// music-metadata splits ID3v2.3 values on "/" and parses "(...)" in genres as
// genre codes, which loses text ("Techno (Peak Time / Driving)" → "Techno ").
// Serato shows the raw value, so these frames are read here as-is.
//
// Returns Map(frameId → string) or null if there is no readable tag.
function readId3TextFrames(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const tagOffset = findTagOffset(fd);
    if (tagOffset < 0) return null;

    const header = readAt(fd, tagOffset, 10);
    const major = header[3];
    const flags = header[5];
    if (header.toString('latin1', 0, 3) !== 'ID3' || (major !== 3 && major !== 4)) return null;
    if (flags & 0x80) return null; // whole-tag unsynchronisation: leave it to music-metadata

    const tag = readAt(fd, tagOffset + 10, syncsafe(header, 6));
    let offset = 0;
    if (flags & 0x40) {
      // Extended header: v2.3 size excludes its own 4 bytes, v2.4 size includes them
      offset = major === 3 ? 4 + tag.readUInt32BE(0) : syncsafe(tag, 0);
    }
    return readFrames(tag, offset, major);
  } catch {
    return null;
  } finally {
    fs.closeSync(fd);
  }
}

// MP3: tag at the start. AIFF / WAV: tag in an "ID3 " / "id3 " chunk.
function findTagOffset(fd) {
  const start = readAt(fd, 0, 12);
  const magic = start.toString('latin1', 0, 4);
  if (start.toString('latin1', 0, 3) === 'ID3') return 0;

  let littleEndian;
  if (magic === 'FORM') littleEndian = false; // AIFF / AIFC
  else if (magic === 'RIFF') littleEndian = true; // WAV
  else return -1;

  const fileSize = fs.fstatSync(fd).size;
  let offset = 12;
  while (offset + 8 <= fileSize) {
    const chunk = readAt(fd, offset, 8);
    const id = chunk.toString('latin1', 0, 4);
    const size = littleEndian ? chunk.readUInt32LE(4) : chunk.readUInt32BE(4);
    if (id === 'ID3 ' || id === 'id3 ') return offset + 8;
    offset += 8 + size + (size % 2); // chunks are padded to an even size
  }
  return -1;
}

function readFrames(tag, offset, major) {
  const frames = new Map();
  while (offset + 10 <= tag.length) {
    const id = tag.toString('latin1', offset, offset + 4);
    if (!/^[A-Z0-9]{4}$/.test(id)) break; // padding
    const size = major === 4 ? syncsafe(tag, offset + 4) : tag.readUInt32BE(offset + 4);
    const formatFlags = tag[offset + 9];
    let data = tag.subarray(offset + 10, offset + 10 + size);
    offset += 10 + size;

    if (major === 3) {
      if (formatFlags & 0xc0) continue; // compressed / encrypted
      if (formatFlags & 0x20) data = data.subarray(1); // grouping identity
    } else {
      if (formatFlags & 0x0c) continue; // compressed / encrypted
      if (formatFlags & 0x40) data = data.subarray(1); // grouping identity
      if (formatFlags & 0x01) data = data.subarray(4); // data length indicator
      if (formatFlags & 0x02) data = removeUnsync(data);
    }

    if (id[0] === 'T' && id !== 'TXXX' && !frames.has(id) && data.length > 1) {
      const text = decodeText(data[0], data.subarray(1));
      if (text) frames.set(id, text);
    }
  }
  return frames;
}

// Multiple values (null-separated) are joined with a space, as Serato shows them
function decodeText(encoding, buf) {
  const values = [];
  if (encoding === 1 || encoding === 2) {
    let start = 0;
    for (let i = 0; i + 1 < buf.length; i += 2) {
      if (buf[i] === 0 && buf[i + 1] === 0) {
        values.push(decodeUtf16(buf.subarray(start, i), encoding === 2));
        start = i + 2;
      }
    }
    values.push(decodeUtf16(buf.subarray(start, buf.length - ((buf.length - start) % 2)), encoding === 2));
  } else {
    const charset = encoding === 3 ? 'utf8' : 'latin1';
    let start = 0;
    for (let i = 0; i <= buf.length; i++) {
      if (i === buf.length || buf[i] === 0) {
        values.push(buf.toString(charset, start, i));
        start = i + 1;
      }
    }
  }
  return values.map((v) => v.trim()).filter(Boolean).join(' ');
}

// Encoding 1 has a BOM per value (little-endian if missing); encoding 2 is BOM-less big-endian
function decodeUtf16(buf, bigEndian) {
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    bigEndian = true;
    buf = buf.subarray(2);
  } else if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    bigEndian = false;
    buf = buf.subarray(2);
  }
  return bigEndian ? Buffer.from(buf).swap16().toString('utf16le') : buf.toString('utf16le');
}

// 0xFF 0x00 → 0xFF
function removeUnsync(buf) {
  const out = [];
  for (let i = 0; i < buf.length; i++) {
    out.push(buf[i]);
    if (buf[i] === 0xff && buf[i + 1] === 0x00) i++;
  }
  return Buffer.from(out);
}

function syncsafe(buf, offset) {
  return ((buf[offset] & 0x7f) << 21) | ((buf[offset + 1] & 0x7f) << 14) |
    ((buf[offset + 2] & 0x7f) << 7) | (buf[offset + 3] & 0x7f);
}

function readAt(fd, position, length) {
  const buf = Buffer.alloc(length);
  const bytesRead = fs.readSync(fd, buf, 0, length, position);
  return buf.subarray(0, bytesRead);
}

module.exports = { readId3TextFrames };
