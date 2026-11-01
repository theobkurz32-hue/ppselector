"""Local operator tools. PINs are entered with getpass and never accepted as arguments."""
import argparse
from datetime import datetime, timezone
import getpass
import json
import os
from pathlib import Path
import secrets
import sqlite3
import tempfile
import time

from server.app import pin_hash, valid_pin, valid_username

REQUIRED_TABLES = {'users', 'sessions', 'attempts', 'project', 'audit'}


def connect_existing(path):
    path = Path(path).resolve()
    if not path.is_file():
        raise ValueError('Banco não encontrado.')
    connection = sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=15)
    connection.row_factory = sqlite3.Row
    connection.execute('PRAGMA foreign_keys=ON')
    tables = {row['name'] for row in connection.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    if not REQUIRED_TABLES <= tables or connection.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
        connection.close()
        raise ValueError('O arquivo não é um banco íntegro desta aplicação.')
    row = connection.execute('SELECT data FROM project WHERE id=1').fetchone()
    if row is None or json.loads(row['data']).get('version') not in (1, 2):
        connection.close()
        raise ValueError('Projeto ausente ou incompatível.')
    return connection


def backup_database(database, output):
    """SQLite backup includes committed WAL state; a prior backup is never overwritten."""
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError('O arquivo de backup já existe. Escolha um nome novo.')
    if not output.parent.is_dir():
        raise ValueError('A pasta de destino deve existir e ser privada.')
    source = connect_existing(database)
    created = False
    try:
        descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(descriptor)
        created = True
        destination = sqlite3.connect(output)
        try:
            source.backup(destination)
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Falha na verificação do backup.')
        finally:
            destination.close()
        os.chmod(output, 0o600)
    except Exception:
        if created:
            output.unlink(missing_ok=True)
        raise
    finally:
        source.close()
    return output


def recover_admin(database, username, pin):
    """OS-level administrative operation, intentionally unavailable over HTTP."""
    username, pin = valid_username(username), valid_pin(pin)
    connection = connect_existing(database)
    try:
        with connection:
            connection.execute('BEGIN IMMEDIATE')
            user = connection.execute('SELECT id FROM users WHERE username=?', (username,)).fetchone()
            if not user:
                raise ValueError('Conta não encontrada. Informe um usuário já existente.')
            salt = secrets.token_hex(16)
            connection.execute("UPDATE users SET salt=?,pin_hash=?,role='admin',active=1 WHERE id=?", (salt, pin_hash(pin, salt), user['id']))
            connection.execute('DELETE FROM sessions WHERE user_id=?', (user['id'],))
            connection.execute('DELETE FROM attempts WHERE key=?', ('user:' + username,))
            connection.execute('INSERT INTO audit(user_id,action,detail,created) VALUES(?,?,?,?)', (user['id'], 'user.recover', json.dumps({'user_id': user['id'], 'method': 'local-operator'}), time.time()))
    finally:
        connection.close()


def restore_database(backup, database, *, server_stopped=False):
    """Restore via SQLite into the destination only after the operator stops the service.

    This function cannot reliably detect an idle external web process. The operator
    must stop it first; the explicit flag and WAL guard make that prerequisite clear.
    """
    if not server_stopped:
        raise ValueError('Pare o serviço e confirme --server-stopped antes de restaurar.')
    database = Path(database).absolute()
    if Path(backup).resolve() == database.resolve():
        raise ValueError('Origem e destino precisam ser diferentes.')
    if any(Path(str(database) + suffix).exists() for suffix in ('-wal', '-shm')):
        raise ValueError('Há arquivos WAL/SHM no destino. Confirme o serviço parado e faça checkpoint seguro antes de restaurar; não apague arquivos manualmente.')
    rollback = None
    if database.exists():
        timestamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
        rollback = database.with_name(database.name + '.before-restore-' + timestamp + '-' + secrets.token_hex(3) + '.sqlite3')
        backup_database(database, rollback)
    source = connect_existing(backup)
    temporary = None
    try:
        handle, temp_name = tempfile.mkstemp(prefix='.riviera-restore-', suffix='.sqlite3', dir=database.parent)
        os.close(handle)
        temporary = Path(temp_name)
        destination = sqlite3.connect(temporary)
        try:
            source.backup(destination)
            destination.execute('DELETE FROM sessions')
            destination.execute('DELETE FROM attempts')
            destination.commit()
            # A restored database should start with no copied WAL sidecars.
            destination.execute('PRAGMA journal_mode=DELETE')
            if destination.execute('PRAGMA integrity_check').fetchone()[0] != 'ok':
                raise ValueError('Falha na integridade do banco restaurado.')
        finally:
            destination.close()
        os.chmod(temporary, 0o600)
        os.replace(temporary, database)
        temporary = None
    finally:
        source.close()
        if temporary:
            temporary.unlink(missing_ok=True)
    return rollback


def prune_audit(database, days):
    if not 30 <= days <= 3650:
        raise ValueError('A retenção deve estar entre 30 e 3650 dias.')
    connection = connect_existing(database)
    try:
        with connection:
            count = connection.execute('DELETE FROM audit WHERE created<?', (time.time() - days * 86400,)).rowcount
        return count
    finally:
        connection.close()


def checkpoint_database(database, *, server_stopped=False):
    if not server_stopped:
        raise ValueError('Pare o serviço e confirme --server-stopped antes do checkpoint.')
    connection = connect_existing(database)
    try:
        busy, _, _ = connection.execute('PRAGMA wal_checkpoint(TRUNCATE)').fetchone()
        if busy:
            raise ValueError('O banco continua em uso; não prossiga com a restauração.')
    finally:
        connection.close()


def main(argv=None):
    parser = argparse.ArgumentParser(description='Operação local do N14 Riviera. Execute apenas no servidor autorizado.')
    sub = parser.add_subparsers(dest='command', required=True)
    recovery = sub.add_parser('recover-admin', help='Recuperar uma conta existente com PIN digitado de forma privada.')
    recovery.add_argument('--database', required=True)
    recovery.add_argument('--username', required=True)
    backup = sub.add_parser('backup', help='Criar backup consistente completo, incluindo contas e auditoria.')
    backup.add_argument('--database', required=True)
    backup.add_argument('--output', required=True)
    restore = sub.add_parser('restore', help='Restaurar backup completo com o serviço parado.')
    restore.add_argument('--database', required=True)
    restore.add_argument('--backup', required=True)
    restore.add_argument('--server-stopped', action='store_true', required=True)
    restore.add_argument('--confirm', action='store_true', required=True)
    checkpoint = sub.add_parser('checkpoint', help='Consolidar WAL com serviço parado antes de uma restauração.')
    checkpoint.add_argument('--database', required=True)
    checkpoint.add_argument('--server-stopped', action='store_true', required=True)
    prune = sub.add_parser('prune-audit', help='Aplicar retenção após backup externo. Exclui registros antigos.')
    prune.add_argument('--database', required=True)
    prune.add_argument('--older-than-days', type=int, default=365)
    prune.add_argument('--confirm', action='store_true', required=True)
    args = parser.parse_args(argv)
    try:
        if args.command == 'recover-admin':
            pin = getpass.getpass('Novo PIN de cinco números: ')
            repeated = getpass.getpass('Repita o novo PIN: ')
            if pin != repeated:
                raise ValueError('Os PINs não coincidem.')
            recover_admin(args.database, args.username, pin)
            print('Administrador recuperado. As sessões anteriores dessa conta foram encerradas.')
        elif args.command == 'backup':
            path = backup_database(args.database, args.output)
            print('Backup íntegro criado em', path)
        elif args.command == 'restore':
            rollback = restore_database(args.backup, args.database, server_stopped=args.server_stopped)
            print('Banco restaurado; todas as sessões restauradas foram encerradas.')
            if rollback:
                print('Cópia de segurança anterior preservada em', rollback)
        elif args.command == 'checkpoint':
            checkpoint_database(args.database, server_stopped=args.server_stopped)
            print('WAL consolidado. Mantenha o serviço parado até terminar a operação.')
        else:
            count = prune_audit(args.database, args.older_than_days)
            print('Registros de auditoria removidos:', count)
    except Exception as error:
        # Never include supplied PINs in messages. FastAPI validation messages are safe text.
        detail = getattr(error, 'detail', str(error))
        parser.exit(1, str(detail) + '\n')


if __name__ == '__main__':
    main()
