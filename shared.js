"use strict";
// Authentication is cookie-based. PINs and session tokens never enter localStorage.
(() => {
  const store = (window.RivieraStore = {
    shared: false,
    user: null,
    revision: null,
    current: null,
    pendingRevision: null,
    saving: false,
    offline: false,
  });
  const roles = { reader: "Leitor", editor: "Editor", admin: "Administrador" };
  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[character],
    );
  const dirtyScopes = new Set();
  let resolveLogin;
  let refreshPromise;
  let notice = "";
  let noticeKind = "info";
  let pollTimer;
  let dirtyVersion = 0;
  let reauthDialogs = [];

  function scopeFor(element) {
    if (!(element instanceof Element)) return null;
    const declared = element.closest("[data-dirty-scope]");
    if (declared) return declared.dataset.dirtyScope || declared.id || "form";
    if (element.closest("#editForm")) return "editor";
    if (element.closest(".settings")) return "settings";
    const form = element.closest("#content form, #expenseForm, #baselineForm");
    return form ? form.id || "content-form" : null;
  }

  const dirty = (window.RivieraDirty = {
    has: () => dirtyScopes.size > 0,
    mark(scope = "form") {
      dirtyVersion++;
      dirtyScopes.add(scope);
      dirtyChanged();
    },
    reset(scope) {
      if (scope) dirtyScopes.delete(scope);
      else dirtyScopes.clear();
      dirtyChanged();
    },
    scopes: () => [...dirtyScopes],
  });
  store.isDirty = dirty.has;

  function dirtyChanged() {
    renderStatus();
    window.dispatchEvent(
      new CustomEvent("riviera-dirty-change", {
        detail: { dirty: dirty.has(), scopes: dirty.scopes() },
      }),
    );
  }
  for (const eventName of ["input", "change"]) {
    document.addEventListener(eventName, (event) => {
      const scope = scopeFor(event.target);
      if (scope) dirty.mark(scope);
    });
  }
  document.addEventListener(
    "close",
    (event) => {
      if (document.body.classList.contains("auth-pending")) return;
      if (event.target.id === "editor") dirty.reset("editor");
      const declared = event.target.querySelector?.("[data-dirty-scope]");
      if (declared)
        dirty.reset(declared.dataset.dirtyScope || declared.id || "form");
    },
    true,
  );
  window.addEventListener("beforeunload", (event) => {
    if (!dirty.has() || store.saving) return;
    event.preventDefault();
    event.returnValue = "";
  });

  function setNotice(message, kind = "info") {
    notice = message;
    noticeKind = kind;
    renderStatus();
  }
  function renderStatus() {
    const wrapper = document.querySelector(".main-wrap");
    if (!wrapper) return;
    let panel = document.querySelector("#syncStatus");
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "syncStatus";
      panel.className = "sync-status";
      panel.setAttribute("role", "status");
      panel.setAttribute("aria-live", "polite");
      wrapper.querySelector(".topbar")?.after(panel);
    }
    let text = notice;
    let kind = noticeKind;
    if (store.shared && store.offline) {
      text =
        "Sem conexão com o servidor. Seus campos foram preservados nesta tela; reconecte antes de salvar.";
      kind = "warning";
    } else if (store.shared && store.pendingRevision !== null) {
      text =
        "Outra pessoa atualizou a obra. Seu rascunho foi preservado. Atualize os dados quando estiver pronto.";
      kind = "warning";
    } else if (dirty.has()) {
      text = "Você tem alterações ainda não salvas.";
      kind = "warning";
    } else if (store.shared && store.saving) {
      text = "Salvando alterações para a equipe…";
    }
    panel.hidden = !text;
    panel.dataset.kind = kind;
    panel.replaceChildren();
    const label = document.createElement("span");
    label.textContent = text;
    panel.append(label);
    if (
      store.shared &&
      store.user &&
      (store.pendingRevision !== null || store.offline)
    ) {
      const button = document.createElement("button");
      button.className = "button";
      button.type = "button";
      button.textContent = store.offline ? "Tentar conexão" : "Atualizar dados";
      button.disabled = store.saving;
      button.onclick = () => manualRefresh();
      panel.append(button);
    }
    const saved = document.querySelector("#saveState");
    if (saved && store.shared) {
      saved.textContent = store.offline
        ? "● Sem conexão"
        : store.saving
          ? "● Salvando…"
          : dirty.has()
            ? "● Rascunho não salvo"
            : store.pendingRevision !== null
              ? "● Atualização disponível"
              : "● Dados compartilhados";
    }
  }

  async function api(path, method = "GET", data) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch("/api/" + path, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: {
          "X-Riviera-Request": "1",
          ...(data ? { "Content-Type": "application/json" } : {}),
        },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
    } catch (cause) {
      store.offline = true;
      renderStatus();
      const error = new Error(
        "Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.",
      );
      error.cause = cause;
      error.network = true;
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    store.offline = false;
    const body = await response
      .json()
      .catch(() => ({ detail: "Resposta inválida do servidor." }));
    if (!response.ok) {
      const error = new Error(
        typeof body.detail === "string"
          ? body.detail
          : "Verifique os campos e tente novamente.",
      );
      error.status = response.status;
      if (error.status === 429 && response.headers.get("retry-after")) {
        error.retryAfter = Number(response.headers.get("retry-after"));
      }
      renderStatus();
      throw error;
    }
    renderStatus();
    return body;
  }

  function showLogin(message = "") {
    document.body.classList.add("auth-pending");
    let panel = document.querySelector("#loginPanel");
    if (!panel) {
      panel = document.createElement("section");
      panel.id = "loginPanel";
      panel.className = "login-panel";
      panel.innerHTML = `<form id="loginForm" class="login-card"><div class="eyebrow">N14 RIVIERA</div><h1>Acesse sua obra</h1><p>Entre com seu usuário e PIN de cinco números.</p><label>Usuário<input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="3" maxlength="40" required></label><label>PIN de cinco números<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{5}" minlength="5" maxlength="5" autocomplete="current-password" required></label><p id="loginError" class="form-error" role="alert"></p><button class="button primary" type="submit">Entrar</button><small>Precisa de acesso ou esqueceu o PIN? Fale com o administrador da obra.</small></form>`;
      document.body.append(panel);
      panel.querySelector("form").onsubmit = async (event) => {
        event.preventDefault();
        const form = event.target;
        const button = form.querySelector("button");
        if (button.disabled) return;
        button.disabled = true;
        const fields = new FormData(form);
        try {
          const result = await api("login", "POST", {
            username: fields.get("username"),
            pin: fields.get("pin"),
          });
          form.reset();
          store.user = result.user;
          panel.remove();
          document.body.classList.remove("auth-pending");
          setupToolbar();
          if (resolveLogin) {
            const resume = resolveLogin;
            resolveLogin = null;
            resume();
          }
        } catch (error) {
          panel.querySelector("#loginError").textContent = error.message;
          form.elements.pin.value = "";
        } finally {
          button.disabled = false;
        }
      };
    }
    panel.querySelector("#loginError").textContent = message;
  }

  function sessionExpired() {
    if (!store.user && document.querySelector("#loginPanel")) return;
    store.user = null;
    // Inert, rather than rerender, preserves any open form's values for reauthentication.
    const app = document.querySelector("#app");
    if (app) app.inert = true;
    showLogin(
      "Sua sessão expirou. Entre novamente; seu rascunho continuará nesta tela.",
    );
    reauthDialogs = [...document.querySelectorAll("dialog[open]")];
    reauthDialogs.forEach((dialog) => dialog.close());
    resolveLogin = async () => {
      if (app) app.inert = false;
      reauthDialogs.forEach((dialog) => {
        if (dialog.isConnected && !dialog.open) dialog.showModal();
      });
      reauthDialogs = [];
      try {
        const { user } = await api("me");
        store.user = user;
        setupToolbar();
        await refreshShared({ apply: !dirty.has(), manual: false });
        window.dispatchEvent(new Event("riviera-role-change"));
      } catch (error) {
        setNotice(error.message, "warning");
      }
    };
  }

  function setupToolbar() {
    document.body.dataset.role = store.user.role;
    let access = document.querySelector("#accessControls");
    if (!access) {
      access = document.createElement("div");
      access.id = "accessControls";
      document.querySelector(".topbar>div").prepend(access);
    }
    access.innerHTML = `<span class="user-label">${escape(store.user.username)} · ${roles[store.user.role]}</span>${store.user.role === "admin" ? '<button id="manageUsers" class="button subtle">Acessos</button>' : ""}<button id="refreshShared" class="button subtle">Atualizar</button><button id="logout" class="button subtle">Sair</button>`;
    document.querySelector("#logout").onclick = async () => {
      if (store.saving) return;
      if (
        dirty.has() &&
        !window.confirm(
          "Existem alterações não salvas. Deseja sair e descartar esse rascunho?",
        )
      )
        return;
      try {
        await api("logout", "POST");
        dirty.reset();
        location.reload();
      } catch (error) {
        setNotice("Não foi possível sair. Verifique sua conexão.", "warning");
      }
    };
    document.querySelector("#refreshShared").onclick = () => manualRefresh();
    if (store.user.role === "admin")
      document.querySelector("#manageUsers").onclick = manageUsers;
    renderStatus();
  }

  store.canEdit = () =>
    !store.shared || ["editor", "admin"].includes(store.user?.role);
  store.canRestore = () => !store.shared || store.user?.role === "admin";
  store.canApproveBaseline = () =>
    !store.shared || store.user?.role === "admin";

  function acceptProject(result, notify) {
    if (Number.isInteger(store.revision) && result.revision < store.revision)
      return structuredClone(store.current);
    store.revision = result.revision;
    store.current = structuredClone(result.data);
    store.pendingRevision = null;
    store.offline = false;
    if (notify) window.dispatchEvent(new Event("riviera-shared-refresh"));
    renderStatus();
    return structuredClone(result.data);
  }

  async function refreshShared({
    apply = true,
    manual = false,
    force = false,
    notify = true,
  } = {}) {
    if (store.saving) return store.current && structuredClone(store.current);
    if (refreshPromise) return refreshPromise;
    refreshPromise = (async () => {
      const wasOffline = store.offline;
      try {
        const result = await api("project");
        if (
          result.revision < store.revision ||
          (result.revision === store.revision && !force)
        ) {
          if (manual) setNotice("A obra já está atualizada.");
          else if (wasOffline)
            setNotice("Conexão restabelecida. A obra está atualizada.");
          return structuredClone(store.current || result.data);
        }
        const protectedDraft =
          dirty.has() || document.querySelector("dialog[open]");
        if (!apply || (!force && protectedDraft)) {
          store.pendingRevision = result.revision;
          renderStatus();
          return store.current && structuredClone(store.current);
        }
        const data = acceptProject(result, notify);
        if (manual) setNotice("Dados atualizados.");
        else setNotice("Uma atualização da equipe foi recebida.");
        return data;
      } catch (error) {
        if (error.status === 401) sessionExpired();
        else setNotice(error.message, "warning");
        throw error;
      } finally {
        refreshPromise = null;
      }
    })();
    return refreshPromise;
  }

  async function manualRefresh() {
    if (store.saving) return;
    const hasDialog = Boolean(document.querySelector("dialog[open]"));
    const hasDraft = dirty.has();
    if (
      (hasDraft || hasDialog) &&
      !window.confirm(
        "Atualizar substituirá os dados desta tela e descartará as alterações ainda não salvas. Deseja continuar?",
      )
    )
      return;
    const beforeRequestVersion = dirtyVersion;
    try {
      // Do not erase a draft until the replacement has actually arrived from the server.
      const result = await api("project");
      if (store.saving) {
        setNotice("Aguarde o salvamento antes de atualizar.");
        return;
      }
      if (
        dirty.has() &&
        dirtyVersion !== beforeRequestVersion &&
        !window.confirm(
          "Seu rascunho mudou enquanto os dados eram carregados. Deseja descartá-lo e atualizar mesmo assim?",
        )
      )
        return;
      if (hasDraft || hasDialog || dirty.has()) {
        document
          .querySelectorAll("dialog[open]")
          .forEach((dialog) => dialog.close());
        dirty.reset();
      }
      acceptProject(result, true);
      setNotice("Dados atualizados.");
    } catch (error) {
      if (error.status === 401) sessionExpired();
      else setNotice(error.message, "warning");
    }
  }
  // A call from app startup loads data without dispatching a premature render event.
  store.refresh = () => refreshShared({ manual: false, notify: false });
  store.checkUpdates = () => refreshShared({ manual: false, notify: true });
  store.load = async () => {
    if (!store.user) {
      showLogin();
      await new Promise((resolve) => {
        resolveLogin = resolve;
      });
    }
    const result = await api("project");
    return acceptProject(result, false);
  };
  store.save = async (data, { restore = false } = {}) => {
    if (!store.canEdit())
      throw new Error("Seu perfil permite apenas consultar a obra.");
    if (restore && !store.canRestore())
      throw new Error("Apenas administradores podem restaurar o projeto.");
    if (store.saving)
      throw new Error(
        "Já existe um salvamento em andamento. Aguarde sua conclusão.",
      );
    store.saving = true;
    renderStatus();
    try {
      const result = await api(restore ? "project/restore" : "project", "PUT", {
        revision: store.revision,
        data,
      });
      const saved = acceptProject(result, false);
      dirty.reset();
      setNotice("Alterações salvas para todos.");
      return saved;
    } catch (error) {
      if (error.status === 401) sessionExpired();
      if (error.status === 409) {
        store.pendingRevision = "conflict";
        setNotice(
          "Outra pessoa atualizou a obra. Seu rascunho continua aberto; atualize os dados antes de refazer e salvar sua alteração.",
          "warning",
        );
      } else {
        setNotice(error.message, "warning");
      }
      throw error;
    } finally {
      store.saving = false;
      renderStatus();
    }
  };

  async function manageUsers() {
    let dialog = document.querySelector("#usersDialog");
    if (!dialog) {
      dialog = document.createElement("dialog");
      dialog.id = "usersDialog";
      dialog.setAttribute("aria-labelledby", "usersTitle");
      document.body.append(dialog);
    }
    dialog.innerHTML = `<div class="dialog-top"><div><div class="eyebrow">ADMINISTRAÇÃO</div><h2 id="usersTitle">Acessos da obra</h2></div><button class="icon-button" id="closeUsers" aria-label="Fechar acessos">×</button></div><p>Leitor consulta. Editor altera custos e planejamento. Administrador também gerencia acessos.</p><div id="usersList"></div><h3>Novo usuário</h3><form id="newUserForm" class="user-form"><label>Usuário<input name="username" required minlength="3" maxlength="40" pattern="[a-zA-Z0-9_.-]+" autocomplete="off" autocapitalize="none"></label><label>PIN de cinco números<input name="pin" type="password" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" required autocomplete="new-password"></label><label>Perfil<select name="role"><option value="reader">Leitor</option><option value="editor">Editor</option><option value="admin">Administrador</option></select></label><p id="usersError" class="form-error" role="alert"></p><button class="button primary">Criar usuário</button></form><details class="audit-section"><summary>Últimas alterações</summary><div id="auditList"></div></details>`;
    dialog.querySelector("#closeUsers").onclick = () => dialog.close();
    if (!dialog.open) dialog.showModal();
    async function loadUsers() {
      const { users } = await api("users");
      dialog.querySelector("#usersList").innerHTML = users
        .map(
          (user) =>
            `<details class="managed-user"><summary><span>${escape(user.username)} <small>${roles[user.role]}${user.active ? "" : " · Bloqueado"}</small></span><span class="chevron"></span></summary><form data-user="${user.id}" class="user-form"><label>Perfil<select name="role">${Object.entries(
              roles,
            )
              .map(
                ([key, label]) =>
                  `<option value="${key}" ${key === user.role ? "selected" : ""}>${label}</option>`,
              )
              .join(
                "",
              )}</select></label><label>Acesso<select name="active"><option value="true" ${user.active ? "selected" : ""}>Ativo</option><option value="false" ${!user.active ? "selected" : ""}>Bloqueado</option></select></label><label>Novo PIN (opcional)<input type="password" name="pin" inputmode="numeric" pattern="[0-9]{5}" maxlength="5" autocomplete="new-password"></label><button class="button">Salvar acesso</button></form></details>`,
        )
        .join("");
      dialog.querySelectorAll("[data-user]").forEach((form) => {
        form.onsubmit = async (event) => {
          event.preventDefault();
          const button = form.querySelector("button");
          if (button.disabled) return;
          button.disabled = true;
          const fields = new FormData(form);
          try {
            await api("users/" + form.dataset.user, "PATCH", {
              role: fields.get("role"),
              active: fields.get("active") === "true",
              ...(fields.get("pin") ? { pin: fields.get("pin") } : {}),
            });
            if (Number(form.dataset.user) === store.user.id) {
              location.reload();
              return;
            }
            await loadUsers();
            dialog.querySelector("#usersError").textContent =
              "Acesso atualizado. Sessões anteriores foram encerradas.";
          } catch (error) {
            dialog.querySelector("#usersError").textContent = error.message;
          } finally {
            button.disabled = false;
          }
        };
      });
    }
    try {
      await loadUsers();
    } catch (error) {
      dialog.querySelector("#usersError").textContent = error.message;
    }
    dialog.querySelector("#newUserForm").onsubmit = async (event) => {
      event.preventDefault();
      const form = event.target;
      const button = form.querySelector("button");
      if (button.disabled) return;
      button.disabled = true;
      const fields = new FormData(form);
      try {
        await api("users", "POST", Object.fromEntries(fields));
        form.reset();
        await loadUsers();
        dialog.querySelector("#usersError").textContent = "Usuário criado.";
      } catch (error) {
        dialog.querySelector("#usersError").textContent = error.message;
      } finally {
        button.disabled = false;
      }
    };
    dialog
      .querySelector(".audit-section")
      .addEventListener("toggle", async (event) => {
        if (!event.target.open) return;
        try {
          const { entries } = await api("audit");
          const actionName = {
            "project.update": "Atualizou a obra",
            login: "Entrou na obra",
            "user.create": "Criou usuário",
            "user.update": "Alterou acesso",
            "project.restore": "Restaurou backup",
            "user.recover": "Recuperou acesso administrativo",
          };
          dialog.querySelector("#auditList").innerHTML = entries
            .map(
              (entry) =>
                `<div class="audit-entry"><b>${escape(entry.username)}</b> · ${escape(new Date(entry.created * 1000).toLocaleString("pt-BR"))}<small>${escape(actionName[entry.action] || entry.action)}${entry.detail.changes ? " · " + entry.detail.changes.length + " campo(s)" : ""}</small>${entry.detail.changes?.length ? `<details><summary>Ver campos alterados</summary>${entry.detail.changes.map((change) => `<p><b>${escape(change.item)} · ${escape(change.field)}</b><br>${escape(change.before)} → ${escape(change.after)}</p>`).join("")}</details>` : ""}</div>`,
            )
            .join("");
        } catch (error) {
          dialog.querySelector("#auditList").textContent = error.message;
        }
      });
  }

  function backgroundRefresh() {
    if (
      !store.shared ||
      !store.user ||
      document.visibilityState === "hidden" ||
      store.saving
    )
      return;
    // We may check the remote revision while editing, but never apply it over a draft.
    refreshShared({
      apply: !dirty.has() && !document.querySelector("dialog[open]"),
      notify: true,
    }).catch(() => {});
  }
  window.addEventListener("focus", backgroundRefresh);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") backgroundRefresh();
  });
  window.addEventListener("online", backgroundRefresh);
  window.addEventListener("offline", () => {
    if (store.shared) {
      store.offline = true;
      renderStatus();
    }
  });
  window.addEventListener("pagehide", () => {
    clearInterval(pollTimer);
    pollTimer = null;
  });
  window.addEventListener("pageshow", () => {
    if (store.shared && !pollTimer)
      pollTimer = setInterval(backgroundRefresh, 30000);
  });

  store.ready = (async () => {
    let response;
    try {
      response = await fetch("/api/config", { cache: "no-store" });
      if (response.status === 404) {
        try {
          localStorage.setItem("riviera-static-mode", "1");
        } catch (_) {}
        const saved = document.querySelector("#saveState");
        if (saved) saved.textContent = "● Somente neste navegador";
        setNotice(
          "Modo local: as alterações ficam somente neste navegador. Exporte um backup para guardá-las.",
        );
        return;
      }
      if (!response.ok) throw new Error("Servidor indisponível.");
      const config = await response.json();
      if (config.shared !== true) throw new Error("Configuração inválida.");
    } catch (error) {
      try {
        if (
          !navigator.onLine &&
          localStorage.getItem("riviera-static-mode") === "1"
        ) {
          setNotice(
            "Modo local offline: as alterações ficam somente neste navegador.",
          );
          return;
        }
      } catch (_) {}
      store.error = error;
      return;
    }
    store.shared = true;
    try {
      localStorage.removeItem("riviera-static-mode");
    } catch (_) {}
    // Remove only this application's old caches/worker, leaving other same-origin projects alone.
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const appDirectory = new URL("./", location.href).href;
      for (const registration of registrations) {
        if (registration.scope === appDirectory)
          await registration.unregister();
      }
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      for (const key of keys)
        if (
          key.startsWith(
            "riviera-" +
              encodeURIComponent(new URL("./", location.href).pathname) +
              "-",
          ) ||
          [
            "riviera-v2",
            "riviera-v3-mobile",
            "riviera-v4-monochrome",
            "riviera-v5-phase-groups",
            "riviera-v6-explicit-fold",
            "riviera-v7-shared-ready",
            "riviera-v8-management",
          ].includes(key)
        )
          await caches.delete(key);
    }
    try {
      const result = await api("me");
      store.user = result.user;
      setupToolbar();
    } catch (error) {
      if (error.status !== 401) store.error = error;
    }
    pollTimer = setInterval(backgroundRefresh, 30000);
    setNotice(
      "Modo compartilhado: alterações confirmadas ficam disponíveis para a equipe.",
    );
  })();
})();
