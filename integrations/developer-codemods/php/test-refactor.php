<?php
// SPDX-License-Identifier: Apache-2.0
$path = sys_get_temp_dir() . '/genlib-rector-' . bin2hex(random_bytes(8)) . '.php';
copy(__DIR__ . '/fixtures/before.php', $path);
try {
    $base = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg(__DIR__ . '/vendor/bin/rector') . ' process ' . escapeshellarg($path) . ' --config ' . escapeshellarg(__DIR__ . '/rector.php') . ' --no-progress-bar';
    passthru($base, $first);
    if ($first !== 0 || (require $path) !== [2,4,6] || !str_contains(file_get_contents($path), 'fn ')) throw new RuntimeException('Transformation did not preserve behavior');
    passthru($base . ' --dry-run', $second);
    if ($second !== 0) throw new RuntimeException('Second run must be a no-op');
} finally { unlink($path); }
