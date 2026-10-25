(function (root) {
  "use strict";
  const S =
    typeof module !== "undefined" && module.exports
      ? require("./scheduler.js")
      : root.MiruniScheduler;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  function consumeSteps(task, minutes) {
    let left = minutes;
    for (const step of task.steps || []) {
      const used = Math.min(step.remaining, left);
      step.remaining -= used;
      left -= used;
      if (!left) break;
    }
  }
  function resizeRemaining(task, minutes) {
    const completed = task.total - task.remaining;
    let cut = task.remaining - minutes;
    if (cut < 0) throw new Error("Reduction cannot increase work");
    for (const step of [...(task.steps || [])].reverse()) {
      const amount = Math.min(cut, step.remaining);
      step.remaining -= amount;
      step.total -= amount;
      cut -= amount;
    }
    task.remaining = minutes;
    task.total = completed + minutes;
  }
  function recoveryOptions(state, today, id) {
    const before = S.plan(state, today),
      task = state.tasks.find((t) => t.id === id);
    if (!task || !task.remaining || !before.shortages[id])
      return { before, options: [] };
    const options = [],
      lack = before.shortages[id];
    if (task.remaining - lack >= 5) {
      const candidate = clone(state),
        changed = candidate.tasks.find((t) => t.id === id);
      resizeRemaining(changed, task.remaining - lack);
      options.push({
        kind: "reduce",
        remaining: changed.remaining,
        before,
        after: S.plan(candidate, today),
        state: candidate,
      });
    }
    const candidate = clone(state),
      changed = candidate.tasks.find((t) => t.id === id);
    const first = task.deadline < today ? today : S.addDays(task.deadline, 1),
      limit = S.addDays(today, 365);
    for (let date = first; date <= limit; date = S.addDays(date, 1)) {
      changed.deadline = date;
      const after = S.plan(candidate, today);
      const worsens = state.tasks.some(
        (t) =>
          t.id !== id &&
          (after.shortages[t.id] || 0) > (before.shortages[t.id] || 0),
      );
      if (!after.shortages[id] && !worsens) {
        options.push({
          kind: "deadline",
          deadline: date,
          before,
          after,
          state: candidate,
        });
        break;
      }
    }
    return { before, options };
  }
  function availabilityOption(state, today, id, date, minutes) {
    const task = state.tasks.find((t) => t.id === id);
    if (
      !task ||
      date < today ||
      date > task.deadline ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      S.dateKey(new Date(date + "T12:00:00")) !== date ||
      !Number.isInteger(minutes) ||
      minutes < 0 ||
      minutes > 1440 ||
      minutes % 30
    )
      return null;
    const candidate = clone(state);
    candidate.overrides[date] = minutes;
    return {
      kind: "availability",
      date,
      minutes,
      state: candidate,
      before: S.plan(state, today),
      after: S.plan(candidate, today),
    };
  }
  function weekStart(date) {
    const weekday = new Date(date + "T12:00:00").getDay();
    return S.addDays(date, -((weekday + 6) % 7));
  }
  function weeklyStats(state, date) {
    const start = weekStart(date),
      end = S.addDays(start, 6);
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: S.addDays(start, i),
      minutes: 0,
      sessions: 0,
      passes: 0,
    }));
    const map = new Map(daily.map((d) => [d.date, d]));
    for (const log of state.logs) {
      const day = map.get(log.date);
      if (!day) continue;
      if (log.type === "progress") {
        day.minutes += log.minutes;
        day.sessions++;
      }
      if (log.type === "skip") day.passes++;
    }
    const minutes = daily.reduce((n, d) => n + d.minutes, 0),
      passes = daily.reduce((n, d) => n + d.passes, 0),
      sessions = daily.reduce((n, d) => n + d.sessions, 0);
    const previousStart = S.addDays(start, -7);
    const previousMinutes = state.logs
      .filter(
        (l) =>
          l.type === "progress" && l.date >= previousStart && l.date < start,
      )
      .reduce((n, l) => n + l.minutes, 0);
    const tasks = state.tasks
      .map((t) => ({
        title: t.title,
        minutes: state.logs
          .filter(
            (l) =>
              l.taskId === t.id &&
              l.type === "progress" &&
              l.date >= start &&
              l.date <= end,
          )
          .reduce((n, l) => n + l.minutes, 0),
      }))
      .filter((t) => t.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
    return {
      start,
      end,
      daily,
      minutes,
      passes,
      sessions,
      activeDays: daily.filter((d) => d.minutes > 0).length,
      previousMinutes,
      tasks,
    };
  }
  const api = {
    consumeSteps,
    resizeRemaining,
    recoveryOptions,
    availabilityOption,
    weekStart,
    weeklyStats,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MiruniProductivity = api;
})(typeof window !== "undefined" ? window : globalThis);
