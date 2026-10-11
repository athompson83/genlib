# pyaccounts

The account service of a small app, standard library only (Python 3.11+).

- `accounts/app.py`: `handle(method, path, headers, body) -> (status, payload)`, the whole HTTP API. `headers` is a dict with lower-case names, `body` is bytes, `payload` is a JSON-serialisable dict.
- `accounts/db.py`: the in-memory database (`db`) and `reset_db()` for tests. Passwords are PBKDF2-SHA256 hashes.
- `accounts/clock.py`: `clock.now()` returns seconds as a float; tests replace it to control time.
- Sessions are out of scope: a successful login returns `session:<username>`, sent back as `Authorization: Bearer session:<username>`.

Run `python3 -m unittest discover -s tests`.

| Method | Path | Result |
| --- | --- | --- |
| POST | /login | `{"username", "password"}` -> 200 `{"session"}`, or 401 `{"error": "invalid_credentials"}` |
| GET | /me | signed in -> 200 `{"username", "email"}`, otherwise 401 |

Errors are `{"error": "<code>"}` with 400 (bad input), 401 (not signed in or bad credentials), 403, 404, 429.
