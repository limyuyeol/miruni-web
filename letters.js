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
  function letter(task, plan, today, logged = 0, previousPasses = 0) {
    if (!task)
      return {
        mood: "calm",
        label: "시작을 기다리는 중",
        symbol: "✦",
        note: "내일도 잘 부탁해 ✦",
        text: "안녕, 나는 미래의 너야.\n우리, 작은 일 하나부터 시작해 볼까?",
      };
    if (!task.remaining)
      return {
        mood: "done",
        label: "과거의 나, 최고다",
        symbol: "♡",
        note: "이제 마음 편하게 쉬자",
        text: "다 끝냈네. 이제 쉬면서도 과제 생각 안 해도 되겠다.\n미리 해준 거 진짜 고마워. 덕분에 마음 편하게 쉰다.",
      };
    const days = S.daysBetween(today, task.deadline),
      ratio = Math.max(0, Math.min(1, 1 - task.remaining / task.total));
    const percent = Math.floor(ratio * 100),
      lack = plan.shortages[task.id] || 0;
    const near = days <= 2,
      mostlyDone = ratio >= 0.75,
      heavy = task.remaining >= 60 && ratio < 0.6;
    let result;
    if (days < 0)
      result = {
        mood: mostlyDone ? "tight" : "tired",
        label: "마감이 지났어",
        symbol: "☂",
        note: "남은 일은 우리 둘 몫",
        text: mostlyDone
          ? `${percent}%나 했는데 마감을 넘겨서 아깝다.\n남은 ${duration(task.remaining)}은 언제 끝낼 수 있을지 다시 정해보자. 여기까지 한 게 있으니까 마무리는 하자.`
          : `마감은 지났는데 ${duration(task.remaining)}이 남았어.\n미뤄도 일은 그대로고 마음만 더 불편해지잖아. 지금 할 수 있는 만큼부터 다시 잡자.`,
      };
    else if (near && mostlyDone)
      result = {
        mood: "calm",
        label: "거의 다 해놔서 여유로움",
        symbol: "♡",
        note: "미리 해두니까 마음이 다르네",
        text: `마감이 ${days === 0 ? "오늘" : "가까워"}도 ${percent}%나 해둬서 훨씬 덜 막막해.\n남은 ${duration(task.remaining)}만 마무리하자. 미리 해놓으니까 이렇게 마음이 편하네.`,
      };
    else if (near && heavy)
      result = {
        mood: "tired",
        label: "미래의 나, 원망 접수 중",
        symbol: "…",
        note: "마지막 날에 다 하려고?",
        text: `마감 ${days === 0 ? "오늘" : "D-" + days}인데 아직 ${duration(task.remaining)} 남았어.\n${previousPasses > 0 ? `이 일 이미 ${previousPasses}번 패스했잖아. 또 마지막 날에 몰아서 하려고?` : "마지막 날에 몰아서 하느라 힘든 거 알면서, 또 나한테 다 넘기려고?"}\n급하게 끝내고 미리 할걸 후회하기 싫으니까, 지금 조금만 해줘.`,
      };
    else if (days >= 5)
      result = {
        mood: "calm",
        label: "아직은 느긋한 미래의 나",
        symbol: "✦",
        note: "지금 나눠 하면 덜 힘들어",
        text: `마감까지 ${days}일 남아서 아직 나눠 할 시간이 있어.\n오늘 조금 해두면 나중에 한꺼번에 안 해도 되잖아. 급할 때 시작하지 말고, 여유 있을 때 조금만 해두자.`,
      };
    else if (mostlyDone)
      result = {
        mood: "calm",
        label: "미리 해둔 나, 제법인데",
        symbol: "♡",
        note: "미래의 나도 숨 좀 쉽니다",
        text: `벌써 ${percent}%나 해뒀네. 이제 남은 ${duration(task.remaining)}만 하면 되겠다.\n해야 할 일이 계속 마음에 걸리는 게 싫었는데, 미리 해줘서 고마워.`,
      };
    else if (near)
      result = {
        mood: "tight",
        label: "마지막 한 걸음 기다리는 중",
        symbol: "✦",
        note: "제발 미루지 마",
        text: `마감이 ${days === 0 ? "오늘" : "가까워"}인데 ${duration(task.remaining)} 남았네.\n조금 남았다고 계속 미루면 이것도 신경 쓰이잖아. 이번에 마무리하고 편하게 쉬자.`,
      };
    else
      result = {
        mood: "tight",
        label: "아직은 좋게 말하는 중",
        symbol: "…",
        note: "우리 조금씩 해두자",
        text: `마감까지 ${days}일, 남은 일은 ${duration(task.remaining)}.\n아직 며칠 남았다고 넘기다 보면 금방 전날이야. 오늘 조금 해놓으면 내일 시작할 때도 덜 막막하잖아.`,
      };
    // A relaxed tone must never hide a mathematically impossible schedule.
    if (lack > 0 && days >= 0)
      result.text += `\n다만 지금 가능한 시간으로는 ${duration(lack)} 부족해. 작업량이나 일정은 조정해 줘.`;
    if (logged > 0)
      result.text += `\n오늘 해준 ${duration(logged)}은 잘 받았어. 그건 고마워.`;
    return result;
  }
  if (typeof module !== "undefined" && module.exports)
    module.exports = { letter };
  root.MiruniLetters = { letter };
})(typeof window !== "undefined" ? window : globalThis);
