(async () => {
  "use strict";
  const S = window.MiruniScheduler,
    $ = (id) => document.getElementById(id);
  const escape = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const hours = (m) => Number((m / 60).toFixed(2)).toLocaleString("ko-KR");
  const duration = (m) =>
    [
      Math.floor(m / 60) ? `${Math.floor(m / 60)}시간` : "",
      m % 60 ? `${m % 60}분` : "",
    ]
      .filter(Boolean)
      .join(" ") || "0분";
  const uid = () =>
    globalThis.crypto?.randomUUID?.() ||
    `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const fresh = () => ({
    version: 1,
    daily: 120,
    weekdays: {},
    overrides: {},
    tasks: [],
    logs: [],
    events: [],
    selected: null,
  });
  let demo = false,
    demoDate = "2026-10-28",
    demoState = null,
    view = "today",
    editing = null,
    pendingSkip = null,
    pendingSkipDate = null,
    toastTimer,
    storageFailed = false;
  let editingEvent = null;
  let calendarMonth = null,
    calendarDate = null,
    calendarContext = null;
  const realToday = () => S.dateKey(new Date()),
    today = () => (demo ? demoDate : realToday());
  function validDate(v) {
    return (
      typeof v === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(v) &&
      S.dateKey(new Date(v + "T12:00:00")) === v
    );
  }
  function validMinutes(n, max = 60000) {
    return Number.isFinite(n) && n >= 0 && n <= max && n % 30 === 0;
  }
  function validWorkMinutes(n, max = 60000) {
    return Number.isInteger(n) && n >= 0 && n <= max && n % 5 === 0;
  }
  const cloud = window.MiruniCloud;
  const presentation = !cloud?.enabled && window.MiruniPresentation;
  const storageKey = presentation ? presentation.key : "miruni-v1";
  const recordStorage = () => (presentation ? sessionStorage : localStorage);
  const cloudInitial = cloud?.enabled ? await cloud.open() : null;
  function load(imported) {
    try {
      const raw =
        imported !== undefined
          ? JSON.stringify(imported)
          : cloud?.enabled
            ? JSON.stringify(cloudInitial.state)
            : recordStorage().getItem(storageKey) ||
              (presentation ? JSON.stringify(presentation.state) : null);
      if (!raw || raw === "null") return fresh();
      const v = JSON.parse(raw);
      // Existing v1 records did not have recurring weekday settings.
      if (v.weekdays === undefined) v.weekdays = {};
      if (v.events === undefined) v.events = [];
      if (
        !Array.isArray(v.events) ||
        !v.events.every(
          (e) =>
            typeof e.id === "string" &&
            typeof e.title === "string" &&
            validDate(e.date) &&
            typeof e.notes === "string" &&
            (e.time === "" || /^([01]\d|2[0-3]):[0-5]\d$/.test(e.time)),
        )
      )
        throw Error();
      if (
        !v.weekdays ||
        Array.isArray(v.weekdays) ||
        typeof v.weekdays !== "object" ||
        !Object.entries(v.weekdays).every(
          ([d, m]) => /^[0-6]$/.test(d) && validMinutes(m, 1440),
        )
      )
        throw Error();
      if (
        v.version !== 1 ||
        !validMinutes(v.daily, 1440) ||
        !v.overrides ||
        !Array.isArray(v.tasks) ||
        !Array.isArray(v.logs)
      )
        throw Error();
      if (
        !Object.entries(v.overrides).every(
          ([d, m]) => validDate(d) && validMinutes(m, 1440),
        )
      )
        throw Error();
      if (
        !v.tasks.every(
          (t) =>
            typeof t.id === "string" &&
            typeof t.title === "string" &&
            validDate(t.deadline) &&
            validWorkMinutes(t.remaining) &&
            validWorkMinutes(t.total, 1e9) &&
            t.total >= t.remaining &&
            Array.isArray(t.skipped) &&
            t.skipped.every(validDate),
        )
      )
        throw Error();
      if (
        !v.logs.every(
          (l) =>
            validDate(l.date) &&
            typeof l.taskId === "string" &&
            [
              "progress",
              "skip",
              "create",
              "edit",
              "undo",
              "steps",
              "recovery",
            ].includes(l.type) &&
            (l.type !== "progress" || validWorkMinutes(l.minutes, 1440)),
        )
      )
        throw Error();
      for (const task of v.tasks) {
        if (task.steps === undefined) task.steps = [];
        if (
          !Array.isArray(task.steps) ||
          !task.steps.every(
            (s) =>
              typeof s.id === "string" &&
              typeof s.title === "string" &&
              validWorkMinutes(s.remaining) &&
              validWorkMinutes(s.total, 1e9) &&
              s.total >= s.remaining,
          ) ||
          (task.steps.length &&
            task.steps.reduce((n, s) => n + s.remaining, 0) !== task.remaining)
        )
          throw Error();
      }
      return v;
    } catch (error) {
      if (imported !== undefined) throw error;
      storageFailed = true;
      return fresh();
    }
  }
  let realState = load();
  const state = () => (demo ? demoState : realState);
  function save() {
    if (!demo) {
      if (cloud?.enabled) {
        if (!storageFailed) cloud.save(realState);
        return;
      }
      try {
        if (storageFailed) return;
        recordStorage().setItem(storageKey, JSON.stringify(realState));
      } catch {
        storageFailed = true;
        toast(
          "브라우저 저장이 불가능해. 현재 기록은 창을 닫으면 사라질 수 있어.",
        );
      }
    }
  }
  function toast(message) {
    $("toast").textContent = message;
    $("toast").hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
  }
  const formatted = (d) =>
    new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    });
  const shortDate = (d) =>
    new Date(d + "T12:00:00").toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    });
  const selected = () =>
    state().tasks.find((t) => t.id === state().selected) || state().tasks[0];
  function message(task, plan) {
    const logged = task
      ? state()
          .logs.filter(
            (l) =>
              l.taskId === task.id &&
              l.type === "progress" &&
              l.date === today(),
          )
          .reduce((n, l) => n + l.minutes, 0)
      : 0;
    const previousPasses = task
      ? state().logs.filter(
          (l) => l.type === "skip" && l.taskId === task.id && l.date <= today(),
        ).length
      : 0;
    return window.MiruniLetters.letter(
      task,
      plan,
      today(),
      logged,
      previousPasses,
    );
  }
  function render() {
    const st = state();
    if (!st.tasks.some((t) => t.id === st.selected))
      st.selected = st.tasks[0]?.id || null;
    const task = selected(),
      plan = S.plan(st, today()),
      msg = message(task, plan);
    $("today-label").textContent =
      formatted(today()) + (demo ? " · 데모 날짜" : "");
    $("demo-button").textContent = demo
      ? "실제 기록으로 돌아가기"
      : "▷ 데모 체험";
    $("demo-badge").hidden = !demo;
    $("demo-controls").hidden = !demo;
    $("next-day").disabled = demo && S.daysBetween("2026-10-28", demoDate) >= 7;
    $("room").dataset.mood = msg.mood;
    $("mood-label").textContent = msg.label;
    $("mood-symbol").textContent = msg.symbol;
    $("floating-note").textContent = msg.note;
    $("room-caption").textContent = msg.label;
    window.MiruniReactions.sync({
      task,
      mood: msg.mood,
      shortage: plan.shortages[task?.id] || 0,
      today: today(),
      context: `${demo}:${today()}`,
    });
    $("future-message").textContent = msg.text;
    $("letter-from").textContent = task
      ? `FROM. ${shortDate(task.deadline)}의 나`
      : "FROM. 내일의 나";
    $("task-count").textContent = st.tasks.filter(
      (t) => t.remaining > 0,
    ).length;
    $("diary-count").textContent = st.tasks.filter(
      (t) => !t.remaining || t.deadline < today(),
    ).length;
    renderWork(task, plan);
    renderSchedule(plan);
    renderTasks();
    renderDiary();
    window.MiruniFeatures.sync(`${demo}:${today()}`);
    renderCalendar(plan);
    document.querySelectorAll("[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === view);
      if (b.dataset.view === view) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    });
    $("dashboard-view").hidden = view === "diary" || view === "weekly";
    $("diary-view").hidden = view !== "diary";
    $("page-title").textContent =
      view === "diary"
        ? "미래의 내가 남긴 일기."
        : view === "weekly"
          ? "이번 주의 나에게 박수를."
          : view === "schedule"
            ? "내일의 시간을 들여다봐."
            : "오늘의 조금, 내일의 여유.";
    $("page-description").textContent =
      view === "diary"
        ? "미뤘던 날도, 해낸 날도. 모두 너의 이야기야."
        : view === "weekly"
          ? "해낸 시간과 미뤘던 순간을 함께 돌아봐."
          : "미래의 내가 보내온 메시지를 확인해 봐.";
    document.querySelector(".local-note").textContent = demo
      ? "◌ 데모 기록 · 실제 기록과 분리"
      : storageFailed
        ? "저장 불가 · 현재 창에서만 유지"
        : cloud?.enabled
          ? "● 로그인 계정에 저장 · 상단에서 상태 확인"
          : presentation
            ? "● 공개 시연 · 현재 탭에만 저장"
            : "● 이 브라우저에 자동 저장";
  }
  function renderWork(task, plan) {
    if (!task) {
      $("task-content").innerHTML =
        '<div class="empty-state"><span class="empty-icon">✳</span><h3>아직 미래는 비어 있어.</h3><p>할 일을 등록하면 오늘 해야 할 양과<br>미뤘을 때 달라지는 미래를 알려줄게.</p><button class="button primary" data-action="add">첫 번째 할 일 등록 →</button><p style="margin:12px 0 0">궁금하다면 위의 데모 체험부터!</p></div>';
      return;
    }
    const left = S.daysBetween(today(), task.deadline),
      lack = plan.shortages[task.id] || 0,
      percent = Math.round(((task.total - task.remaining) / task.total) * 100),
      todayWork =
        plan.days[0]?.allocations.find((a) => a.id === task.id)?.minutes || 0;
    const passed = task.skipped.includes(today()),
      done = task.remaining === 0,
      free = S.capacity(state(), today());
    let title = done
      ? "다 끝냈어. 오늘의 나, 고마워!"
      : lack
        ? `${hours(lack)}시간 부족해. 계획 조정이 필요해.`
        : todayWork
          ? `오늘 ${hours(todayWork)}시간이면, 계획대로 갈 수 있어.`
          : "오늘은 다른 일정에 시간을 쓸 수 있어.";
    let detail = done
      ? "미래의 방이 밝아졌어. 일기에도 남겨뒀어."
      : lack
        ? "작업량이나 마감일을 조정해 줘. 가능한 시간을 넘겨 배정하지 않을게."
        : passed
          ? "오늘은 패스한 상태야. 마음이 바뀌면 조금 해도 괜찮아."
          : "아래 일정은 다른 할 일까지 포함해서 계산했어.";
    $("task-content").innerHTML =
      `<div class="task-title-line"><h3>${escape(task.title)}</h3><span class="deadline">${done ? "완료" : left < 0 ? "마감 지남" : left === 0 ? "D-DAY" : `D-${left}`}</span></div><p class="task-subtitle">${escape(formatted(task.deadline))} 마감 · 하루 기본 ${hours(state().daily)}시간</p><div class="metric-row"><div class="metric"><div class="metric-label">남은 작업 시간</div><div class="metric-value">${hours(task.remaining)}<small>시간</small></div></div><div class="metric"><div class="metric-label">오늘 예정된 작업</div><div class="metric-value">${hours(todayWork)}<small>시간</small></div></div></div><div class="progress-track" role="progressbar" aria-label="작업 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div><div class="progress-caption"><span>${hours(task.total - task.remaining)}시간 완료 / 총 ${hours(task.total)}시간</span><span>${percent}% 해냈어</span></div><div class="status-box ${lack ? "danger" : ""}"><strong>${title}</strong><p>${detail}</p></div><div class="work-actions"><button class="button primary" data-action="progress" ${done || workLimit(task, today()) < 5 ? "disabled" : ""}>✓ 오늘 하기</button><button class="button subtle" data-action="skip" ${done || passed || task.deadline < today() ? "disabled" : ""}>${passed ? "오늘은 패스했어" : "내일로 미루면? →"}</button></div><div class="edit-row"><button class="text-button" data-action="edit">작업량·마감일 조정</button>${passed ? '<button class="text-button" data-action="undo">패스 취소하기</button>' : ""}${free < 5 && !done ? '<button class="text-button" data-action="settings">오늘 가능 시간 조정</button>' : ""}</div>`;
  }
  function renderSchedule(plan) {
    $("schedule").innerHTML = plan.days
      .map((d, i) => {
        const used = d.available - d.free;
        return `<article class="day-card ${i === 0 ? "current" : ""}"><div class="day-top"><span>${shortDate(d.date)}</span>${i === 0 ? "<strong>TODAY</strong>" : ""}</div><div class="day-hours">${hours(used)} <small>/ ${hours(d.available)}시간</small></div><div class="day-bar"><span style="width:${d.available ? (used / d.available) * 100 : 0}%"></span></div>${d.allocations.length ? d.allocations.map((a) => `<div class="day-allocation ${a.id === state().selected ? "selected" : ""}" title="${escape(state().tasks.find((t) => t.id === a.id).title)}">${escape(state().tasks.find((t) => t.id === a.id).title)} · ${hours(a.minutes)}h</div>`).join("") : `<div class="day-allocation">${d.available ? "여유를 남겨뒀어 ✦" : "작업 가능한 시간이 없어"}</div>`}</article>`;
      })
      .join("");
    $("schedule-foot").textContent = plan.totalShortage
      ? `⚠ 전체 작업 중 ${hours(plan.totalShortage)}시간은 마감 안에 배정할 수 없어. 작업량이나 일정을 조정해 줘.`
      : "✦ 실제로 가능한 시간 안에서만 배정했어. 오늘 이미 작업한 시간은 제외돼.";
    $("schedule-foot").classList.toggle("danger-text", plan.totalShortage > 0);
  }
  function renderCalendar(plan) {
    const context = `${demo}:${today()}`;
    if (context !== calendarContext) {
      calendarContext = context;
      calendarDate = today();
      calendarMonth = today().slice(0, 7) + "-01";
    }
    const st = state(),
      start = new Date(calendarMonth + "T12:00:00");
    const count = new Date(
      start.getFullYear(),
      start.getMonth() + 1,
      0,
    ).getDate();
    const byDate = new Map(plan.days.map((d) => [d.date, d]));
    $("calendar-month").textContent =
      `${start.getFullYear()}년 ${start.getMonth() + 1}월`;
    let cells = '<div class="calendar-blank" aria-hidden="true"></div>'.repeat(
      start.getDay(),
    );
    for (let i = 0; i < count; i++) {
      const date = S.addDays(calendarMonth, i),
        day = byDate.get(date);
      const planned = day?.allocations.reduce((n, a) => n + a.minutes, 0) || 0;
      const actual = S.usedOn(st, date),
        deadlines = st.tasks.filter((t) => t.deadline === date);
      const events = st.events.filter((e) => e.date === date);
      const label = `${formatted(date)}${date === today() ? ", 오늘" : ""}, 예정 ${hours(planned)}시간, 완료 ${hours(actual)}시간, 마감 ${deadlines.length}개, 이벤트 ${events.length}개`;
      cells += `<button class="calendar-day ${date === today() ? "is-today" : ""} ${date === calendarDate ? "is-selected" : ""} ${date < today() ? "is-past" : ""}" data-calendar-date="${date}" aria-label="${escape(label)}" aria-pressed="${date === calendarDate}" ${date === today() ? 'aria-current="date"' : ""}><span class="calendar-number">${i + 1}${date === today() ? "<small>오늘</small>" : ""}</span>${planned ? `<span class="calendar-event planned">예정 ${hours(planned)}h</span>` : ""}${actual ? `<span class="calendar-event actual">완료 ${hours(actual)}h</span>` : ""}${deadlines.length ? `<span class="calendar-event due" title="${escape(deadlines.map((t) => t.title).join(", "))}">마감 ${deadlines.length}개</span>` : ""}${events.length ? `<span class="calendar-event personal">이벤트 ${events.length}개</span>` : ""}</button>`;
    }
    const tail = (7 - ((start.getDay() + count) % 7)) % 7;
    cells += '<div class="calendar-blank" aria-hidden="true"></div>'.repeat(
      tail,
    );
    $("calendar-grid").innerHTML = cells;
    const day = byDate.get(calendarDate),
      past = calendarDate < today();
    const allocations = day?.allocations || [],
      logs = st.logs.filter(
        (l) =>
          l.date === calendarDate &&
          ["progress", "skip", "undo"].includes(l.type),
      );
    const deadlines = st.tasks.filter((t) => t.deadline === calendarDate);
    const free = day?.free ?? S.capacity(st, calendarDate);
    const row = (tag, title, detail, className = "") =>
      `<li><span class="calendar-detail-tag ${className}">${tag}</span><div><strong>${escape(title)}</strong><small>${escape(detail)}</small></div></li>`;
    const rows = allocations.map((a) =>
      row(
        "예정",
        st.tasks.find((t) => t.id === a.id).title,
        `${hours(a.minutes)}시간 작업`,
      ),
    );
    for (const t of deadlines)
      rows.push(
        row(
          "마감",
          t.title,
          t.remaining === 0
            ? "작업 완료"
            : `${hours(t.remaining)}시간 남음${plan.shortages[t.id] ? ` · 현재 계획에서 ${hours(plan.shortages[t.id])}시간 부족` : ""}`,
          "due",
        ),
      );
    for (const l of logs)
      rows.push(
        row(
          l.type === "progress" ? "완료" : l.type === "skip" ? "패스" : "취소",
          st.tasks.find((t) => t.id === l.taskId)?.title || "작업 기록",
          l.type === "progress"
            ? `${hours(l.minutes)}시간 실제 작업`
            : l.type === "skip"
              ? "오늘의 작업을 미뤘어."
              : "패스를 취소했어.",
          l.type === "progress" ? "actual" : "",
        ),
      );
    for (const event of st.events
      .filter((e) => e.date === calendarDate)
      .sort((a, b) => a.time.localeCompare(b.time))) {
      rows.push(
        `<li><span class="calendar-detail-tag personal">이벤트</span><div><strong>${escape(event.title)}</strong><small class="event-notes">${escape([event.time || "종일", event.notes].filter(Boolean).join(" · "))}</small></div><button class="text-button event-edit" data-edit-event="${escape(event.id)}">수정</button></li>`,
      );
    }
    $("calendar-detail").innerHTML =
      `<div class="calendar-detail-heading"><h3>${formatted(calendarDate)}</h3><span>${past ? `실제 작업 ${hours(S.usedOn(st, calendarDate))}시간` : `가능 ${hours(S.configuredCapacity(st, calendarDate))}시간 · 남는 시간 ${hours(free)}시간`}</span></div><div class="calendar-entry-actions">${calendarDate <= today() ? '<button class="button small subtle" data-calendar-record>＋ 이날 작업 기록</button>' : ""}<button class="button small subtle" data-calendar-event>＋ 이날 이벤트</button></div>${rows.length ? `<ul>${rows.join("")}</ul>` : `<p class="muted">아직 이 날짜에 등록된 기록이나 일정이 없어.</p>`}${past ? '<p class="calendar-key">지난 날짜는 실제 기록과 마감일·이벤트를 보여줘. 당시의 예정 시간은 따로 저장하지 않아.</p>' : ""}`;
  }
  function moveCalendarMonth(offset) {
    const date = new Date(calendarMonth + "T12:00:00");
    date.setMonth(date.getMonth() + offset);
    calendarMonth = S.dateKey(date);
    calendarDate = calendarMonth;
    renderCalendar(S.plan(state(), today()));
  }
  $("calendar-prev").addEventListener("click", () => moveCalendarMonth(-1));
  $("calendar-next").addEventListener("click", () => moveCalendarMonth(1));
  $("calendar-today").addEventListener("click", () => {
    calendarContext = null;
    renderCalendar(S.plan(state(), today()));
  });
  $("calendar-grid").addEventListener("click", (e) => {
    const date = e.target.closest("[data-calendar-date]")?.dataset.calendarDate;
    if (!date) return;
    calendarDate = date;
    renderCalendar(S.plan(state(), today()));
    $("calendar-grid")
      .querySelector(`[data-calendar-date="${date}"]`)
      .focus({ preventScroll: true });
  });
  $("calendar-detail").addEventListener("click", (e) => {
    if (e.target.closest("[data-calendar-record]")) openProgress(calendarDate);
    if (e.target.closest("[data-calendar-event]")) openEvent(calendarDate);
    const edit = e.target.closest("[data-edit-event]");
    if (edit) openEvent(calendarDate, edit.dataset.editEvent);
  });
  $("calendar-add-event").addEventListener("click", () =>
    openEvent(calendarDate || today()),
  );
  function openEvent(date, id = null) {
    const event = state().events.find((e) => e.id === id);
    editingEvent = event?.id || null;
    const f = $("event-form");
    f.reset();
    f.elements.title.value = event?.title || "";
    f.elements.date.value = event?.date || date;
    f.elements.time.value = event?.time || "";
    f.elements.notes.value = event?.notes || "";
    $("event-dialog-title").textContent = event
      ? "이벤트 수정하기"
      : "캘린더에 이벤트 남기기";
    $("event-delete").hidden = !event;
    $("event-error").textContent = "";
    $("event-dialog").showModal();
  }
  $("event-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      title = f.elements.title.value.trim(),
      date = f.elements.date.value,
      time = f.elements.time.value,
      notes = f.elements.notes.value.trim();
    if (
      !title ||
      !validDate(date) ||
      (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    ) {
      $("event-error").textContent = "이벤트 이름과 날짜·시간을 확인해 줘.";
      return;
    }
    const existing = state().events.find((e) => e.id === editingEvent);
    const event = { id: existing?.id || uid(), title, date, time, notes };
    if (existing) Object.assign(existing, event);
    else state().events.push(event);
    calendarDate = date;
    calendarMonth = date.slice(0, 7) + "-01";
    save();
    $("event-dialog").close();
    render();
    toast("이벤트를 캘린더에 저장했어.");
  });
  $("event-delete").addEventListener("click", () => {
    const event = state().events.find((e) => e.id === editingEvent);
    if (!event || !confirm(`「${event.title}」 이벤트를 삭제할까?`)) return;
    state().events = state().events.filter((e) => e.id !== editingEvent);
    save();
    $("event-dialog").close();
    render();
    toast("이벤트를 삭제했어.");
  });
  function renderTasks() {
    $("task-list").innerHTML = state().tasks.length
      ? state()
          .tasks.slice()
          .sort((a, b) => a.deadline.localeCompare(b.deadline))
          .map(
            (t) =>
              `<button class="task-item ${t.id === state().selected ? "selected" : ""}" data-task="${escape(t.id)}" aria-pressed="${t.id === state().selected}"><span class="task-icon">${t.remaining ? "▤" : "✓"}</span><span><strong>${escape(t.title)}</strong><small>${shortDate(t.deadline)} 마감</small></span><span class="task-remain">${t.remaining ? hours(t.remaining) + "h 남음" : "해냈어!"}</span></button>`,
          )
          .join("")
      : '<div class="empty-state"><p style="margin:0">아직 등록한 할 일이 없어. 미래의 나에게 첫 부탁을 남겨줘.</p></div>';
  }
  function renderDiary() {
    $("diary-list").innerHTML = state().tasks.length
      ? state()
          .tasks.slice()
          .reverse()
          .map((t) => {
            const logs = state()
                .logs.filter((l) => l.taskId === t.id)
                .sort((a, b) => a.date.localeCompare(b.date)),
              closed = t.remaining === 0 || t.deadline < today();
            const summary = logs
              .filter((l) => ["progress", "skip"].includes(l.type))
              .map((l) =>
                l.type === "progress"
                  ? `${shortDate(l.date)}의 나는 ${hours(l.minutes)}시간을 해줬다. 조금 감동했다.`
                  : `${shortDate(l.date)}의 나는 패스를 눌렀다. 미래의 나에게 일이 도착했다.`,
              );
            const ending =
              t.remaining === 0
                ? "그리고 마침내 끝냈다. 과거의 나에게, 고마워."
                : t.deadline < today()
                  ? `${hours(t.total)}시간 중 ${hours(t.total - t.remaining)}시간을 완료했다. 남은 ${hours(t.remaining)}시간은 일정을 다시 잡아보자.`
                  : "이 이야기는 아직 쓰는 중. 오늘의 조금을 기다린다.";
            return `<article class="diary-entry"><span class="eyebrow">${closed ? "A LETTER FROM YOUR FUTURE" : "STILL WRITING…"} · ${shortDate(t.deadline)}</span><h3>${escape(t.title)}</h3><p>${escape(summary.length ? summary.join("\n") : "아직 작업 기록이 없다.")}\n${escape(ending)}</p><details><summary>그때의 미래 메시지와 활동 ${logs.length}개</summary><ul>${logs.map((l) => `<li>${shortDate(l.date)} · ${escape(l.message || "할 일을 등록했어.")}</li>`).join("")}</ul></details></article>`;
          })
          .join("")
      : '<div class="empty-state"><span class="empty-icon">✉</span><h3>아직 도착한 일기가 없어.</h3><p>할 일을 등록하고, 오늘의 선택을 남겨봐.</p></div>';
  }
  function log(type, task, minutes = 0, text = "", date = today()) {
    state().logs.push({
      id: uid(),
      type,
      taskId: task.id,
      date,
      minutes,
      message: text || message(task, S.plan(state(), today())).text,
    });
  }
  function openTask(edit = false) {
    const task = edit ? selected() : null;
    editing = task?.id || null;
    const f = $("task-form");
    f.reset();
    f.elements.title.value = task?.title || "";
    f.elements.deadline.removeAttribute("min");
    f.elements.deadline.max = S.addDays(today(), 365);
    f.elements.deadline.value = task ? task.deadline : S.addDays(today(), 2);
    f.elements.hours.min = task ? "0" : "0.5";
    f.elements.hours.step = task ? "any" : "0.5";
    f.elements.hours.value = task ? task.remaining / 60 : 6;
    f.elements.hours.readOnly = !!task?.steps?.length;
    $("task-hours-help").textContent = task
      ? `현재 ${duration(task.remaining)} 남았어. 시간 단위로 입력하되, 5분 단위로 조정할 수 있어.`
      : "30분 단위로 입력해 줘.";
    if (task?.steps?.length)
      $("task-hours-help").textContent =
        "단계가 있는 과제야. 남은 시간은 과제 쪼개기의 단계 편집에서 조정해 줘.";
    f.elements.daily.value = state().daily / 60;
    $("task-error").textContent = "";
    $("task-dialog-title").textContent = task
      ? "계획은 바꿔도 괜찮아."
      : "미래의 나에게 부탁하기";
    $("task-dialog").showModal();
  }
  $("task-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      title = f.elements.title.value.trim(),
      deadline = f.elements.deadline.value,
      minutes = Math.round(Number(f.elements.hours.value) * 60),
      daily = Number(f.elements.daily.value) * 60;
    if (
      !title ||
      !validDate(deadline) ||
      deadline > S.addDays(today(), 365) ||
      !(editing ? validWorkMinutes(minutes) : validMinutes(minutes)) ||
      (!editing && minutes < 30) ||
      !validMinutes(daily, 1440)
    ) {
      $("task-error").textContent =
        `이름과 ${editing ? "5분" : "30분"} 단위 시간을 확인해 줘. 과거 마감일도 가능하고, 미래 마감일은 오늘부터 1년 이내로 입력해 줘.`;
      return;
    }
    let t = state().tasks.find((t) => t.id === editing);
    if (t?.steps?.length && minutes !== t.remaining) {
      $("task-error").textContent = "단계 편집에서 남은 시간을 조정해 줘.";
      return;
    }
    if (t) {
      const completed = t.total - t.remaining;
      t.remaining = minutes;
      t.total = completed + minutes || 30;
      t.title = title;
      t.deadline = deadline;
      log("edit", t, 0, "작업량과 일정을 다시 조정했다.");
    } else {
      t = {
        id: uid(),
        title,
        deadline,
        remaining: minutes,
        total: minutes,
        skipped: [],
        steps: [],
      };
      state().tasks.push(t);
      log("create", t, 0, "미래의 나에게 할 일을 부탁했다.");
    }
    state().daily = daily;
    state().selected = t.id;
    save();
    view = "today";
    $("task-dialog").close();
    render();
    toast("미래의 나에게 전달했어.");
  });
  function workLimit(task, date) {
    if (!task || !validDate(date) || date > today()) return 0;
    return Math.min(task.remaining, S.recordingCapacity(state(), date));
  }
  function updateProgressLimit() {
    const f = $("progress-form");
    const t = state().tasks.find((t) => t.id === f.elements.taskId.value),
      date = f.elements.date.value;
    const limit = workLimit(t, date);
    f.elements.minutes.max = limit;
    if (!f.elements.minutes.value || Number(f.elements.minutes.value) > limit)
      f.elements.minutes.value = Math.max(5, Math.min(30, limit));
    $("progress-description").textContent = t
      ? `${t.title} · 선택한 날짜에 기록 가능한 시간은 ${duration(limit)}이야. 설정한 가능 시간을 넘겨도 실제로 한 만큼 기록할 수 있어. 시간 설정은 그대로 유지돼.`
      : "기록할 과제를 선택해 줘.";
    $("progress-error").textContent =
      limit < 5 ? "남은 작업량이나 하루 총 24시간 기록 한도를 확인해 줘." : "";
  }
  function openProgress(date = today()) {
    const tasks = state().tasks.filter((t) => t.remaining > 0);
    if (!tasks.length) {
      toast("먼저 남은 작업이 있는 할 일을 등록해 줘.");
      return;
    }
    const f = $("progress-form");
    f.elements.taskId.innerHTML = tasks
      .map((t) => `<option value="${escape(t.id)}">${escape(t.title)}</option>`)
      .join("");
    f.elements.taskId.value = tasks.some((t) => t.id === state().selected)
      ? state().selected
      : tasks[0].id;
    f.elements.date.max = today();
    f.elements.date.value = date;
    f.elements.minutes.value = 30;
    $("progress-error").textContent = "";
    updateProgressLimit();
    $("progress-dialog").showModal();
  }
  $("progress-form").elements.date.addEventListener(
    "change",
    updateProgressLimit,
  );
  $("past-work").addEventListener("click", () =>
    openProgress(S.addDays(today(), -1)),
  );
  $("progress-form").elements.taskId.addEventListener(
    "change",
    updateProgressLimit,
  );
  $("progress-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const t = state().tasks.find(
        (t) => t.id === e.currentTarget.elements.taskId.value,
      ),
      date = e.currentTarget.elements.date.value,
      minutes = Number(e.currentTarget.elements.minutes.value),
      limit = workLimit(t, date);
    if (!validWorkMinutes(minutes, limit) || minutes < 5) {
      $("progress-error").textContent =
        `5분부터 ${limit}분까지, 5분 단위로 기록할 수 있어.`;
      return;
    }
    if (!recordWork(t.id, minutes, date)) return;
    $("progress-dialog").close();
    render();
    toast(
      t.remaining
        ? `${formatted(date)}에 작업한 ${duration(minutes)}을 기록했어.`
        : "다 해냈어! 미래의 방이 밝아졌어. ✦",
    );
  });
  function recordWork(id, minutes, date = today()) {
    const t = state().tasks.find((t) => t.id === id);
    if (!t || !validWorkMinutes(minutes, workLimit(t, date)) || minutes < 5) {
      toast("남은 작업량과 하루 총 24시간 기록 한도를 확인해 줘.");
      return false;
    }
    window.MiruniProductivity.consumeSteps(t, minutes);
    t.remaining -= minutes;
    t.skipped = t.skipped.filter((d) => d !== date);
    log(
      "progress",
      t,
      minutes,
      `${formatted(date)}에 ${minutes}분 완료. 시작했네? 제일 무서운 건 끝났다.`,
      date,
    );
    save();
    return true;
  }
  function openSkip() {
    const t = selected();
    if (
      !t ||
      !t.remaining ||
      t.skipped.includes(today()) ||
      t.deadline < today()
    )
      return;
    pendingSkip = t.id;
    pendingSkipDate = today();
    const impact = window.MiruniImpact.compareSkip(state(), today(), t.id);
    const b = impact.beforeShortage,
      a = impact.afterShortage;
    const letterCard = (l) =>
      `<article class="impact-letter"><span class="letter-from">FROM. ${escape(formatted(l.date))}의 나</span><p>${escape(l.text)}</p></article>`;
    const increasedShortage = Math.max(0, a - b);
    const summary = impact.todayRemoved
      ? `오늘 하지 않는 「${t.title}」 ${duration(impact.todayRemoved)}. 그 부담이 어디로 가는지 확인해 봐.`
      : "선택한 과제는 오늘 배정된 작업이 없어. 오늘을 패스해도 이 과제의 배정은 그대로야.";
    const letters = impact.letters;
    $("skip-preview").innerHTML = `
      <p class="impact-intro">${escape(summary)}</p>
      <div class="comparison"><div><span>오늘 계획대로 하면</span><strong>${b ? duration(b) + " 부족" : "마감 내 가능"}</strong><p>마감 내 배정 ${duration(t.remaining - b)}</p></div><div><span>오늘 미루면</span><strong>${a ? duration(a) + " 부족" : "마감 내 가능"}</strong><p>마감 내 배정 ${duration(t.remaining - a)}</p></div></div>
      <h3>날짜별로 달라지는 미래</h3>
      <div class="impact-table-wrap"><table class="impact-table"><caption>선택 과제: ${escape(t.title)}</caption><thead><tr><th scope="col">날짜</th><th scope="col">오늘 하면</th><th scope="col">오늘 미루면</th></tr></thead><tbody>${impact.days.map((d) => `<tr class="${d.date === today() ? "impact-today" : ""} ${d.taskIncrease > 0 || d.freeLoss > 0 ? "impact-busier" : ""}"><th scope="row">${escape(shortDate(d.date))}${d.date === today() ? "<small>오늘</small>" : ""}</th><td><strong>이 과제 ${duration(d.beforeTask)}</strong><span>전체 작업 ${duration(d.beforeTotal)}</span><small>여유 ${duration(d.beforeFree)}</small></td><td><strong>이 과제 ${duration(d.afterTask)}</strong><span>전체 작업 ${duration(d.afterTotal)}</span><small>여유 ${duration(d.afterFree)}</small>${d.date > today() && d.taskIncrease > 0 ? `<em>이 과제 +${duration(d.taskIncrease)}</em>` : ""}${d.freeLoss > 0 ? `<em>여유 −${duration(d.freeLoss)}</em>` : ""}</td></tr>`).join("")}</tbody></table></div>
      <p class="muted small-copy">‘여유’는 입력한 작업 가능 시간 중 남는 시간이야. 다른 과제도 함께 계산하고, 이미 기록한 작업 시간은 제외했어.</p>
      ${a ? `<div class="status-box danger"><strong>${duration(a)}은 마감 안에 들어가지 않아.</strong><p>${increasedShortage ? `오늘 미루면서 배정할 수 없는 시간이 ${duration(increasedShortage)} 늘어났어.` : "기존 계획에서도 부족했던 시간이야."} 작업량이나 일정을 조정해 줘.</p></div>` : ""}
      ${impact.after.totalShortage > a ? `<p class="small-copy danger-text">다른 과제까지 합하면 ${duration(impact.after.totalShortage)} 부족해. (미루기 전 ${duration(impact.before.totalShortage)})</p>` : ""}
      <h3>부담을 받게 된 날에서 온 편지</h3>
      <div class="impact-letters">${letters.length ? letters.slice(0, 3).map(letterCard).join("") : '<p class="muted">추가 작업을 맡거나 여유가 줄어드는 미래 날짜는 없어.</p>'}${letters.length > 3 ? `<details><summary>다른 날짜의 편지 ${letters.length - 3}통 더 보기</summary>${letters.slice(3).map(letterCard).join("")}</details>` : ""}</div>
      ${increasedShortage ? `<article class="impact-letter undelivered"><span class="letter-from">FROM. ${escape(formatted(t.deadline))} · 배정하지 못한 일</span><p>오늘 미루면 마감 안에 못 넣는 시간이 ${duration(increasedShortage)} 더 늘어나.\n“마지막 날에 어떻게든 하겠다는 거야? 지금 정해둔 시간으로는 다 못 해. 그날 급해지기 전에 작업량이나 일정을 바꿔줘.”</p></article>` : ""}`;
    $("skip-dialog").showModal();
  }
  $("confirm-skip").addEventListener("click", () => {
    if (pendingSkipDate !== today()) {
      $("skip-dialog").close();
      pendingSkip = null;
      render();
      toast("날짜가 바뀌었어. 오늘의 일정으로 미리보기를 다시 열어 줘.");
      return;
    }
    const t = state().tasks.find((t) => t.id === pendingSkip);
    if (t && !t.skipped.includes(today()) && t.remaining > 0) {
      const impact = window.MiruniImpact.compareSkip(state(), today(), t.id);
      t.skipped.push(today());
      const futureLetters = impact.letters
        .map((l) => `${formatted(l.date)}의 나: ${l.text}`)
        .join("\n\n");
      log(
        "skip",
        t,
        0,
        message(t, S.plan(state(), today())).text +
          (futureLetters ? "\n\n" + futureLetters : ""),
      );
      save();
    }
    pendingSkip = null;
    $("skip-dialog").close();
    render();
    toast("오늘은 패스. 바뀐 미래 일정을 확인해 봐.");
  });
  function addOverride(
    date = today(),
    minutes = S.configuredCapacity(state(), date),
  ) {
    const row = document.createElement("div");
    row.className = "override-row";
    row.innerHTML = `<input type="date" aria-label="별도로 설정할 날짜" required value="${escape(date)}"><input type="number" aria-label="해당 날짜의 작업 가능 시간" min="0" max="24" step="0.5" required value="${minutes / 60}"><button type="button" aria-label="날짜별 설정 삭제">×</button>`;
    row.querySelector("button").addEventListener("click", () => row.remove());
    $("overrides").append(row);
  }
  function openSettings() {
    $("settings-form").elements.daily.value = state().daily / 60;
    $("weekdays").innerHTML = [
      [1, "월요일"],
      [2, "화요일"],
      [3, "수요일"],
      [4, "목요일"],
      [5, "금요일"],
      [6, "토요일"],
      [0, "일요일"],
    ]
      .map(
        ([day, label]) =>
          `<label>${label}<div class="weekday-input"><input type="number" data-weekday="${day}" aria-label="${label} 작업 가능 시간" min="0" max="24" step="0.5" placeholder="${state().daily / 60}" value="${state().weekdays?.[day] === undefined ? "" : state().weekdays[day] / 60}"><span>시간</span></div></label>`,
      )
      .join("");
    $("overrides").replaceChildren();
    Object.entries(state().overrides)
      .sort(([a], [b]) => a.localeCompare(b))
      .forEach(([d, m]) => addOverride(d, m));
    $("settings-error").textContent = "";
    $("settings-dialog").showModal();
  }
  $("add-override").addEventListener("click", () => {
    const values = Array.from(
      $("overrides").querySelectorAll("[type=date]"),
    ).map((x) => x.value);
    let d = today();
    while (values.includes(d)) d = S.addDays(d, 1);
    addOverride(d);
  });
  $("settings-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const daily = Number(e.currentTarget.elements.daily.value) * 60,
      overrides = {},
      weekdays = {};
    if (!validMinutes(daily, 1440)) return;
    for (const input of $("weekdays").querySelectorAll("input")) {
      if (input.value === "") continue;
      const minutes = Number(input.value) * 60;
      if (!validMinutes(minutes, 1440)) {
        $("settings-error").textContent =
          "요일별 시간은 0~24시간 사이, 30분 단위로 입력해 줘.";
        return;
      }
      weekdays[input.dataset.weekday] = minutes;
    }
    for (const row of $("overrides").children) {
      const [date, h] = row.querySelectorAll("input");
      const m = Number(h.value) * 60;
      if (
        !validDate(date.value) ||
        !validMinutes(m, 1440) ||
        Object.hasOwn(overrides, date.value)
      ) {
        $("settings-error").textContent =
          "날짜가 중복되지 않는지, 시간이 올바른지 확인해 줘.";
        return;
      }
      overrides[date.value] = m;
    }
    state().daily = daily;
    state().weekdays = weekdays;
    state().overrides = overrides;
    save();
    $("settings-dialog").close();
    render();
    toast("가능한 시간에 맞춰 일정을 다시 계산했어.");
  });
  $("settings-form").elements.daily.addEventListener("input", (e) => {
    $("weekdays")
      .querySelectorAll("input")
      .forEach((input) => {
        input.placeholder = e.target.value;
      });
  });
  $("task-content").addEventListener("click", (e) => {
    const action = e.target.closest("[data-action]")?.dataset.action;
    if (action === "add") openTask();
    if (action === "edit") openTask(true);
    if (action === "progress") openProgress();
    if (action === "skip") openSkip();
    if (action === "settings") openSettings();
    if (action === "undo") {
      const t = selected();
      t.skipped = t.skipped.filter((d) => d !== today());
      log("undo", t, 0, "오늘의 패스를 취소했다.");
      save();
      render();
      toast("오늘 일정으로 다시 돌아왔어.");
    }
  });
  $("task-list").addEventListener("click", (e) => {
    const id = e.target.closest("[data-task]")?.dataset.task;
    if (id) {
      state().selected = id;
      save();
      render();
    }
  });
  $("add-task").addEventListener("click", () => openTask());
  $("settings-button").addEventListener("click", openSettings);
  document
    .querySelectorAll("[data-close]")
    .forEach((b) =>
      b.addEventListener("click", () => b.closest("dialog").close()),
    );
  document.querySelectorAll("[data-view]").forEach((b) =>
    b.addEventListener("click", () => {
      view = b.dataset.view;
      render();
      if (view === "schedule")
        $("schedule-section").scrollIntoView({
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
          block: "start",
        });
    }),
  );
  function resetDemo() {
    demoDate = "2026-10-28";
    demoState = fresh();
    demoState.tasks = [
      {
        id: "demo-report",
        title: "캡스톤 최종 보고서",
        deadline: "2026-10-30",
        remaining: 360,
        total: 360,
        skipped: [],
      },
    ];
    demoState.selected = "demo-report";
    demoState.logs = [
      {
        id: uid(),
        type: "create",
        taskId: "demo-report",
        date: demoDate,
        minutes: 0,
        message:
          "금요일까지 보고서 6시간. 수·목·금 각각 2시간, 딱 맞는 시작이었다.",
      },
    ];
  }
  $("demo-button").addEventListener("click", () => {
    demo = !demo;
    if (demo && !demoState) resetDemo();
    view = "today";
    render();
    toast(
      demo
        ? "데모 시작! 실제 기록에는 영향을 주지 않아."
        : "실제 기록으로 돌아왔어.",
    );
  });
  $("demo-reset").addEventListener("click", () => {
    window.MiruniReactions.reset();
    resetDemo();
    render();
    toast("수요일 아침으로 돌아왔어.");
  });
  $("next-day").addEventListener("click", () => {
    if (!demo) return;
    demoDate = S.addDays(demoDate, 1);
    render();
  });
  window.addEventListener("focus", () => {
    if (!document.querySelector("dialog[open]")) render();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && !document.querySelector("dialog[open]")) render();
  });
  window.MiruniFeatures.init({
    getState: state,
    getTask: selected,
    today,
    getContext: () => `${demo}:${today()}`,
    save,
    log,
    refresh: render,
    notify: toast,
    uid,
    duration,
    escape,
  });
  window.MiruniReactions.init({
    getTask: selected,
    getContext: () => `${demo}:${today()}`,
    getLimit: (id) => {
      const t = state().tasks.find((t) => t.id === id);
      return t ? workLimit(t, today()) : 0;
    },
    record: recordWork,
    refresh: render,
    notify: toast,
  });
  window.MiruniBackup = {
    exportState: () => structuredClone(realState),
    importState: (value) => {
      if (demo) throw Error("데모를 종료한 뒤 가져와 줘.");
      const next = load(value);
      window.MiruniReactions.reset();
      realState = next;
      storageFailed = false;
      save();
      render();
      toast("기록을 가져왔어. 상단에서 저장 상태를 확인해 줘.");
    },
  };
  cloud?.ready();
  if (presentation) {
    $("account-button").textContent = "기록 백업";
    $("account-name").textContent = "공개 시연용 기록";
    $("cloud-status").textContent = "시연 중 변경은 현재 탭에만 저장돼.";
    $("cloud-hint").textContent =
      "다른 컴퓨터에서는 제공된 원본 기록으로 시작해. 서버 기록과는 연결되지 않아.";
    $("cloud-login").hidden = true;
    const banner = document.createElement("div");
    banner.className = "presentation-banner";
    const label = document.createElement("span");
    label.textContent = `${presentation.date} 기록으로 시연 중 · 변경은 현재 탭에만 적용`;
    const reset = document.createElement("button");
    reset.className = "button small";
    reset.textContent = "시연 처음으로";
    reset.onclick = () => {
      if (!confirm("시연 중 바꾼 내용을 지우고 처음 제공된 기록으로 돌아갈까?"))
        return;
      try {
        recordStorage().removeItem(storageKey);
        location.reload();
      } catch {
        toast(
          "이 브라우저에서 초기화할 수 없어. 새 탭에서 공개 링크를 열어 줘.",
        );
      }
    };
    banner.append(label, reset);
    document.querySelector(".content").prepend(banner);
  }
  render();
  if (storageFailed)
    toast(
      "저장된 기록을 읽지 못했어. 기존 데이터는 덮어쓰지 않고 현재 창에서 실행할게.",
    );
})();
