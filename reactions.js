(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  let api,
    info = {},
    session = null,
    configuredMinutes = 5,
    reactionIndex = 0,
    lastReactionKey = null,
    night = false,
    light = true,
    coffeeClicks = 0,
    plantClicks = 0,
    effectTimer,
    timer;
  const lines = {
    urgent: [
      "또 미뤄? 또?",
      "지금까지 미뤘다가 망해 본 게 한두 번이야?",
      "제발 지금 조금만 하자.",
      "시작이 반임. ㅇㅇ",
      "제발, 너 4학년이야.",
      "줴줴이야.",
      "엄…",
      "망했네…",
    ],
    ready: [
      "아, 그나마 살겠네.",
      "해 놓으니까 편하잖아. ㅇㅈ?",
      "티원~",
      "야르!",
      "어우, 편해.",
    ],
    calm: [
      "지금은 커피 향까지 느낄 여유가 있어. 이 평화, 마음에 든다.",
      "우리 이렇게 조금씩 해두면 마감일에도 사람이겠는데?",
      "오늘의 작은 시작? 미래에서는 꽤 귀한 선물이야.",
    ],
    tight: [
      "지금 일정이 테트리스 마지막 줄 같아.",
      "커피는 준비했어. 이제 네 시작만 기다린다.",
      "내일의 나도 오늘의 너랑 같은 사람이란다.",
    ],
    tired: [
      "커피로 시간을 늘릴 수 있었다면 이미 끝냈다.",
      "업무는 복사되는데 나는 복사가 안 되네.",
      "서류 탑이 자라고 있어. 물은 안 줬는데.",
    ],
    done: [
      "과거의 나, 오늘 좀 멋있었다?",
      "일 없는 책상… 이게 바로 인테리어지.",
      "할 일을 끝낸 당신, 당당하게 쉬어도 됩니다.",
    ],
  };
  function say(text) {
    $("reaction-message").textContent = text;
  }
  function reactionKey(next = info) {
    if (
      next.task &&
      (!next.task.remaining ||
        1 - next.task.remaining / Math.max(1, next.task.total) >= 0.75)
    )
      return "ready";
    if (
      next.task &&
      window.MiruniScheduler.daysBetween(next.today, next.task.deadline) <= 2
    )
      return "urgent";
    return next.mood || "calm";
  }
  function nextReaction() {
    const pool = lines[reactionKey()] || lines.calm;
    return pool[reactionIndex++ % pool.length];
  }
  function sayRoom(text) {
    say(["urgent", "ready"].includes(reactionKey()) ? nextReaction() : text);
  }
  function reset() {
    session = null;
    configuredMinutes = 5;
    draw();
  }
  function sync(next) {
    const changed =
      info.context !== next.context ||
      info.task?.id !== next.task?.id ||
      lastReactionKey !== reactionKey(next);
    if (info.context && info.context !== next.context && session) {
      session = null;
      api.notify("날짜나 모드가 바뀌어서 타이머를 종료했어.");
    }
    info = next;
    if (changed && !session) configuredMinutes = 5;
    lastReactionKey = reactionKey(next);
    const layout = window.MiruniRoomState.roomState(
      next.task,
      next.today,
      next.shortage,
    );
    $("room-books").innerHTML = Array.from(
      { length: layout.books },
      (_, i) =>
        `<span class="room-book" aria-hidden="true" style="--i:${i};--tilt:${((i % 3) - 1) * 4}deg"></span>`,
    ).join("");
    $("room-books").style.height = `${Math.max(30, layout.books * 7)}px`;
    $("room-books").hidden = !layout.books;
    $("room-books").setAttribute(
      "aria-label",
      `책 ${layout.books}권 쌓임. 눌러서 정리하기`,
    );
    $("room-coffee").innerHTML = Array.from(
      { length: layout.cups },
      (_, i) =>
        `<span class="room-coffee-cup" aria-hidden="true" style="--col:${i % 3};--row:${Math.floor(i / 3)}">☕</span>`,
    ).join("");
    $("room-coffee").style.height =
      `${Math.max(32, Math.ceil(layout.cups / 3) * 22 + 9)}px`;
    $("room-coffee").hidden = !layout.cups;
    $("room-coffee").setAttribute(
      "aria-label",
      `커피잔 ${layout.cups}개. 눌러서 한 모금 마시기`,
    );
    $("room").dataset.clutter = String(layout.level);
    updateRoomLight();
    if (changed) {
      reactionIndex = 0;
      say(nextReaction());
    }
    draw();
  }
  function updateRoomLight() {
    $("room").dataset.time = night ? "night" : "day";
    $("room").dataset.light = light ? "on" : "off";
    $("room-window").setAttribute("aria-pressed", String(night));
    $("room-window").setAttribute(
      "aria-label",
      `창문: ${night ? "낮" : "밤"}으로 바꾸기`,
    );
    $("room-lamp").setAttribute("aria-pressed", String(light));
    $("room-lamp").setAttribute(
      "aria-label",
      `방 조명 ${light ? "끄기" : "켜기"}`,
    );
  }
  function playRoom(target, text, kind, symbol) {
    target.classList.remove("room-bounce");
    void target.offsetWidth;
    target.classList.add("room-bounce");
    const effect = $("room-effect");
    clearTimeout(effectTimer);
    effect.classList.remove("show");
    effect.dataset.kind = kind;
    effect.textContent = symbol;
    void effect.offsetWidth;
    effect.classList.add("show");
    effectTimer = setTimeout(() => effect.classList.remove("show"), 1300);
    sayRoom(text);
  }
  function remainingMs() {
    return session?.running
      ? Math.max(0, session.endsAt - Date.now())
      : (session?.left ?? configuredMinutes * 60000);
  }
  function tick() {
    if (session && api.getContext() !== info.context) {
      reset();
      api.refresh();
      api.notify(
        "날짜가 바뀌어서 타이머를 종료했어. 오늘의 일정으로 다시 시작해 줘.",
      );
      return;
    }
    if (session?.running && remainingMs() === 0) {
      session.running = false;
      session.left = 0;
      session.completed += session.segmentMinutes;
      say("시작했네? 제일 무서운 건 끝났다. 나 지금 살짝 감동.");
      api.notify(
        `${session.segmentMinutes}분 해냈어! 실제로 작업했다면 기록해 줘.`,
      );
    }
    draw();
  }
  function draw() {
    const seconds = Math.ceil(remainingMs() / 1000);
    $("focus-clock").textContent =
      `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
    const task = api?.getTask(),
      finished = session && !session.running && session.left === 0;
    $("focus-start").hidden =
      !!session?.running || !!(session && session.left > 0);
    $("focus-start").textContent = finished
      ? "▷ 조금 더 하기 (+5분)"
      : configuredMinutes === 5
        ? "▷ 딱 5분만 시작"
        : `▷ ${configuredMinutes}분 시작`;
    $("focus-start").disabled =
      !session && (!task || api.getLimit(task.id) < configuredMinutes);
    const timerTask = session ? { id: session.id } : task;
    const reserved = session
      ? session.completed + (finished ? 0 : session.segmentMinutes)
      : configuredMinutes;
    $("focus-add").disabled =
      !timerTask || api.getLimit(timerTask.id) < reserved + 5;
    $("focus-pause").hidden = !session || finished;
    $("focus-pause").textContent = session?.running
      ? "잠깐 쉬기"
      : "이어서 하기";
    $("focus-record").hidden =
      !session?.completed || !!session.running || session.left > 0;
    $("focus-record").textContent =
      `${session?.completed || 5}분 실제로 했어 · 기록`;
    $("focus-reset").hidden = !session && configuredMinutes === 5;
    $("focus-reset").textContent = session
      ? "타이머 끝내기"
      : "5분으로 되돌리기";
    const text = session
      ? `${session.title} · ${finished ? `${session.completed}분 타이머 완료! 실제 작업 여부를 확인해 줘.` : session.running ? "지금은 딱 이 일만. 작은 시작을 응원해." : "잠깐 쉬는 중. 준비되면 이어서 해봐."}`
      : task?.remaining === 0
        ? "다 끝냈어. 이제 쉬는 것도 일정이야."
        : !task
          ? "할 일을 등록하면 5분부터 같이 시작할 수 있어."
          : configuredMinutes === 5
            ? "완벽한 한 시간보다, 일단 5분. 옆의 +로 늘릴 수 있어."
            : `${configuredMinutes}분으로 준비했어. +를 누르면 5분씩 늘어나.`;
    if ($("focus-message").textContent !== text)
      $("focus-message").textContent = text;
  }
  function start() {
    const task = session
      ? { id: session.id, title: session.title }
      : api.getTask();
    const minutes = session ? 5 : configuredMinutes;
    if (!task || api.getLimit(task.id) < (session?.completed || 0) + minutes) {
      api.notify(
        "남은 작업량과 하루 총 24시간 기록 한도 안에서 시간을 정해 줘.",
      );
      return;
    }
    session = {
      id: task.id,
      title: task.title,
      completed: session?.completed || 0,
      segmentMinutes: minutes,
      left: minutes * 60000,
      endsAt: Date.now() + minutes * 60000,
      running: true,
    };
    say(
      `좋아. ${minutes}분만 집중해 보자. 미래의 내가 옆에서 조용히 응원할게.`,
    );
    draw();
  }
  function init(callbacks) {
    api = callbacks;
    $("room-window").addEventListener("click", () => {
      night = !night;
      updateRoomLight();
      sayRoom(
        night
          ? "창밖만 밤으로 바꿨어. 밤이라고 갑자기 집중 잘될 거라 기대하는 건 아니지?"
          : "다시 낮이야. 실제 날짜는 그대로니까 지금 조금 해볼까?",
      );
    });
    $("room-lamp").addEventListener("click", () => {
      light = !light;
      updateRoomLight();
      sayRoom(
        light
          ? "불 켰다. 책상은 준비됐고, 이제 시작만 하면 되네."
          : "불 끈다고 할 일이 없어지진 않더라. 잠깐 쉬었다가 다시 켜줘.",
      );
    });
    $("room-coffee").addEventListener("click", () => {
      const lines = [
        "커피 한 모금. 이제 자료 한 줄이라도 읽자.",
        "커피는 마셨고… 과제는 언제 시작할 거야?",
        "계속 누르면 커피만 마신 사람이 돼. 5분만 해볼까?",
      ];
      playRoom(
        $("room-coffee"),
        lines[coffeeClicks++ % lines.length],
        "coffee",
        "♨",
      );
    });
    $("room-plant").addEventListener("click", () => {
      const lines = [
        "물 줬어. 화분은 잘 챙기네. 과제도 조금만 챙겨줘.",
        "나도 물 한 잔 마시고 다시 해볼까?",
        "화분은 충분히 마셨어. 이제 네가 시작할 차례야.",
      ];
      playRoom(
        $("room-plant"),
        lines[plantClicks++ % lines.length],
        "plant",
        "💧",
      );
    });
    $("room-books").addEventListener("click", () => {
      const arranged = $("room-books").classList.toggle("arranged");
      playRoom(
        $("room-books"),
        arranged
          ? "책은 반듯하게 정리했어. 근데 책상 정리만 하다가 공부 끝내는 건 아니지?"
          : "책이 또 기울었네. 쌓인 일을 줄이면 책도 줄어들어.",
        "books",
        "✦",
      );
    });
    $("mascot-button").addEventListener("click", () => {
      say(nextReaction());
      $("mascot-button").classList.remove("poked");
      void $("mascot-button").offsetWidth;
      $("mascot-button").classList.add("poked");
    });
    $("reply-start").addEventListener("click", () =>
      say("그 말 기다렸다! 아래 5분 버튼부터 가볍게 눌러볼까?"),
    );
    $("reply-wait").addEventListener("click", () =>
      say("알겠어. 근데 “조금”의 단위가 분이지? 주는 아니지?"),
    );
    $("focus-start").addEventListener("click", start);
    $("focus-add").addEventListener("click", () => {
      tick();
      const task = session ? { id: session.id } : api.getTask();
      const finished = session && !session.running && session.left === 0;
      const reserved = session
        ? session.completed + (finished ? 0 : session.segmentMinutes)
        : configuredMinutes;
      if (!task || api.getLimit(task.id) < reserved + 5) {
        api.notify(
          "남은 작업량과 하루 총 24시간 기록 한도 안에서 늘릴 수 있어.",
        );
        return;
      }
      if (!session) configuredMinutes += 5;
      else if (finished) {
        session.segmentMinutes = 5;
        session.left = 300000;
        session.running = false;
      } else {
        session.segmentMinutes += 5;
        if (session.running) session.endsAt += 300000;
        else session.left += 300000;
      }
      draw();
      api.notify("집중 시간 5분 추가!");
    });
    $("focus-pause").addEventListener("click", () => {
      tick();
      if (!session || session.left === 0) return;
      if (session.running) {
        session.left = remainingMs();
        session.running = false;
      } else {
        session.endsAt = Date.now() + session.left;
        session.running = true;
      }
      draw();
    });
    $("focus-record").addEventListener("click", () => {
      tick();
      if (!session || session.running || session.left > 0 || !session.completed)
        return;
      if (
        !confirm(
          `「${session.title}」를 실제로 ${session.completed}분 작업했나요? 확인하면 진행 기록에 반영해요.`,
        )
      )
        return;
      if (api.record(session.id, session.completed)) {
        reset();
        api.refresh();
        say("오늘의 작은 시작, 잘 받았어. 미래의 내가 고맙대.");
      }
    });
    $("focus-reset").addEventListener("click", () => {
      if (!session) {
        reset();
        return;
      }
      if (
        confirm("타이머를 종료할까? 아직 기록하지 않은 타이머 시간은 사라져.")
      )
        reset();
    });
    timer = setInterval(tick, 250);
    draw();
  }
  window.MiruniReactions = { init, sync, reset };
})();
