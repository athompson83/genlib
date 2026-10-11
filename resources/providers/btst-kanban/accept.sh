#!/bin/sh
# SPDX-License-Identifier: Apache-2.0
# Acceptance for an app that adopted provider btst-kanban. Run from the app against a started server:
#   sh accept.sh [baseUrl]
# GENLIB_IDENTITY_HEADER  header the app's evaluation server auth reads the user id from (default x-demo-user)
# PLAYWRIGHT_DIR          directory where the playwright package resolves (default: the app)
# DATABASE_URL            when set, also checks the rows reached PostgreSQL
# Covers boards, columns-tasks, move-ordering, atomic-writes (concurrent moves, cascade), authorization,
# routes-ui (browser: no console errors, assignee resolved from the app's users) and persistence.
set -e
D=$(cd "$(dirname "$0")" && pwd); BASE=${1:-http://localhost:3000}; H=${GENLIB_IDENTITY_HEADER:-x-demo-user}
node "$D/api-check.mjs" "$BASE" "$H:alice"
node "$D/auth-check.mjs" "$BASE" "$H"
(cd "${PLAYWRIGHT_DIR:-.}" && node "$D/ui-check.mjs" "$BASE" "$H")
if [ -n "$DATABASE_URL" ]; then
  name="persist-$$"
  curl -sf -X POST "$BASE/api/data/boards" -H 'content-type: application/json' -H "origin: $BASE" -H "$H: alice" -d "{\"name\":\"$name\"}" > /dev/null
  n=$(psql "$DATABASE_URL" -tAc "select count(*) from kanban_board b join kanban_column c on c.board_id = b.id where b.name = '$name'")
  echo "PostgreSQL rows for $name: $n columns"; [ "$n" = 3 ]
fi
