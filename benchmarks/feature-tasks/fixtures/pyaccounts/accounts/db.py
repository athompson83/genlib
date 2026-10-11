import hashlib
from dataclasses import dataclass, field


def hash_password(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 100_000)


@dataclass
class User:
    username: str
    email: str
    salt: bytes
    password_hash: bytes


@dataclass
class Db:
    users: dict[str, User] = field(default_factory=dict)


def _seed() -> Db:
    db = Db()
    for name, password in [("alice", "correct horse"), ("bob", "battery staple")]:
        salt = hashlib.sha256(name.encode()).digest()[:16]
        db.users[name] = User(name, f"{name}@example.test", salt, hash_password(password, salt))
    return db


db = _seed()


def reset_db() -> None:
    global db
    fresh = _seed()
    db.__dict__.clear()
    db.__dict__.update(fresh.__dict__)
