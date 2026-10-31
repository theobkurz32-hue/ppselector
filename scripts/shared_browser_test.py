"""Isolated shared-server browser tests; creates and removes its own DB and test accounts."""
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
BASE='http://127.0.0.1:8001'

def login(page,username,pin):
    page.goto(BASE)
    page.locator('#loginForm').wait_for(state='visible')
    page.locator('#loginForm [name=username]').fill(username)
    page.locator('#loginForm [name=pin]').fill(pin)
    page.locator('#loginForm button').click()
    page.locator('#app').wait_for(state='visible')

def open_resource(page):
    page.locator('nav [data-view=quantitativos]').click()
    page.locator('#search').fill('01.02')
    page.locator('.phase-heading').click()
    page.locator('.resource-row > summary').click()

def edit_price(page,price):
    open_resource(page)
    page.locator('[data-resource]').click()
    page.locator('[name=price]').fill(str(price))
    page.get_by_role('button',name='Salvar alterações').click()
    expect(page.locator('#editor')).not_to_be_visible()

with tempfile.TemporaryDirectory() as tmp:
    pin=''.join(secrets.choice('0123456789') for _ in range(5))
    env={**os.environ,'RIVIERA_DB_PATH':str(Path(tmp)/'test.sqlite3'),'RIVIERA_ALLOW_HTTP':'1','RIVIERA_ADMIN_USER':'testowner','RIVIERA_ADMIN_PIN':pin}
    log=open(Path(tmp)/'server.log','w+')
    process=subprocess.Popen([sys.executable,'-m','uvicorn','server.app:create_app','--factory','--host','127.0.0.1','--port','8001','--no-access-log'],cwd=ROOT,env=env,stdout=log,stderr=log)
    try:
        for _ in range(100):
            try:
                if urlopen(BASE+'/healthz',timeout=.2).status==200:break
            except Exception:time.sleep(.05)
        else:raise RuntimeError('Test server did not become ready')
        with sync_playwright() as p:
            browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox'])
            contexts=[browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True) for _ in range(3)]
            admin,editor,reader=[c.new_page() for c in contexts]
            errors=[]
            for page in [admin,editor,reader]:page.on('pageerror',lambda e:errors.append(str(e)))
            login(admin,'testowner',pin)
            assert 'Administrador' in admin.locator('#accessControls').inner_text()
            admin.locator('#manageUsers').click()
            for username,role in [('testeditor','editor'),('testreader','reader')]:
                form=admin.locator('#newUserForm');form.locator('[name=username]').fill(username);form.locator('[name=pin]').fill('05678');form.locator('[name=role]').select_option(role);form.locator('button').click()
                expect(admin.locator('#usersList')).to_contain_text(username)
            admin.locator('#closeUsers').click()
            login(editor,'testeditor','05678');login(reader,'testreader','05678')
            assert not reader.locator('#manageUsers').count()
            assert not reader.locator('#restore').is_visible()
            open_resource(reader)
            assert not reader.locator('[data-resource]').is_visible()
            edit_price(editor,150)
            expect(editor.locator('#toast')).to_contain_text('salvas para todos')
            reader.locator('#refreshShared').click()
            expect(reader.locator('#toast')).to_contain_text('Dados atualizados')
            reader.locator('#search').fill('01.02');reader.locator('.phase-heading').click()
            assert '150,00' in reader.locator('.resource-row > summary').inner_text()
            assert not reader.locator('[data-resource]').is_visible()
            # Store last confirmed data separately: a rejected stale write must not remain visible.
            second_context=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
            second=second_context.new_page();login(second,'testeditor','05678')
            edit_price(editor,200)
            open_resource(second);second.locator('[data-resource]').click();second.locator('[name=price]').fill('300')
            second.get_by_role('button',name='Salvar alterações').click()
            expect(second.locator('#toast')).to_contain_text('Outra pessoa atualizou')
            expect(second.locator('#editor')).not_to_be_visible()
            second.locator('.phase-heading').click()
            assert '150,00' in second.locator('.resource-row > summary').inner_text()
            second.locator('#refreshShared').click();expect(second.locator('#toast')).to_contain_text('Dados atualizados')
            second.locator('.phase-heading').click();assert '200,00' in second.locator('.resource-row > summary').inner_text()
            admin.locator('#manageUsers').click()
            managed=admin.locator('.managed-user').filter(has=admin.locator('summary',has_text='testeditor'))
            managed.locator('summary').click();managed.locator('[name=active]').select_option('false');managed.locator('button').click()
            expect(admin.locator('#usersError')).to_contain_text('Acesso atualizado')
            admin.locator('#closeUsers').click()
            editor.locator('#refreshShared').click()
            editor.locator('#loginForm').wait_for(state='visible')
            # Manual refresh surfaces the revoked session; no data write is accepted.

            response=contexts[1].request.get(BASE+'/api/project')
            assert response.status==401
            admin.locator('#logout').click();admin.locator('#loginForm').wait_for(state='visible')
            assert not admin.locator('#app').is_visible()
            assert admin.evaluate("localStorage.getItem('riviera-project-v1')")==None
            assert not errors,errors
            second_context.close()
            for c in contexts:c.close()
            browser.close()
            print('PASS shared mobile UI: login; admin creates/blocks accounts; readers cannot edit; edits shared across browsers; explicit refresh; stale-write conflict and rollback; session revocation; logout; no private localStorage; no page errors.')
    finally:
        process.terminate();process.wait(timeout=10);log.close()
