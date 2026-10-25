(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const enabled = !!document.querySelector('meta[name="miruni-cloud"]');
  let revision = 0,
    owner = null,
    pending = null,
    sending = false,
    blocked = false,
    retryTimer;
  const status = (text, problem = false) => {
    $("cloud-status").textContent = text;
    $("account-button").textContent = problem ? "⚠ 저장 상태 확인" : text;
    $("account-button").classList.toggle("sync-warning", problem);
  };
  const download = () => {
    const blob = new Blob(
      [JSON.stringify(window.MiruniBackup.exportState(), null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob),
      link = document.createElement("a");
    link.href = url;
    link.download = `미룬이-기록-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  async function send() {
    clearTimeout(retryTimer);
    if (!pending || sending || blocked) return;
    const snapshot = pending;
    sending = true;
    status("서버에 저장 중…");
    try {
      const response = await fetch("/api/data", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ state: snapshot, revision, owner }),
        signal: AbortSignal.timeout(15000),
      });
      const data = await response.json();
      if (!response.ok) {
        if ([409, 401, 400, 403, 413].includes(response.status)) {
          blocked = true;
          $("cloud-reload").hidden = false;
          if (response.status === 401) {
            $("cloud-login").href =
              "/signin-with-chatgpt?return_to=%2Findex.html";
            $("cloud-login").target = "_top";
            $("cloud-login").textContent = "다시 로그인";
            $("cloud-login").hidden = false;
          }
        }
        throw Error(data.error || "저장을 완료하지 못했어.");
      }
      revision = data.revision;
      if (pending === snapshot) pending = null;
      $("cloud-retry").hidden = true;
      status("✓ 서버 저장 완료");
    } catch (e) {
      status(
        blocked ? e.message : "연결 끊김 · 아직 서버에 저장되지 않았어",
        true,
      );
      $("cloud-retry").hidden = blocked;
      if (blocked) {
        $("cloud-hint").textContent =
          "현재 기록을 먼저 내보내서 보관해 줘. 최신 기록을 불러오면 이 창의 미저장 변경은 사라져. 기록을 합치려면 최신 내용을 확인한 뒤 다시 입력해 줘.";
      } else retryTimer = setTimeout(send, 10000);
    } finally {
      sending = false;
    }
    if (pending && pending !== snapshot && !blocked)
      retryTimer = setTimeout(send, 100);
  }
  window.MiruniCloud = {
    enabled,
    async open() {
      const gate = document.createElement("dialog");
      gate.className = "cloud-gate";
      gate.innerHTML =
        '<h2>내 미룬이 불러오기</h2><p role="status">로그인 계정의 기록을 확인하고 있어…</p><button class="button" hidden>다시 시도</button><a class="button primary" href="/signin-with-chatgpt?return_to=%2Findex.html" target="_top" hidden>ChatGPT로 로그인</a>';
      document.body.append(gate);
      gate.showModal();
      gate.addEventListener("cancel", (e) => e.preventDefault());
      for (;;) {
        try {
          const r = await fetch("/api/data", {
            cache: "no-store",
            signal: AbortSignal.timeout(15000),
          });
          if (r.status === 401) {
            gate.querySelector("p").textContent =
              "ChatGPT 계정으로 로그인하면 다른 컴퓨터에서도 내 설정과 기록을 불러올 수 있어.";
            gate.querySelector("a").hidden = false;
            await new Promise(() => {});
          }
          if (!r.ok) throw Error();
          const data = await r.json();
          revision = data.revision;
          owner = data.user.id;
          $("account-name").textContent = data.user.name;
          $("cloud-login").hidden = true;
          $("cloud-logout").hidden = false;
          $("cloud-reload").hidden = false;
          $("cloud-hint").textContent =
            "같은 ChatGPT 계정으로 로그인하면 다른 컴퓨터에서도 이어서 쓸 수 있어. 다른 기기의 변경은 최신 기록 불러오기로 확인해 줘. 데모와 미기록 타이머는 저장되지 않아.";
          status(
            data.state
              ? "✓ 서버 기록 불러옴"
              : "로그인 완료 · 첫 기록을 만들어 봐",
          );
          gate.close();
          gate.remove();
          return data;
        } catch {
          gate.querySelector("p").textContent =
            "서버 기록을 불러오지 못했어. 인터넷 연결을 확인한 뒤 다시 시도해 줘. 기존 기록은 그대로야.";
          const button = gate.querySelector("button");
          button.hidden = false;
          await new Promise((resolve) => (button.onclick = resolve));
          button.hidden = true;
        }
      }
    },
    save(value) {
      pending = structuredClone(value);
      status("저장 대기 중…");
      clearTimeout(retryTimer);
      if (!blocked) retryTimer = setTimeout(send, 250);
      else status("서버 저장 보류 · 기록을 백업해 줘", true);
    },
    ready() {
      $("account-button").onclick = () => $("account-dialog").showModal();
      $("export-records").onclick = download;
      $("import-records").onclick = () => $("import-file").click();
      $("import-file").onchange = async (e) => {
        $("backup-error").textContent = "";
        try {
          const file = e.target.files[0];
          if (!file) return;
          if (file.size > 2_000_000)
            throw Error("2MB 이하의 미룬이 기록 파일을 선택해 줘.");
          const value = JSON.parse(await file.text());
          if (!value || value.version !== 1)
            throw Error("미룬이에서 내보낸 JSON 파일을 선택해 줘.");
          if (blocked) throw Error("먼저 저장 문제를 해결한 뒤 가져와 줘.");
          if (
            !confirm(
              "파일의 기록으로 현재 과제·설정·기록을 교체할까? 기존 기록이 필요하면 취소하고 먼저 내보내 줘.",
            )
          )
            return;
          window.MiruniBackup.importState(value);
          $("account-dialog").close();
        } catch (e) {
          $("backup-error").textContent =
            e.message || "올바른 기록 파일이 아니야.";
        } finally {
          e.target.value = "";
        }
      };
      $("cloud-retry").onclick = send;
      $("cloud-reload").onclick = () => {
        if (pending || sending) {
          if (
            !confirm(
              "현재 기록을 내보내 백업한 뒤 서버 기록을 불러올까? 이 창의 미저장 변경은 파일에만 남아.",
            )
          )
            return;
          download();
          pending = null;
        }
        location.reload();
      };
      $("cloud-logout").onclick = (e) => {
        if (pending || sending) {
          e.preventDefault();
          $("backup-error").textContent =
            "서버 저장을 완료한 뒤 로그아웃해 줘. 연결 문제가 있으면 기록을 먼저 내보내 줘.";
        }
      };
      window.addEventListener("beforeunload", (e) => {
        if (pending || sending) {
          e.preventDefault();
          e.returnValue = "";
        }
      });
      window.addEventListener("online", send);
    },
  };
})();
