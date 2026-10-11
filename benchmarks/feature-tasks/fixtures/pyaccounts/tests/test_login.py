import json
import unittest

from accounts.app import handle
from accounts.db import reset_db


def call(method, path, body=None, user=None):
    headers = {"authorization": f"Bearer session:{user}"} if user else {}
    return handle(method, path, headers, json.dumps(body).encode() if body is not None else b"")


class LoginTest(unittest.TestCase):
    def setUp(self):
        reset_db()

    def test_login(self):
        self.assertEqual(call("POST", "/login", {"username": "alice", "password": "correct horse"}), (200, {"session": "session:alice"}))
        self.assertEqual(call("POST", "/login", {"username": "alice", "password": "nope"})[0], 401)

    def test_me(self):
        self.assertEqual(call("GET", "/me", user="alice")[1]["username"], "alice")
        self.assertEqual(call("GET", "/me")[0], 401)


if __name__ == "__main__":
    unittest.main()
