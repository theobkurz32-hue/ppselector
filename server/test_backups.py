"""Automatic snapshot rotation and health reporting tests use isolated databases."""
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient
from server.app import create_app
from server.backups import snapshot_database


class AutomaticBackupTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        self.db = self.directory / 'live.sqlite3'
        create_app(self.db, allow_http=True, bootstrap=('owner', '01234'))

    def tearDown(self):
        self.tmp.cleanup()

    def test_rotation_preserves_external_snapshots_and_database_integrity(self):
        folder = self.directory / 'backups'
        folder.mkdir()
        unrelated = folder / 'operator-save.sqlite3'
        unrelated.write_bytes(b'preserve')
        snapshots = [snapshot_database(self.db, folder, keep=2) for _ in range(3)]
        self.assertFalse(snapshots[0].exists())
        self.assertTrue(snapshots[1].exists())
        self.assertTrue(snapshots[2].exists())
        self.assertEqual(unrelated.read_bytes(), b'preserve')
        self.assertEqual(folder.stat().st_mode & 0o777, 0o700)
        self.assertEqual(snapshots[2].stat().st_mode & 0o777, 0o600)
        with sqlite3.connect(snapshots[2]) as c:
            self.assertEqual(c.execute('PRAGMA integrity_check').fetchone()[0], 'ok')
            self.assertEqual(c.execute('SELECT username FROM users').fetchone()[0], 'owner')

    def test_lifespan_creates_initial_snapshot_and_reports_success(self):
        folder = self.directory / 'daily'
        with patch.dict(os.environ, {'RIVIERA_BACKUP_DIR': str(folder), 'RIVIERA_BACKUP_INTERVAL_SECONDS': '60'}):
            with TestClient(create_app(self.db, allow_http=True)) as client:
                health = client.get('/healthz').json()
                self.assertEqual(health['status'], 'ok')
                self.assertEqual(health['backup']['status'], 'ok')
                self.assertIsNotNone(health['backup']['last_success'])
                self.assertEqual(len(list(folder.glob('riviera-auto-*.sqlite3'))), 1)

    def test_failure_reports_degraded_without_logging_error_payload(self):
        with patch.dict(os.environ, {'RIVIERA_BACKUP_DIR': str(self.directory / 'fail')}), patch('server.app.snapshot_database', side_effect=PermissionError('DO-NOT-LOG-PAYLOAD')):
            with self.assertLogs('riviera.backup', level='ERROR') as logs:
                with TestClient(create_app(self.db, allow_http=True)) as client:
                    response = client.get('/healthz')
                    self.assertEqual(response.status_code, 200)
                    self.assertEqual(response.json()['status'], 'degraded')
                    self.assertEqual(response.json()['backup']['status'], 'error')
                    self.assertNotIn('DO-NOT-LOG-PAYLOAD', response.text)
            self.assertNotIn('DO-NOT-LOG-PAYLOAD', '\n'.join(logs.output))


if __name__ == '__main__':
    unittest.main()
