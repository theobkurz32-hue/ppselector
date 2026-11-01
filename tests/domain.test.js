const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const D = require("../domain.js");
const original = JSON.parse(
  fs.readFileSync(require("node:path").join(__dirname, "../data/project.json")),
);
const fresh = () => D.migrate(original, original);

test("migration preserves edits and reference weights; cent totals reconcile", () => {
  const old = structuredClone(original);
  old.resources[0].price = 123;
  const p = D.migrate(old, original);
  assert.equal(p.version, 2);
  assert.equal(p.resources[0].price, 123);
  assert.equal(p.baseline.weights["01.01"], 0);
  assert.deepEqual(p.expenses, []);
  const c = D.costs(fresh());
  assert.equal(c.directCents, 165080062);
  assert.equal(c.reserveCents, 13206405);
  assert.equal(
    Object.values(c.services).reduce((n, s) => n + s.cents, 0),
    c.directCents,
  );
  const service = c.services["11.02"];
  assert.equal(
    D.cents(service.Material) +
      D.cents(service.MDO) +
      D.cents(service.Terceiros),
    service.cents,
  );
});
test("physical weights stay fixed after prices change and planned uses the same weights", () => {
  const p = fresh();
  p.tasks.find((t) => t.id === "08.01").progress = 1;
  const before = D.progress(p, "2027-01-01").actual;
  p.resources.find(
    (r) => r.serviceId === "08.01" && r.nature === "Material",
  ).price *= 2;
  assert.equal(D.progress(p, "2027-01-01").actual, before);
  for (const t of p.tasks) {
    const period = p.baseline.tasks[t.id],
      days = D.workingDates(period.start, period.end, p.calendar);
    t.progress = days.filter((d) => d <= "2027-03-01").length / days.length;
  }
  const progress = D.progress(p, "2027-03-01");
  assert.ok(Math.abs(progress.actual - progress.planned) < 1e-12);
});
test("partial expired tasks are late; completed tasks never late", () => {
  const t = { progress: 0.1, end: "2026-01-01" };
  assert.match(D.taskState(t, "2026-02-01").label, /Atrasado/);
  assert.equal(D.taskState({ ...t, progress: 1 }, "2026-02-01").late, false);
});
test("calendar respects holidays and weekend; invalid periods do not acquire phantom cost", () => {
  assert.equal(D.workingDates("2026-11-07", "2026-11-08").length, 0);
  assert.equal(
    D.workingDates("2026-11-02", "2026-11-06", { holidays: ["2026-11-03"] })
      .length,
    4,
  );
  const p = fresh();
  p.tasks[1].start = "2026-11-07";
  p.tasks[1].end = "2026-11-08";
  assert.ok(D.series(p).invalidTasks.includes("01.02"));
});
test("money uses half-up decimal rounding and rejects unsafe totals", () => {
  assert.equal(D.cents("1.005"), 101);
  assert.equal(D.roundedProduct(".25", "10.02"), 251);
  assert.throws(() => D.roundedProduct(1e8, 1e8));
});
test("dependencies reject cycles and replan forward respecting duration/holidays", () => {
  const p = fresh();
  p.tasks[1].dependencies = [p.tasks[0].id];
  p.tasks[0].end = "2026-11-20";
  const count = D.workingDates(
    p.tasks[1].start,
    p.tasks[1].end,
    p.calendar,
  ).length;
  const moved = D.reschedule(p);
  assert.ok(moved.changed.includes("01.02"));
  assert.equal(moved.project.tasks[1].start, "2026-11-23");
  assert.equal(
    D.workingDates(
      moved.project.tasks[1].start,
      moved.project.tasks[1].end,
      p.calendar,
    ).length,
    count,
  );
  p.tasks[0].dependencies = [p.tasks[1].id];
  assert.throws(() => D.topology(p.tasks), /ciclo/);
});
test("expense records reconcile paid/open/overdue and survive backup validation", () => {
  const p = fresh();
  p.expenses = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      serviceId: "01.02",
      name: "Taxa",
      amount: 10001,
      date: "2026-10-01",
      dueDate: "2026-10-10",
      status: "planned",
      paidAt: null,
    },
    {
      id: "22222222-2222-4222-8222-222222222222",
      serviceId: "01.02",
      name: "Pagamento",
      amount: 2500,
      date: "2026-10-01",
      dueDate: "2026-10-01",
      status: "paid",
      paidAt: "2026-10-01",
    },
  ];
  assert.equal(D.finance(p, "2026-10-31").overdue, 10001);
  assert.equal(D.finance(p, "2026-10-31").paid, 2500);
  assert.equal(D.validate(p, fresh()).expenses.length, 2);
  p.expenses[1].id = "11111111-1111-4111-8111-111111111111";
  assert.throws(() => D.validate(p, fresh()));
});
test("monthly forecast allocates exactly the direct cost, reserve explicitly excluded", () => {
  const p = fresh(),
    s = D.series(p);
  assert.equal(
    s.monthly.reduce((sum, [, amount]) => sum + D.cents(amount), 0),
    D.costs(p).directCents,
  );
  assert.ok(Math.abs(s.weeks.at(-1).financial - 1) < 1e-12);
  assert.ok(Math.abs(s.weeks.at(-1).physical - 1) < 1e-12);
});

test("reference calendar remains frozen when operational holidays change", () => {
  const p = fresh(),
    before = D.progress(p, "2027-03-01").planned;
  p.calendar.holidays = ["2026-11-03", "2026-11-04"];
  assert.equal(D.progress(p, "2027-03-01").planned, before);
});
test("payments before project start are retained in the historical series", () => {
  const p = fresh();
  p.expenses = [
    {
      id: "11111111-1111-4111-8111-111111111111",
      serviceId: "01.02",
      name: "Antecipação",
      amount: 10000,
      date: "2026-01-01",
      dueDate: "2026-01-01",
      status: "paid",
      paidAt: "2026-01-01",
    },
  ];
  const s = D.series(p);
  assert.ok(s.weeks[0].date < "2026-11-01");
  assert.ok(s.weeks[0].paid > 0);
});
