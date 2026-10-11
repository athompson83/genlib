import hmac
import json
import re

from .db import db, hash_password


class HttpError(Exception):
    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


def read_json(body: bytes) -> dict:
    try:
        value = json.loads(body or b"{}")
    except ValueError:
        raise HttpError(400, "invalid_json")
    if not isinstance(value, dict):
        raise HttpError(400, "invalid_json")
    return value


def current_user(headers: dict):
    match = re.fullmatch(r"Bearer session:([a-z0-9-]+)", headers.get("authorization", ""))
    return db.users.get(match.group(1)) if match else None


def require_user(headers: dict):
    user = current_user(headers)
    if user is None:
        raise HttpError(401, "unauthenticated")
    return user


def check_password(user, password) -> bool:
    return isinstance(password, str) and hmac.compare_digest(hash_password(password, user.salt), user.password_hash)


def handle(method: str, path: str, headers: dict, body: bytes = b""):
    try:
        if path == "/login" and method == "POST":
            data = read_json(body)
            user = db.users.get(data.get("username")) if isinstance(data.get("username"), str) else None
            if user is None or not check_password(user, data.get("password")):
                raise HttpError(401, "invalid_credentials")
            return 200, {"session": f"session:{user.username}"}
        if path == "/me" and method == "GET":
            user = require_user(headers)
            return 200, {"username": user.username, "email": user.email}
        raise HttpError(404, "not_found")
    except HttpError as error:
        return error.status, {"error": error.code}
