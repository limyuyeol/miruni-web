(function (root) {
  "use strict";
  const S =
    typeof module !== "undefined" && module.exports
      ? require("./scheduler.js")
      : root.MiruniScheduler;
  const duration = (m) =>
    [
      Math.floor(m / 60) ? `${Math.floor(m / 60)}시간` : "",
      m % 60 ? `${m % 60}분` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0분";
  function compareSkip(state, today, id) {
    const task = state.tasks.find((t) => t.id === id);
    if (!task) return null;
    const previousPasses = state.logs.filter(
      (l) => l.type === "skip" && l.taskId === id && l.date <= today,
    ).length;
    const before = S.plan(state, today),
      after = S.plan(state, today, id),
      afterMap = new Map(after.days.map((d) => [d.date, d]));
    const days = before.days.map((b) => {
      const a = afterMap.get(b.date),
        beforeTask = b.allocations.find((x) => x.id === id)?.minutes || 0,
        afterTask = a.allocations.find((x) => x.id === id)?.minutes || 0;
      return {
        date: b.date,
        beforeTask,
        afterTask,
        beforeTotal: b.available - b.free,
        afterTotal: a.available - a.free,
        beforeFree: b.free,
        afterFree: a.free,
        taskIncrease: afterTask - beforeTask,
        freeLoss: b.free - a.free,
      };
    });
    const letters = days
      .filter((d) => d.date > today && (d.taskIncrease > 0 || d.freeLoss > 0))
      .map((d) => {
        const taskLine =
          d.taskIncrease > 0
            ? `오늘 미루면 「${task.title}」 ${duration(d.taskIncrease)}을 더 맡게 돼.`
            : "오늘의 선택 때문에 다른 작업이 재배치되어 내 일정이 더 바빠졌어.";
        const freeLine =
          d.freeLoss > 0
            ? `남는 작업 가능 시간은 ${duration(d.beforeFree)}에서 ${duration(d.afterFree)}으로 줄어들어.`
            : `다른 작업도 재배치돼서, 그날 전체 작업량은 ${duration(d.beforeTotal)}에서 ${duration(d.afterTotal)}으로 바뀌어.`;
        const joke =
          previousPasses > 0
            ? `이 일 이미 ${previousPasses}번 패스했는데, 또 미루려고? 마지막 날에 급하게 하면서 미리 할걸 후회하는 건 결국 나잖아. 오늘 조금이라도 해줘.`
            : d.freeLoss > 0 && d.afterFree === 0
              ? "마지막 날에 몰아서 하면 대충 끝내고 제출하기 바쁘잖아. 고칠 시간도 없이 내는 거 싫으면, 오늘 조금이라도 해줘."
              : d.freeLoss > 0
                ? "오늘 하기 싫은 일이 그날이라고 갑자기 하고 싶어지겠어? 나도 피곤할 수 있잖아. 할 수 있을 때 조금만 해두자."
                : "일이 없어진 게 아니라 내가 할 차례가 된 거야. 다른 할 일도 있는데, 나한테 한꺼번에 넘기진 말아줘.";
        return { date: d.date, text: `${taskLine}\n${freeLine}\n“${joke}”` };
      });
    return {
      before,
      after,
      days,
      letters,
      todayRemoved: Math.max(
        0,
        (days[0]?.beforeTask || 0) - (days[0]?.afterTask || 0),
      ),
      beforeShortage: before.shortages[id] || 0,
      afterShortage: after.shortages[id] || 0,
    };
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { compareSkip };
  root.MiruniImpact = { compareSkip };
})(typeof window !== "undefined" ? window : globalThis);
