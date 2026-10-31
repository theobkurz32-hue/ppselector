"""Run with: python3 -m server.run. Configure the environment before starting."""
import os
import uvicorn

if __name__ == '__main__':
    if not os.environ.get('RIVIERA_DB_PATH'):
        raise SystemExit('Defina RIVIERA_DB_PATH em um volume persistente antes de iniciar.')
    uvicorn.run('server.app:create_app', factory=True, host='0.0.0.0', port=int(os.environ.get('PORT', '8000')), proxy_headers=True, forwarded_allow_ips=os.environ.get('RIVIERA_TRUSTED_PROXIES', '127.0.0.1'))
