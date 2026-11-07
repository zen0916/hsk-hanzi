(function () {
  "use strict";

  // ---------- 데이터 준비 ----------
  var H = window.HANZI, G = window.GLOSS, LEVELS = window.LEVELS || [1];
  var WORDS = window.WORDS.map(function (a, i) { return { w: a[0], p: a[1], m: a[2], lv: a[3] || 1, i: i }; });
  var BYW = {}; WORDS.forEach(function (x) { BYW[x.w] = x; });
  var uniq = function (s) { return Array.from(new Set(Array.from(s))); };
  // 한자 → 그 한자가 들어간 단어들 (파생 학습의 핵심)
  var CHAR_WORDS = {};
  WORDS.forEach(function (x) { uniq(x.w).forEach(function (c) { (CHAR_WORDS[c] = CHAR_WORDS[c] || []).push(x); }); });

  // 새 단어 순서: 같은 한자로 시작하는 단어끼리 붙여서 (学 → 学生 → 学习 → 学校)
  var ORDER = {};
  LEVELS.forEach(function (lv) {
    var list = WORDS.filter(function (x) { return x.lv === lv; });
    var first = {};
    list.forEach(function (x, k) { var c = x.w[0]; if (!(c in first)) first[c] = k; });
    list.slice().sort(function (a, b) { return first[a.w[0]] - first[b.w[0]] || a.i - b.i; })
      .forEach(function (x, k) { ORDER[x.w] = k; });
  });

  // ---------- 저장 (이 기기 브라우저에만 저장) ----------
  var KEY = "hsk-hanzi-v1";
  var S = {};
  try { S = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { S = {}; }
  S.cards = S.cards || {};
  S.lv = LEVELS.indexOf(S.lv) >= 0 ? S.lv : 1;
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) {} }

  // 간격 반복: 단계별 다음 복습까지의 일수
  var DAYS = [0, 1, 3, 7, 14, 30];
  var DAY = 86400000;
  function known(w) { var c = S.cards[w]; if (!c) return 0; return c.box >= 3 ? 2 : 1; }
  function inLv(lv) { return function (x) { return x.lv === lv; }; }
  function dueList() { var now = Date.now(); return WORDS.filter(function (x) { var c = S.cards[x.w]; return c && c.due <= now; }); }
  function newList(lv) {
    return WORDS.filter(function (x) { return x.lv === lv && !S.cards[x.w]; })
      .sort(function (a, b) { return ORDER[a.w] - ORDER[b.w]; });
  }
  function grade(w, g) {
    if (!S.cards[w]) logToday("n"); // 오늘 처음 배운 새 단어 수
    var c = S.cards[w] || { box: 0, due: 0 };
    if (g === 0) c.box = 0;
    else if (g === 1) c.box = Math.max(1, c.box);
    else c.box = Math.min(DAYS.length - 1, c.box + 1);
    c.due = g === 0 ? Date.now() : Date.now() + DAYS[c.box] * DAY - 3600000;
    S.cards[w] = c; logToday("w"); save();
  }

  // ---------- 유틸 ----------
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var view = $("#view");
  var zhVoice = null;
  function pickVoice() {
    if (!("speechSynthesis" in window)) return;
    var vs = speechSynthesis.getVoices();
    zhVoice = vs.find(function (v) { return /zh[-_]CN/i.test(v.lang); }) || vs.find(function (v) { return /^zh/i.test(v.lang); }) || null;
  }
  if ("speechSynthesis" in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
  function speak(t) {
    if (!("speechSynthesis" in window)) return;
    speechSynthesis.cancel();
    var u = new SpeechSynthesisUtterance(t); u.lang = "zh-CN"; u.rate = 0.8;
    if (zhVoice) u.voice = zhVoice;
    speechSynthesis.speak(u);
  }
  function hunOnly(c) { return H[c] ? H[c].k.replace(/^\S+\s/, "") : (G[c] || ""); }
  function lvSeg(cur, withAll) {
    return '<div class="seg lv">' + (withAll ? '<button data-lv="0"' + (cur === 0 ? ' class="on"' : '') + '>전체</button>' : '') +
      LEVELS.map(function (lv) { return '<button data-lv="' + lv + '"' + (cur === lv ? ' class="on"' : '') + '>' + lv + '급</button>'; }).join("") + '</div>';
  }
  function bindSeg(root, fn) {
    root.querySelectorAll(".seg.lv button").forEach(function (b) { b.onclick = function () { fn(+b.dataset.lv); }; });
  }

  // ---------- 설정 (화면 테마, 글자 크기, 자동 발음) ----------
  S.set = Object.assign({ theme: "auto", big: false, autoSpeak: true, perDay: 10 }, S.set || {});
  var cardKeys = null;
  document.addEventListener("keydown", function (e) {
    if (tab === "home" && session && sheet.hidden && cardKeys && !(e.target.closest && e.target.closest("input"))) cardKeys(e);
  });
  function applySettings() {
    var root = document.documentElement;
    if (S.set.theme === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", S.set.theme);
    document.body.classList.toggle("big", !!S.set.big);
  }
  function openSettings() {
    var seg = function (key, opts) {
      return '<div class="seg set" data-k="' + key + '">' + opts.map(function (o) {
        return '<button data-v="' + o[0] + '"' + (String(S.set[key]) === o[0] ? ' class="on"' : '') + '>' + o[1] + '</button>';
      }).join("") + '</div>';
    };
    openSheet('<div class="stack"><h2 class="sh">설정</h2>' +
      '<div class="setrow"><span>화면 테마</span>' + seg("theme", [["auto", "자동"], ["light", "밝게"], ["dark", "어둡게"]]) + '</div>' +
      '<div class="setrow"><span>글자 크기</span>' + seg("big", [["false", "보통"], ["true", "크게"]]) + '</div>' +
      '<div class="setrow"><span>정답 볼 때 발음 자동 재생</span>' + seg("autoSpeak", [["true", "켜기"], ["false", "끄기"]]) + '</div>' +
      '<p class="note">컴퓨터에서는 스페이스로 정답 보기, 1·2·3으로 평가할 수 있어요.</p></div>');
    sheetContent.querySelectorAll(".seg.set button").forEach(function (b) {
      b.onclick = function () {
        var k = b.parentNode.dataset.k, v = b.dataset.v;
        S.set[k] = v === "true" ? true : v === "false" ? false : v;
        save(); applySettings(); openSettings();
      };
    });
  }
  applySettings();
  $("#gear").onclick = openSettings;

  // ---------- 탭 ----------
  var tab = "home";
  try { tab = localStorage.getItem(KEY + "-tab") || "home"; } catch (e) {}
  document.querySelectorAll(".tabs button").forEach(function (b) {
    b.addEventListener("click", function () { go(b.dataset.tab); });
  });
  function go(t) {
    tab = t; session = null; quiz = null;
    try { localStorage.setItem(KEY + "-tab", t); } catch (e) {}
    document.querySelectorAll(".tabs button").forEach(function (b) { b.classList.toggle("on", b.dataset.tab === t); });
    render(); window.scrollTo(0, 0);
  }
  function render() {
    if (tab === "home") session ? renderCard() : quiz ? renderQuiz() : renderHome();
    else if (tab === "words") renderWords();
    else if (tab === "stats") renderStats();
    else renderHanzi();
  }

  // ---------- 학습 홈 ----------
  var session = null, quiz = null;
  function modeSeg() {
    return '<div class="seg mode"><button data-m="word"' + (S.mode !== "quiz" ? ' class="on"' : '') + '>단어 학습</button>' +
      '<button data-m="quiz"' + (S.mode === "quiz" ? ' class="on"' : '') + '>한자 퀴즈</button></div>';
  }
  function bindMode() {
    view.querySelectorAll(".seg.mode button").forEach(function (b) {
      b.onclick = function () { S.mode = b.dataset.m; save(); renderHome(); };
    });
  }
  function renderHome() {
    if (S.mode === "quiz") return renderQuizHome();
    var lv = S.lv;
    var lvWords = WORDS.filter(inLv(lv));
    var learned = lvWords.filter(function (x) { return known(x.w) === 2; }).length;
    var seen = lvWords.filter(function (x) { return S.cards[x.w]; }).length;
    var perDay = S.set.perDay, doneToday = newToday();
    var due = dueList().length, fresh = Math.max(0, Math.min(perDay - doneToday, newList(lv).length));
    var total = due + fresh;
    var leftAll = newList(lv).length;
    var lvChars = Object.keys(H).filter(function (c) { return H[c].lv === lv; }).length;
    view.innerHTML =
      '<div class="stack">' + modeSeg() +
      lvSeg(lv, false) +
      '<div class="panel stack">' +
      '<div><b>HSK ' + lv + '급</b> <span class="muted small">· 새 단어 ' + lvWords.length + '개 · 새 한자 ' + lvChars + '자</span></div>' +
      '<div class="bar"><i style="width:' + (learned / lvWords.length * 100).toFixed(1) + '%"></i></div>' +
      '<div class="stats">' +
      '<div class="stat"><b>' + learned + '</b><span>외운 단어</span></div>' +
      '<div class="stat"><b>' + due + '</b><span>오늘 복습</span></div>' +
      '<div class="stat"><b>' + (lvWords.length - seen) + '</b><span>남은 새 단어</span></div>' +
      '</div>' +
      '<div class="goal"><div class="goal-h"><span>하루 새 단어</span><b>오늘 ' + Math.min(doneToday, perDay) + ' / ' + perDay + '개</b></div>' +
      '<div class="seg per">' + [5, 10, 15, 20, 30].map(function (n) {
        return '<button data-n="' + n + '"' + (n === perDay ? ' class="on"' : '') + '>' + n + '개</button>';
      }).join("") + '</div></div></div>' +
      '<button class="btn" id="start"' + (total ? "" : " disabled") + '>' +
      (total ? "학습 시작 · " + (due ? "복습 " + Math.min(due, 50) + (fresh ? " + " : "") : "") + (fresh ? "새 단어 " + fresh : "") : "오늘 목표 완료 🎉") + '</button>' +
      (!fresh && leftAll ? '<button class="btn ghost" id="more5">새 단어 5개 더 하기</button>' : '') +
      '<div class="panel small muted">' +
      '<b style="color:var(--text)">이렇게 공부해요</b><br>' +
      '① 단어를 보고 뜻을 떠올려 보세요.<br>' +
      '② 정답을 열면 단어를 이루는 한자와 연상법이 나와요. 한자를 누르면 유래와 부수, 같은 한자가 쓰인 다른 단어를 볼 수 있어요.<br>' +
      '③ 얼마나 알았는지 고르면 알맞은 때에 다시 복습시켜 드려요.<br>' +
      '④ 새 단어는 같은 한자로 시작하는 단어끼리 이어서 나와요.' +
      '</div>' +
      '<p class="note">HSK 3.0 (2026 개정) 기준 · 단어 목록: complete-hsk-vocabulary (MIT) · 한자 분해·획순: Make Me a Hanzi (LGPL·Arphic) · 뜻·유래·연상법은 AI가 작성</p>' +
      '</div>';
    bindSeg(view, function (v) { S.lv = v; save(); renderHome(); });
    bindMode();
    view.querySelectorAll(".seg.per button").forEach(function (b) {
      b.onclick = function () { S.set.perDay = +b.dataset.n; save(); renderHome(); };
    });
    var begin = function (nNew) {
      var q = dueList().slice(0, 50).concat(newList(S.lv).slice(0, nNew));
      if (!q.length) return;
      session = { q: q, i: 0, open: false };
      renderCard();
    };
    var s = $("#start");
    if (s) s.onclick = function () { begin(fresh); };
    var m5 = $("#more5");
    if (m5) m5.onclick = function () { begin(5); };
  }
  function newToday() { var e = S.log[today()]; return (e && e.n) || 0; }

  // ---------- 학습 카드 ----------
  function renderCard() {
    if (session.i >= session.q.length) {
      session = null;
      view.innerHTML = '<div class="panel card stack"><div class="word">很好!</div><p>이번 학습을 마쳤어요.</p><button class="btn" id="back">처음으로</button></div>';
      $("#back").onclick = function () { renderHome(); };
      return;
    }
    var x = session.q[session.i];
    var done = session.i;
    var html =
      '<div class="stack">' +
      '<div class="progress"><span>' + (done + 1) + ' / ' + session.q.length + '</span><div class="bar"><i style="width:' + (done / session.q.length * 100) + '%"></i></div>' +
      '<button class="speak" id="quit">그만</button></div>' +
      '<div class="panel card">' +
      '<div class="lvtag">HSK ' + x.lv + '</div>' +
      '<div class="word">' + esc(x.w) + '</div>' +
      '<button class="speak" id="say">🔊 발음 듣기</button>' +
      (session.open
        ? '<div class="pinyin">' + esc(x.p) + '</div><div class="meaning">' + esc(x.m) + '</div>'
        : '<div class="hint">뜻과 발음을 떠올려 보세요</div>') +
      '</div>';
    if (session.open) {
      var ex = wordExtra(x);
      html += '<div class="chars">' + charTiles(x.w) + '</div>' + ex +
        '<div class="rate sticky">' +
        '<button class="r0" data-g="0">몰랐어요<small>곧 다시</small></button>' +
        '<button class="r1" data-g="1">헷갈려요<small>내일</small></button>' +
        '<button class="r2" data-g="2">알아요<small>' + nextLabel(x.w) + '</small></button>' +
        '</div><p class="note">카드를 ← 밀면 몰랐어요, → 밀면 알아요</p>';
    } else {
      html += '<button class="btn" id="reveal">정답 보기</button><p class="note">카드를 누르거나 밀어도 정답이 보여요</p>';
    }
    view.innerHTML = html + '</div>';
    $("#say").onclick = function () { speak(x.w); };
    $("#quit").onclick = function () { session = null; renderHome(); };
    var reveal = function () { session.open = true; if (S.set.autoSpeak) speak(x.w); renderCard(); };
    var rate = function (g) {
      grade(x.w, g);
      if (g === 0) session.q.push(x); // 모르면 이번 학습 끝에 한 번 더
      session.i++; session.open = false; renderCard(); window.scrollTo(0, 0);
    };
    cardKeys = function (e) {
      if (!session.open && (e.key === " " || e.key === "Enter")) { e.preventDefault(); reveal(); }
      else if (session.open && /^[123]$/.test(e.key)) rate(+e.key - 1);
    };
    // 카드 밀기: 정답 전에는 아무 방향이나 = 정답 보기, 정답 후에는 → 알아요 / ← 몰랐어요
    var card = $(".card"), sx = null, sy = 0;
    card.addEventListener("touchstart", function (e) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    card.addEventListener("touchmove", function (e) {
      if (sx == null) return;
      var dx = e.touches[0].clientX - sx;
      if (Math.abs(dx) > Math.abs(e.touches[0].clientY - sy)) card.style.transform = "translateX(" + dx * 0.4 + "px) rotate(" + dx * 0.02 + "deg)";
    }, { passive: true });
    card.addEventListener("touchend", function (e) {
      if (sx == null) return;
      var dx = e.changedTouches[0].clientX - sx; sx = null; card.style.transform = "";
      if (Math.abs(dx) < 70) return;
      if (!session.open) reveal(); else rate(dx > 0 ? 2 : 0);
    });
    if (!session.open) {
      $("#reveal").onclick = reveal;
      card.onclick = function (e) { if (!e.target.closest("button")) reveal(); };
    } else {
      bindCharTiles(view); bindExtra(view);
      view.querySelectorAll(".rate button").forEach(function (b) { b.onclick = function () { rate(+b.dataset.g); }; });
    }
  }
  function nextLabel(w) {
    var c = S.cards[w]; var box = Math.min(DAYS.length - 1, (c ? c.box : 0) + 1);
    return DAYS[box] + "일 뒤";
  }
  function charTiles(w) {
    return uniq(w).map(function (c) {
      var h = H[c]; if (!h) return "";
      var n = (CHAR_WORDS[c] || []).length - 1;
      return '<button class="ch" data-c="' + esc(c) + '"><div class="big">' + esc(c) + '</div><div>' +
        '<div class="kr">' + esc(h.k) + '</div><div class="mn">' + esc(h.m) + '</div>' +
        '<div class="more">유래·부수 보기' + (n > 0 ? ' · 이 한자가 쓰인 단어 ' + n + '개 더' : '') + ' ›</div></div></button>';
    }).join("");
  }
  function bindCharTiles(root) {
    root.querySelectorAll("[data-c]").forEach(function (b) { b.onclick = function () { openChar(b.dataset.c); }; });
  }

  // ---------- 한자 퀴즈 ----------
  // 문제 유형: 0 한자→훈음, 1 훈음→한자, 2 부수 찾기
  // 오답 보기는 가능한 한 같은 부수의 한자에서 골라 헷갈리는 글자끼리 구분하게 한다.
  S.hz = S.hz || {};
  var QN = 10;
  var BY_RAD = {};
  Object.keys(H).forEach(function (c) { (BY_RAD[H[c].r] = BY_RAD[H[c].r] || []).push(c); });
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function seenChars() {
    var s = {};
    Object.keys(S.cards).forEach(function (w) { Array.from(w).forEach(function (c) { if (H[c]) s[c] = 1; }); });
    return s;
  }
  function weakness(c) { var h = S.hz[c]; return h ? h.ng * 2 - h.ok : 0; }
  function pickDistract(c, n, keyFn) {
    var key = keyFn(c), out = [], used = {}; used[key] = 1;
    var near = shuffle((BY_RAD[H[c].r] || []).slice());
    var far = shuffle(Object.keys(H).filter(function (x) { return Math.abs(H[x].lv - H[c].lv) <= 1; }));
    near.concat(far).some(function (x) {
      var k = keyFn(x);
      if (x !== c && !used[k] && k) { used[k] = 1; out.push(x); }
      return out.length >= n;
    });
    return out;
  }
  function makeQuiz(lv) {
    var seen = seenChars();
    var pool = Object.keys(H).filter(function (c) { return H[c].lv <= lv && (lv === 1 || H[c].lv >= lv - 1 || seen[c] || S.hz[c]); });
    var ranked = shuffle(pool).sort(function (a, b) {
      return (weakness(b) - weakness(a)) || ((seen[b] ? 1 : 0) - (seen[a] ? 1 : 0)) || ((H[b].lv === lv) - (H[a].lv === lv));
    });
    var qs = ranked.slice(0, QN).map(function (c, i) {
      var type = i % 3;
      if (type === 2 && (H[c].r === c || !(H[H[c].r] || G[H[c].r]))) type = 0;
      var opts, ans;
      if (type === 0) { opts = [c].concat(pickDistract(c, 3, hunOnly)); ans = c; }
      else if (type === 1) { opts = [c].concat(pickDistract(c, 3, function (x) { return x; })); ans = c; }
      else {
        ans = H[c].r;
        // 이 한자 안에 들어 있는 다른 부품은 보기에서 뺀다 (정답처럼 보일 수 있으므로)
        var inside = H[c].p.join("") + c;
        var rads = shuffle(Object.keys(BY_RAD).filter(function (r) { return r !== ans && inside.indexOf(r) < 0 && (H[r] || G[r]); })).slice(0, 3);
        opts = [ans].concat(rads);
      }
      return { c: c, type: type, opts: shuffle(opts), ans: ans, picked: null };
    });
    return { qs: shuffle(qs), i: 0, score: 0 };
  }
  function renderQuizHome() {
    var lv = S.lv;
    var lvChars = Object.keys(H).filter(function (c) { return H[c].lv === lv; });
    var tried = lvChars.filter(function (c) { return S.hz[c]; }).length;
    var weak = Object.keys(S.hz).filter(function (c) { return weakness(c) > 0; });
    view.innerHTML = '<div class="stack">' + modeSeg() + lvSeg(lv, false) +
      '<div class="panel stack"><div><b>HSK ' + lv + '급 한자 퀴즈</b> <span class="muted small">· 한자 ' + lvChars.length + '자</span></div>' +
      '<div class="bar"><i style="width:' + (tried / lvChars.length * 100).toFixed(1) + '%"></i></div>' +
      '<div class="stats"><div class="stat"><b>' + tried + '</b><span>풀어 본 한자</span></div>' +
      '<div class="stat"><b>' + weak.length + '</b><span>약한 한자</span></div>' +
      '<div class="stat"><b>' + QN + '</b><span>한 번에 문제</span></div></div></div>' +
      '<button class="btn" id="qstart">퀴즈 시작</button>' +
      (weak.length ? '<div class="panel"><h3 class="h3">자주 틀린 한자</h3><div class="chips">' +
        weak.sort(function (a, b) { return weakness(b) - weakness(a); }).slice(0, 12).map(function (c) {
          return '<button class="chip" data-c="' + esc(c) + '"><span class="zh">' + esc(c) + '</span><span>' + esc(hunOnly(c)) + '</span></button>';
        }).join("") + '</div></div>' : '') +
      '<div class="panel small muted"><b style="color:var(--text)">세 가지 문제가 섞여 나와요</b><br>' +
      '① 한자를 보고 훈음 고르기<br>② 훈음을 보고 한자 고르기<br>③ 한자의 부수 찾기<br>' +
      '틀리기 쉬운 비슷한 한자(같은 부수)가 보기로 나오고, 자주 틀린 한자는 다음 퀴즈에 먼저 나와요.</div></div>';
    bindSeg(view, function (v) { S.lv = v; save(); renderHome(); });
    bindMode(); bindCharTiles(view);
    $("#qstart").onclick = function () { quiz = makeQuiz(S.lv); renderQuiz(); };
  }
  function optLabel(q, x) {
    if (q.type === 0) return '<span class="ko">' + esc(hunOnly(x)) + '</span>';
    if (q.type === 1) return '<span class="zh big">' + esc(x) + '</span>';
    return '<span class="zh">' + esc(x) + '</span> <span class="ko small">' + esc(hunOnly(x)) + '</span>';
  }
  function renderQuiz() {
    if (quiz.i >= quiz.qs.length) {
      var sc = quiz.score, n = quiz.qs.length;
      var wrong = quiz.qs.filter(function (q) { return q.picked !== q.ans; });
      quiz = null;
      view.innerHTML = '<div class="stack"><div class="panel card stack"><div class="word">' + sc + ' / ' + n + '</div>' +
        '<p>' + (sc === n ? '완벽해요! 🎉' : sc >= n * 0.7 ? '잘했어요!' : '틀린 한자를 한 번 더 살펴봐요.') + '</p></div>' +
        (wrong.length ? '<div class="panel"><h3 class="h3">틀린 한자</h3><div class="chips">' + wrong.map(function (q) {
          return '<button class="chip" data-c="' + esc(q.c) + '"><span class="zh">' + esc(q.c) + '</span><span>' + esc(hunOnly(q.c)) + '</span></button>';
        }).join("") + '</div></div>' : '') +
        '<button class="btn" id="qagain">한 번 더</button><button class="btn ghost" id="qback">처음으로</button></div>';
      bindCharTiles(view);
      $("#qagain").onclick = function () { quiz = makeQuiz(S.lv); renderQuiz(); };
      $("#qback").onclick = function () { renderHome(); };
      return;
    }
    var q = quiz.qs[quiz.i], h = H[q.c];
    var prompt = q.type === 0 ? '<div class="word">' + esc(q.c) + '</div><div class="hint">이 한자의 훈음은?</div>'
      : q.type === 1 ? '<div class="qko">' + esc(hunOnly(q.c)) + '</div><div class="hint">이 훈음에 맞는 한자는?</div>'
      : '<div class="word">' + esc(q.c) + '</div><div class="hint">이 한자의 부수는?</div>';
    var html = '<div class="stack"><div class="progress"><span>' + (quiz.i + 1) + ' / ' + quiz.qs.length + '</span>' +
      '<div class="bar"><i style="width:' + (quiz.i / quiz.qs.length * 100) + '%"></i></div><button class="speak" id="quit">그만</button></div>' +
      '<div class="panel card">' + prompt + '</div><div class="opts">' +
      q.opts.map(function (x) {
        var cls = q.picked == null ? '' : x === q.ans ? ' ok' : x === q.picked ? ' ng' : ' dim';
        return '<button class="opt' + cls + '" data-o="' + esc(x) + '"' + (q.picked != null ? ' disabled' : '') + '>' + optLabel(q, x) + '</button>';
      }).join("") + '</div>';
    if (q.picked != null) {
      var right = q.picked === q.ans;
      html += '<div class="memo"><h3>' + (right ? '정답! ' : '오답 — ') + esc(q.c) + ' ' + esc(hunOnly(q.c)) + '</h3><p>' + esc(h.m) + '</p></div>' +
        '<div class="row2"><button class="btn ghost" data-c="' + esc(q.c) + '">자세히 보기</button><button class="btn" id="qnext">다음</button></div>';
    }
    view.innerHTML = html + '</div>';
    $("#quit").onclick = function () { quiz = null; renderHome(); };
    if (q.picked == null) {
      view.querySelectorAll(".opt").forEach(function (b) {
        b.onclick = function () {
          q.picked = b.dataset.o;
          var st = S.hz[q.c] || { ok: 0, ng: 0 };
          if (q.picked === q.ans) { st.ok++; quiz.score++; } else st.ng++;
          S.hz[q.c] = st; logToday("q"); save();
          if (q.type !== 0) speak(q.c);
          renderQuiz();
        };
      });
    } else {
      bindCharTiles(view);
      $("#qnext").onclick = function () { quiz.i++; renderQuiz(); window.scrollTo(0, 0); };
    }
  }

  // ---------- 학습 기록 (날짜별) ----------
  S.log = S.log || {};
  function today() { var d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function logToday(kind) {
    var t = today(), e = S.log[t] || { w: 0, q: 0 };
    e[kind] = (e[kind] || 0) + 1; S.log[t] = e;
  }

  // ---------- 기록 화면 ----------
  function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function streak() {
    var d = new Date(), n = 0;
    if (!S.log[dayKey(d)]) d.setDate(d.getDate() - 1); // 오늘 아직 안 했어도 어제까지 이어졌으면 유지
    while (S.log[dayKey(d)]) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function renderStats() {
    var t = S.log[today()] || { w: 0, q: 0 };
    var days = [];
    for (var i = 13; i >= 0; i--) { var d = new Date(); d.setDate(d.getDate() - i); var e = S.log[dayKey(d)] || {}; days.push({ d: d, n: (e.w || 0) + (e.q || 0), w: e.w || 0, q: e.q || 0 }); }
    var max = Math.max(10, Math.max.apply(null, days.map(function (x) { return x.n; })));
    var learnedAll = Object.keys(S.cards).filter(function (w) { return S.cards[w].box >= 3; }).length;
    var charsKnown = {};
    Object.keys(S.cards).forEach(function (w) { if (S.cards[w].box >= 1) Array.from(w).forEach(function (c) { if (H[c]) charsKnown[c] = 1; }); });
    var WD = ["일", "월", "화", "수", "목", "금", "토"];
    view.innerHTML = '<div class="stack">' +
      '<div class="stats"><div class="stat"><b>' + streak() + '일</b><span>연속 학습</span></div>' +
      '<div class="stat"><b>' + (t.w + t.q) + '</b><span>오늘 푼 카드</span></div>' +
      '<div class="stat"><b>' + learnedAll + '</b><span>외운 단어</span></div></div>' +
      '<div class="panel"><h3 class="h3">최근 2주 학습량 <span class="muted">(단어 카드 + 퀴즈 문제)</span></h3>' +
      '<div class="chart" role="img" aria-label="최근 14일 학습량 막대 그래프">' + days.map(function (x, k) {
        var h = x.n ? Math.max(4, x.n / max * 100) : 0;
        var tip = (x.d.getMonth() + 1) + "/" + x.d.getDate() + " · 단어 " + x.w + " · 퀴즈 " + x.q;
        return '<div class="col" title="' + tip + '" data-tip="' + tip + '"><div class="barv' + (k === 13 ? ' today' : '') + '" style="height:' + h + '%"></div>' +
          '<span class="lbl">' + (k === 13 ? '오늘' : WD[x.d.getDay()]) + '</span></div>';
      }).join("") + '</div><div class="tip small muted" id="tip">막대를 누르면 그날의 학습량이 보여요.</div></div>' +
      '<div class="panel"><h3 class="h3">급수별 진도</h3>' +
      '<div class="legend"><span><i class="sw s2"></i>외움</span><span><i class="sw s1"></i>학습 중</span><span><i class="sw s0"></i>아직 안 봄</span></div>' +
      LEVELS.map(function (lv) {
        var ws = WORDS.filter(inLv(lv)), a = 0, b = 0;
        ws.forEach(function (x) { var k = known(x.w); if (k === 2) a++; else if (k === 1) b++; });
        var pa = a / ws.length * 100, pb = b / ws.length * 100;
        return '<div class="lvrow"><span class="lvn">' + lv + '급</span><div class="stack1" title="외움 ' + a + ' · 학습 중 ' + b + ' · 전체 ' + ws.length + '">' +
          (a ? '<i class="s2" style="width:' + pa + '%"></i>' : '') + (b ? '<i class="s1" style="width:' + pb + '%"></i>' : '') + '<i class="s0" style="flex:1"></i></div>' +
          '<span class="lvv">' + a + '/' + ws.length + '</span></div>';
      }).join("") + '</div>' +
      '<div class="panel small"><b>만난 한자 ' + Object.keys(charsKnown).length + ' / ' + Object.keys(H).length + '자</b><div class="muted">공부한 단어에 들어 있던 한자 수예요.</div></div>' +
      '<div class="panel stack"><h3 class="h3" style="margin:0">기록 백업</h3>' +
      '<p class="small muted" style="margin:0">학습 기록은 이 기기의 브라우저에만 저장돼요. 기기를 바꾸거나 브라우저 데이터를 지우기 전에 파일로 내보내 두세요.</p>' +
      '<div class="row2"><button class="btn ghost" id="imp">불러오기</button><button class="btn ghost" id="exp">내보내기</button></div>' +
      '<input type="file" id="impf" accept="application/json,.json" hidden></div>' +
      '</div>';
    view.querySelectorAll(".col").forEach(function (c) { c.onclick = function () { $("#tip").textContent = c.dataset.tip; }; });
    $("#exp").onclick = function () {
      var blob = new Blob([JSON.stringify(S)], { type: "application/json" });
      var a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "hanzi-hsk-기록-" + today() + ".json";
      document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    };
    $("#imp").onclick = function () { $("#impf").click(); };
    $("#impf").onchange = function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (txt) {
        var d = JSON.parse(txt);
        if (!d || typeof d.cards !== "object") throw new Error("형식");
        if (!confirm("지금 기록을 불러온 파일 내용으로 바꿀까요?")) return;
        S = d; S.cards = S.cards || {}; S.hz = S.hz || {}; S.log = S.log || {}; S.lv = LEVELS.indexOf(S.lv) >= 0 ? S.lv : 1;
        S.set = Object.assign({ theme: "auto", big: false, autoSpeak: true, perDay: 10 }, S.set || {});
        save(); applySettings(); renderStats();
      }).catch(function () { alert("이 파일은 불러올 수 없어요."); });
    };
  }

  // ---------- 단어 목록 ----------
  var wordQuery = "", wordLv = 0;
  var PAGE = 200;
  function renderWords() {
    view.innerHTML = '<div class="stack">' + lvSeg(wordLv, true) +
      '<input class="search" id="q" type="search" placeholder="한자, 병음, 뜻으로 검색" value="' + esc(wordQuery) + '">' +
      '<ul class="list" id="wl"></ul><button class="btn ghost" id="more" hidden>더 보기</button></div>';
    bindSeg(view, function (v) { wordLv = v; renderWords(); });
    var q = $("#q"), shown = PAGE, items = [];
    q.oninput = function () { wordQuery = q.value; shown = PAGE; fill(); };
    $("#more").onclick = function () { shown += PAGE; draw(); };
    function fill() {
      var t = wordQuery.trim().toLowerCase();
      var plain = function (s) { return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[\s']/g, ""); };
      var pt = plain(t);
      items = WORDS.filter(function (x) {
        if (wordLv && x.lv !== wordLv) return false;
        return !t || x.w.indexOf(t) >= 0 || x.m.indexOf(t) >= 0 || (pt && plain(x.p).indexOf(pt) >= 0);
      });
      draw();
    }
    function draw() {
      $("#wl").innerHTML = items.length ? items.slice(0, shown).map(function (x) {
        return '<li><button class="row" data-w="' + esc(x.w) + '"><span class="w">' + esc(x.w) + '</span><span class="d"><div>' + esc(x.p) + '</div><div>' + esc(x.m) + '</div></span><span class="lvs">' + x.lv + '</span><span class="dot l' + known(x.w) + '"></span></button></li>';
      }).join("") : '<li class="row muted">검색 결과가 없어요</li>';
      $("#more").hidden = items.length <= shown;
      $("#wl").querySelectorAll("[data-w]").forEach(function (b) { b.onclick = function () { openWord(b.dataset.w); }; });
    }
    fill();
  }

  // ---------- 한자 목록 ----------
  var hanziSort = "family", hanziLv = 0;
  function renderHanzi() {
    var list = Object.keys(H).filter(function (c) { return !hanziLv || H[c].lv === hanziLv; });
    if (hanziSort === "family") list.sort(function (a, b) { return (CHAR_WORDS[b] || []).length - (CHAR_WORDS[a] || []).length; });
    else list.sort(function (a, b) { return H[a].r.localeCompare(H[b].r, "zh") || a.localeCompare(b, "zh"); });
    view.innerHTML = '<div class="stack">' + lvSeg(hanziLv, true) +
      '<div class="seg"><button data-s="family">많이 쓰이는 순</button><button data-s="radical">부수별</button></div>' +
      '<p class="small muted" style="margin:0">' + list.length + '자 · 숫자는 이 한자가 들어간 HSK 1~' + LEVELS[LEVELS.length - 1] + '급 단어 수예요. 숫자가 큰 한자부터 외우면 여러 단어를 한꺼번에 잡을 수 있어요.</p>' +
      '<div class="grid">' + list.map(function (c) {
        var n = (CHAR_WORDS[c] || []).length;
        return '<button class="cell" data-c="' + esc(c) + '">' + (n > 1 ? '<span class="n">' + n + '</span>' : '') +
          '<span class="z">' + esc(c) + '</span><span class="k">' + esc(hunOnly(c)) + '</span></button>';
      }).join("") + '</div></div>';
    bindSeg(view, function (v) { hanziLv = v; renderHanzi(); });
    view.querySelectorAll(".seg:not(.lv) button").forEach(function (b) {
      b.classList.toggle("on", b.dataset.s === hanziSort);
      b.onclick = function () { hanziSort = b.dataset.s; renderHanzi(); };
    });
    bindCharTiles(view);
  }

  // ---------- 상세 시트 ----------
  var sheet = $("#sheet"), sheetContent = $("#sheet-content");
  sheet.addEventListener("click", function (e) { if (e.target.closest("[data-close]")) closeSheet(); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") closeSheet(); });
  function openSheet(html) {
    sheetContent.innerHTML = html; sheet.hidden = false;
    $(".sheet-body").scrollTop = 0;
    document.body.style.overflow = "hidden";
  }
  function closeSheet() { stopStrokes(); sheet.hidden = true; document.body.style.overflow = ""; }
  function partChip(x) {
    return H[x]
      ? '<button class="part" data-c="' + esc(x) + '"><b>' + esc(x) + '</b>' + esc(hunOnly(x)) + ' ›</button>'
      : '<span class="part"><b>' + esc(x) + '</b>' + esc(G[x] || "") + '</span>';
  }

  function openChar(c) {
    var h = H[c]; if (!h) return;
    var words = (CHAR_WORDS[c] || []).slice().sort(function (a, b) { return a.lv - b.lv || a.w.length - b.w.length; });
    var parts = h.p.length ? '<div class="parts">' + h.p.map(partChip).join("") + '</div>' : '<span class="muted">더 나누지 않는 기본 글자</span>';
    var r = h.r === c ? '<b class="zh">' + esc(c) + '</b> (자기 자신이 부수)' : partChip(h.r);
    openSheet(
      '<div class="stack">' +
      '<div class="hero"><div class="stk" id="stk"><span class="z">' + esc(c) + '</span></div><div class="k">' + esc(h.k) + '</div>' +
      '<div class="small muted">HSK ' + h.lv + '급 한자<span id="stkn"></span></div>' +
      '<div class="btns"><button class="speak" id="sc">🔊 발음 듣기</button><button class="speak" id="replay" hidden>✍️ 획순 다시 보기</button></div></div>' +
      (h.m ? '<div class="memo"><h3>연상법</h3><p>' + esc(h.m) + '</p></div>' : '') +
      '<div class="panel stack">' +
      '<dl class="kv"><dt>부수</dt><dd>' + r + '</dd><dt>구성</dt><dd>' + parts + '</dd></dl>' +
      (h.o ? '<div class="sec"><h3>유래</h3><p>' + esc(h.o) + '</p></div>' : '') + '</div>' +
      '<div class="sec"><h3>이 한자가 쓰인 단어 (' + words.length + ')</h3><div class="chips">' +
      words.map(function (x) { return '<button class="chip" data-w="' + esc(x.w) + '"><span class="zh">' + esc(x.w) + '</span><span>' + esc(x.m) + ' · ' + x.lv + '급</span></button>'; }).join("") +
      '</div></div>' +
      '<p class="note">유래와 연상법은 AI가 작성했어요. 학설이 여러 가지인 글자는 외우기 쉬운 설명을 골랐어요.</p>' +
      '</div>');
    $("#sc").onclick = function () { speak(c); };
    bindCharTiles(sheetContent);
    sheetContent.querySelectorAll("[data-w]").forEach(function (b) { b.onclick = function () { openWord(b.dataset.w); }; });
    drawStrokes(c, $("#stk"));
  }

  // ---------- 획순 애니메이션 (Make Me a Hanzi 데이터) ----------
  var stkTimers = [], stkCache = {}, stkUid = 0;
  function stopStrokes() { stkTimers.forEach(clearTimeout); stkTimers = []; }
  function drawStrokes(c, box) {
    stopStrokes();
    var go = function (d) {
      if (!box.isConnected) return;
      var NS = "http://www.w3.org/2000/svg", uid = ++stkUid;
      var svg = document.createElementNS(NS, "svg");
      svg.setAttribute("viewBox", "0 0 1024 1024");
      svg.innerHTML = '<g class="guide"><path d="M0 0L1024 1024M1024 0L0 1024M512 0V1024M0 512H1024"/><rect x="8" y="8" width="1008" height="1008"/></g>' +
        '<g transform="scale(1,-1) translate(0,-900)">' +
        d.s.map(function (p, i) {
          var med = d.m[i].map(function (pt, k) { return (k ? "L" : "M") + pt[0] + " " + pt[1]; }).join("");
          return '<clipPath id="k' + uid + '_' + i + '"><path d="' + p + '"/></clipPath><path class="sbg" d="' + p + '"/>' +
            '<path class="san" clip-path="url(#k' + uid + '_' + i + ')" d="' + med + '"/>';
        }).join("") + '</g>';
      box.innerHTML = ""; box.appendChild(svg);
      var n = $("#stkn"); if (n) n.textContent = " · 총 " + d.s.length + "획";
      var rp = $("#replay"); if (rp) { rp.hidden = false; rp.onclick = function () { drawStrokes(c, box); }; }
      var paths = Array.from(svg.querySelectorAll(".san"));
      paths.forEach(function (p) { var L = p.getTotalLength() + 140; p.style.strokeDasharray = L + " " + L; p.style.strokeDashoffset = L; p._L = L; });
      var t = 300;
      paths.forEach(function (p) {
        var dur = Math.max(260, p._L * 0.9);
        stkTimers.push(setTimeout(function () { p.style.transition = "stroke-dashoffset " + dur + "ms linear"; p.style.strokeDashoffset = 0; }, t));
        t += dur + 120;
      });
    };
    if (stkCache[c]) return go(stkCache[c]);
    fetch("strokes/" + c.codePointAt(0).toString(16) + ".json").then(function (r) { return r.json(); })
      .then(function (d) { stkCache[c] = d; go(d); }).catch(function () { /* 오프라인 등: 글자만 표시 */ });
  }

  function openWord(w) {
    var x = BYW[w]; if (!x) return;
    openSheet(
      '<div class="stack">' +
      '<div class="hero"><div class="word">' + esc(x.w) + '</div><div class="pinyin">' + esc(x.p) + '</div><div class="meaning">' + esc(x.m) + '</div>' +
      '<div class="small muted">HSK ' + x.lv + '급</div>' +
      '<button class="speak" id="sw">🔊 발음 듣기</button></div>' +
      wordExtra(x) +
      '<div class="chars">' + charTiles(x.w) + '</div></div>');
    $("#sw").onclick = function () { speak(x.w); };
    bindCharTiles(sheetContent); bindExtra(sheetContent);
  }

  // ---------- 단어 구성 풀이 + 예문 ----------
  var EX = window.EX || {};
  function wordExtra(x) {
    var e = EX[x.w]; if (!e) return "";
    var why = e[0], zh = e[1], ko = e[2], out = "";
    if (why) out += '<div class="why"><h3>왜 이 한자들일까?</h3><p>' + esc(why) + '</p></div>';
    if (zh) {
      var hi = esc(zh).split(esc(x.w)).join('<mark>' + esc(x.w) + '</mark>');
      out += '<div class="ex"><div class="ex-h"><h3>예문</h3><button class="speak sm" data-say="' + esc(zh) + '">🔊</button></div>' +
        '<p class="ex-zh">' + hi + '</p><p class="ex-ko">' + esc(ko) + '</p></div>';
    }
    return out;
  }
  function bindExtra(root) {
    root.querySelectorAll("[data-say]").forEach(function (b) { b.onclick = function () { speak(b.dataset.say); }; });
  }

  // ---------- 시작 ----------
  go(["home", "words", "hanzi", "stats"].indexOf(tab) >= 0 ? tab : "home");

  // 오프라인 사용 (http/https에서만 동작)
  if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();
