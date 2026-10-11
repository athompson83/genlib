# SPDX-License-Identifier: Apache-2.0
"""SQLite syntax/data checks; these do not compile generated Kotlin or Swift."""
from pathlib import Path
import sqlite3
import unittest
ROOT = Path(__file__).resolve().parents[1]
SQL = ROOT / 'kotlin/src/commonMain/sqldelight/dev/genlib/inventory/db'
class SqlProfileTests(unittest.TestCase):
    def test_upgrade_preserves_rows_and_defaults(self):
        db = sqlite3.connect(':memory:')
        db.executescript((ROOT / 'fixtures/v1.sql').read_text())
        db.executescript((SQL / '1.sqm').read_text())
        self.assertEqual(db.execute('SELECT id, archived FROM item').fetchall(), [('legacy', 0)])
        db.execute("UPDATE item SET completed = ? WHERE id = ?", (1, 'legacy'))
        self.assertEqual(db.execute('SELECT completed FROM item').fetchone(), (1,))
        db.close()
    def test_current_schema_constraint_and_transaction(self):
        schema = (SQL / 'Item.sq').read_text().split('listActive:')[0].replace(' AS Boolean', '')
        db = sqlite3.connect(':memory:'); db.executescript(schema)
        with self.assertRaises(sqlite3.IntegrityError):
            with db:
                db.execute('INSERT INTO item(id,title) VALUES (?,?)', ('a', 'Valid'))
                db.execute('INSERT INTO item(id,title) VALUES (?,?)', ('b', ''))
        self.assertEqual(db.execute('SELECT count(*) FROM item').fetchone(), (0,))
        db.close()
if __name__ == '__main__': unittest.main()
