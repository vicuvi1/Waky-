import { analyzePose, RepCounter, HINTS } from "./pushups.js";
import { startPoseCamera } from "./camera.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fromMin = (n) => `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(Math.round(n % 60)).padStart(2, "0")}`;
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

let state = null;

// ---------- api ----------

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Something went wrong");
  return data;
}

async function refresh() {
  state = await api("GET", "/api/state");
  render();
}

async function act(method, path, body, okMsg) {
  try {
    state = await api(method, path, body);
    render();
    if (okMsg) toast(okMsg);
    return true;
  } catch (e) {
    toast(e.message, true);
    return false;
  }
}

function toast(msg, error = false) {
  const el = $("toast");
  el.textContent = msg;
  el.className = `toast${error ? " error" : ""}`;
  el.hidden = false;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { el.hidden = true; }, error ? 5000 : 2500);
}

// ---------- render ----------

function render() {
  renderToday();
  renderProgress();
  renderSettings();
}

function renderToday() {
  const s = state.stats;
  const now = new Date();
  const h = now.getHours();
  $("greeting").textContent = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  $("today-date").textContent = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

  const t = s.today;
  const hero = $("hero");
  if (t.record) {
    const late = toMin(t.record.time) - toMin(t.record.target);
    const how = t.ontime ? (late <= 0 ? "On time" : `On time · ${late} min after target`) : `${late} min late`;
    hero.className = "hero card done";
    hero.innerHTML = `
      <div>
        <div class="eyebrow">Done for today</div>
        <div class="target">${esc(t.record.time)}</div>
        <div class="status ${t.ontime ? "ok" : "late"}">${how} · ${plural(t.record.reps, "push-up")}</div>
      </div>
      <svg class="hero-check ${t.ontime ? "" : "late"}" viewBox="0 0 52 52"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-16"/></svg>`;
  } else {
    const nowMin = h * 60 + now.getMinutes();
    const target = toMin(t.target);
    const deadline = target + state.settings.grace;
    const missed = nowMin > deadline + 180; // Same cut-off as the nag bot.
    let status;
    if (nowMin < target) status = `<span class="status">Target in ${formatGap(target - nowMin)}</span>`;
    else if (nowMin <= deadline) status = `<span class="status ok">Check in by ${fromMin(deadline)} to be on time</span>`;
    else if (!missed) status = `<span class="status late">Past your on-time window. Check in anyway.</span>`;
    else status = `<span class="status">No check-in this morning. Tomorrow is a fresh one.</span>`;

    const tomorrow = new Date(now.getTime() + 864e5);
    const tWeekend = [0, 6].includes(tomorrow.getDay());
    hero.className = "hero card";
    hero.innerHTML = missed ? `
      <div>
        <div class="eyebrow">Tomorrow · ${tWeekend ? "Weekend" : "Weekday"}</div>
        <div class="target">${esc(tWeekend ? state.settings.weekend : state.settings.weekday)}</div>
        ${status}
      </div>
      <div class="cta">
        <button class="btn ghost" id="start">Check in for today anyway</button>
        <span class="muted small">Set your phone alarm before bed</span>
      </div>` : `
      <div>
        <div class="eyebrow">Wake-up target · ${t.weekend ? "Weekend" : "Weekday"}</div>
        <div class="target">${esc(t.target)}</div>
        ${status}
      </div>
      <div class="cta">
        <button class="btn primary" id="start">Start ${state.settings.reps} push-ups</button>
        <span class="muted small">Camera counts them for you</span>
      </div>`;
    $("start").onclick = () => startSession("checkin");
  }

  $("streak").textContent = s.streak;
  $("streak-unit").textContent = s.streak === 1 ? "day" : "days";
  $("streak-best").textContent = s.best ? `Best: ${plural(s.best, "day")}` : "Your first check-in starts it";

  if (s.next) {
    const span = s.next.days - s.next.from;
    const done = s.streak - s.next.from;
    $("next-title").textContent = s.next.title;
    $("next-bar").style.width = `${Math.max(4, (100 * done) / span)}%`;
    const left = s.next.days - s.streak;
    $("next-sub").textContent = `${plural(left, "more day")} on time to reach day ${s.next.days}`;
  } else {
    $("next-title").textContent = "All milestones reached";
    $("next-bar").style.width = "100%";
    $("next-sub").textContent = "Keep the streak alive.";
  }

  const week = s.calendar.slice(-7);
  const names = ["M", "T", "W", "T", "F", "S", "S"];
  $("week").innerHTML = week.map((d, i) =>
    `<div class="d ${d.status}${d.date === t.date ? " today" : ""}" title="${d.time ? "Up at " + d.time : ""}"><i></i>${names[i]}</div>`).join("");
  const good = week.filter((d) => d.status === "ontime").length;
  const past = week.filter((d) => !["future", "empty"].includes(d.status) && d.status !== "pending").length;
  $("week-sub").textContent = past ? `${good} of ${past} on time` : "Nothing logged yet this week";
}

function formatGap(min) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

function renderProgress() {
  const s = state.stats;
  $("p-streak").textContent = plural(s.streak, "day");
  $("p-best").textContent = plural(s.best, "day");
  $("p-rate").textContent = s.rate == null ? "–" : `${s.rate}%`;
  $("p-avg").textContent = s.avg ?? "–";

  $("calendar").innerHTML = s.calendar.map((d) => {
    const day = Number(d.date.slice(8));
    const label = new Date(d.date + "T12:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
    const tip = d.time ? `${label} · up at ${d.time}` : d.status === "missed" ? `${label} · missed` : "";
    return `<div class="c ${d.status}"${tip ? ` data-tip="${esc(tip)}"` : ""}>${day}</div>`;
  }).join("");

  $("chart").innerHTML = chartSvg(s.chart);

  $("milestones").innerHTML = s.milestones.map((m) => {
    const cls = m.reached ? "reached" : s.next && s.next.days === m.days ? "next" : "";
    return `<li class="${cls}"><div class="badge">${m.days}</div><div><b>${esc(m.title)}</b><p>${esc(m.text)}</p></div></li>`;
  }).join("");

  const rows = Object.entries(state.days).sort(([a], [b]) => b.localeCompare(a));
  $("history").innerHTML = rows.length ? rows.map(([date, r]) => {
    const ontime = toMin(r.time) <= toMin(r.target) + state.settings.grace;
    const label = new Date(date + "T12:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
    const how = r.mode === "manual" ? " · counted by hand" : r.mode === "added" ? " · added by hand" : "";
    return `<div class="row">
      <div class="when"><span class="t">${esc(r.time)}</span> <span class="muted small">· ${label} · target ${esc(r.target)}${how}</span></div>
      <span class="tag ${ontime ? "ontime" : "late"}">${ontime ? "On time" : "Late"}</span>
      <div class="acts"><button class="icon-btn" data-edit="${date}">Edit</button><button class="icon-btn" data-del="${date}">Delete</button></div>
    </div>`;
  }).join("") : `<div class="empty-note">No days yet. Your first check-in shows up here.</div>`;
}

function chartSvg(points) {
  const W = 520, H = 240, L = 46, R = 12, T = 14, B = 26;
  const times = points.flatMap((p) => [toMin(p.target), ...(p.time ? [toMin(p.time)] : [])]);
  let lo = Math.min(...times) - 15, hi = Math.max(...times) + 15;
  lo = Math.floor(lo / 15) * 15; hi = Math.ceil(hi / 15) * 15;
  const x = (i) => L + (i * (W - L - R)) / (points.length - 1);
  const y = (m) => T + ((m - lo) * (H - T - B)) / (hi - lo || 1); // Earlier = higher.
  const step = hi - lo > 120 ? 60 : 30;
  let out = `<svg viewBox="0 0 ${W} ${H}">`;
  for (let m = Math.ceil(lo / step) * step; m <= hi; m += step) {
    out += `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(m)}" y2="${y(m)}"/><text class="axis" x="${L - 8}" y="${y(m) + 4}" text-anchor="end">${fromMin(m)}</text>`;
  }
  out += `<polyline class="target" points="${points.map((p, i) => `${x(i)},${y(toMin(p.target))}`).join(" ")}"/>`;
  let seg = [];
  const segs = [];
  points.forEach((p, i) => {
    if (p.time) seg.push(`${x(i)},${y(toMin(p.time))}`);
    else if (seg.length) { segs.push(seg); seg = []; }
  });
  if (seg.length) segs.push(seg);
  segs.filter((s) => s.length > 1).forEach((s) => { out += `<polyline class="path" points="${s.join(" ")}"/>`; });
  points.forEach((p, i) => {
    if (p.time) out += `<circle class="pt" cx="${x(i)}" cy="${y(toMin(p.time))}" r="6" fill="var(--${p.ontime ? "ontime" : "late"})"><title>${p.date.slice(5)} · ${p.time}</title></circle>`;
    if (i % 2 === (points.length - 1) % 2) out += `<text class="axis" x="${x(i)}" y="${H - 6}" text-anchor="middle">${Number(p.date.slice(8))}</text>`;
  });
  if (!points.some((p) => p.time)) out += `<text class="empty" x="${(L + W) / 2}" y="${H / 2 - 20}" text-anchor="middle">Your wake-up times will show here</text>`;
  return out + "</svg>";
}

function renderSettings() {
  const st = state.settings;
  for (const [id, key] of [["s-weekday", "weekday"], ["s-weekend", "weekend"], ["s-grace", "grace"], ["s-reps", "reps"]]) {
    if (document.activeElement !== $(id)) $(id).value = st[key];
  }
  $("s-sound").checked = st.sound;

  const tg = state.telegram;
  if (tg.connected) {
    $("tg-box").innerHTML = `
      <div class="tg-status"><span class="led"></span><div>Connected to <b>@${esc(tg.bot)}</b>${tg.name ? ` · ${esc(tg.name)}` : ""}</div></div>
      <p class="muted small">Each check-in is posted and pinned there. The nag bot reads the pin to know you're up.
        Its config needs your chat id: <b>${esc(tg.chatId)}</b></p>
      ${tg.error ? `<p class="err">Last check-in didn't go through: ${esc(tg.error)} Waky keeps retrying.</p>` : ""}
      <button class="btn ghost small" id="tg-off">Disconnect</button>`;
    $("tg-off").onclick = () => act("DELETE", "/api/telegram", null, "Disconnected");
  } else {
    $("tg-box").innerHTML = `
      <ol class="steps">
        <li>In @BotFather, revoke the old token and copy the new one.</li>
        <li>Paste it here.</li>
        <li>Open your bot in Telegram and send <b>/start</b>.</li>
        <li>Press Connect.</li>
      </ol>
      <div class="form"><input type="password" id="tg-token" placeholder="Bot token" autocomplete="off"></div>
      <p></p><button class="btn primary" id="tg-connect">Connect</button>`;
    $("tg-connect").onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = "Connecting…";
      await act("POST", "/api/telegram", { token: $("tg-token").value }, "Telegram connected");
      if ($("tg-connect")) { $("tg-connect").disabled = false; $("tg-connect").textContent = "Connect"; }
    };
  }
  $("data-note").textContent = `Data: ${state.dataDir}` + (state.backupDir ? ` · Backup copy: ${state.backupDir}` : "");
}

// ---------- push-up session ----------

let session = null;

async function startSession(mode) {
  const target = mode === "test" ? 999 : state.settings.reps;
  session = { mode, target, reps: 0, stop: null, manual: false, lastValid: performance.now(), done: false };
  $("session").hidden = false;
  $("manual-pad").hidden = true;
  $("session-manual").hidden = true;
  $("count-of").textContent = mode === "test" ? "test" : `/ ${target}`;
  setCount(0);
  hint("Starting camera…");

  const counter = new RepCounter();
  const manualTimer = setTimeout(() => { if (session && !session.manual) $("session-manual").hidden = mode === "test"; }, 20000);
  session.cleanup = () => clearTimeout(manualTimer);

  try {
    hint("Loading the pose model…");
    session.stop = await startPoseCamera($("video"), $("overlay"), (lms, now, aspect) => {
      if (!session || session.manual || session.done) return;
      const pose = analyzePose(lms, aspect);
      const r = counter.push(pose.ok ? pose.elbow : null, now);
      if (!pose.ok) return hint(HINTS[pose.reason], "warn");
      session.lastValid = now;
      if (r.event === "rep") addRep();
      else if (r.event === "shallow") hint("Go lower", "warn");
      else if (r.phase === "wait") hint("Straighten your arms to start", "good");
      else hint(r.phase === "down" ? "Up!" : "Down", "good");
    });
    if (!session) return; // Closed while loading.
  } catch (e) {
    console.error(e);
    if (!session) return;
    hint(e.name === "NotAllowedError" ? "Camera blocked. Allow it in the address bar." : "Camera or pose model failed to load", "warn");
    if (mode !== "test") $("session-manual").hidden = false;
  }
}

function hint(text, tone = "") {
  const el = $("session-hint");
  if (el.textContent !== text) el.textContent = text;
  el.className = `pill ${tone}`;
}

function setCount(n) {
  const el = $("count");
  el.textContent = n;
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
  const frac = session.mode === "test" ? (n % 10) / 10 : Math.min(1, n / session.target);
  $("ring-fg").style.strokeDashoffset = 553 * (1 - frac);
}

function addRep() {
  session.reps += 1;
  setCount(session.reps);
  sound("tick");
  if (session.reps >= session.target) finishSession();
}

function closeSession() {
  if (!session) return;
  session.stop?.();
  session.cleanup?.();
  session = null;
  $("session").hidden = true;
}

async function finishSession() {
  const s = session;
  s.done = true;
  hint("Done!", "good");
  sound("done");
  const prevStreak = state.stats.streak;
  setTimeout(async () => {
    closeSession();
    const ok = await act("POST", "/api/checkin", { reps: s.reps, mode: s.manual ? "manual" : "camera" });
    if (ok) showDone(prevStreak);
  }, 600);
}

function showDone(prevStreak) {
  const s = state.stats;
  const t = s.today;
  $("done-title").textContent = t.ontime ? "You're up." : "You're up. Late, but up.";
  $("done-sub").textContent = `Checked in at ${t.record.time} · ${plural(t.record.reps, "push-up")}`;
  const m = s.hit;
  $("done-milestone").hidden = !m;
  if (m) $("done-milestone").innerHTML = `<b>🏆 Day ${m.days} · ${esc(m.title)}</b>${esc(m.text)}`;
  $("done").hidden = false;
  $("done-streak-label").textContent = s.streak ? "day streak" : "Streak reset. On time tomorrow starts a new one.";
  $("done-streak").hidden = !s.streak;
  countUp($("done-streak"), Math.min(prevStreak, s.streak), s.streak);
  confetti($("confetti"), m ? 220 : 120);
}

function countUp(el, from, to) {
  el.textContent = from;
  if (from === to) return;
  setTimeout(() => { el.textContent = to; el.animate([{ transform: "scale(1.4)" }, { transform: "scale(1)" }], { duration: 500, easing: "ease-out" }); }, 700);
}

// ---------- effects ----------

let audio = null;
function sound(kind) {
  if (!state.settings.sound) return;
  audio ??= new AudioContext();
  const notes = kind === "tick" ? [[880, 0, 0.08]] : [[523, 0, 0.18], [659, 0.12, 0.18], [784, 0.24, 0.18], [1047, 0.36, 0.4]];
  for (const [freq, at, dur] of notes) {
    const o = audio.createOscillator(), g = audio.createGain();
    o.type = "sine";
    o.frequency.value = freq;
    const t0 = audio.currentTime + at;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(audio.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.05);
  }
}

function confetti(canvas, count) {
  const ctx = canvas.getContext("2d");
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  const colors = ["#ffb547", "#ff8a3d", "#34d399", "#f4f4f6", "#fbbf24"];
  const parts = Array.from({ length: count }, () => ({
    x: canvas.width / 2, y: canvas.height * 0.42,
    vx: (Math.random() - 0.5) * 26 * devicePixelRatio, vy: (-Math.random() * 22 - 6) * devicePixelRatio,
    r: (Math.random() * 5 + 3) * devicePixelRatio, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3,
    c: colors[(Math.random() * colors.length) | 0],
  }));
  const start = performance.now();
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of parts) {
      p.vy += 0.6 * devicePixelRatio; p.vx *= 0.985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - t / 2600);
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.fillStyle = p.c;
      ctx.fillRect(-p.r, -p.r / 2, p.r * 2, p.r);
      ctx.restore();
    }
    if (t < 2600) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, canvas.width, canvas.height);
  };
  requestAnimationFrame(frame);
}

// ---------- events ----------

document.querySelectorAll(".tab").forEach((tab) => {
  tab.onclick = () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t === tab));
    document.querySelectorAll(".view").forEach((v) => v.classList.toggle("active", v.id === `view-${tab.dataset.view}`));
  };
});

$("session-close").onclick = closeSession;
$("session-manual").onclick = () => {
  session.manual = true;
  session.stop?.();
  $("session-manual").hidden = true;
  $("manual-pad").hidden = false;
  hint("Counting by hand");
};
$("manual-tap").onclick = () => { if (session && !session.done) addRep(); };
$("done-close").onclick = () => { $("done").hidden = true; };
$("cam-test").onclick = () => startSession("test");
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeSession(); $("done").hidden = true; } });

const saveSetting = (key, value) => act("POST", "/api/settings", { [key]: value }, "Saved");
$("s-weekday").onchange = (e) => saveSetting("weekday", e.target.value);
$("s-weekend").onchange = (e) => saveSetting("weekend", e.target.value);
$("s-grace").onchange = (e) => saveSetting("grace", e.target.value);
$("s-reps").onchange = (e) => saveSetting("reps", e.target.value);
$("s-sound").onchange = (e) => saveSetting("sound", e.target.checked);
document.querySelectorAll("[data-step]").forEach((b) => {
  b.onclick = () => saveSetting("reps", Math.max(1, Number($("s-reps").value) + Number(b.dataset.step)));
});

$("history").onclick = (e) => {
  const del = e.target.dataset.del, edit = e.target.dataset.edit;
  if (del && confirm(`Delete ${del}?`)) act("DELETE", `/api/days/${del}`, null, "Deleted");
  if (edit) openDayDialog(edit);
};
$("add-day").onclick = () => openDayDialog(null);

function openDayDialog(date) {
  const today = state.stats.today.date;
  $("day-dialog-title").textContent = date ? "Edit day" : "Add a day";
  $("d-date").value = date || today;
  $("d-date").max = today;
  $("d-date").disabled = !!date;
  $("d-time").value = date ? state.days[date].time : state.stats.today.target;
  $("day-dialog").showModal();
}
$("day-dialog").addEventListener("close", () => {
  if ($("day-dialog").returnValue === "save") {
    act("POST", "/api/days", { date: $("d-date").value, time: $("d-time").value }, "Saved");
  }
});

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}
setInterval(tick, 1000);
tick();
setInterval(() => refresh().catch(() => {}), 60000); // Also tells the server the window is still open.
addEventListener("focus", () => refresh().catch(() => {}));
refresh().catch((e) => toast(e.message, true));
