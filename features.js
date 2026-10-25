(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    P = window.MiruniProductivity,
    S = window.MiruniScheduler;
  let api,
    week = null,
    selectedWeekDay = null,
    context = null,
    stepTask = null,
    stepSnapshot = null,
    recoveryTask = null,
    recoverySnapshot = null,
    recoveryContext = null,
    options = [];
  const h = (m) => Number((m / 60).toFixed(2)),
    fmt = (d) =>
      new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
        month: "numeric",
        day: "numeric",
      });
  const escape = (s) => api.escape(s),
    duration = (m) => api.duration(m);
  function sync(nextContext) {
    if (context !== nextContext) {
      context = nextContext;
      week = P.weekStart(api.today());
      selectedWeekDay = null;
    }
    const task = api.getTask(),
      plan = S.plan(api.getState(), api.today());
    $("split-task").disabled = !task;
    $("split-task").textContent = task?.steps?.length
      ? "단계 편집"
      : "＋ 과제 쪼개기";
    if (!task)
      $("steps-summary").innerHTML =
        '<p class="feature-empty">할 일을 등록하면 작은 단계로 나눌 수 있어.</p>';
    else if (!task.steps?.length)
      $("steps-summary").innerHTML =
        `<p class="feature-empty">${escape(task.title)}<br>“보고서 완성” 대신 “자료 3개 찾기”부터 시작해 봐.</p>`;
    else {
      const next = task.steps.find((s) => s.remaining > 0);
      $("steps-summary").innerHTML =
        `<p class="next-step">${next ? "다음 한 걸음: " + escape(next.title) : "모든 단계를 마쳤어! ✦"}</p><ol class="step-list">${task.steps.map((s, i) => `<li class="${s.remaining ? "" : "finished"}"><span class="step-number">${s.remaining ? i + 1 : s.total ? "✓" : "–"}</span><div><strong>${escape(s.title)}</strong><small>${s.total ? duration(s.total - s.remaining) + " 완료 · " + duration(s.remaining) + " 남음" : "작업 범위에서 제외"}</small></div></li>`).join("")}</ol><p class="small-copy muted">오늘 하기와 5분 타이머 기록이 단계에도 함께 반영돼.</p>`;
    }
    const lack = task ? plan.shortages[task.id] || 0 : 0;
    $("recovery-summary").innerHTML = !task
      ? '<p class="feature-empty">할 일을 등록하면 계획을 함께 살펴볼게.</p>'
      : !lack
        ? '<div class="status-box"><strong>지금 계획은 마감 안에 들어가.</strong><p>시간이 부족해지면 작업량·마감일·가능 시간의 변경안을 비교해 줄게.</p></div>'
        : `<div class="status-box danger"><strong>${duration(lack)} 부족해. 아직 방법은 있어.</strong><p>실제로 가능한 선택을 비교하고, 마음에 드는 계획을 적용해 봐.</p></div><button class="button primary full" id="open-recovery">복구 방법 비교하기 →</button>`;
    renderWeek();
  }
  function renderWeek() {
    const stats = P.weeklyStats(api.getState(), week),
      max = Math.max(30, ...stats.daily.map((d) => d.minutes));
    if (
      selectedWeekDay &&
      (selectedWeekDay < stats.start || selectedWeekDay > stats.end)
    )
      selectedWeekDay = null;
    $("week-label").textContent =
      `${stats.start.slice(0, 4)}년 ${fmt(stats.start)} – ${fmt(stats.end)}`;
    $("week-next").disabled = week >= P.weekStart(api.today());
    const diff = stats.minutes - stats.previousMinutes;
    const best = stats.daily
      .filter((d) => d.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes)[0];
    const summary = !stats.minutes
      ? "아직 이번 주 작업 기록이 없어. 5분짜리 시작 하나부터 남겨볼까?"
      : `${stats.activeDays}일 동안 ${duration(stats.minutes)}을 해냈어. ${best ? `${fmt(best.date)}에 가장 많이 작업했네. ` : ""}${stats.passes ? `패스 버튼을 ${stats.passes}번 눌렀어도, 해낸 시간은 사라지지 않아.` : "이번 주는 패스 기록 없이 차근차근 진행했어."}`;
    $("weekly-stats").innerHTML =
      `<div class="weekly-metrics"><div><span>실제 작업 시간</span><strong>${duration(stats.minutes)}</strong></div><div><span>작업한 날</span><strong>${stats.activeDays}<small> / 7일</small></strong></div><div><span>작업 기록</span><strong>${stats.sessions}<small>회</small></strong></div><div><span>패스 선택</span><strong>${stats.passes}<small>회</small></strong></div></div><p class="week-comparison">이전 주 ${duration(stats.previousMinutes)} · ${diff === 0 ? "작업 시간 변화 없음" : `${duration(Math.abs(diff))} ${diff > 0 ? "더 작업했어" : "적게 작업했어"}`}</p><div class="week-chart" aria-label="요일별 실제 작업 시간">${stats.daily.map((d, i) => `<button type="button" class="week-bar-column ${selectedWeekDay === d.date ? "selected" : ""}" data-week-day="${d.date}" aria-controls="weekly-day-detail" aria-pressed="${selectedWeekDay === d.date}" aria-label="${d.date}, ${duration(d.minutes)} 작업. 작업 내역 보기"><span class="week-bar-value">${d.minutes ? duration(d.minutes) : "—"}</span><span class="week-bar-track"><span style="height:${(d.minutes / max) * 100}%"></span></span><span>${["월", "화", "수", "목", "금", "토", "일"][i]}</span><small>${fmt(d.date)}</small></button>`).join("")}</div><div id="weekly-day-detail" class="weekly-day-detail" aria-live="polite"></div><div class="weekly-reflection"><span class="eyebrow">이번 주의 나에게</span><p>${escape(summary)}</p></div>${stats.tasks.length ? `<details class="weekly-breakdown"><summary>과제별 작업 시간</summary><ul>${stats.tasks.map((t) => `<li><span>${escape(t.title)}</span><strong>${duration(t.minutes)}</strong></li>`).join("")}</ul></details>` : ""}<p class="small-copy muted">월요일~일요일 기준 · 타이머만 실행한 시간은 제외 · 패스 횟수는 취소 여부와 관계없이 누른 횟수야.</p>`;
    renderDayDetail();
  }
  function renderDayDetail() {
    const panel = $("weekly-day-detail");
    if (!selectedWeekDay) {
      panel.innerHTML =
        '<p class="muted">위의 날짜별 막대를 누르면 그날 작업한 과제와 시간을 볼 수 있어.</p>';
      return;
    }
    const state = api.getState(),
      records = state.logs.filter(
        (l) => l.type === "progress" && l.date === selectedWeekDay,
      );
    const grouped = new Map();
    for (const log of records) {
      if (!grouped.has(log.taskId))
        grouped.set(log.taskId, {
          title:
            state.tasks.find((t) => t.id === log.taskId)?.title || "이전 과제",
          minutes: 0,
          records: [],
        });
      const group = grouped.get(log.taskId);
      group.minutes += log.minutes;
      group.records.push(log);
    }
    const dateLabel = new Date(
      selectedWeekDay + "T12:00:00",
    ).toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
      weekday: "long",
    });
    const total = records.reduce((n, l) => n + l.minutes, 0);
    panel.innerHTML = `<div class="weekly-day-heading"><h3>${dateLabel}</h3><span>총 ${duration(total)} · ${records.length}회 기록</span></div>${
      records.length
        ? `<ul class="daily-work-list">${Array.from(grouped.values())
            .sort((a, b) => b.minutes - a.minutes)
            .map(
              (g) =>
                `<li><div class="daily-work-summary"><strong>${escape(g.title)}</strong><span>${duration(g.minutes)}</span></div>${g.records.length > 1 ? `<details><summary>${g.records.length}회 나눠 작업했어 · 개별 기록 보기</summary><ol>${g.records.map((l, i) => `<li>기록 ${i + 1} · ${duration(l.minutes)}</li>`).join("")}</ol></details>` : "<small>작업 기록 1회</small>"}</li>`,
            )
            .join("")}</ul>`
        : '<p class="muted">이날은 저장된 작업 기록이 없어.</p>'
    }`;
  }
  function addStep(row = {}) {
    const div = document.createElement("div");
    div.className = "step-editor-row";
    div.dataset.id = row.id || api.uid();
    div.dataset.completed = String((row.total || 0) - (row.remaining || 0));
    div.innerHTML = `<div><input class="step-title" aria-label="단계 이름" maxlength="60" required placeholder="예: 자료 3개 찾기" value="${escape(row.title || "")}"><small>${duration(Number(div.dataset.completed))} 완료한 기록 유지</small></div><label><span>남은 분</span><input class="step-minutes" aria-label="단계의 남은 작업 시간 (분)" type="number" min="0" max="60000" step="5" required value="${row.remaining || 0}"></label><button type="button" class="remove-step" aria-label="단계 삭제" ${Number(div.dataset.completed) > 0 ? 'disabled title="작업 기록이 있는 단계는 유지돼"' : ""}>×</button>`;
    div.querySelector("button").addEventListener("click", () => {
      div.remove();
      updateStepTotal();
    });
    $("step-rows").append(div);
    updateStepTotal();
  }
  function updateStepTotal() {
    const total = Array.from(
      $("step-rows").querySelectorAll(".step-minutes"),
    ).reduce((n, i) => n + (Number(i.value) || 0), 0);
    $("steps-total").textContent =
      `남은 작업 합계: ${duration(total)} · 저장하면 과제의 남은 시간도 이 합계로 바뀌어.`;
  }
  function openSteps() {
    const task = api.getTask();
    if (!task) return;
    stepTask = task.id;
    stepSnapshot = JSON.stringify(task);
    $("steps-description").textContent =
      `${task.title} · 현재 ${duration(task.remaining)} 남음`;
    $("step-rows").replaceChildren();
    (task.steps?.length
      ? task.steps
      : [
          {
            title: "첫 번째 작은 시작",
            remaining: task.remaining,
            total: task.remaining,
          },
        ]
    ).forEach(addStep);
    $("steps-template").disabled =
      !!task.steps?.some((s) => s.total > s.remaining) || task.remaining < 5;
    $("steps-error").textContent = "";
    $("steps-dialog").showModal();
  }
  function comparison(option) {
    const id = recoveryTask,
      before = option.before.shortages[id] || 0,
      after = option.after.shortages[id] || 0;
    return `<div class="recovery-comparison"><span>지금 <strong>${duration(before)} 부족</strong></span><span aria-hidden="true">→</span><span>변경 후 <strong>${after ? duration(after) + " 부족" : "마감 내 가능"}</strong></span></div><p class="small-copy muted">전체 과제의 부족 시간: ${duration(option.before.totalShortage)} → ${duration(option.after.totalShortage)}</p>`;
  }
  function proposal(option, index) {
    const task = api.getState().tasks.find((t) => t.id === recoveryTask);
    const title =
      option.kind === "reduce"
        ? "작업 범위를 줄인다면"
        : option.kind === "deadline"
          ? "마감일을 조정할 수 있다면"
          : "그날 가능한 시간을 바꾼다면";
    const detail =
      option.kind === "reduce"
        ? `남은 작업 ${duration(task.remaining)} → ${duration(option.remaining)}. 완료로 처리하지 않고 작업 범위를 줄여. 단계가 있으면 뒤 단계부터 줄어들어.`
        : option.kind === "deadline"
          ? `마감일 ${task.deadline} → ${option.deadline}. 현재 가능 시간으로 다른 과제의 부족 시간을 늘리지 않는 가장 빠른 날짜야.`
          : `${option.date}의 총 가능 시간 ${duration(S.configuredCapacity(api.getState(), option.date))} → ${duration(option.minutes)}. 모든 과제가 함께 쓰는 시간이야.`;
    const worsens = api
      .getState()
      .tasks.some(
        (t) =>
          t.id !== recoveryTask &&
          (option.after.shortages[t.id] || 0) >
            (option.before.shortages[t.id] || 0),
      );
    const improves =
      (option.after.shortages[recoveryTask] || 0) <
      (option.before.shortages[recoveryTask] || 0);
    return `<article class="recovery-option"><h3>${title}</h3><p>${escape(detail)}</p>${comparison(option)}${worsens ? '<p class="form-error">다른 과제의 부족 시간이 늘어나는 안이야. 시간이나 날짜를 다시 조정해 줘.</p>' : !improves ? '<p class="muted small-copy">이 변경으로는 선택한 과제의 부족 시간이 줄어들지 않아.</p>' : ""}<button class="button primary small" data-apply-recovery="${index}" ${worsens || !improves ? "disabled" : ""}>이 계획 적용</button></article>`;
  }
  function openRecovery() {
    const task = api.getTask();
    if (!task) return;
    recoveryTask = task.id;
    recoverySnapshot = JSON.stringify(api.getState());
    recoveryContext = api.getContext();
    const result = P.recoveryOptions(api.getState(), api.today(), task.id);
    options = result.options;
    $("recovery-description").textContent =
      `${task.title} · 현재 ${duration(result.before.shortages[task.id] || 0)} 부족`;
    $("recovery-options").innerHTML =
      options.map(proposal).join("") ||
      '<p class="small-copy muted">현재 시간 설정으로는 작업을 유지하면서 복구할 안을 찾지 못했어. 1년 안의 마감과 가능한 시간을 다시 살펴봐.</p>';
    const f = $("availability-form");
    f.hidden = task.deadline < api.today();
    f.elements.date.min = api.today();
    f.elements.date.max = task.deadline;
    const date =
      task.skipped.includes(api.today()) && task.deadline > api.today()
        ? S.addDays(api.today(), 1)
        : api.today();
    f.elements.date.value = date;
    f.elements.hours.value = Math.min(
      24,
      Math.ceil(
        (S.configuredCapacity(api.getState(), date) +
          (result.before.shortages[task.id] || 0)) /
          30,
      ) / 2,
    );
    $("availability-preview").innerHTML = "";
    $("availability-error").textContent = "";
    $("recovery-dialog").showModal();
  }
  function init(callbacks) {
    api = callbacks;
    $("weekly-stats").addEventListener("click", (e) => {
      const button = e.target.closest("[data-week-day]");
      if (!button) return;
      selectedWeekDay = button.dataset.weekDay;
      $("weekly-stats")
        .querySelectorAll("[data-week-day]")
        .forEach((b) => {
          const selected = b.dataset.weekDay === selectedWeekDay;
          b.classList.toggle("selected", selected);
          b.setAttribute("aria-pressed", String(selected));
        });
      renderDayDetail();
    });
    $("split-task").addEventListener("click", openSteps);
    $("recovery-summary").addEventListener("click", (e) => {
      if (e.target.closest("#open-recovery")) openRecovery();
    });
    $("step-rows").addEventListener("input", updateStepTotal);
    $("steps-add").addEventListener("click", () => addStep());
    $("steps-template").addEventListener("click", () => {
      const task = api.getState().tasks.find((t) => t.id === stepTask);
      if (!task || task.steps?.some((s) => s.total > s.remaining)) return;
      $("step-rows").replaceChildren();
      if (task.remaining < 15)
        addStep({
          title: "작은 단계 하나",
          remaining: task.remaining,
          total: task.remaining,
        });
      else {
        const first = Math.max(5, Math.floor((task.remaining * 0.2) / 5) * 5),
          last = first;
        [
          ["자료 조사", first],
          ["초안 작성", task.remaining - first - last],
          ["검토·마무리", last],
        ].forEach(([title, remaining]) =>
          addStep({ title, remaining, total: remaining }),
        );
      }
    });
    $("steps-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const task = api.getState().tasks.find((t) => t.id === stepTask);
      if (!task || JSON.stringify(task) !== stepSnapshot) {
        $("steps-error").textContent =
          "작업이 바뀌었어. 창을 닫고 다시 열어 줘.";
        return;
      }
      const rows = Array.from($("step-rows").children),
        steps = rows.map((r) => {
          const remaining = Number(r.querySelector(".step-minutes").value);
          return {
            id: r.dataset.id,
            title: r.querySelector(".step-title").value.trim(),
            remaining,
            total: Number(r.dataset.completed) + remaining,
          };
        });
      const sum = steps.reduce((n, s) => n + s.remaining, 0),
        completed = task.total - task.remaining;
      if (
        !steps.length ||
        steps.some(
          (s) =>
            !s.title ||
            !Number.isInteger(s.remaining) ||
            s.remaining < 0 ||
            s.remaining % 5,
        ) ||
        sum > 60000 ||
        (!sum && !completed)
      ) {
        $("steps-error").textContent =
          "단계 이름과 5분 단위 시간을 확인해 줘. 작업 기록이 없으면 최소 5분은 남겨줘.";
        return;
      }
      task.steps = steps;
      task.remaining = sum;
      task.total = completed + sum;
      api.log(
        "steps",
        task,
        0,
        `과제를 ${steps.length}단계로 나눴다. 남은 작업 ${duration(sum)}.`,
      );
      api.save();
      $("steps-dialog").close();
      api.refresh();
      api.notify("큰 과제를 작은 시작으로 나눴어.");
    });
    $("availability-form").addEventListener("submit", (e) => {
      e.preventDefault();
      if (
        JSON.stringify(api.getState()) !== recoverySnapshot ||
        api.getContext() !== recoveryContext
      ) {
        $("availability-error").textContent =
          "일정이 바뀌었어. 복구 창을 다시 열어 줘.";
        return;
      }
      const f = e.currentTarget,
        option = P.availabilityOption(
          api.getState(),
          api.today(),
          recoveryTask,
          f.elements.date.value,
          Number(f.elements.hours.value) * 60,
        );
      if (!option) {
        $("availability-error").textContent =
          "오늘부터 마감일까지의 날짜와 0~24시간을 확인해 줘.";
        return;
      }
      options = options.filter((o) => o.kind !== "availability");
      options.push(option);
      $("availability-preview").innerHTML = proposal(
        option,
        options.length - 1,
      );
      $("availability-error").textContent = "";
    });
    $("recovery-dialog").addEventListener("click", (e) => {
      const b = e.target.closest("[data-apply-recovery]");
      if (!b || b.disabled) return;
      if (
        JSON.stringify(api.getState()) !== recoverySnapshot ||
        api.getContext() !== recoveryContext
      ) {
        api.notify("일정이 바뀌어서 복구안을 다시 계산할게.");
        openRecovery();
        return;
      }
      const option = options[Number(b.dataset.applyRecovery)];
      if (!option) return;
      Object.assign(api.getState(), option.state);
      const task = api.getState().tasks.find((t) => t.id === recoveryTask);
      const text =
        option.kind === "reduce"
          ? `작업 범위를 ${duration(option.remaining)}로 조정했다.`
          : option.kind === "deadline"
            ? `마감일을 ${option.deadline}로 조정했다.`
            : `${option.date}의 가능 시간을 ${duration(option.minutes)}로 조정했다.`;
      api.log("recovery", task, 0, text);
      api.save();
      $("recovery-dialog").close();
      api.refresh();
      api.notify("새 계획을 적용했어. 미래 일정과 캘린더도 바뀌었어.");
    });
    $("week-prev").addEventListener("click", () => {
      week = S.addDays(week, -7);
      renderWeek();
    });
    $("week-next").addEventListener("click", () => {
      if (week < P.weekStart(api.today())) {
        week = S.addDays(week, 7);
        renderWeek();
      }
    });
    $("week-today").addEventListener("click", () => {
      week = P.weekStart(api.today());
      renderWeek();
    });
  }
  window.MiruniFeatures = { init, sync };
})();
