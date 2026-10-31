'use strict';
// This file never stores PINs or session tokens in localStorage.
(() => {
  const store = window.RivieraStore = {shared:false,user:null,revision:null,current:null};
  const roles={reader:'Leitor',editor:'Editor',admin:'Administrador'};
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let resolveLogin;
  async function api(path,method='GET',data){
    const response=await fetch('/api/'+path,{method,credentials:'same-origin',cache:'no-store',headers:{'X-Riviera-Request':'1',...(data?{'Content-Type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})});
    const body=await response.json().catch(()=>({detail:'Resposta inválida do servidor.'}));
    if(!response.ok){const error=new Error(typeof body.detail==='string'?body.detail:'Verifique os campos e tente novamente.');error.status=response.status;throw error}
    return body;
  }
  function showLogin(message=''){
    document.body.classList.add('auth-pending');
    let panel=document.querySelector('#loginPanel');
    if(!panel){panel=document.createElement('section');panel.id='loginPanel';panel.className='login-panel';panel.innerHTML=`<form id="loginForm" class="login-card"><div class="eyebrow">N14 RIVIERA</div><h1>Acesse sua obra</h1><p>Entre com seu usuário e PIN de cinco números.</p><label>Usuário<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="40" required></label><label>PIN de cinco números<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{5}" minlength="5" maxlength="5" autocomplete="current-password" required></label><p id="loginError" class="form-error" role="alert"></p><button class="button primary" type="submit">Entrar</button><small>Precisa de acesso ou esqueceu o PIN? Fale com o administrador da obra.</small></form>`;document.body.append(panel);
      panel.querySelector('form').onsubmit=async event=>{event.preventDefault();const form=event.target,button=form.querySelector('button');button.disabled=true;const fields=new FormData(form);try{const result=await api('login','POST',{username:fields.get('username'),pin:fields.get('pin')});form.reset();store.user=result.user;panel.remove();document.body.classList.remove('auth-pending');setupToolbar();if(resolveLogin){resolveLogin();resolveLogin=null}}catch(error){panel.querySelector('#loginError').textContent=error.message;form.elements.pin.value=''}finally{button.disabled=false}};
    }
    panel.querySelector('#loginError').textContent=message;
  }
  function setupToolbar(){
    document.body.dataset.role=store.user.role;
    let access=document.querySelector('#accessControls');
    if(!access){access=document.createElement('div');access.id='accessControls';document.querySelector('.topbar>div').prepend(access)}
    access.innerHTML=`<span class="user-label">${escape(store.user.username)} · ${roles[store.user.role]}</span>${store.user.role==='admin'?'<button id="manageUsers" class="button subtle">Acessos</button>':''}<button id="refreshShared" class="button subtle">Atualizar</button><button id="logout" class="button subtle">Sair</button>`;
    document.querySelector('#logout').onclick=async()=>{try{await api('logout','POST');location.reload()}catch(e){window.alert('Não foi possível sair. Verifique sua conexão.')}};
    document.querySelector('#refreshShared').onclick=async()=>{try{if(document.querySelector('#editor[open]')){window.alert('Feche a edição antes de atualizar.');return}await store.refresh();window.dispatchEvent(new Event('riviera-shared-refresh'))}catch(e){if(e.status===401){store.user=null;document.querySelector('#app').hidden=true;showLogin('Sua sessão expirou. Entre novamente.');resolveLogin=()=>location.reload()}else window.alert(e.message)}};
    if(store.user.role==='admin')document.querySelector('#manageUsers').onclick=manageUsers;
    document.querySelector('#saveState').textContent='● Dados compartilhados';
  }
  store.canEdit=()=>!store.shared||['editor','admin'].includes(store.user?.role);
  store.canRestore=()=>!store.shared||store.user?.role==='admin';
  store.refresh=async()=>{const result=await api('project');store.revision=result.revision;store.current=structuredClone(result.data);return structuredClone(result.data)};
  store.load=async()=>{if(!store.user){showLogin();await new Promise(resolve=>resolveLogin=resolve)}return store.refresh()};
  store.save=async data=>{
    if(!store.canEdit())throw new Error('Seu perfil permite apenas consultar a obra.');
    try{const result=await api('project','PUT',{revision:store.revision,data});store.revision=result.revision;store.current=structuredClone(result.data);document.querySelector('#saveState').textContent='● Salvo para todos';return result.data}catch(error){
      if(error.status===401){store.user=null;document.querySelector('#app').hidden=true;showLogin('Sua sessão expirou. Entre novamente.');resolveLogin=()=>location.reload()}
      throw error;
    }
  };
  async function manageUsers(){
    let dialog=document.querySelector('#usersDialog');if(!dialog){dialog=document.createElement('dialog');dialog.id='usersDialog';document.body.append(dialog)}
    dialog.innerHTML=`<div class="dialog-top"><div><div class="eyebrow">ADMINISTRAÇÃO</div><h2>Acessos da obra</h2></div><button class="icon-button" id="closeUsers" aria-label="Fechar acessos">×</button></div><p>Leitor consulta. Editor altera custos e planejamento. Administrador também gerencia acessos.</p><div id="usersList"></div><h3>Novo usuário</h3><form id="newUserForm" class="user-form"><label>Usuário<input name="username" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9_.-]+" autocomplete="off" autocapitalize="none"></label><label>PIN de cinco números<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required autocomplete="new-password"></label><label>Perfil<select name="role"><option value="reader">Leitor</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></label><p id="usersError" class="form-error" role="alert"></p><button class="button primary">Criar usuário</button></form><details class="audit-section"><summary>Últimas alterações</summary><div id="auditList"></div></details>`;
    dialog.querySelector('#closeUsers').onclick=()=>dialog.close();if(!dialog.open)dialog.showModal();
    async function loadUsers(){const {users}=await api('users');dialog.querySelector('#usersList').innerHTML=users.map(user=>`<details class="managed-user"><summary><span>${escape(user.username)} <small>${roles[user.role]}${user.active?'':' · Bloqueado'}</small></span><span class="chevron"></span></summary><form data-user="${user.id}" class="user-form"><label>Perfil<select name="role">${Object.entries(roles).map(([key,label])=>`<option value="${key}" ${key===user.role?'selected':''}>${label}</option>`).join('')}</select></label><label>Acesso<select name="active"><option value="true" ${user.active?'selected':''}>Ativo</option><option value="false" ${!user.active?'selected':''}>Bloqueado</option></select></label><label>Novo PIN (opcional)<input type="password" name="pin" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="new-password"></label><button class="button">Salvar acesso</button></form></details>`).join('');
      dialog.querySelectorAll('[data-user]').forEach(form=>form.onsubmit=async event=>{event.preventDefault();const data=new FormData(form);try{await api('users/'+form.dataset.user,'PATCH',{role:data.get('role'),active:data.get('active')==='true',...(data.get('pin')?{pin:data.get('pin')}:{})});if(Number(form.dataset.user)===store.user.id){location.reload();return}await loadUsers();dialog.querySelector('#usersError').textContent='Acesso atualizado. Sessões anteriores foram encerradas.'}catch(e){dialog.querySelector('#usersError').textContent=e.message}});
    }
    try{await loadUsers()}catch(e){dialog.querySelector('#usersError').textContent=e.message}
    dialog.querySelector('#newUserForm').onsubmit=async event=>{event.preventDefault();const form=event.target,fields=new FormData(form);try{await api('users','POST',Object.fromEntries(fields));form.reset();await loadUsers();dialog.querySelector('#usersError').textContent='Usuário criado.'}catch(e){dialog.querySelector('#usersError').textContent=e.message}};
    dialog.querySelector('.audit-section').addEventListener('toggle',async event=>{if(!event.target.open)return;try{const {entries}=await api('audit');dialog.querySelector('#auditList').innerHTML=entries.map(e=>`<div class="audit-entry"><b>${escape(e.username)}</b> · ${escape(new Date(e.created*1000).toLocaleString('pt-BR'))}<small>${escape({'project.update':'Atualizou a obra','login':'Entrou na obra','user.create':'Criou usuário','user.update':'Alterou acesso'}[e.action]||e.action)}${e.detail.changes?' · '+e.detail.changes.length+' campo(s)':''}</small></div>`).join('')}catch(e){dialog.querySelector('#auditList').textContent=e.message}});
  }
  store.ready=(async()=>{
    let response;
    try{response=await fetch('/api/config',{cache:'no-store'});if(response.status===404){try{localStorage.setItem('riviera-static-mode','1')}catch(e){}return;}if(!response.ok)throw new Error('Servidor indisponível.');const config=await response.json();if(config.shared!==true)throw new Error('Configuração inválida.')}catch(e){try{if(!navigator.onLine&&localStorage.getItem('riviera-static-mode')==='1')return}catch(ignore){}store.error=e;return}
    store.shared=true;try{localStorage.removeItem('riviera-static-mode')}catch(e){}
    // Shared sessions never use the static offline cache or private browser copies.
    if('serviceWorker'in navigator){const regs=await navigator.serviceWorker.getRegistrations();for(const reg of regs)await reg.unregister()}
    if('caches'in window){const keys=await caches.keys();for(const key of keys)await caches.delete(key)}
    try{const result=await api('me');store.user=result.user;setupToolbar()}catch(e){if(e.status!==401)store.error=e}
    window.addEventListener('focus',async()=>{if(!store.user||document.querySelector('dialog[open]'))return;try{const result=await api('project');if(result.revision!==store.revision){store.revision=result.revision;store.current=result.data;window.dispatchEvent(new Event('riviera-shared-refresh'))}}catch(e){if(e.status===401){store.user=null;document.querySelector('#app').hidden=true;showLogin('Sua sessão expirou. Entre novamente.');resolveLogin=()=>location.reload()}}});
  })();
})();
