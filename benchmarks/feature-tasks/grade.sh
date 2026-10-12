#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# grade.sh <task> <app-dir>: copy the hidden tests into a scratch copy of a finished run and report pass counts.
# task: invitations | webhook | csv | totp | outgoing | digests | signup | twofactor | uploads
set -e
K=$(cd "$(dirname "$0")" && pwd); t=$1; app=$(cd "$2" && pwd)
G=$(mktemp -d); cp -R "$app/." "$G"; cd "$G"
if [ "$t" = totp ]; then
  cp "$K/grading/totp/test_hidden_totp.py" tests/
  out=$(python3 -m unittest tests.test_hidden_totp 2>&1 || true)
  echo "$out" | tail -3
else
  mkdir -p tests/hidden && cp "$K/grading/helpers.ts" tests/hidden/ && cp "$K/grading/$t/"*.ts tests/hidden/
  out=$(node --test --test-concurrency=1 tests/hidden/*.hidden.test.ts 2>&1 || true)
  echo "$out" | grep -E "^# (tests|pass|fail)"
fi
rm -rf "$G"
