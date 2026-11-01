"""Consistent, private, rotating snapshots. External copies remain the operator's duty."""
from datetime import datetime, timezone
from pathlib import Path
import secrets


def snapshot_database(database, directory, keep=7):
    if not isinstance(keep, int) or not 1 <= keep <= 90:
        raise ValueError('A retenção de snapshots deve estar entre 1 e 90 arquivos.')
    # Imported at execution time to avoid a circular import with the operator CLI.
    from server.manage import backup_database
    directory = Path(directory)
    directory.mkdir(parents=True, exist_ok=True, mode=0o700)
    directory.chmod(0o700)
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    output = directory / ('riviera-auto-' + stamp + '-' + secrets.token_hex(3) + '.sqlite3')
    backup_database(database, output)
    # Never remove external operator snapshots or symlink targets.
    snapshots = sorted(path for path in directory.glob('riviera-auto-*.sqlite3') if path.is_file() and not path.is_symlink())
    for old in snapshots[:-keep]:
        old.unlink()
    return output
