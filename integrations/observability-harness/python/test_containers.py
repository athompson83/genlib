# SPDX-License-Identifier: Apache-2.0
"""Explicit pytest/Docker gate; do not include in dependency-free checks."""
import os
from pathlib import Path
import psycopg
from testcontainers.postgres import PostgresContainer

def test_postgres_transaction_rollback():
    with PostgresContainer(os.getenv('GENLIB_TEST_POSTGRES_IMAGE', 'postgres:18.6-alpine3.24'), driver=None) as postgres:
        with psycopg.connect(postgres.get_connection_url()) as connection:
            connection.execute((Path(__file__).resolve().parents[1] / 'fixtures/postgres.sql').read_text())
            connection.commit()
            try:
                with connection.transaction():
                    connection.execute('INSERT INTO item(id,title) VALUES(%s,%s)', ('a', 'Before failure'))
                    connection.execute('INSERT INTO item(id,title) VALUES(%s,%s)', ('b', ''))
            except psycopg.errors.CheckViolation:
                pass
            else:
                raise AssertionError('Invalid batch unexpectedly succeeded')
            assert connection.execute('SELECT count(*) FROM item').fetchone() == (0,)
