"""Mocked shared-state regression checks; no server, DB, credentials, or persistent browser state."""
from pathlib import Path
import json
from playwright.sync_api import sync_playwright, expect

ROOT=Path(__file__).resolve().parents[1]
source=(ROOT/'shared.js').read_text()
state={'revision':1,'data':{'version':2,'area':289.33},'put_conflict':False,'offline':False,'put_count':0}
html='''<!doctype html><html><head><meta charset="utf-8"></head><body><div class="main-wrap"><header class="topbar"><div><span id="saveState"></span></div></header><main><div id="app"><div id="content"><div class="settings"><input id="area" value="289.33"></div></div></div></main></div><dialog id="editor"><form id="editForm"><input name="price" value="20"></form></dialog><script src="/shared.js"></script></body></html>'''
with sync_playwright() as p:
 b=p.chromium.launch(**({'executable_path':'/usr/bin/chromium'} if Path('/usr/bin/chromium').exists() else {}),headless=True,args=['--no-sandbox'])
 page=b.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 def handle(route):
  path=route.request.url.split('http://riviera.local')[-1]
  if path=='/shared.js':return route.fulfill(status=200,body=source,content_type='application/javascript')
  if path=='/':return route.fulfill(status=200,body=html,content_type='text/html')
  if path=='/api/config':data={'shared':True}
  elif path=='/api/me':data={'user':{'id':1,'username':'owner','role':'admin','active':1}}
  elif path=='/api/project':
   if state['offline']:return route.abort('internetdisconnected')
   if route.request.method=='PUT':
    state['put_count']+=1
    if state['put_conflict']:return route.fulfill(status=409,json={'detail':'Outra pessoa atualizou a obra.'})
    body=route.request.post_data_json
    state['data']=body['data'];state['revision']+=1
   data={'data':state['data'],'revision':state['revision']}
  elif path=='/api/project/restore':
   state['put_count']+=1;state['data']=route.request.post_data_json['data'];state['revision']+=1;data={'data':state['data'],'revision':state['revision']}
  else:return route.fulfill(status=404,json={})
  return route.fulfill(status=200,json=data)
 page.route('**/*',handle)
 page.goto('http://riviera.local/')
 page.evaluate('async()=>{await RivieraStore.ready;await RivieraStore.load();window.refreshCount=0;window.addEventListener("riviera-shared-refresh",()=>{refreshCount++;document.querySelector("#area").value=RivieraStore.current.area})}')
 assert page.evaluate('RivieraStore.canApproveBaseline()')
 page.locator('#area').fill('999');assert page.evaluate('RivieraDirty.has()')
 state.update(revision=2,data={'version':2,'area':333})
 page.evaluate('window.dispatchEvent(new Event("focus"))')
 page.wait_for_function('RivieraStore.pendingRevision === 2')
 assert page.locator('#area').input_value()=='999'
 assert page.evaluate('RivieraStore.revision')==1
 assert page.evaluate('refreshCount')==0
 expect(page.locator('#syncStatus')).to_contain_text('rascunho foi preservado')
 page.once('dialog',lambda dialog:dialog.dismiss())
 page.locator('#refreshShared').click();assert page.locator('#area').input_value()=='999'
 page.once('dialog',lambda dialog:dialog.accept())
 page.locator('#refreshShared').click();page.wait_for_function('RivieraStore.revision === 2')
 assert page.locator('#area').input_value()=='333'
 assert not page.evaluate('RivieraDirty.has()')
 assert page.evaluate('refreshCount')==1
 page.locator('#area').fill('444');state['put_conflict']=True
 error=page.evaluate('async()=>{try{await RivieraStore.save({version:2,area:444})}catch(e){return e.status}}')
 assert error==409 and page.evaluate('RivieraDirty.has()')
 assert page.evaluate('RivieraStore.current.area')==333
 assert page.locator('#area').input_value()=='444'
 state['put_conflict']=False
 result=page.evaluate('async()=>Promise.allSettled([RivieraStore.save({version:2,area:444}),RivieraStore.save({version:2,area:555})]).then(x=>x.map(y=>y.status))')
 assert result==['fulfilled','rejected']
 assert not page.evaluate('RivieraDirty.has()')
 assert page.evaluate('RivieraStore.current.area')==444
 state['offline']=True
 page.evaluate('RivieraStore.checkUpdates().catch(()=>{})')
 page.wait_for_function('RivieraStore.offline')
 expect(page.locator('#syncStatus')).to_contain_text('Sem conexão')
 state['offline']=False
 page.evaluate('RivieraStore.checkUpdates()')
 assert not page.evaluate('RivieraStore.offline')
 page.evaluate('RivieraStore.user.role="reader"')
 assert not page.evaluate('RivieraStore.canApproveBaseline()')
 assert not page.evaluate('RivieraStore.canEdit()')
 assert not errors,errors
 page.evaluate('RivieraDirty.reset()');b.close()
print('PASS shared.js contract: dirty settings retained on focus; remote-update notice; cancel/confirm discard; conflict keeps draft; duplicate save guard; offline persistent status; role-gated baseline; revision safe.')
