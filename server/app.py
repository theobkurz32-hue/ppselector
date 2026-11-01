"""Single-project shared server. SQLite requires a persistent local volume, one instance."""
from contextlib import asynccontextmanager, contextmanager, suppress
from pathlib import Path
import copy
import asyncio
from datetime import datetime, timezone
import logging
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, ConfigDict, StrictBool, StrictInt, StrictStr

from server.model import canonical_project, changes, migrate_project
from server.backups import snapshot_database

ROOT = Path(__file__).resolve().parents[1]
ROLES = {'reader', 'editor', 'admin'}
COOKIE = 'riviera_session'
SESSION_SECONDS = 8 * 60 * 60


def pin_hash(pin, salt):
    return hashlib.scrypt(pin.encode(), salt=bytes.fromhex(salt), n=16384, r=8, p=1, dklen=32).hex()


def valid_username(username):
    if not re.fullmatch(r'[a-zA-Z0-9_.-]{3,40}', username):
        raise HTTPException(422, 'Usuário: use de 3 a 40 letras, números, ponto, hífen ou sublinhado.')
    return username.lower()


def valid_pin(pin):
    if not re.fullmatch(r'[0-9]{5}', pin):
        raise HTTPException(422, 'O PIN deve conter exatamente cinco números.')
    return pin


class Login(BaseModel):
    model_config = ConfigDict(extra='forbid')
    username: StrictStr
    pin: StrictStr


class UserCreate(Login):
    role: StrictStr


class UserUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    role: StrictStr
    active: StrictBool
    pin: StrictStr | None = None


class ProjectUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid')
    revision: StrictInt
    data: dict



def create_app(db_path=None, *, allow_http=None, bootstrap=None):
    db_path = Path(db_path or os.environ.get('RIVIERA_DB_PATH', '/tmp/riviera-development.sqlite3'))
    db_path.parent.mkdir(parents=True, exist_ok=True)
    allow_http = os.environ.get('RIVIERA_ALLOW_HTTP') == '1' if allow_http is None else allow_http
    source_template = json.loads((ROOT / 'data/project.json').read_text())
    baseline = migrate_project(source_template, source_template)
    backup_directory = os.environ.get('RIVIERA_BACKUP_DIR')
    backup_interval = int(os.environ.get('RIVIERA_BACKUP_INTERVAL_SECONDS', '86400'))
    backup_keep = int(os.environ.get('RIVIERA_BACKUP_KEEP', '7'))
    if not 60 <= backup_interval <= 31 * 86400 or not 1 <= backup_keep <= 90:
        raise RuntimeError('Intervalo ou retenção de backup automático inválido.')
    logger = logging.getLogger('riviera.backup')

    @asynccontextmanager
    async def lifespan(application):
        application.state.backups = {'enabled': bool(backup_directory), 'status': 'pending' if backup_directory else 'disabled', 'last_success': None}
        async def run_snapshot():
            try:
                await asyncio.to_thread(snapshot_database, db_path, backup_directory, backup_keep)
                application.state.backups.update(status='ok', last_success=datetime.now(timezone.utc).isoformat())
            except Exception as error:
                application.state.backups['status'] = 'error'
                # Only the exception type is logged, never DB contents, credentials or arbitrary error text.
                logger.error('Automatic database backup failed (%s)', type(error).__name__)
        async def repeat():
            while True:
                await asyncio.sleep(backup_interval)
                await run_snapshot()
        task = None
        if backup_directory:
            await run_snapshot()
            task = asyncio.create_task(repeat())
        try:
            yield
        finally:
            if task:
                task.cancel()
                with suppress(asyncio.CancelledError):
                    await task

    app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan)
    app.state.backups = {'enabled': bool(backup_directory), 'status': 'pending' if backup_directory else 'disabled', 'last_success': None}

    @contextmanager
    def db():
        connection = sqlite3.connect(db_path, timeout=15)
        connection.row_factory = sqlite3.Row
        connection.execute('PRAGMA foreign_keys=ON')
        try:
            yield connection
            connection.commit()
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    with db() as c:
        c.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, pin_hash TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at REAL NOT NULL);
        CREATE TABLE IF NOT EXISTS project(id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1);
        CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), action TEXT NOT NULL, detail TEXT NOT NULL, created REAL NOT NULL);
        ''')
        c.execute('INSERT OR IGNORE INTO project(id,data) VALUES(1,?)', (json.dumps(baseline),))
        stored = c.execute('SELECT data FROM project WHERE id=1').fetchone()
        old_data = json.loads(stored['data'])
        migrated = migrate_project(old_data, source_template)
        if migrated != old_data:
            c.execute('UPDATE project SET data=?,revision=revision+1 WHERE id=1', (json.dumps(migrated),))
        initial = bootstrap or (os.environ.get('RIVIERA_ADMIN_USER'), os.environ.get('RIVIERA_ADMIN_PIN'))
        if not c.execute('SELECT 1 FROM users LIMIT 1').fetchone() and not all(initial):
            raise RuntimeError('Primeiro acesso: configure RIVIERA_ADMIN_USER e RIVIERA_ADMIN_PIN nos segredos da hospedagem.')
        if not c.execute('SELECT 1 FROM users LIMIT 1').fetchone() and all(initial):
            username, pin = valid_username(initial[0]), valid_pin(initial[1])
            salt = secrets.token_hex(16)
            c.execute('INSERT INTO users(username,salt,pin_hash,role) VALUES(?,?,?,?)', (username, salt, pin_hash(pin, salt), 'admin'))
    os.chmod(db_path, 0o600)

    @app.middleware('http')
    async def protections(request, call_next):
        path = request.url.path
        if path.startswith('/api/') and request.method not in ('GET', 'HEAD', 'OPTIONS'):
            # A cross-origin HTML form cannot supply this header. No CORS routes are enabled.
            if request.headers.get('x-riviera-request') != '1':
                return JSONResponse({'detail': 'Origem da solicitação não autorizada.'}, status_code=403)
            expected = os.environ.get('RIVIERA_PUBLIC_ORIGIN') or os.environ.get('RENDER_EXTERNAL_URL')
            if expected and request.headers.get('origin') != expected.rstrip('/'):
                return JSONResponse({'detail': 'Origem da solicitação não autorizada.'}, status_code=403)
            length = request.headers.get('content-length')
            if length and (not length.isdigit() or int(length) > 2_000_000):
                return JSONResponse({'detail': 'Solicitação muito grande.'}, status_code=413)
            # Also limit chunked requests before any JSON parsing.
            chunks, total = [], 0
            async for chunk in request.stream():
                total += len(chunk)
                if total > 2_000_000:
                    return JSONResponse({'detail': 'Solicitação muito grande.'}, status_code=413)
                chunks.append(chunk)
            request._body = b''.join(chunks)
        response = await call_next(request)
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['Referrer-Policy'] = 'same-origin'
        response.headers['X-Frame-Options'] = 'DENY'
        response.headers['Content-Security-Policy'] = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
        response.headers['Cache-Control'] = 'no-store'
        return response

    def current_user(request: Request):
        token = request.cookies.get(COOKIE, '')
        digest = hashlib.sha256(token.encode()).hexdigest()
        with db() as c:
            row = c.execute('SELECT users.* FROM users JOIN sessions ON users.id=sessions.user_id WHERE token_hash=? AND expires>? AND active=1', (digest, time.time())).fetchone()
        if not row:
            raise HTTPException(401, 'Entre com seu usuário e PIN para continuar.')
        return dict(row)

    def editor(user=Depends(current_user)):
        if user['role'] not in ('editor', 'admin'):
            raise HTTPException(403, 'Seu perfil permite apenas consultar a obra.')
        return user

    def admin(user=Depends(current_user)):
        if user['role'] != 'admin':
            raise HTTPException(403, 'Apenas administradores podem gerenciar acessos.')
        return user

    def public_user(user):
        return {key: user[key] for key in ('id', 'username', 'role', 'active')}

    def audit(c, user_id, action, detail):
        c.execute('INSERT INTO audit(user_id,action,detail,created) VALUES(?,?,?,?)', (user_id, action, json.dumps(detail), time.time()))

    @app.get('/api/config')
    def config():
        return {'shared': True}

    @app.get('/healthz')
    def health():
        with db() as c:
            c.execute('SELECT 1').fetchone()
        backup_status = dict(app.state.backups)
        return {'status': 'degraded' if backup_status['status'] == 'error' else 'ok', 'backup': backup_status}

    @app.post('/api/login')
    def login(payload: Login, request: Request, response: Response):
        username = payload.username.lower()[:100]
        # Trust the socket client, never an arbitrary X-Forwarded-For header. Configure Uvicorn's proxy allowlist at deployment.
        ip = request.client.host if request.client else 'unknown'
        keys = [('user:' + username, 5), ('ip:' + ip, 30), ('volume:' + ip, 120)]
        now = time.time()
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            c.execute('DELETE FROM sessions WHERE expires<=?', (now,))
            c.execute('DELETE FROM attempts WHERE reset_at<=?', (now,))
            for key, limit in keys:
                row = c.execute('SELECT * FROM attempts WHERE key=?', (key,)).fetchone()
                if row and row['count'] >= limit:
                    raise HTTPException(429, 'Muitas tentativas. Aguarde 15 minutos para tentar novamente.', headers={'Retry-After': str(max(1, int(row['reset_at'] - now)))})
            # Bound total requests separately from authentication failures. Correct logins do not consume the failure allowance.
            c.execute('INSERT INTO attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', ('volume:' + ip, now + 60))
            row = c.execute('SELECT * FROM users WHERE username=?', (username,)).fetchone()
            salt = row['salt'] if row else '00' * 16
            candidate = pin_hash(payload.pin[:128], salt)
            valid = row and row['active'] and re.fullmatch(r'[0-9]{5}', payload.pin) and hmac.compare_digest(candidate, row['pin_hash'])
            if valid:
                c.execute('DELETE FROM attempts WHERE key=?', ('user:' + username,))
                token = secrets.token_urlsafe(32)
                c.execute('INSERT INTO sessions VALUES(?,?,?)', (hashlib.sha256(token.encode()).hexdigest(), row['id'], now + SESSION_SECONDS))
                audit(c, row['id'], 'login', {})
            else:
                for key in ('user:' + username, 'ip:' + ip):
                    c.execute('INSERT INTO attempts(key,count,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1', (key, now + 900))
        if not valid:
            raise HTTPException(401, 'Usuário ou PIN inválido.')
        response.set_cookie(COOKIE, token, max_age=SESSION_SECONDS, httponly=True, secure=not allow_http, samesite='strict', path='/')
        return {'user': public_user(dict(row))}

    @app.get('/api/me')
    def me(user=Depends(current_user)):
        return {'user': public_user(user)}

    @app.post('/api/logout')
    def logout(request: Request, response: Response):
        digest = hashlib.sha256(request.cookies.get(COOKIE, '').encode()).hexdigest()
        with db() as c:
            c.execute('DELETE FROM sessions WHERE token_hash=?', (digest,))
        response.delete_cookie(COOKIE, path='/', secure=not allow_http, httponly=True, samesite='strict')
        return {'ok': True}

    @app.get('/api/project')
    def project(user=Depends(current_user)):
        with db() as c:
            row = c.execute('SELECT * FROM project WHERE id=1').fetchone()
        return {'data': json.loads(row['data']), 'revision': row['revision']}

    def save_project(payload, user, *, restoring=False):
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            previous = c.execute('SELECT * FROM project WHERE id=1').fetchone()
            if payload.revision != previous['revision']:
                raise HTTPException(409, 'Outra pessoa atualizou a obra. Atualize os dados antes de salvar novamente.')
            previous_data = json.loads(previous['data'])
            data = canonical_project(payload.data, source_template, existing=previous_data, allow_baseline=user['role'] == 'admin')
            diff = changes(previous_data, data)
            revision = previous['revision'] + 1
            c.execute('UPDATE project SET data=?,revision=? WHERE id=1', (json.dumps(data), revision))
            audit(c, user['id'], 'project.restore' if restoring else 'project.update', {'revision': revision, 'changes': diff})
        return {'data': data, 'revision': revision}

    @app.put('/api/project')
    def update_project(payload: ProjectUpdate, user=Depends(editor)):
        return save_project(payload, user)

    @app.put('/api/project/restore')
    def restore_project(payload: ProjectUpdate, user=Depends(admin)):
        return save_project(payload, user, restoring=True)

    @app.get('/api/users')
    def users(user=Depends(admin)):
        with db() as c:
            return {'users': [dict(row) for row in c.execute('SELECT id,username,role,active FROM users ORDER BY username')]}

    @app.post('/api/users', status_code=201)
    def add_user(payload: UserCreate, user=Depends(admin)):
        username, pin = valid_username(payload.username), valid_pin(payload.pin)
        if payload.role not in ROLES:
            raise HTTPException(422, 'Perfil inválido.')
        salt = secrets.token_hex(16)
        try:
            with db() as c:
                cursor = c.execute('INSERT INTO users(username,salt,pin_hash,role) VALUES(?,?,?,?)', (username, salt, pin_hash(pin, salt), payload.role))
                audit(c, user['id'], 'user.create', {'user_id': cursor.lastrowid, 'role': payload.role})
                return {'user': {'id': cursor.lastrowid, 'username': username, 'role': payload.role, 'active': 1}}
        except sqlite3.IntegrityError:
            raise HTTPException(409, 'Esse nome de usuário já está em uso.')

    @app.patch('/api/users/{user_id}')
    def update_user(user_id: int, payload: UserUpdate, user=Depends(admin)):
        if payload.role not in ROLES:
            raise HTTPException(422, 'Perfil inválido.')
        if payload.pin is not None:
            valid_pin(payload.pin)
        with db() as c:
            c.execute('BEGIN IMMEDIATE')
            target = c.execute('SELECT * FROM users WHERE id=?', (user_id,)).fetchone()
            if not target:
                raise HTTPException(404, 'Usuário não encontrado.')
            if target['role'] == 'admin' and target['active'] and (payload.role != 'admin' or not payload.active):
                count = c.execute("SELECT count(*) FROM users WHERE role='admin' AND active=1").fetchone()[0]
                if count <= 1:
                    raise HTTPException(409, 'Mantenha pelo menos um administrador ativo.')
            c.execute('UPDATE users SET role=?,active=? WHERE id=?', (payload.role, int(payload.active), user_id))
            if payload.pin is not None:
                salt = secrets.token_hex(16)
                c.execute('UPDATE users SET salt=?,pin_hash=? WHERE id=?', (salt, pin_hash(payload.pin, salt), user_id))
            c.execute('DELETE FROM sessions WHERE user_id=?', (user_id,))
            c.execute('DELETE FROM attempts WHERE key=?', ('user:' + target['username'],))
            audit(c, user['id'], 'user.update', {'user_id': user_id, 'role': payload.role, 'active': payload.active, 'pin_changed': payload.pin is not None})
        return {'ok': True}

    @app.get('/api/audit')
    def audit_log(user=Depends(admin)):
        with db() as c:
            rows = c.execute('SELECT audit.id,username,action,detail,created FROM audit JOIN users ON users.id=audit.user_id ORDER BY audit.id DESC LIMIT 100').fetchall()
        return {'entries': [{**dict(row), 'detail': json.loads(row['detail'])} for row in rows]}

    @app.get('/data/project.json')
    def protected_baseline(user=Depends(current_user)):
        return JSONResponse(baseline)

    @app.get('/sw.js')
    def disabled_worker():
        # Migrate any old static-mode worker without retaining private responses.
        return Response("self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('riviera-'+encodeURIComponent(new URL(self.registration.scope).pathname)+'-')||[\"riviera-v2\",\"riviera-v3-mobile\",\"riviera-v4-monochrome\",\"riviera-v5-phase-groups\",\"riviera-v6-explicit-fold\",\"riviera-v7-shared-ready\",\"riviera-v8-management\"].includes(k)).map(k=>caches.delete(k)))).then(()=>self.registration.unregister()).then(()=>self.clients.claim())));", media_type='application/javascript')

    allowed_static = {'index.html', 'app.js', 'shared.js', 'styles.css', 'manifest.webmanifest', 'domain.js', 'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'}

    @app.get('/')
    def index():
        return FileResponse(ROOT / 'index.html')

    @app.get('/{file:path}')
    def asset(file: str):
        if file not in allowed_static:
            raise HTTPException(404, 'Arquivo não encontrado.')
        return FileResponse(ROOT / file)

    return app
