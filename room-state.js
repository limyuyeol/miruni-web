(function (root) {
  const S =
    typeof module !== "undefined" && module.exports
      ? require("./scheduler.js")
      : root.MiruniScheduler;
  function roomState(task, today, shortage = 0) {
    if (!task) return { books: 2, cups: 1, level: 0 };
    if (!task.remaining) return { books: 0, cups: 0, level: 0 };
    const days = S.daysBetween(today, task.deadline),
      remaining = Math.min(1, task.remaining / Math.max(1, task.total));
    const urgency =
      days <= 0
        ? 9
        : days === 1
          ? 7
          : days <= 2
            ? 5
            : days <= 4
              ? 3
              : days <= 7
                ? 2
                : 1;
    const level = Math.max(
      1,
      Math.min(
        10,
        Math.ceil(urgency * remaining) + Math.min(2, Math.ceil(shortage / 120)),
      ),
    );
    return {
      books: Math.min(12, level + 1),
      cups: Math.min(9, Math.max(1, level)),
      level,
    };
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { roomState };
  root.MiruniRoomState = { roomState };
})(typeof window !== "undefined" ? window : globalThis);
