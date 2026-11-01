"""Operator recovery and full-database backup/restore tests use temporary files."""
import contextlib
import io
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from server.app import create_app
from server.manage import backup_database, recover_admin, restore_database, main

HEADERS = {'X-Riviera-Request': '1'}


class OperatorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / 'production.sqlite3'
        self.app = create_app(self.db, allow_http=True, bootstrap=('owner', '01234'))
        self.client = TestClient(self.app, headers=HEADERS)
        self.client.post('/api/login', json={'username': 'owner', 'pin': '01234'})

    def tearDown(self):
        self.client.close()
        self.tmp.cleanup()

    def test_recovery_invalidates_session_and_is_not_an_http_route(self):
        self.assertEqual(self.client.post('/api/recover-admin').status_code, 405)
        recover_admin(self.db, 'owner', '00001')
        self.assertEqual(self.client.get('/api/me').status_code, 401)
        self.assertEqual(self.client.post('/api/login', json={'username': 'owner', 'pin': '01234'}).status_code, 401)
        self.assertEqual(self.client.post('/api/login', json={'username': 'owner', 'pin': '00001'}).status_code, 200)
        entries = self.client.get('/api/audit').json()['entries']
        self.assertTrue(any(entry['action'] == 'user.recover' for entry in entries))
        self.assertNotIn('00001', json.dumps(entries))

    def test_cli_uses_private_prompt_and_never_outputs_pin(self):
        output = io.StringIO()
        with patch('server.manage.getpass.getpass', side_effect=['00002', '00002']), contextlib.redirect_stdout(output):
            main(['recover-admin', '--database', str(self.db), '--username', 'owner'])
        self.assertNotIn('00002', output.getvalue())
        with self.assertRaises(SystemExit), contextlib.redirect_stderr(io.StringIO()):
            main(['recover-admin', '--database', str(self.db), '--username', 'owner', '--pin', '12345'])

    def test_backup_includes_wal_and_restore_keeps_rollback_and_revokes_sessions(self):
        # An open WAL connection keeps committed changes in its sidecar during backup.
        writer = sqlite3.connect(self.db)
        writer.execute('PRAGMA journal_mode=WAL')
        with writer:
            writer.execute("UPDATE users SET username='renamed' WHERE username='owner'")
        backup = Path(self.tmp.name) / 'snapshot.sqlite3'
        backup_database(self.db, backup)
        self.assertEqual(backup.stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(backup) as snap:
            self.assertEqual(snap.execute('SELECT username FROM users').fetchone()[0], 'renamed')
        with self.assertRaises(ValueError):
            backup_database(self.db, backup)
        writer.close()
        with self.assertRaises(ValueError):
            restore_database(backup, self.db)
        rollback = restore_database(backup, self.db, server_stopped=True)
        self.assertTrue(rollback.exists())
        with sqlite3.connect(self.db) as restored:
            self.assertEqual(restored.execute('SELECT count(*) FROM sessions').fetchone()[0], 0)
            self.assertEqual(restored.execute('SELECT username FROM users').fetchone()[0], 'renamed')
            self.assertEqual(restored.execute('PRAGMA integrity_check').fetchone()[0], 'ok')


if __name__ == '__main__':
    unittest.main()
