const fs = require('fs');
const path = require('path');
const { readId3TextFrames } = require('./id3Text');

// music-metadata is ESM-only, so it has to be loaded with a dynamic import
let parseFilePromise = null;
function loadParser() {
  if (!parseFilePromise) {
    parseFilePromise = import('music-metadata').then((mm) => mm.parseFile);
  }
  return parseFilePromise;
}

// Serato's ttyp for extensions where it differs from the extension itself
const SERATO_FILE_TYPES = { wav: 'wave', aif: 'aiff' };

function fileType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  return SERATO_FILE_TYPES[ext] || ext;
}

// Reads the file's tags and returns them as database V2 text fields
// (tag → string), formatted the way Serato writes them itself.
// Returns {} if the file cannot be parsed; Serato then shows the filename only.
async function readTrackTags(filePath) {
  let metadata;
  try {
    const parseFile = await loadParser();
    metadata = await parseFile(filePath, { duration: false, skipCovers: true });
  } catch {
    return {};
  }

  const { common, format } = metadata;
  const id3 = readId3TextFrames(filePath);
  const fields = id3 ? id3Fields(id3) : vorbisLikeFields(common, metadata.native);
  Object.assign(fields, {
    tcom: commentText(first(common.comment)),
    tlen: format.duration ? formatLength(format.duration) : undefined,
    tsiz: formatSize(fs.statSync(filePath).size),
    tbit: format.bitrate ? `${(format.bitrate / 1000).toFixed(1)}kbps` : undefined,
    tsmp: format.sampleRate ? `${(format.sampleRate / 1000).toFixed(1)}k` : undefined,
  });

  const tags = {};
  for (const [tag, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      tags[tag] = String(value).trim();
    }
  }
  return tags;
}

// Raw ID3v2 text frames (MP3 / AIFF / WAV)
function id3Fields(frames) {
  return {
    tsng: frames.get('TIT2'),
    tart: frames.get('TPE1'),
    talb: frames.get('TALB'),
    tgen: id3Genre(frames.get('TCON')),
    tgrp: frames.get('TIT1'),
    tlbl: frames.get('TPUB'),
    tcmp: frames.get('TCOM'),
    trmx: frames.get('TPE4'),
    ttyr: id3Year(frames),
    tkey: frames.get('TKEY'),
    tbpm: formatBpm(frames.get('TBPM')),
  };
}

// "(35)House" → "House": a leading ID3v1 genre code is dropped when a name follows it
function id3Genre(value) {
  return value && value.replace(/^(\(\d+\))+(?=[^(])/, '');
}

// v2.4: TDRC ("2026-01-30"). v2.3: TYER + TDAT (DDMM), as Serato combines them.
function id3Year(frames) {
  if (frames.has('TDRC')) return frames.get('TDRC');
  const year = frames.get('TYER');
  const date = frames.get('TDAT');
  if (year && date && /^\d{4}$/.test(date)) {
    return `${year}-${date.slice(2, 4)}-${date.slice(0, 2)}`;
  }
  return year;
}

// FLAC / OGG / M4A: music-metadata's common tags are lossless here
function vorbisLikeFields(common, native) {
  return {
    tsng: common.title,
    tart: common.artist,
    talb: common.album,
    tgen: (common.genre || []).join(' '),
    tgrp: common.grouping,
    tlbl: first(common.label),
    tcmp: first(common.composer),
    trmx: first(common.remixer),
    ttyr: common.date || (common.year ? String(common.year) : undefined),
    tkey: common.key || nativeValue(native, ['INITIALKEY', 'KEY']),
    tbpm: formatBpm(nativeValue(native, ['BPM', 'TEMPO', 'tmpo']) ?? common.bpm),
  };
}

function nativeValue(native, ids) {
  for (const tags of Object.values(native)) {
    const tag = tags.find((t) => ids.includes(t.id));
    if (tag) return tag.value;
  }
  return undefined;
}

function first(values) {
  return Array.isArray(values) ? values[0] : values;
}

// Comments are plain strings in some music-metadata versions, { text } objects in others
function commentText(comment) {
  return comment && typeof comment === 'object' ? comment.text : comment;
}

// "128" → "128.00"
function formatBpm(value) {
  const bpm = parseFloat(value);
  return bpm > 0 ? bpm.toFixed(2) : undefined;
}

// 384.05 → "06:24.05"
function formatLength(seconds) {
  const centis = Math.round(seconds * 100);
  const mins = Math.floor(centis / 6000);
  const secs = Math.floor((centis % 6000) / 100);
  const cs = centis % 100;
  return `${pad2(mins)}:${pad2(secs)}.${pad2(cs)}`;
}

// 15897461 → "15.2MB"
function formatSize(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

module.exports = { readTrackTags, fileType };
