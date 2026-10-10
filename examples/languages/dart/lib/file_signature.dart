// SPDX-License-Identifier: Apache-2.0
/// File type detection from leading bytes (magic numbers) for upload checks; the first matching rule wins. Detection is a
/// first check, not a malware scan: still re-encode or sandbox untrusted files.
library;

const _ftyp = {
  'avif': ('image/avif', 'avif'), 'avis': ('image/avif', 'avif'), 'heic': ('image/heic', 'heic'), 'heix': ('image/heic', 'heic'),
  'mif1': ('image/heif', 'heif'), 'msf1': ('image/heif', 'heif'), 'qt  ': ('video/quicktime', 'mov'), 'M4A ': ('audio/mp4', 'm4a'),
  '3gp4': ('video/3gpp', '3gp'), '3gp5': ('video/3gpp', '3gp'),
};
const _aliases = {'jpeg': 'jpg', 'jpe': 'jpg', 'tiff': 'tif', 'htm': 'html', 'mpeg': 'mp3', 'heif': 'heif'};
const _zipExtensions = {'zip', 'docx', 'xlsx', 'pptx', 'odt', 'ods', 'odp', 'jar', 'apk', 'epub'};

bool _at(List<int> b, int offset, String sig) {
  if (b.length < offset + sig.length) return false;
  for (var i = 0; i < sig.length; i++) {
    if (b[offset + i] != sig.codeUnitAt(i)) return false;
  }
  return true;
}

/// (mime, extension) for a recognised format, else null. Reads at most the first 64 bytes.
(String, String)? detectFileType(List<int> data) {
  final b = data.length > 64 ? data.sublist(0, 64) : data;
  if (_at(b, 0, '\x89PNG\r\n\x1a\n')) return ('image/png', 'png');
  if (_at(b, 0, '\xff\xd8\xff')) return ('image/jpeg', 'jpg');
  if (_at(b, 0, 'GIF87a') || _at(b, 0, 'GIF89a')) return ('image/gif', 'gif');
  if (_at(b, 0, 'RIFF') && _at(b, 8, 'WEBP')) return ('image/webp', 'webp');
  if (_at(b, 0, 'RIFF') && _at(b, 8, 'WAVE')) return ('audio/wav', 'wav');
  if (_at(b, 0, 'RIFF') && _at(b, 8, 'AVI ')) return ('video/x-msvideo', 'avi');
  if (_at(b, 0, 'BM') && b.length >= 14) return ('image/bmp', 'bmp');
  if (_at(b, 0, '\x00\x00\x01\x00')) return ('image/x-icon', 'ico');
  if (_at(b, 0, 'II*\x00') || _at(b, 0, 'MM\x00*')) return ('image/tiff', 'tif');
  if (_at(b, 0, '%PDF-')) return ('application/pdf', 'pdf');
  if (_at(b, 0, 'PK\x03\x04') || _at(b, 0, 'PK\x05\x06')) return ('application/zip', 'zip');
  if (_at(b, 0, '\x1f\x8b')) return ('application/gzip', 'gz');
  if (_at(b, 0, '7z\xbc\xaf\x27\x1c')) return ('application/x-7z-compressed', '7z');
  if (_at(b, 0, 'Rar!\x1a\x07')) return ('application/vnd.rar', 'rar');
  if (_at(b, 0, 'SQLite format 3\x00')) return ('application/vnd.sqlite3', 'sqlite');
  if (_at(b, 0, '\x00asm')) return ('application/wasm', 'wasm');
  if (_at(b, 0, 'OggS')) return ('audio/ogg', 'ogg');
  if (_at(b, 0, 'fLaC')) return ('audio/flac', 'flac');
  if (_at(b, 0, 'ID3') || (b.length >= 2 && b[0] == 0xFF && (b[1] & 0xE0) == 0xE0 && (b[1] & 0x06) != 0)) return ('audio/mpeg', 'mp3');
  if (_at(b, 0, '\x1aE\xdf\xa3')) return ('video/webm', 'webm');
  if (_at(b, 4, 'ftyp') && b.length >= 12) {
    final brand = String.fromCharCodes(b.sublist(8, 12));
    return _ftyp[brand] ?? ('video/mp4', 'mp4');
  }
  if (_at(b, 0, 'wOFF')) return ('font/woff', 'woff');
  if (_at(b, 0, 'wOF2')) return ('font/woff2', 'woff2');
  return null;
}

/// True when the content's detected type agrees with the file name's extension (case-insensitive; jpeg/jpe -> jpg,
/// tiff -> tif). Zip content matches zip and zip containers (docx, xlsx, pptx, odt, ods, odp, jar, apk, epub); HEIC content
/// matches heic or heif. A name without an extension never matches.
bool matchesExtension(List<int> data, String filename) {
  final dot = filename.lastIndexOf('.');
  if (dot < 0) return false;
  var ext = filename.substring(dot + 1).toLowerCase();
  ext = _aliases[ext] ?? ext;
  final t = detectFileType(data);
  if (t == null) return false;
  if (t.$2 == 'zip') return _zipExtensions.contains(ext);
  if (t.$2 == 'heic') return ext == 'heic' || ext == 'heif';
  return ext == t.$2;
}
