(function (root) {
  "use strict";
  const dateKey = (d) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const addDays = (key, n) => {
    const d = new Date(key + "T12:00:00");
    d.setDate(d.getDate() + n);
    return dateKey(d);
  };
  const daysBetween = (a, b) =>
    Math.round(
      (new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 86400000,
    );
  const usedOn = (state, date) =>
    state.logs
      .filter((l) => l.type === "progress" && l.date === date)
      .reduce((n, l) => n + l.minutes, 0);
  // A specific date wins over the recurring weekday; blank weekdays use daily.
  const configuredCapacity = (state, date) =>
    state.overrides[date] ??
    state.weekdays?.[new Date(date + "T12:00:00").getDay()] ??
    state.daily;
  const capacity = (state, date) =>
    Math.max(0, configuredCapacity(state, date) - usedOn(state, date));
  // Planned availability is a planning budget, not a cap on actual work.
  const recordingCapacity = (state, date) =>
    Math.max(0, 1440 - usedOn(state, date));
  function plan(state, today, skipId = null) {
    const active = state.tasks
      .filter((t) => t.remaining > 0)
      .slice()
      .sort(
        (a, b) =>
          a.deadline.localeCompare(b.deadline) || a.id.localeCompare(b.id),
      );
    const remaining = Object.fromEntries(
      active.map((t) => [t.id, t.remaining]),
    );
    const final = active.reduce(
      (d, t) => (t.deadline > d ? t.deadline : d),
      addDays(today, 2),
    );
    const days = [];
    for (let i = 0; i <= Math.min(365, daysBetween(today, final)); i++) {
      const date = addDays(today, i),
        available = capacity(state, date);
      let free = available;
      const allocations = [];
      for (const task of active) {
        if (
          task.deadline < date ||
          task.skipped.includes(date) ||
          (date === today && task.id === skipId)
        )
          continue;
        const minutes = Math.min(free, remaining[task.id]);
        if (minutes > 0) {
          allocations.push({ id: task.id, minutes });
          remaining[task.id] -= minutes;
          free -= minutes;
        }
      }
      days.push({ date, available, free, allocations });
    }
    return {
      days,
      shortages: remaining,
      totalShortage: Object.values(remaining).reduce((a, b) => a + b, 0),
    };
  }
  const api = {
    dateKey,
    addDays,
    daysBetween,
    usedOn,
    configuredCapacity,
    capacity,
    recordingCapacity,
    plan,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.MiruniScheduler = api;
})(typeof window !== "undefined" ? window : globalThis);
