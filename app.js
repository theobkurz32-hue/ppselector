"use strict";
const KEY = "riviera-project-v1";
const D = window.RivieraDomain;
let confirmedProject,
  seriesCache,
  networkCache,
  budgetTab = "services",
  expenseFilter = "all",
  criticalOnly = false,
  lastHash = location.hash;
const money = (n) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    n,
  );
const number = (n, d = 2) =>
  new Intl.NumberFormat("pt-BR", { maximumFractionDigits: d }).format(n);
const pct = (n) => number(n * 100, 1) + "%";
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const parseDate = (s) => new Date(s + "T12:00:00Z");
const iso = (d) => d.toISOString().slice(0, 10);
const date = (s) =>
  s ? parseDate(s).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : "—";
const today = () =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
let project,
  baseline,
  view = "resumo",
  query = "",
  phaseFilter = "",
  scheduleMode = "gantt",
  ganttZoom = "month",
  editing = null;
let totals, byService, byPhase, natures;
const titles = {
  resumo: [
    "Visão geral da obra",
    "Do planejamento à entrega, todos os números no mesmo lugar.",
  ],
  orcamento: [
    "Orçamento executivo",
    "Custos por serviço, fase e natureza, sempre atualizados.",
  ],
  planejamento: [
    "Planejamento da obra",
    "O cronograma completo, com datas e avanço de cada atividade.",
  ],
  quantitativos: [
    "Quantitativos e preços",
    "Edite os insumos para recalcular o orçamento da obra.",
  ],
  premissas: [
    "Premissas e fontes",
    "Os critérios e as referências que sustentam o planejamento.",
  ],
};
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message;
  el.style.display = "block";
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.style.display = "none"), 4000);
}
async function persist(options = {}) {
  try {
    if (window.RivieraStore.shared)
      project = D.migrate(await window.RivieraStore.save(project, options));
    else {
      D.validate(project, baseline);
      const previous = localStorage.getItem(KEY);
      if (previous) localStorage.setItem("riviera-project-last-good", previous);
      localStorage.setItem(KEY, JSON.stringify(project));
      document.querySelector("#saveState").textContent =
        "● Salvo neste navegador";
      window.RivieraDirty?.reset();
    }
    confirmedProject = D.clone(project);
    setStatus(
      window.RivieraStore.shared
        ? "Dados compartilhados: alteração salva para a equipe."
        : "Modo local: os dados ficam neste navegador. Exporte um backup para guardá-los.",
      "info",
    );
    return true;
  } catch (error) {
    project = D.clone(confirmedProject);
    setStatus("Não foi salvo: " + error.message, "warning");
    toast(error.message);
    return false;
  }
}

function recalculate() {
  const budget = D.costs(project);
  byService = budget.services;
  byPhase = budget.phases;
  natures = budget.natures;
  const progress = D.progress(project, today()),
    finance = D.finance(project, today());
  const start = project.tasks.map((t) => t.start).sort()[0],
    end = project.tasks
      .map((t) => t.end)
      .sort()
      .at(-1);
  totals = {
    direct: budget.directCents / 100,
    reserve: budget.reserveCents / 100,
    total: budget.totalCents / 100,
    start,
    end,
    progress: progress.actual,
    planned: progress.planned,
    finance,
  };
  seriesCache = D.series(project);
  networkCache = D.network(project);
}

function metric(label, value, detail, featured = false, icon = "↗") {
  return `<article class="metric ${featured ? "featured" : ""}"><span class="metric-icon">${icon}</span><div class="metric-label">${label}</div><div class="metric-value">${value}</div><div class="metric-detail">${detail}</div></article>`;
}
function metrics() {
  return `<div class="metrics">${metric("Investimento estimado", money(totals.total), `Inclui ${pct(project.reserve)} de reserva técnica`, true)}${metric("Custo direto", money(totals.direct), `${project.services.length} serviços · ${project.phases.length} fases`, false, "▤")}${metric("Reserva técnica", money(totals.reserve), `<b>${pct(project.reserve)}</b> sobre o custo direto`, false, "◇")}${metric("Custo por m²", money(totals.total / project.area), `${number(project.area)} m² de área construída`, false, "⌑")}</div>`;
}
function workdays(start, end) {
  return D.workingDates(start, end, project?.calendar).length;
}

function financialSeries() {
  return seriesCache || D.series(project);
}

function curve(weeks) {
  const x = (i) => 40 + (i * 510) / Math.max(weeks.length - 1, 1),
    y = (n) => 190 - Math.min(n, 1) * 160;
  const points = (key) => weeks.map((w, i) => `${x(i)},${y(w[key])}`).join(" ");
  return `<svg class="chart" viewBox="0 0 580 225" role="img" aria-label="Curva S de avanço financeiro e físico planejado"><defs><linearGradient id="area" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#ffffff" stop-opacity=".2"/><stop offset="100%" stop-color="#ffffff" stop-opacity="0"/></linearGradient></defs>${[0, 0.25, 0.5, 0.75, 1].map((n) => `<line x1="40" x2="550" y1="${y(n)}" y2="${y(n)}" stroke="#2a2a2a"/><text x="5" y="${y(n) + 3}">${Math.round(n * 100)}%</text>`).join("")}<polygon points="40,190 ${points("financial")} 550,190" fill="url(#area)"/><line id="curveMarker" x1="40" x2="40" y1="30" y2="190" stroke="#666" stroke-dasharray="2 3"/><polyline points="${points("physical")}" stroke="#999999" stroke-width="2" fill="none" stroke-dasharray="5 4"/><polyline points="${points("financial")}" stroke="#ffffff" stroke-width="2.5" fill="none"/><polyline points="${points("paid")}" stroke="#ddd" stroke-width="2" fill="none" stroke-dasharray="2 5"/>${weeks
    .filter((_, i) => i % Math.max(1, Math.floor(weeks.length / 6)) === 0)
    .map(
      (w) =>
        `<text x="${x(weeks.indexOf(w))}" y="215" text-anchor="middle">${parseDate(w.date).toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })}</text>`,
    )
    .join("")}</svg>`;
}
function curveControl(weeks) {
  const i = 0,
    w = weeks[i];
  return `<div class="curve-inspector"><div class="curve-readout" aria-live="polite"><b id="curveWeek">Semana de ${date(w.date)}</b><span>Financeiro <strong id="curveFinancial">${pct(w.financial)}</strong></span><span>Físico <strong id="curvePhysical">${pct(w.physical)}</strong></span><span>Pago <strong id="curvePaid">${pct(w.paid)}</strong></span></div><label for="curveRange">Explore as semanas <span>Arraste para comparar</span></label><input id="curveRange" type="range" min="0" max="${weeks.length - 1}" value="0" aria-label="Semana do cronograma" aria-valuetext="Semana de ${date(w.date)}"></div>`;
}

function renderOverview() {
  const { weeks, monthly } = financialSeries(),
    top = Object.entries(byPhase)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6),
    max = Math.max(...top.map((x) => x[1]), 1),
    maxMonth = Math.max(...monthly.map((x) => x[1]), 1);
  return `${metrics()}${overviewInsights()}<div class="dashboard-grid"><section class="panel"><div class="panel-heading"><div><h2>Evolução planejada da obra</h2><p>Previsto na linha-base · pagamentos registrados · escala até 100%</p></div><span class="pill">${weeks.length} semanas</span></div><div class="panel-body"><div class="chart-legend"><span><i></i> Financeiro previsto</span><span><i class="gold"></i> Físico previsto · linha-base</span><span><i style="border-top:2px dotted #ddd;background:none"></i> Financeiro pago</span></div>${curve(weeks)}${curveControl(weeks)}</div><div class="project-strip"><div><small>FÍSICO PREVISTO HOJE</small><b>${pct(totals.planned)}</b></div><div><small>ENTREGA PREVISTA</small><b>${date(totals.end)}</b></div><div><small>AVANÇO REAL</small><b>${pct(totals.progress)}</b></div><div><small>DESVIO FÍSICO</small><b>${number((totals.progress - totals.planned) * 100, 1)} p.p.</b></div></div></section><section class="panel"><div class="panel-heading"><div><h2>Maiores custos por fase</h2><p>Participação no orçamento direto</p></div><a class="small-link" href="#orcamento">Ver todas ↗</a></div><div class="panel-body">${top.map(([p, cost]) => `<div class="phase-line"><div class="phase-label"><span title="${esc(p)}">${esc(p.replace(/^\d+ - /, ""))}</span><b>${money(cost)}</b></div><div class="bar-bg"><div class="bar-fill" style="width:${(cost / max) * 100}%"></div></div></div>`).join("")}<p>As ${top.length} maiores fases representam ${pct(top.reduce((a, x) => a + x[1], 0) / Math.max(totals.direct, 1))} do custo direto.</p></div></section></div><div class="lower-grid section-space"><section class="panel"><div class="panel-heading"><div><h2>Desembolso mensal previsto</h2><p>Custo direto previsto · reserva técnica não distribuída</p></div><span class="pill">${monthly.length} meses</span></div><div class="panel-body"><div class="month-bars">${monthly.map(([m, cost]) => `<button type="button" class="month-col" data-month="${m}" data-cost="${cost}" aria-label="${m}: ${money(cost)}" aria-pressed="false"><div class="month-bar" style="height:${(cost / maxMonth) * 125}px"></div><small>${parseDate(m + "-01").toLocaleDateString("pt-BR", { month: "short", timeZone: "UTC" })}/${m.slice(2, 4)}</small></button>`).join("")}</div><p id="monthReadout" class="month-readout" aria-live="polite">Toque em um mês para ver o valor previsto.</p></div></section><section class="panel"><div class="panel-heading"><div><h2>Composição do investimento</h2><p>Distribuição por natureza do custo</p></div></div><div class="panel-body">${Object.entries(
    natures,
  )
    .map(
      ([name, cost], i) =>
        `<div class="phase-line"><div class="phase-label"><span>${name === "MDO" ? "Mão de obra" : name}</span><b>${money(cost)}</b></div><div class="bar-bg"><div class="bar-fill" style="width:${(cost / Math.max(totals.direct, 1)) * 100}%"></div></div><small class="bar-percentage">${pct(cost / Math.max(totals.direct, 1))} do custo direto</small></div>`,
    )
    .join("")}</div></section></div>`;
}
function filtered(items) {
  const q = query.toLocaleLowerCase("pt-BR");
  return items.filter(
    (x) =>
      (!phaseFilter || x.phase === phaseFilter) &&
      (!q ||
        [x.id, x.serviceId, x.name, x.service, x.nature, x.confidence].some(
          (v) =>
            String(v || "")
              .toLocaleLowerCase("pt-BR")
              .includes(q),
        )),
  );
}
function toolbar(count) {
  return `<div class="toolbar"><input id="search" class="search" type="search" placeholder="Buscar serviço, código ou insumo…" aria-label="Buscar" value="${esc(query)}"><select id="phaseFilter" class="filter-phase" aria-label="Filtrar por fase"><option value="">Todas as fases</option>${project.phases.map((p) => `<option ${p === phaseFilter ? "selected" : ""} value="${esc(p)}">${esc(p)}</option>`).join("")}</select><span class="row-count">${count} registros</span></div>`;
}
function groupedPhaseRows(rows, renderRow) {
  if (!rows.length) return '<div class="empty">Nenhum item encontrado.</div>';
  return project.phases
    .map((phase) => {
      const items = rows.filter((row) => row.phase === phase);
      if (!items.length) return "";
      const id = String(project.phases.indexOf(phase) + 1).padStart(2, "0");
      const total = items.reduce(
        (sum, row) =>
          sum +
          (view === "orcamento"
            ? byService[row.id].total
            : D.lineCents(row) / 100),
        0,
      );
      return `<details class="phase-group" data-phase="${esc(phase)}"><summary class="phase-heading"><span class="phase-name">${esc(phase)}</span><span class="phase-meta"><small>${items.length} ${view === "orcamento" ? "serviços" : "insumos"}</small><b>${money(total)}</b></span><span class="chevron" aria-hidden="true"></span></summary><div class="phase-items" aria-label="Subitens da fase ${id}">${items.map(renderRow).join("")}</div></details>`;
    })
    .join("");
}
function budgetRows() {
  return groupedPhaseRows(filtered(project.services), (s) => {
    const r = byService[s.id];
    return `<details class="compact-row budget-row" data-row="${s.id}"><summary><span class="row-code">${s.id}</span><span class="row-name">${esc(s.name)}</span><b class="row-value">${money(r.total)}</b><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><h3>${esc(s.name)}</h3><div class="detail-grid"><div><small>Material</small><b>${money(r.Material)}</b></div><div><small>Mão de obra</small><b>${money(r.MDO)}</b></div><div><small>Terceiros</small><b>${money(r.Terceiros)}</b></div><div><small>Quantidade de referência</small><b>${number(s.quantity)} ${esc(s.unit)}</b></div></div><p>Confiança: ${esc(s.confidence)} · ${esc(s.note)}</p><button class="button" data-service="${s.id}">Ver e editar insumos</button></div></details>`;
  });
}

function renderBudget() {
  return `<div class="section-summary"><span>Custo direto <b>${money(totals.direct)}</b></span><span>Com reserva <b>${money(totals.total)}</b></span></div>
<div class="gantt-toggle section-space" role="group" aria-label="Seções do orçamento"><button class="button ${budgetTab === "services" ? "primary" : ""}" data-budget-tab="services" aria-pressed="${budgetTab === "services"}">Serviços</button><button class="button ${budgetTab === "expenses" ? "primary" : ""}" data-budget-tab="expenses" aria-pressed="${budgetTab === "expenses"}">Despesas e pagamentos</button></div>
${budgetTab === "expenses" ? renderFinance() : `<details class="settings-panel"><summary>Parâmetros e calendário <span class="chevron" aria-hidden="true"></span></summary><div class="settings" data-dirty-scope="settings"><label>Área construída (m²)<input id="area" type="number" min="0.01" max="10000000" step="0.01" value="${project.area}"></label><label>Reserva técnica (%)<input id="reserve" type="number" min="0" max="100" step="0.1" value="${project.reserve * 100}"></label><label>Feriados e paralisações (AAAA-MM-DD, separados por vírgulas)<textarea id="holidays" rows="3">${esc(project.calendar.holidays.join(", "))}</textarea></label><button class="button primary" id="saveSettings">Aplicar parâmetros</button></div></details>${baselinePanel()}<section class="panel compact-panel">${toolbar(filtered(project.services).length)}<div id="tableBody" class="compact-list">${budgetRows()}</div></section>`}`;
}

function resourceRows() {
  return groupedPhaseRows(
    filtered(project.resources),
    (r) =>
      `<details class="compact-row resource-row" data-row="${r.id}"><summary><span class="row-code">${r.serviceId}</span><span class="row-name">${esc(r.service)}<small>${esc(r.nature === "MDO" ? "Mão de obra" : r.nature)}</small></span><b class="row-value">${money(D.lineCents(r) / 100)}</b><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><h3>${esc(r.service)}</h3><p>${esc(r.name)} · ${esc(r.criterion)}</p><div class="detail-grid"><div><small>Quantidade</small><b>${number(r.quantity, 4)} ${esc(r.unit)}</b></div><div><small>Preço unitário</small><b>${money(r.price)}</b></div><div><small>Natureza</small><b>${esc(r.nature)}</b></div></div><button class="button" data-resource="${r.id}">Editar quantidade e preço</button></div></details>`,
  );
}

function renderResources() {
  return `<div class="section-summary"><span>Insumos <b>${project.resources.length}</b></span><span>Total <b>${money(totals.direct)}</b></span></div><section class="panel compact-panel">${toolbar(filtered(project.resources).length)}<div id="tableBody" class="compact-list">${resourceRows()}</div></section>`;
}

function taskStatus(t) {
  return D.taskState(t, today()).label;
}

function statusPill(t) {
  const state = D.taskState(t, today());
  return `<span class="pill ${t.progress >= 1 ? "done" : state.late ? "late" : t.progress > 0 ? "running" : ""}">${esc(state.label)}${state.delay ? " · " + state.delay + " dias" : ""}</span>`;
}

function taskList() {
  return filtered(
    project.tasks.map((t) => ({
      ...t,
      phase: project.services.find((s) => s.id === t.id).phase,
    })),
  ).filter((t) => !criticalOnly || networkCache.critical.includes(t.id));
}
function scheduleRows() {
  const tasks = taskList();
  let previous = "";
  if (scheduleMode === "list")
    return (
      tasks
        .map((t) => {
          let group = "";
          if (previous !== t.phase) {
            previous = t.phase;
            group = `<div class="phase-summary"><span>${esc(t.phase)}</span></div>`;
          }
          return `${group}<details class="compact-row task-row" data-row="${t.id}"><summary><span class="row-code">${t.id}</span><span class="row-name">${esc(t.name)}<small>${date(t.start).slice(0, 5)} — ${date(t.end).slice(0, 5)}${D.taskState(t, today()).late ? " · ATRASADO" : ""}</small></span><span class="row-progress"><b>${pct(t.progress)}</b><i style="--progress:${t.progress * 100}%"></i></span><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><h3>${esc(t.name)}</h3><div class="detail-grid"><div><small>Início</small><b>${date(t.start)}</b></div><div><small>Fim</small><b>${date(t.end)}</b></div><div><small>Duração</small><b>${t.duration} dias úteis</b></div><div><small>Custo previsto</small><b>${money(byService[t.id].total)}</b></div></div><p>${statusPill(t)} · ${esc(t.predecessor)}</p><button class="button" data-task="${t.id}">Editar datas e progresso</button></div></details>`;
        })
        .join("") || '<div class="empty">Nenhuma atividade encontrada.</div>'
    );
  const weeks = ganttWeeks(),
    origin = +parseDate(weeks[0].date),
    span = weeks.length * 7 * 86400000;
  return (
    tasks
      .map((t) => {
        let group = "";
        if (previous !== t.phase) {
          previous = t.phase;
          group = `<div class="gantt-phase"><span title="${esc(t.phase)}">${esc(t.phase)}</span><div></div></div>`;
        }
        const left = ((+parseDate(t.start) - origin) / span) * 100,
          width =
            ((+parseDate(t.end) - +parseDate(t.start) + 86400000) / span) * 100;
        return `${group}<div class="gantt-row ${D.taskState(t, today()).late ? "is-late" : ""} ${networkCache.critical.includes(t.id) ? "is-critical" : ""}"><button class="gantt-label" data-task="${t.id}" title="${esc(t.name)}"><small>${t.id}</small><span>${esc(t.name)}</span></button><div class="gantt-track"><button class="gantt-bar ${t.progress >= 1 ? "complete" : ""}" data-task="${t.id}" style="left:${left}%;width:${Math.max(width, 0.25)}%" aria-label="${esc(t.name)}, ${date(t.start)} a ${date(t.end)}, ${pct(t.progress)}"><span class="gantt-fill" style="width:${t.progress * 100}%"></span><span class="gantt-caption">${t.progress > 0 ? pct(t.progress) : ""}</span></button></div></div>`;
      })
      .join("") || '<div class="empty">Nenhuma atividade encontrada.</div>'
  );
}

function scheduleTable() {
  if (scheduleMode === "list")
    return `<div id="tableBody" class="compact-list">${scheduleRows()}</div>`;
  const weeks = ganttWeeks();
  const months = [];
  for (const w of weeks) {
    const key = w.date.slice(0, 7);
    if (months.at(-1)?.key === key) months.at(-1).count++;
    else months.push({ key, count: 1 });
  }
  return `<div class="gantt-scroll" tabindex="0" role="region" aria-label="Cronograma Gantt. Role horizontalmente para explorar os meses."><div class="gantt" style="--timeline-width:${Math.max(weeks.length * (ganttZoom === "week" ? 36 : 16), 520)}px;--weeks:${weeks.length}"><div class="gantt-header"><div class="gantt-corner">Atividade / período</div><div class="gantt-calendar"><div class="gantt-months">${months.map((m) => `<span style="flex:${m.count}">${parseDate(m.key + "-01").toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" })}</span>`).join("")}</div><div class="gantt-weeks">${weeks.map((w) => `<span title="Semana de ${date(w.date)}">${w.date.slice(8)}</span>`).join("")}</div></div></div><div id="tableBody">${scheduleRows()}</div></div></div>`;
}

function renderSchedule() {
  return `<div class="section-summary"><span>Período <b>${date(totals.start)} — ${date(totals.end)}</b></span><span>Avanço <b>${pct(totals.progress)}</b></span></div><section class="panel compact-panel"><div class="panel-heading"><h2>Cronograma</h2><div class="gantt-toggle"><button class="button ${scheduleMode === "gantt" ? "primary" : ""}" data-mode="gantt">Gantt</button><button class="button ${scheduleMode === "list" ? "primary" : ""}" data-mode="list">Lista</button></div></div>${planningInsights()}${toolbar(taskList().length)}${scheduleMode === "gantt" ? `<div class="timeline-tools"><span>Deslize para explorar · toque na barra para editar</span><label>Escala <select id="ganttZoom" aria-label="Escala do Gantt"><option value="month" ${ganttZoom === "month" ? "selected" : ""}>Meses</option><option value="week" ${ganttZoom === "week" ? "selected" : ""}>Semanas</option></select></label></div>` : ""}<div id="scheduleTable">${scheduleTable()}</div></section>`;
}

function renderNotes() {
  return `<div class="premise-list">${project.notes.map((n) => `<details class="premise-row"><summary><span>${esc(n.topic)}</span><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><p>${esc(n.text)}</p>${n.impact ? `<p><b>Impacto:</b> ${esc(n.impact)}</p>` : ""}${n.source ? `<small>Fonte: ${/^https:\/\//.test(n.source) ? `<a href="${esc(n.source)}" target="_blank" rel="noopener noreferrer">${esc(n.source)} ↗</a>` : esc(n.source)}</small>` : ""}</div></details>`).join("")}</div>`;
}

function render() {
  recalculate();
  view = titles[location.hash.slice(1)] ? location.hash.slice(1) : "resumo";
  document.querySelector("#viewTitle").textContent = titles[view][0];
  document.querySelector("#viewDescription").textContent = titles[view][1];
  document.title = `${titles[view][0]} · N14 Riviera`;
  document.querySelectorAll("nav a").forEach((a) => {
    a.classList.toggle("active", a.dataset.view === view);
    if (a.dataset.view === view) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
  document.querySelector("#content").innerHTML = {
    resumo: renderOverview,
    orcamento: renderBudget,
    planejamento: renderSchedule,
    quantitativos: renderResources,
    premissas: renderNotes,
  }[view]();
  document.querySelector(".heading-actions").hidden =
    view === "resumo" || view === "premissas";
  document.querySelector("#viewDescription").hidden = true;
  document.querySelector("#overviewIntro").hidden = view !== "resumo";
  document.body.dataset.view = view;
  document.querySelector("#export").textContent = "Exportar CSV";
  document.querySelector("#restore").hidden = !window.RivieraStore.canRestore();
  document
    .querySelectorAll("[data-resource],#saveSettings")
    .forEach((button) => (button.hidden = !window.RivieraStore.canEdit()));
  document
    .querySelectorAll(".settings-panel input,.settings-panel textarea")
    .forEach((input) => (input.disabled = !window.RivieraStore.canEdit()));
  document
    .querySelectorAll("[data-editor-only]")
    .forEach((el) => (el.hidden = !window.RivieraStore.canEdit()));
  document
    .querySelectorAll("[data-admin-only]")
    .forEach((el) => (el.hidden = !window.RivieraStore.canApproveBaseline()));
  window.RivieraDirty?.reset();
}
function updateTable() {
  const content =
    view === "orcamento"
      ? budgetRows()
      : view === "quantitativos"
        ? resourceRows()
        : scheduleRows();
  document.querySelector("#tableBody").innerHTML = content;
  const count =
    view === "orcamento"
      ? filtered(project.services).length
      : view === "quantitativos"
        ? filtered(project.resources).length
        : taskList().length;
  document.querySelector(".toolbar .row-count").textContent =
    count + " registros";
}
function openEditor(kind, id) {
  if (!window.RivieraStore.canEdit() && kind === "resource") {
    toast("Seu perfil permite apenas consultar a obra.");
    return;
  }
  editing = { kind, id };
  const r =
    kind === "resource"
      ? project.resources.find((x) => x.id === id)
      : project.tasks.find((x) => x.id === id);
  document.querySelector("#editCode").textContent =
    (r.serviceId || r.id) +
    " / " +
    (kind === "resource" ? "QUANTITATIVO" : "PLANEJAMENTO");
  document.querySelector("#editTitle").textContent =
    kind === "resource" ? r.service : r.name;
  document.querySelector("#editFields").innerHTML =
    kind === "resource"
      ? `<p class="dialog-hint">${esc(r.name)} · ${esc(r.nature)}<br>${esc(r.note)}</p><div class="field-grid"><label>Quantidade (${esc(r.unit)})<input name="quantity" type="number" min="0" max="100000000" step="any" required value="${r.quantity}"></label><label>Preço unitário (R$)<input name="price" type="number" min="0" max="100000000" step="any" required value="${r.price}"></label></div><p class="dialog-hint">O custo do serviço, das fases e os indicadores serão recalculados ao salvar.</p>`
      : `<div class="field-grid"><label>Início<input name="start" type="date" min="2000-01-01" max="2100-12-31" value="${r.start}" required></label><label>Fim<input name="end" type="date" min="2000-01-01" max="2100-12-31" value="${r.end}" required></label><label>Progresso real (%)<input name="progress" type="number" min="0" max="100" step="0.1" value="${r.progress * 100}" required></label><label class="full">Dependências fim → início (códigos separados por vírgula)<input name="dependencies" maxlength="2000" placeholder="Ex.: 01.01, 01.02" value="${esc(r.dependencies.join(", "))}"></label><label class="full">Predecessora de referência<input name="predecessor" maxlength="250" value="${esc(r.predecessor)}"></label></div><p class="dialog-hint">O prazo e as curvas previstas serão recalculados. Use Replanejar dependências no Plano para ajustar as atividades vinculadas. Os feriados configurados são respeitados.</p>`;
  document
    .querySelectorAll("#editFields input,#editFields select")
    .forEach((input) => (input.disabled = !window.RivieraStore.canEdit()));
  document.querySelector("#editForm [type=submit]").hidden =
    !window.RivieraStore.canEdit();
  document.querySelector("#cancelEditor").textContent =
    window.RivieraStore.canEdit() ? "Cancelar" : "Fechar";
  document.querySelector("#editor").showModal();
}
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function exportCSV() {
  let rows;
  if (view === "quantitativos")
    rows = [
      [
        "EAP",
        "Serviço",
        "Insumo",
        "Natureza",
        "Quantidade",
        "Unidade",
        "Preço unitário",
        "Total",
      ],
      ...filtered(project.resources).map((r) => [
        r.serviceId,
        r.service,
        r.name,
        r.nature,
        r.quantity,
        r.unit,
        r.price,
        D.lineCents(r) / 100,
      ]),
    ];
  else if (view === "planejamento")
    rows = [
      [
        "EAP",
        "Atividade",
        "Início",
        "Fim",
        "Dias úteis",
        "Progresso",
        "Status",
        "Custo",
      ],
      ...taskList().map((t) => [
        t.id,
        t.name,
        t.start,
        t.end,
        t.duration,
        t.progress,
        taskStatus(t),
        byService[t.id].total,
      ]),
    ];
  else
    rows = [
      ["EAP", "Serviço", "Fase", "Material", "MDO", "Terceiros", "Total"],
      ...filtered(project.services).map((s) => [
        s.id,
        s.name,
        s.phase,
        byService[s.id].Material,
        byService[s.id].MDO,
        byService[s.id].Terceiros,
        byService[s.id].total,
      ]),
      ["", "CUSTO DIRETO", "", "", "", "", totals.direct],
      ["", "RESERVA TÉCNICA", "", "", "", "", totals.reserve],
      ["", "TOTAL ESTIMADO", "", "", "", "", totals.total],
    ];
  const safe = (v) => {
    const s = String(v ?? "");
    return (
      '"' + (/^[=+@\-\t\r]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"'
    );
  };
  download(
    `N14_Riviera_${view}.csv`,
    "\uFEFF" + rows.map((row) => row.map(safe).join(";")).join("\r\n"),
    "text/csv;charset=utf-8",
  );
  toast("CSV exportado");
}
function validateBackup(candidate, options = {}) {
  const restored = D.migrate(candidate, baseline);
  D.validate(restored, baseline, options);
  // Keep descriptive content from the trusted source, while retaining only editable values.
  const clean = D.migrate(baseline, baseline);
  clean.area = restored.area;
  clean.reserve = restored.reserve;
  clean.baseline = D.clone(restored.baseline);
  clean.calendar = D.clone(restored.calendar);
  clean.expenses = D.clone(restored.expenses);
  clean.resources.forEach((r, i) => {
    r.quantity = restored.resources[i].quantity;
    r.price = restored.resources[i].price;
  });
  clean.tasks.forEach((t, i) => {
    for (const key of [
      "start",
      "end",
      "progress",
      "predecessor",
      "dependencies",
    ])
      t[key] = D.clone(restored.tasks[i][key]);
    t.duration = D.workingDates(t.start, t.end, clean.calendar).length;
  });
  return clean;
}

function setStatus(message, kind = "info") {
  const banner = document.querySelector("#appStatus");
  if (kind === "info" && document.querySelector("#syncStatus")) {
    banner.hidden = true;
    return;
  }
  banner.textContent = message;
  banner.dataset.kind = kind;
  banner.hidden = false;
}
function overviewInsights() {
  const low = project.services
    .filter((s) => s.confidence === "Baixa")
    .reduce((sum, s) => sum + byService[s.id].total, 0);
  const zero = project.services.filter((s) => byService[s.id].total === 0);
  const late = project.tasks.filter((t) => D.taskState(t, today()).late);
  const f = totals.finance;
  return `<section class="finance-summary" aria-label="Acompanhamento da obra"><div><small>Pagamentos registrados</small><b>${money(f.paid / 100)}</b></div><div><small>Compromissos a pagar</small><b>${money(f.committed / 100)}</b></div><div><small>Pagamentos vencidos</small><b>${money(f.overdue / 100)}</b></div><div><small>Atividades atrasadas</small><b>${late.length}</b></div></section>
<details class="quality-alert"><summary>Qualidade da referência e alertas <span class="chevron" aria-hidden="true"></span></summary><p>${pct(low / Math.max(totals.direct, 1))} do orçamento atual está em serviços de confiança baixa. ${zero.length} serviço(s) têm preço zero; confirme projetos, medições e cotações.</p><p>Linha-base física ${project.baseline.approvedAt ? "aprovada em " + date(project.baseline.approvedAt.slice(0, 10)) : "importada e ainda não aprovada"}. Pesos fixos mantêm o avanço independente dos reajustes. Pagamentos só aparecem depois de lançados.</p>${zero.length ? `<p>Preço zero: ${zero.map((s) => esc(s.id + " — " + s.name)).join("; ")}.</p>` : ""}${seriesCache.invalidTasks.length ? `<p role="alert">Revisar períodos sem dia útil: ${seriesCache.invalidTasks.join(", ")}.</p>` : ""}</details>`;
}
function baselinePanel() {
  return `<details class="baseline-panel"><summary>Linha-base física <span class="baseline-status">${project.baseline.approvedAt ? "Aprovada" : "Aprovação pendente"}</span><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><p>O previsto e o realizado usam os mesmos pesos fixos da referência, baseados no orçamento aprovado. Reajustes de preços não mudam o avanço físico. Uma nova aprovação substitui os pesos e as datas de referência para as comparações seguintes.</p><p>${project.baseline.approvedAt ? "Última aprovação: " + esc(new Date(project.baseline.approvedAt).toLocaleString("pt-BR")) : "A referência original foi preservada durante a migração. Confira os quantitativos antes de aprovar."}</p><button class="button" id="approveBaseline" data-admin-only>Aprovar orçamento e datas atuais como referência</button></div></details>`;
}
function planningInsights() {
  const n = networkCache;
  return `<div class="baseline-panel"><p>${project.tasks.filter((t) => D.taskState(t, today()).late).length} atividades atrasadas · ${n.links} vínculo(s) fim → início · ${n.violations.length} conflito(s) de sequência.</p><p>${n.links ? "Folgas e cadeia crítica calculadas somente para a rede de vínculos cadastrada; valide as dependências com o responsável técnico." : "As dependências originais são apenas observações. Cadastre vínculos por código para analisar a rede e replanejar."}</p><div class="gantt-toggle"><button class="button" id="reschedule" data-editor-only>Replanejar dependências</button>${n.links ? `<button class="button" id="criticalFilter" aria-pressed="${criticalOnly}">${criticalOnly ? "Mostrar todas" : "Ver cadeia crítica"}</button>` : ""}</div></div>`;
}
function renderFinance() {
  const f = totals.finance;
  const rows = project.expenses
    .filter(
      (e) =>
        expenseFilter === "all" ||
        expenseFilter === e.status ||
        (expenseFilter === "overdue" &&
          e.status === "planned" &&
          e.dueDate < today()),
    )
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
  return `<section class="finance-grid section-space"><div class="finance-summary"><div><small>Pago</small><b>${money(f.paid / 100)}</b></div><div><small>A pagar</small><b>${money(f.committed / 100)}</b></div><div><small>Vencido, não pago</small><b>${money(f.overdue / 100)}</b></div><div><small>Saldo após compromissos¹</small><b>${money(totals.total - (f.paid + f.committed) / 100)}</b></div></div><p>¹ Investimento estimado com reserva menos pagamentos e compromissos registrados. Não representa saldo bancário. Valores e pagamentos são informados manualmente; não há integração bancária.</p><div class="toolbar"><button class="button primary" id="addExpense" data-editor-only>+ Nova despesa</button><label>Consultar <select id="expenseFilter"><option value="all" ${expenseFilter === "all" ? "selected" : ""}>Todas</option><option value="planned" ${expenseFilter === "planned" ? "selected" : ""}>A pagar</option><option value="paid" ${expenseFilter === "paid" ? "selected" : ""}>Pagas</option><option value="overdue" ${expenseFilter === "overdue" ? "selected" : ""}>Vencidas</option></select></label></div><div class="expense-list">${rows.map((e) => `<details class="expense-row"><summary><span><b>${esc(e.name)}</b><small>${esc(e.serviceId)} · ${date(e.dueDate)} · ${e.status === "paid" ? "Pago em " + date(e.paidAt) : e.dueDate < today() ? "Vencido" : "A pagar"}</small></span><strong>${money(e.amount / 100)}</strong><span class="chevron" aria-hidden="true"></span></summary><div class="row-detail"><p>${esc(project.services.find((s) => s.id === e.serviceId).name)} · Registrado em ${date(e.date)}</p><button class="button" data-expense="${e.id}" data-editor-only>Editar despesa</button><button class="button" data-delete-expense="${e.id}" data-editor-only>Excluir lançamento</button></div></details>`).join("") || '<p class="empty">Nenhuma despesa registrada neste filtro.</p>'}</div></section>`;
}
function openExpense(id) {
  if (!window.RivieraStore.canEdit()) return;
  const expense = project.expenses.find((e) => e.id === id) || {
    id: crypto.randomUUID(),
    name: "",
    serviceId: project.services[0].id,
    amount: 0,
    date: today(),
    dueDate: today(),
    status: "planned",
    paidAt: null,
  };
  const dialog = document.querySelector("#expenseDialog");
  dialog.dataset.id = expense.id;
  dialog.querySelector("#expenseFields").innerHTML =
    `<div class="field-grid"><label class="full">Descrição<input name="name" maxlength="200" required value="${esc(expense.name)}"></label><label class="full">Serviço<select name="serviceId">${project.services.map((s) => `<option value="${s.id}" ${s.id === expense.serviceId ? "selected" : ""}>${esc(s.id + " — " + s.name)}</option>`).join("")}</select></label><label>Valor (R$)<input type="number" name="amount" min="0.01" max="10000000000" step="0.01" required value="${expense.amount / 100}"></label><label>Data do registro<input type="date" name="date" min="2000-01-01" max="2100-12-31" required value="${expense.date}"></label><label>Vencimento<input type="date" name="dueDate" min="2000-01-01" max="2100-12-31" required value="${expense.dueDate}"></label><label>Situação<select name="status"><option value="planned" ${expense.status === "planned" ? "selected" : ""}>A pagar</option><option value="paid" ${expense.status === "paid" ? "selected" : ""}>Pago</option></select></label><label>Data do pagamento<input type="date" name="paidAt" min="2000-01-01" max="2100-12-31" value="${expense.paidAt || today()}"></label></div>`;
  dialog.showModal();
}
function clearDirty() {
  window.RivieraDirty?.reset();
}
function canDiscard() {
  return (
    !window.RivieraDirty?.has() ||
    confirm("Existem alterações ainda não salvas. Deseja descartá-las?")
  );
}
function closeEditor(id) {
  if (
    window.RivieraDirty?.has() &&
    !confirm("Descartar as alterações deste formulário?")
  )
    return;
  document.querySelector("#" + id).close();
  clearDirty();
}
function refreshCurve(index) {
  const w = seriesCache.weeks[index];
  document.querySelector("#curveWeek").textContent =
    "Semana de " + date(w.date);
  document.querySelector("#curveFinancial").textContent = pct(w.financial);
  document.querySelector("#curvePhysical").textContent = pct(w.physical);
  document.querySelector("#curvePaid").textContent = pct(w.paid);
  document
    .querySelector("#curveRange")
    .setAttribute("aria-valuetext", "Semana de " + date(w.date));
  const x = 40 + (index * 510) / Math.max(seriesCache.weeks.length - 1, 1);
  document.querySelector("#curveMarker").setAttribute("x1", x);
  document.querySelector("#curveMarker").setAttribute("x2", x);
}

document.querySelector("#content").addEventListener("input", (event) => {
  if (event.target.id === "search") {
    query = event.target.value;
    updateTable();
  }
  if (event.target.id === "curveRange")
    refreshCurve(Number(event.target.value));
});
document.querySelector("#content").addEventListener("change", (event) => {
  if (event.target.id === "phaseFilter") {
    phaseFilter = event.target.value;
    updateTable();
  }
  if (event.target.id === "ganttZoom") {
    ganttZoom = event.target.value;
    document.querySelector("#scheduleTable").innerHTML = scheduleTable();
  }
  if (event.target.id === "expenseFilter") {
    expenseFilter = event.target.value;
    render();
  }
});
document.querySelector("#content").addEventListener("click", async (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.month) {
    document
      .querySelectorAll("[data-month]")
      .forEach((el) => el.setAttribute("aria-pressed", String(el === button)));
    document.querySelector("#monthReadout").textContent =
      parseDate(button.dataset.month + "-01").toLocaleDateString("pt-BR", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      }) +
      " · " +
      money(Number(button.dataset.cost));
  }
  if (button.dataset.resource) openEditor("resource", button.dataset.resource);
  if (button.dataset.task) openEditor("task", button.dataset.task);
  if (button.dataset.expense) openExpense(button.dataset.expense);
  if (button.id === "addExpense") openExpense();
  if (button.dataset.service) {
    if (!canDiscard()) return;
    query = button.dataset.service;
    phaseFilter = "";
    clearDirty();
    location.hash = "quantitativos";
    setTimeout(() => {
      query = button.dataset.service;
      render();
    }, 0);
  }
  if (button.dataset.mode || button.dataset.budgetTab) {
    if (!canDiscard()) return;
    clearDirty();
    if (button.dataset.mode) scheduleMode = button.dataset.mode;
    else budgetTab = button.dataset.budgetTab;
    render();
  }
  if (button.id === "criticalFilter") {
    criticalOnly = !criticalOnly;
    render();
  }
  if (button.id === "reschedule" && window.RivieraStore.canEdit()) {
    try {
      const result = D.reschedule(project);
      if (!result.changed.length) {
        toast("Nenhuma atividade não iniciada precisa ser deslocada.");
        return;
      }
      if (
        !confirm(
          "Deslocar " +
            result.changed.length +
            " atividade(s) não iniciada(s), preservando duração e feriados?",
        )
      )
        return;
      project = result.project;
      if (await persist()) {
        render();
        toast("Dependências replanejadas.");
      }
    } catch (error) {
      toast(error.message);
    }
  }
  if (
    button.id === "approveBaseline" &&
    window.RivieraStore.canApproveBaseline()
  ) {
    if (
      !canDiscard() ||
      !confirm(
        "Aprovar os custos e datas atuais como uma nova linha-base? Os pesos físicos serão substituídos explicitamente.",
      )
    )
      return;
    project.baseline = D.defaultBaseline(project);
    project.baseline.approvedAt = new Date().toISOString();
    if (await persist()) {
      render();
      toast("Linha-base aprovada.");
    }
  }
  if (button.dataset.deleteExpense && window.RivieraStore.canEdit()) {
    if (!confirm("Excluir este lançamento da obra?")) return;
    project.expenses = project.expenses.filter(
      (e) => e.id !== button.dataset.deleteExpense,
    );
    if (await persist()) {
      render();
      toast("Lançamento excluído.");
    }
  }
  if (button.id === "saveSettings" && window.RivieraStore.canEdit()) {
    const area = document.querySelector("#area"),
      reserve = document.querySelector("#reserve");
    if (!area.reportValidity() || !reserve.reportValidity()) return;
    const holidays = [
      ...new Set(
        document
          .querySelector("#holidays")
          .value.split(/[\s,;]+/)
          .filter(Boolean),
      ),
    ].sort();
    if (holidays.some((d) => !D.validDate(d)) || holidays.length > 3660) {
      toast("Informe feriados válidos no formato AAAA-MM-DD.");
      return;
    }
    const candidate = D.clone(project);
    candidate.area = Number(area.value);
    candidate.reserve = Number(reserve.value) / 100;
    candidate.calendar = { holidays };
    const invalid = candidate.tasks.filter(
      (t) => !D.workingDates(t.start, t.end, candidate.calendar).length,
    );
    if (invalid.length) {
      toast(
        "O calendário deixa atividades sem dia útil: " +
          invalid.map((t) => t.id).join(", "),
      );
      return;
    }
    candidate.tasks.forEach(
      (t) =>
        (t.duration = D.workingDates(
          t.start,
          t.end,
          candidate.calendar,
        ).length),
    );
    project = candidate;
    if (await persist()) {
      render();
      toast("Parâmetros e calendário atualizados.");
    }
  }
});
document
  .querySelector("#editForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.RivieraStore.canEdit()) return;
    const submit = event.target.querySelector("[type=submit]");
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const fields = new FormData(event.target),
        candidate = D.clone(project);
      if (editing.kind === "resource") {
        const row = candidate.resources.find((r) => r.id === editing.id);
        row.quantity = Number(fields.get("quantity"));
        row.price = Number(fields.get("price"));
        D.lineCents(row);
      } else {
        const task = candidate.tasks.find((t) => t.id === editing.id),
          start = fields.get("start"),
          end = fields.get("end");
        if (end < start)
          throw Error("A data final deve ser igual ou posterior à inicial.");
        const days = D.workingDates(start, end, candidate.calendar);
        if (!days.length)
          throw Error(
            "A atividade precisa de pelo menos um dia útil no calendário.",
          );
        Object.assign(task, {
          start,
          end,
          duration: days.length,
          progress: Number(fields.get("progress")) / 100,
          predecessor: fields.get("predecessor"),
          dependencies: fields
            .get("dependencies")
            .split(/[\s,;]+/)
            .filter(Boolean),
        });
        D.topology(candidate.tasks);
      }
      D.validate(candidate, baseline);
      project = candidate;
      if (await persist()) {
        document.querySelector("#editor").close();
        render();
        toast(
          window.RivieraStore.shared
            ? "Alterações salvas para todos"
            : "Alterações aplicadas",
        );
      }
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  });
document
  .querySelector("#expenseForm")
  .addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!window.RivieraStore.canEdit()) return;
    const submit = event.target.querySelector("[type=submit]");
    if (submit.disabled) return;
    submit.disabled = true;
    try {
      const f = new FormData(event.target),
        expense = {
          id: document.querySelector("#expenseDialog").dataset.id,
          name: f.get("name").trim(),
          serviceId: f.get("serviceId"),
          amount: D.cents(f.get("amount")),
          date: f.get("date"),
          dueDate: f.get("dueDate"),
          status: f.get("status"),
          paidAt: f.get("status") === "paid" ? f.get("paidAt") : null,
        };
      const candidate = D.clone(project),
        i = candidate.expenses.findIndex((e) => e.id === expense.id);
      if (i < 0) candidate.expenses.push(expense);
      else candidate.expenses[i] = expense;
      D.validate(candidate, baseline);
      project = candidate;
      if (await persist()) {
        document.querySelector("#expenseDialog").close();
        render();
        toast("Despesa salva.");
      }
    } catch (error) {
      toast(error.message);
    } finally {
      submit.disabled = false;
    }
  });
for (const id of ["closeEditor", "cancelEditor"])
  document.querySelector("#" + id).onclick = () => closeEditor("editor");
for (const id of ["closeExpense", "cancelExpense"])
  document.querySelector("#" + id).onclick = () => closeEditor("expenseDialog");
for (const id of ["editor", "expenseDialog"])
  document.querySelector("#" + id).addEventListener("cancel", (event) => {
    event.preventDefault();
    closeEditor(id);
  });
document.querySelector("#export").onclick = () => {
  if (view === "orcamento" && budgetTab === "expenses") {
    const rows = [
      [
        "Descrição",
        "Serviço",
        "Valor R$",
        "Situação",
        "Vencimento",
        "Pagamento",
      ],
      ...project.expenses.map((e) => [
        e.name,
        e.serviceId,
        number(e.amount / 100, 2),
        e.status === "paid" ? "Pago" : "A pagar",
        e.dueDate,
        e.paidAt || "",
      ]),
    ];
    const safe = (value) =>
      '"' +
      (/^[=+@\-\t\r]/.test(String(value)) ? "'" : "") +
      String(value).replace(/"/g, '""') +
      '"';
    download(
      "N14_Riviera_despesas.csv",
      "\uFEFF" + rows.map((r) => r.map(safe).join(";")).join("\r\n"),
      "text/csv;charset=utf-8",
    );
  } else exportCSV();
};
document.querySelector("#backup").onclick = () =>
  download(
    "N14_Riviera_backup.json",
    JSON.stringify(project, null, 2),
    "application/json",
  );
document.querySelector("#restore").onclick = () => {
  if (window.RivieraStore.canRestore())
    document.querySelector("#backupFile").click();
};
document.querySelector("#backupFile").onchange = async (event) => {
  const file = event.target.files[0];
  if (!file || !window.RivieraStore.canRestore()) return;
  try {
    if (file.size > 5e6) throw Error("Arquivo muito grande.");
    const restored = validateBackup(JSON.parse(await file.text()));
    if (
      !canDiscard() ||
      !confirm(
        "Restaurar este backup substituirá os dados atuais da obra. Deseja continuar?",
      )
    )
      return;
    project = restored;
    if (await persist({ restore: true })) {
      render();
      toast("Backup restaurado");
    }
  } catch (error) {
    toast("Não foi possível restaurar: " + error.message);
  } finally {
    event.target.value = "";
  }
};
window.addEventListener("hashchange", () => {
  if (!project) return;
  if (!canDiscard()) {
    history.replaceState(null, "", lastHash || location.pathname);
    return;
  }
  lastHash = location.hash;
  clearDirty();
  query = "";
  phaseFilter = "";
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  document.querySelector("#viewTitle").focus({ preventScroll: true });
});
window.addEventListener("riviera-shared-refresh", () => {
  project = D.migrate(window.RivieraStore.current);
  confirmedProject = D.clone(project);
  render();
  toast("Dados atualizados");
});
window.addEventListener("riviera-role-change", () => {
  const allowed = window.RivieraStore.canEdit();
  document
    .querySelectorAll(
      "#editFields input,#expenseFields input,#expenseFields select",
    )
    .forEach((e) => (e.disabled = !allowed));
  document.querySelector("#editForm [type=submit]").hidden = !allowed;
  document.querySelector("#expenseForm [type=submit]").hidden = !allowed;
  if (!window.RivieraDirty.has()) render();
});
window.addEventListener("beforeunload", (event) => {
  if (window.RivieraDirty?.has()) {
    event.preventDefault();
    event.returnValue = "";
  }
});
async function init() {
  try {
    await window.RivieraStore.ready;
    if (window.RivieraStore.error) throw window.RivieraStore.error;
    if (window.RivieraStore.shared) {
      project = D.migrate(await window.RivieraStore.load());
      baseline = D.clone(project);
      setStatus(
        "Dados compartilhados: alterações autorizadas ficam disponíveis para a equipe.",
        "info",
      );
    } else {
      const response = await fetch("data/project.json");
      if (!response.ok) throw Error("Falha ao ler os dados.");
      baseline = D.migrate(await response.json());
      project = D.clone(baseline);
      const raw = localStorage.getItem(KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          project = validateBackup(parsed, { allowLegacyNonworking: true });
          if (
            parsed.version === 1 &&
            !localStorage.getItem("riviera-project-backup-v1")
          )
            localStorage.setItem("riviera-project-backup-v1", raw);
        } catch (error) {
          setStatus(
            "Os dados locais não puderam ser carregados. A referência original está em exibição; exporte e confira seus backups antes de editar.",
            "warning",
          );
        }
      }
      if (!document.querySelector("#appStatus").textContent)
        setStatus(
          "Modo local: alterações ficam neste navegador. Use Backup para guardar ou transferir os dados.",
          "info",
        );
    }
    confirmedProject = D.clone(project);
    render();
    document.querySelector("#loading").hidden = true;
    document.querySelector("#app").hidden = false;
    if (!window.RivieraStore.shared && "serviceWorker" in navigator)
      navigator.serviceWorker
        .register("./sw.js")
        .catch(() =>
          setStatus(
            "Cache offline indisponível. O site continua funcionando com conexão.",
            "warning",
          ),
        );
  } catch (error) {
    document.querySelector("#loading").textContent =
      "Não foi possível carregar a obra. " + error.message;
  }
}
init();
document.querySelector(".skip-link").addEventListener("click", (event) => {
  event.preventDefault();
  document.querySelector("#mainContent").focus();
});

function ganttWeeks() {
  const first = project.tasks.map((t) => t.start).sort()[0],
    last = project.tasks
      .map((t) => t.end)
      .sort()
      .at(-1);
  return seriesCache.weeks.filter((w) => {
    const end = parseDate(w.date);
    end.setUTCDate(end.getUTCDate() + 6);
    return w.date <= last && iso(end) >= first;
  });
}
