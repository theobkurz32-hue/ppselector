"""Run python3 -m unittest server.test_api. Uses only isolated temporary databases."""
import copy
import os
from unittest.mock import patch
import sqlite3
import tempfile
import unittest
from pathlib import Path
from fastapi.testclient import TestClient
from server.app import create_app

HEADERS={'X-Riviera-Request':'1'}

class SharedApiTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory()
        self.path=Path(self.tmp.name)/'test.sqlite3'
        self.app=create_app(self.path,allow_http=True,bootstrap=('owner','01234'))
        self.admin=TestClient(self.app,headers=HEADERS)
        self.assertEqual(self.admin.post('/api/login',json={'username':'owner','pin':'01234'}).status_code,200)

    def tearDown(self):
        self.admin.close();self.tmp.cleanup()

    def new_user(self,username,role,pin='05678'):
        response=self.admin.post('/api/users',json={'username':username,'pin':pin,'role':role})
        self.assertEqual(response.status_code,201,response.text)
        client=TestClient(self.app,headers=HEADERS)
        self.assertEqual(client.post('/api/login',json={'username':username,'pin':pin}).status_code,200)
        self.addCleanup(client.close)
        return client,response.json()['user']['id']

    def test_anonymous_and_static_file_boundary(self):
        anonymous=TestClient(self.app)
        for path in ['/api/project','/api/me','/api/users','/api/audit','/data/project.json']:
            self.assertEqual(anonymous.get(path).status_code,401,path)
        for path in ['/server/app.py','/data/N14_Riviera_Original.xlsx','/.env','/render.yaml']:
            self.assertEqual(anonymous.get(path).status_code,404,path)
        self.assertEqual(anonymous.get('/').status_code,200)
        self.assertEqual(anonymous.get('/api/config').json(),{'shared':True})
        self.assertIn('no-store',self.admin.get('/api/project').headers['cache-control'])
        self.assertIn('unregister',anonymous.get('/sw.js').text)

    def test_roles_sharing_revision_and_audit(self):
        reader,_=self.new_user('read.user','reader')
        editor,_=self.new_user('edit.user','editor')
        before=reader.get('/api/project').json()
        changed=copy.deepcopy(before)
        changed['data']['resources'][0]['quantity']=3
        changed['data']['resources'][0]['price']=40
        self.assertEqual(reader.put('/api/project',json=changed).status_code,403)
        self.assertEqual(reader.get('/api/users').status_code,403)
        self.assertEqual(editor.post('/api/users',json={'username':'hacker','pin':'00000','role':'admin'}).status_code,403)
        self.assertEqual(editor.get('/api/audit').status_code,403)
        saved=editor.put('/api/project',json=changed)
        self.assertEqual(saved.status_code,200,saved.text)
        self.assertEqual(reader.get('/api/project').json()['data']['resources'][0]['price'],40)
        self.assertEqual(editor.put('/api/project',json=changed).status_code,409)
        logs=self.admin.get('/api/audit').json()['entries']
        log=next(x for x in logs if x['action']=='project.update')
        self.assertEqual(log['username'],'edit.user')
        self.assertEqual(len(log['detail']['changes']),2)

    def test_revoke_reset_last_admin_and_storage(self):
        editor,user_id=self.new_user('worker','editor')
        self.assertEqual(self.admin.patch('/api/users/1',json={'role':'reader','active':True}).status_code,409)
        self.assertEqual(self.admin.patch(f'/api/users/{user_id}',json={'role':'reader','active':True,'pin':'00001'}).status_code,200)
        self.assertEqual(editor.get('/api/project').status_code,401)
        self.assertEqual(editor.post('/api/login',json={'username':'worker','pin':'00001'}).status_code,200)
        self.assertEqual(editor.get('/api/me').json()['user']['role'],'reader')
        self.assertEqual(self.admin.patch(f'/api/users/{user_id}',json={'role':'reader','active':False}).status_code,200)
        self.assertEqual(editor.get('/api/project').status_code,401)
        self.assertEqual(editor.post('/api/login',json={'username':'worker','pin':'00001'}).status_code,401)
        with sqlite3.connect(self.path) as c:
            user=c.execute("SELECT salt,pin_hash FROM users WHERE username='owner'").fetchone()
            self.assertNotIn('01234',user)
            self.assertEqual(len(user[1]),64)
            self.assertNotIn(self.admin.cookies.get('riviera_session'),[r[0] for r in c.execute('SELECT token_hash FROM sessions')])
        self.assertEqual(self.admin.post('/api/logout').status_code,200)
        self.assertEqual(self.admin.get('/api/project').status_code,401)

    def test_pin_validation_csrf_and_rate_limit(self):
        self.assertEqual(self.admin.post('/api/users',json={'username':'bad','pin':'1234','role':'reader'}).status_code,422)
        self.assertEqual(self.admin.post('/api/users',json={'username':'bad','pin':'123456','role':'reader'}).status_code,422)
        anonymous=TestClient(self.app)
        self.assertEqual(anonymous.post('/api/login',json={'username':'owner','pin':'01234'}).status_code,403)
        for _ in range(5):
            self.assertEqual(self.admin.post('/api/login',json={'username':'missing','pin':'11111'}).status_code,401)
        locked=self.admin.post('/api/login',json={'username':'missing','pin':'11111'})
        self.assertEqual(locked.status_code,429)
        self.assertIn('retry-after',locked.headers)
        self.assertEqual(self.admin.post('/api/users',json={'username':'owner','pin':'12345','role':'reader'}).status_code,409)

    def test_input_limits_and_persistence(self):
        initial=self.admin.get('/api/project').json()
        invalid=copy.deepcopy(initial);invalid['data']['resources'][0]['price']=-1
        self.assertEqual(self.admin.put('/api/project',json=invalid).status_code,422)
        invalid=copy.deepcopy(initial);invalid['data']['tasks'][0]['end']='2020-01-01'
        self.assertEqual(self.admin.put('/api/project',json=invalid).status_code,422)
        invalid=copy.deepcopy(initial);invalid['data']['resources'][0]['serviceId']='99.99'
        self.assertEqual(self.admin.put('/api/project',json=invalid).status_code,422)
        updated=copy.deepcopy(initial);updated['data']['resources'][0]['price']=75
        self.assertEqual(self.admin.put('/api/project',json=updated).status_code,200)
        restarted=TestClient(create_app(self.path,allow_http=True),headers=HEADERS)
        self.assertEqual(restarted.post('/api/login',json={'username':'owner','pin':'01234'}).status_code,200)
        self.assertEqual(restarted.get('/api/project').json()['data']['resources'][0]['price'],75)
        self.assertEqual(restarted.get('/api/project').json()['revision'],2)
        restarted.close()

    def test_origin_and_oversized_request(self):
        with patch.dict(os.environ, {'RIVIERA_PUBLIC_ORIGIN':'https://obra.example'}):
            self.assertEqual(self.admin.post('/api/login',json={'username':'owner','pin':'01234'},headers={'Origin':'https://evil.example'}).status_code,403)
            self.assertEqual(self.admin.post('/api/login',json={'username':'owner','pin':'01234'},headers={'Origin':'https://obra.example'}).status_code,200)
        self.assertEqual(self.admin.post('/api/login',content=b'x'*2_000_001).status_code,413)
        self.assertEqual(self.admin.post('/api/login',content=iter([b'x'*1_000_001,b'y'*1_000_001])).status_code,413)

    def test_successful_logins_do_not_consume_ip_failure_limit(self):
        for _ in range(35):
            response = self.admin.post('/api/login', json={'username': 'owner', 'pin': '01234'})
            self.assertEqual(response.status_code, 200, response.text)
        # Failed attempts against many names still share the IP allowance.
        for index in range(30):
            response = self.admin.post('/api/login', json={'username': f'unknown{index}', 'pin': '11111'})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.admin.post('/api/login', json={'username': 'newname', 'pin': '11111'}).status_code, 429)

    def test_baseline_admin_restore_and_expense_sharing(self):
        from uuid import uuid4
        editor, _ = self.new_user('editor2', 'editor')
        before = editor.get('/api/project').json()
        self.assertEqual(before['data']['version'], 2)
        changed = copy.deepcopy(before)
        changed['data']['baseline']['weights']['01.01'] = 10
        self.assertEqual(editor.put('/api/project', json=changed).status_code, 403)
        self.assertEqual(editor.put('/api/project/restore', json=before).status_code, 403)
        changed = copy.deepcopy(before)
        changed['data']['expenses'] = [{'id': str(uuid4()), 'serviceId':'01.01', 'name':'Taxa', 'date':'2026-11-03', 'dueDate':'2026-11-10', 'amount':3990, 'status':'paid', 'paidAt':'2020-11-07'}]
        self.assertEqual(editor.put('/api/project', json=changed).status_code, 200)
        saved = self.admin.get('/api/project').json()
        saved['data']['baseline']['weights']['01.01'] = 10
        saved['data']['baseline']['approvedAt'] = '2026-11-01T12:00:00Z'
        self.assertEqual(self.admin.put('/api/project/restore', json=saved).status_code, 200)
        latest = editor.get('/api/project').json()
        self.assertEqual(latest['data']['baseline']['weights']['01.01'], 10)
        self.assertEqual(latest['data']['expenses'][0]['amount'], 3990)
        logs = self.admin.get('/api/audit').json()['entries']
        self.assertTrue(any(entry['action'] == 'project.restore' for entry in logs))

    def test_existing_v1_database_migrates_without_losing_user_work(self):
        initial = self.admin.get('/api/project').json()['data']
        initial['version'] = 1
        initial['baseline'] = {'direct': 1650800.62, 'total': 1782864.67}
        initial.pop('expenses', None)
        initial.pop('calendar', None)
        initial['resources'][0]['quantity'] = 9
        initial['resources'][0]['price'] = 80
        initial['tasks'][0]['progress'] = .5
        with sqlite3.connect(self.path) as c:
            import json
            c.execute('UPDATE project SET data=? WHERE id=1', (json.dumps(initial),))
        restarted = TestClient(create_app(self.path, allow_http=True), headers=HEADERS)
        restarted.post('/api/login', json={'username':'owner','pin':'01234'})
        migrated = restarted.get('/api/project').json()
        self.assertEqual(migrated['data']['version'], 2)
        self.assertEqual(migrated['data']['resources'][0]['quantity'], 9)
        self.assertEqual(migrated['data']['resources'][0]['price'], 80)
        self.assertEqual(migrated['data']['tasks'][0]['progress'], .5)
        self.assertEqual(migrated['data']['expenses'], [])
        self.assertEqual(migrated['revision'], 2)
        restarted.close()

    def test_production_cookie(self):
        secure=TestClient(create_app(self.path,allow_http=False),base_url='https://testserver',headers=HEADERS)
        response=secure.post('/api/login',json={'username':'owner','pin':'01234'})
        cookie=response.headers['set-cookie'].lower()
        self.assertIn('secure',cookie);self.assertIn('httponly',cookie);self.assertIn('samesite=strict',cookie)
        self.assertEqual(secure.get('/api/me').status_code,200)
        secure.close()

if __name__=='__main__':
    unittest.main()
