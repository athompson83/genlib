// SPDX-License-Identifier: Apache-2.0
/// MIME type <-> file extension for common web and document formats (IANA names). Lookup is case-insensitive on the text
/// after the last '.' (a name without '.' is itself the extension). The first table row for a type is its canonical
/// extension. Text types get '; charset=utf-8' from [contentTypeFor].
library;

const _table = <(String, String)>[
  ('html', 'text/html'),
  ('htm', 'text/html'),
  ('css', 'text/css'),
  ('js', 'text/javascript'),
  ('mjs', 'text/javascript'),
  ('cjs', 'text/javascript'),
  ('json', 'application/json'),
  ('map', 'application/json'),
  ('jsonld', 'application/ld+json'),
  ('webmanifest', 'application/manifest+json'),
  ('xml', 'application/xml'),
  ('txt', 'text/plain'),
  ('text', 'text/plain'),
  ('log', 'text/plain'),
  ('md', 'text/markdown'),
  ('markdown', 'text/markdown'),
  ('csv', 'text/csv'),
  ('tsv', 'text/tab-separated-values'),
  ('ics', 'text/calendar'),
  ('vcf', 'text/vcard'),
  ('yaml', 'application/yaml'),
  ('yml', 'application/yaml'),
  ('toml', 'application/toml'),
  ('png', 'image/png'),
  ('jpg', 'image/jpeg'),
  ('jpeg', 'image/jpeg'),
  ('gif', 'image/gif'),
  ('webp', 'image/webp'),
  ('avif', 'image/avif'),
  ('svg', 'image/svg+xml'),
  ('ico', 'image/vnd.microsoft.icon'),
  ('bmp', 'image/bmp'),
  ('tif', 'image/tiff'),
  ('tiff', 'image/tiff'),
  ('heic', 'image/heic'),
  ('mp3', 'audio/mpeg'),
  ('wav', 'audio/wav'),
  ('ogg', 'audio/ogg'),
  ('oga', 'audio/ogg'),
  ('m4a', 'audio/mp4'),
  ('flac', 'audio/flac'),
  ('weba', 'audio/webm'),
  ('opus', 'audio/opus'),
  ('mp4', 'video/mp4'),
  ('m4v', 'video/mp4'),
  ('webm', 'video/webm'),
  ('ogv', 'video/ogg'),
  ('mov', 'video/quicktime'),
  ('avi', 'video/x-msvideo'),
  ('mpeg', 'video/mpeg'),
  ('woff', 'font/woff'),
  ('woff2', 'font/woff2'),
  ('ttf', 'font/ttf'),
  ('otf', 'font/otf'),
  ('pdf', 'application/pdf'),
  ('zip', 'application/zip'),
  ('gz', 'application/gzip'),
  ('tar', 'application/x-tar'),
  ('7z', 'application/x-7z-compressed'),
  ('rar', 'application/vnd.rar'),
  ('bz2', 'application/x-bzip2'),
  ('doc', 'application/msword'),
  ('docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  ('xls', 'application/vnd.ms-excel'),
  ('xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
  ('ppt', 'application/vnd.ms-powerpoint'),
  ('pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'),
  ('odt', 'application/vnd.oasis.opendocument.text'),
  ('ods', 'application/vnd.oasis.opendocument.spreadsheet'),
  ('odp', 'application/vnd.oasis.opendocument.presentation'),
  ('rtf', 'application/rtf'),
  ('epub', 'application/epub+zip'),
  ('wasm', 'application/wasm'),
  ('bin', 'application/octet-stream'),
  ('exe', 'application/vnd.microsoft.portable-executable'),
  ('sh', 'application/x-sh'),
  ('apk', 'application/vnd.android.package-archive'),
  ('jar', 'application/java-archive'),
  ('swf', 'application/x-shockwave-flash'),
];
final _byExt = {for (final r in _table) r.$1: r.$2};
final _byType = () {
  final m = <String, String>{};
  for (final r in _table) {
    m.putIfAbsent(r.$2, () => r.$1);
  }
  return m;
}();
const _textExtra = {
  'application/json',
  'application/ld+json',
  'application/manifest+json',
  'application/toml',
  'application/xml',
  'application/yaml',
  'image/svg+xml',
  'text/javascript'
};

/// The MIME type for a file name or bare extension ("a.PNG", ".png", "png"), else null.
String? mimeTypeFor(String name) {
  final dot = name.lastIndexOf('.');
  return _byExt[(dot < 0 ? name : name.substring(dot + 1)).toLowerCase()];
}

/// The canonical extension (without '.') for a MIME type; parameters and case are ignored. Unknown -> null.
String? extensionFor(String type) {
  final semi = type.indexOf(';');
  return _byType[(semi < 0 ? type : type.substring(0, semi)).trim().toLowerCase()];
}

/// A Content-Type header value for [name]: text types get '; charset=utf-8', unknown -> application/octet-stream.
String contentTypeFor(String name) {
  final t = mimeTypeFor(name);
  if (t == null) return 'application/octet-stream';
  return t.startsWith('text/') || _textExtra.contains(t) ? '$t; charset=utf-8' : t;
}
