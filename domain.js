/* Business rules shared by the browser and Node regression tests. No DOM or storage. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RivieraDomain = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const DAY = 86400000;
  const clone = (value) => structuredClone(value);
  const parse = (value) => new Date(value + "T12:00:00Z");
  const iso = (value) => value.toISOString().slice(0, 10);
  function validDate(value) {
    return (
      typeof value === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      value >= "2000-01-01" &&
      value <= "2100-12-31" &&
      Number.isFinite(+parse(value)) &&
      iso(parse(value)) === value
    );
  }
  function decimal(value) {
    if (!Number.isFinite(Number(value)) || Number(value) < 0)
      throw new Error("Valor monetário inválido.");
    const [coefficient, exponent = "0"] = String(value)
      .toLowerCase()
      .split("e");
    const [whole, fraction = ""] = coefficient.split(".");
    return {
      value: BigInt(whole + fraction),
      scale: fraction.length - Number(exponent),
    };
  }
  function roundedProduct(a, b, precision = 2) {
    const x = decimal(a),
      y = decimal(b),
      power = x.scale + y.scale - precision;
    let result = x.value * y.value;
    if (power > 0) {
      const divisor = 10n ** BigInt(power);
      result = (result + divisor / 2n) / divisor;
    } else result *= 10n ** BigInt(-power);
    if (result > BigInt(Number.MAX_SAFE_INTEGER))
      throw new Error("Valor excede o limite financeiro permitido.");
    return Number(result);
  }
  const cents = (value) => roundedProduct(value, 1);
  const lineCents = (row) => roundedProduct(row.quantity, row.price);
  function workingDates(start, end, calendar = {}) {
    if (!validDate(start) || !validDate(end) || end < start)
      throw new Error("Período da atividade inválido.");
    const excluded = new Set(calendar.holidays || []),
      dates = [];
    for (
      let day = parse(start), last = parse(end);
      day <= last;
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      if (
        day.getUTCDay() !== 0 &&
        day.getUTCDay() !== 6 &&
        !excluded.has(iso(day))
      )
        dates.push(iso(day));
    }
    return dates;
  }
  function nextWorking(value, calendar = {}, include = false) {
    let day = parse(value);
    if (!include) day.setUTCDate(day.getUTCDate() + 1);
    while (!workingDates(iso(day), iso(day), calendar).length)
      day.setUTCDate(day.getUTCDate() + 1);
    return iso(day);
  }
  function finishOn(start, duration, calendar) {
    let day = nextWorking(start, calendar, true),
      remaining = duration - 1;
    while (remaining-- > 0) day = nextWorking(day, calendar);
    return day;
  }
  function costs(project) {
    const services = Object.fromEntries(
      project.services.map((s) => [
        s.id,
        { ...s, cents: 0, Material: 0, MDO: 0, Terceiros: 0, total: 0 },
      ]),
    );
    const phaseCents = Object.fromEntries(project.phases.map((p) => [p, 0]));
    const natureCents = { Material: 0, MDO: 0, Terceiros: 0 };
    for (const row of project.resources) {
      const amount = lineCents(row),
        service = services[row.serviceId];
      if (!service || !(row.nature in natureCents))
        throw new Error("Insumo sem serviço ou natureza válida.");
      service.cents += amount;
      service[row.nature] += amount;
      phaseCents[row.phase] += amount;
      natureCents[row.nature] += amount;
    }
    const directCents = Object.values(natureCents).reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(directCents))
      throw new Error("Total excede o limite financeiro permitido.");
    for (const service of Object.values(services)) {
      service.total = service.cents / 100;
      for (const key of Object.keys(natureCents)) service[key] /= 100;
    }
    const reserveCents = roundedProduct(directCents, project.reserve, 0);
    if (!Number.isSafeInteger(directCents + reserveCents))
      throw new Error("Total excede o limite financeiro permitido.");
    return {
      services,
      directCents,
      reserveCents,
      totalCents: directCents + reserveCents,
      phases: Object.fromEntries(
        Object.entries(phaseCents).map(([k, v]) => [k, v / 100]),
      ),
      natures: Object.fromEntries(
        Object.entries(natureCents).map(([k, v]) => [k, v / 100]),
      ),
    };
  }
  function defaultBaseline(original) {
    const budget = costs(original);
    return {
      approvedAt: null,
      calendar: clone(original.calendar || { holidays: [] }),
      weights: Object.fromEntries(
        original.tasks.map((t) => [t.id, budget.services[t.id].total]),
      ),
      tasks: Object.fromEntries(
        original.tasks.map((t) => [t.id, { start: t.start, end: t.end }]),
      ),
    };
  }
  function migrate(source, original = source) {
    const project = clone(source);
    if (![1, 2].includes(project.version))
      throw new Error("Versão de backup não suportada.");
    project.version = 2;
    project.calendar ||= { holidays: [] };
    project.expenses ||= [];
    if (!project.baseline?.weights)
      project.baseline = defaultBaseline(original);
    project.baseline.calendar ||= clone(project.calendar || { holidays: [] });
    for (const task of project.tasks) task.dependencies ||= [];
    return project;
  }
  function topology(tasks) {
    const lookup = new Map(tasks.map((t) => [t.id, t])),
      state = new Map(),
      ordered = [];
    function visit(task) {
      if (state.get(task.id) === 1)
        throw new Error("As dependências formam um ciclo.");
      if (state.get(task.id) === 2) return;
      state.set(task.id, 1);
      for (const id of task.dependencies || []) {
        if (!lookup.has(id) || id === task.id)
          throw new Error(
            "Dependência inexistente ou apontando para a própria atividade.",
          );
        visit(lookup.get(id));
      }
      state.set(task.id, 2);
      ordered.push(task);
    }
    tasks.forEach(visit);
    return ordered;
  }
  function validate(project, original, { allowLegacyNonworking = false } = {}) {
    if (
      project.project !== original.project ||
      !Number.isFinite(project.area) ||
      project.area < 0.01 ||
      project.area > 1e7 ||
      !Number.isFinite(project.reserve) ||
      project.reserve < 0 ||
      project.reserve > 1
    )
      throw new Error("Parâmetros do projeto inválidos.");
    for (const key of ["services", "resources", "tasks", "phases", "notes"]) {
      if (
        !Array.isArray(project[key]) ||
        project[key].length !== original[key].length
      )
        throw new Error("Estrutura de backup incompatível.");
    }
    project.resources.forEach((row, i) => {
      const old = original.resources[i];
      if (
        ["id", "serviceId", "phase", "nature"].some((k) => row[k] !== old[k]) ||
        ![row.quantity, row.price].every(
          (n) => Number.isFinite(n) && n >= 0 && n <= 1e8,
        )
      )
        throw new Error("Insumo inválido no backup.");
      lineCents(row);
    });
    if (
      !Array.isArray(project.calendar?.holidays) ||
      project.calendar.holidays.length > 3660 ||
      !project.calendar.holidays.every(validDate) ||
      new Set(project.calendar.holidays).size !==
        project.calendar.holidays.length
    )
      throw new Error("Calendário inválido.");
    project.tasks.forEach((task, i) => {
      if (
        task.id !== original.tasks[i].id ||
        !Number.isFinite(task.progress) ||
        task.progress < 0 ||
        task.progress > 1 ||
        !validDate(task.start) ||
        !validDate(task.end) ||
        task.end < task.start ||
        typeof task.predecessor !== "string" ||
        task.predecessor.length > 250 ||
        !Array.isArray(task.dependencies) ||
        task.dependencies.length > project.tasks.length ||
        new Set(task.dependencies).size !== task.dependencies.length
      )
        throw new Error("Atividade inválida no backup.");
    });
    if (
      !allowLegacyNonworking &&
      project.tasks.some(
        (t) => !workingDates(t.start, t.end, project.calendar).length,
      )
    )
      throw new Error("Cada atividade precisa de pelo menos um dia útil.");
    topology(project.tasks);
    const base = project.baseline;
    if (
      !base ||
      (base.approvedAt !== null &&
        (typeof base.approvedAt !== "string" ||
          !Number.isFinite(Date.parse(base.approvedAt)) ||
          !/(Z|[+-]\d\d:\d\d)$/.test(base.approvedAt)))
    )
      throw new Error("Linha-base inválida.");
    if (
      Object.keys(base).some(
        (k) => !["approvedAt", "weights", "tasks", "calendar"].includes(k),
      ) ||
      Object.keys(base.weights || {}).length !== project.tasks.length ||
      Object.keys(base.tasks || {}).length !== project.tasks.length
    )
      throw new Error("Estrutura da linha-base inválida.");
    if (
      !Array.isArray(base.calendar?.holidays) ||
      !base.calendar.holidays.every(validDate) ||
      new Set(base.calendar.holidays).size !== base.calendar.holidays.length ||
      base.calendar.holidays.length > 3660
    )
      throw new Error("Calendário da linha-base inválido.");
    let weight = 0;
    for (const task of project.tasks) {
      const w = base.weights?.[task.id],
        period = base.tasks?.[task.id];
      if (
        !Number.isFinite(w) ||
        w < 0 ||
        !period ||
        !validDate(period.start) ||
        !validDate(period.end) ||
        period.end < period.start
      )
        throw new Error("Pesos ou datas da linha-base inválidos.");
      weight += w;
    }
    if (!(weight > 0))
      throw new Error("A linha-base precisa de pesos positivos.");
    if (!Array.isArray(project.expenses) || project.expenses.length > 10000)
      throw new Error("Lista de despesas inválida.");
    const ids = new Set(),
      services = new Set(project.services.map((s) => s.id));
    for (const expense of project.expenses) {
      if (
        typeof expense.id !== "string" ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
          expense.id,
        ) ||
        ids.has(expense.id) ||
        !services.has(expense.serviceId) ||
        typeof expense.name !== "string" ||
        !expense.name.trim() ||
        expense.name.length > 200 ||
        !Number.isSafeInteger(expense.amount) ||
        expense.amount < 0 ||
        expense.amount > 1e12 ||
        !validDate(expense.date) ||
        !validDate(expense.dueDate) ||
        !["planned", "paid"].includes(expense.status) ||
        (expense.status === "paid"
          ? !validDate(expense.paidAt) ||
            expense.paidAt >
              new Intl.DateTimeFormat("sv-SE", {
                timeZone: "America/Sao_Paulo",
              }).format(new Date())
          : expense.paidAt !== null)
      )
        throw new Error("Despesa inválida.");
      ids.add(expense.id);
    }
    if (
      !Number.isSafeInteger(project.expenses.reduce((n, e) => n + e.amount, 0))
    )
      throw new Error("Total de despesas excede o limite permitido.");
    costs(project);
    return project;
  }
  function completion(period, when, calendar) {
    const days = workingDates(period.start, period.end, calendar);
    if (!days.length) return when >= period.end ? 1 : 0;
    return days.filter((day) => day <= when).length / days.length;
  }
  function progress(project, when) {
    const weights = project.baseline.weights;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    return {
      actual:
        project.tasks.reduce(
          (sum, task) => sum + weights[task.id] * task.progress,
          0,
        ) / total,
      planned:
        project.tasks.reduce(
          (sum, task) =>
            sum +
            weights[task.id] *
              completion(
                project.baseline.tasks[task.id],
                when,
                project.baseline.calendar,
              ),
          0,
        ) / total,
    };
  }
  function taskState(task, when) {
    const late = task.progress < 1 && when > task.end;
    return {
      late,
      label:
        task.progress >= 1
          ? "Concluído"
          : late
            ? task.progress > 0
              ? "Em andamento · Atrasado"
              : "Não iniciado · Atrasado"
            : task.progress > 0
              ? "Em andamento"
              : "Não iniciado",
      delay: late ? Math.round((+parse(when) - +parse(task.end)) / DAY) : 0,
    };
  }
  function finance(project, when) {
    let paid = 0,
      committed = 0,
      overdue = 0;
    const byService = Object.fromEntries(
      project.services.map((s) => [s.id, { paid: 0, committed: 0 }]),
    );
    for (const item of project.expenses) {
      const key = item.status === "paid" ? "paid" : "committed";
      if (key === "paid") paid += item.amount;
      else {
        committed += item.amount;
        if (item.dueDate < when) overdue += item.amount;
      }
      byService[item.serviceId][key] += item.amount;
    }
    return { paid, committed, overdue, byService };
  }
  function series(project) {
    const budget = costs(project),
      daily = {},
      paidDaily = {},
      taskDates = new Map();
    for (const task of project.tasks) {
      const dates = workingDates(task.start, task.end, project.calendar);
      // Legacy invalid periods remain visible as a warning; no cost is assigned to a non-working day.
      taskDates.set(task.id, dates);
      dates.forEach((day, i) => {
        const cost =
          Math.floor(budget.services[task.id].cents / dates.length) +
          (i < budget.services[task.id].cents % dates.length ? 1 : 0);
        daily[day] = (daily[day] || 0) + cost;
      });
    }
    for (const expense of project.expenses)
      if (expense.status === "paid")
        paidDaily[expense.paidAt] =
          (paidDaily[expense.paidAt] || 0) + expense.amount;
    const periods = [
      ...project.tasks,
      ...Object.values(project.baseline.tasks),
      ...project.expenses
        .filter((e) => e.status === "paid")
        .map((e) => ({ start: e.paidAt, end: e.paidAt })),
    ];
    const start = periods.reduce(
      (min, t) => (t.start < min ? t.start : min),
      periods[0].start,
    );
    const end = periods.reduce(
      (max, t) => (t.end > max ? t.end : max),
      periods[0].end,
    );
    const monday = parse(start);
    monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
    const weights = project.baseline.weights,
      sumWeights = Object.values(weights).reduce((a, b) => a + b, 0),
      baselineDates = project.tasks.map((t) => ({
        id: t.id,
        days: workingDates(
          project.baseline.tasks[t.id].start,
          project.baseline.tasks[t.id].end,
          project.baseline.calendar,
        ),
      }));
    const weeks = [],
      months = {};
    for (const [day, amount] of Object.entries(daily))
      months[day.slice(0, 7)] = (months[day.slice(0, 7)] || 0) + amount;
    const dailyEntries = Object.entries(daily).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    const paidEntries = Object.entries(paidDaily).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    let index = 0,
      paidIndex = 0,
      cumulative = 0,
      paidCumulative = 0;
    for (
      let day = new Date(monday);
      day <= parse(end);
      day.setUTCDate(day.getUTCDate() + 7)
    ) {
      const last = new Date(day);
      last.setUTCDate(last.getUTCDate() + 6);
      const cutoff = iso(last);
      while (index < dailyEntries.length && dailyEntries[index][0] <= cutoff)
        cumulative += dailyEntries[index++][1];
      while (
        paidIndex < paidEntries.length &&
        paidEntries[paidIndex][0] <= cutoff
      )
        paidCumulative += paidEntries[paidIndex++][1];
      const physical =
        baselineDates.reduce(
          (sum, t) =>
            sum +
            weights[t.id] *
              (t.days.length
                ? t.days.filter((d) => d <= cutoff).length / t.days.length
                : cutoff >= project.baseline.tasks[t.id].end
                  ? 1
                  : 0),
          0,
        ) / sumWeights;
      weeks.push({
        date: iso(day),
        financial: budget.directCents ? cumulative / budget.directCents : 0,
        physical,
        paid: budget.directCents ? paidCumulative / budget.directCents : 0,
      });
    }
    return {
      weeks,
      monthly: Object.entries(months)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([m, amount]) => [m, amount / 100]),
      invalidTasks: project.tasks
        .filter((t) => !taskDates.get(t.id).length)
        .map((t) => t.id),
    };
  }
  function reschedule(project) {
    const result = clone(project),
      lookup = new Map(result.tasks.map((t) => [t.id, t])),
      changed = [];
    for (const task of topology(result.tasks)) {
      if (!task.dependencies.length || task.progress > 0) continue;
      const latestEnd = task.dependencies
        .map((id) => lookup.get(id).end)
        .sort()
        .at(-1);
      const earliest = nextWorking(latestEnd, result.calendar);
      if (task.start < earliest) {
        const duration = workingDates(
          task.start,
          task.end,
          result.calendar,
        ).length;
        if (!duration)
          throw new Error("A atividade " + task.id + " não possui dia útil.");
        task.start = earliest;
        task.end = finishOn(earliest, duration, result.calendar);
        task.duration = duration;
        changed.push(task.id);
      }
    }
    return { project: result, changed };
  }
  function network(project) {
    const ordered = topology(project.tasks),
      lookup = new Map(),
      links = project.tasks.reduce((n, t) => n + t.dependencies.length, 0);
    const start = project.tasks.map((t) => t.start).sort()[0];
    for (const task of ordered) {
      const duration = workingDates(
        task.start,
        task.end,
        project.calendar,
      ).length;
      const rootOffset = Math.max(
        0,
        workingDates(start, task.start, project.calendar).length - 1,
      );
      const earliest = Math.max(
        rootOffset,
        ...task.dependencies.map((id) => lookup.get(id).finish),
        0,
      );
      lookup.set(task.id, {
        start: earliest,
        finish: earliest + duration,
        duration,
        latest: Infinity,
      });
    }
    const finish = Math.max(...[...lookup.values()].map((t) => t.finish));
    for (const task of [...ordered].reverse()) {
      const successors = ordered.filter((t) =>
        t.dependencies.includes(task.id),
      );
      const latestFinish = successors.length
        ? Math.min(...successors.map((t) => lookup.get(t.id).latest))
        : finish;
      lookup.get(task.id).latest = latestFinish - lookup.get(task.id).duration;
    }
    return {
      links,
      critical: links
        ? ordered
            .filter(
              (t) =>
                Math.abs(lookup.get(t.id).latest - lookup.get(t.id).start) <
                0.001,
            )
            .map((t) => t.id)
        : [],
      violations: project.tasks
        .filter((t) =>
          t.dependencies.some(
            (id) => project.tasks.find((x) => x.id === id).end >= t.start,
          ),
        )
        .map((t) => t.id),
      slack: Object.fromEntries(
        [...lookup].map(([id, t]) => [id, t.latest - t.start]),
      ),
    };
  }
  return {
    migrate,
    validate,
    costs,
    progress,
    series,
    taskState,
    finance,
    topology,
    reschedule,
    network,
    validDate,
    workingDates,
    nextWorking,
    roundedProduct,
    cents,
    lineCents,
    clone,
    defaultBaseline,
  };
});
