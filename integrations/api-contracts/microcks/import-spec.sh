#!/usr/bin/env sh
# SPDX-License-Identifier: Apache-2.0
set -eu
# Explicit local side effect: import the authored contract into a running local Microcks fixture.
curl --fail-with-body --silent --show-error -F file=@schema/openapi.json http://127.0.0.1:8585/api/artifact/upload
