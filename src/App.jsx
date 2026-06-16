import React, { useState, useEffect, useCallback, useMemo } from "react";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, doc,
  getDocs, setDoc, deleteDoc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ────────────────────────────────────────────────────────────
   Casa Alegria — Events & Bookings Calendar
   Backed by Firebase Firestore for real-time shared storage.
──────────────────────────────────────────────────────────── */

const firebaseConfig = {
  apiKey: "AIzaSyDfg1vpXJ_RJc-SrI-TO5YiGxC2ODDQr3o",
  authDomain: "casa-alegria-calendar.firebaseapp.com",
  projectId: "casa-alegria-calendar",
  storageBucket: "casa-alegria-calendar.firebasestorage.app",
  messagingSenderId: "997828783656",
  appId: "1:997828783656:web:c0dfbb9a53c73198968f1d"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const eventsCol = collection(db, "events");
const configDoc = doc(db, "config", "main");

const SPACES = {
  dome:   { name: "Butterfly Dome", color: "#E2922F", soft: "#FAEACD", ink: "#7A4E12" },
  studio: { name: "Yoga Studio",    color: "#3F8466", soft: "#DCEDE3", ink: "#23503D" },
  cafe:   { name: "Café",           color: "#C5604A", soft: "#F6DDD4", ink: "#7C3322" },
};
const SPACE_KEYS = Object.keys(SPACES);
const DEFAULT_PASSWORD = "alegria";
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DOW = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

const pad = (n) => String(n).padStart(2, "0");
const toKey = (y, m, d) => `${y}-${pad(m + 1)}-${pad(d)}`;
const todayKey = () => { const t = new Date(); return toKey(t.getFullYear(), t.getMonth(), t.getDate()); };
const parseKey = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d); };
const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const ap = h >= 12 ? "pm" : "am";
  const hh = h % 12 === 0 ? 12 : h % 12;
  return m === 0 ? `${hh}${ap}` : `${hh}:${pad(m)}${ap}`;
};
const fmtLongDate = (k) =>
  parseKey(k).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function sampleEvents() {
  const t = new Date();
  const y = t.getFullYear(), m = t.getMonth();
  const day = (d) => toKey(y, m, Math.min(d, 28));
  return [
    { id: uid(), title: "Morning Vinyasa Flow", space: "studio", date: day(t.getDate() + 1), start: "08:00", end: "09:15", privacy: "public", host: "Marisol", desc: "All-levels flow to start the day. Mats provided." },
    { id: uid(), title: "Butterfly Release Ceremony", space: "dome", date: day(t.getDate() + 3), start: "17:00", end: "18:30", privacy: "public", host: "Casa Alegria", desc: "Monthly release in the dome — family friendly." },
    { id: uid(), title: "Private rental", space: "dome", date: day(t.getDate() + 5), start: "13:00", end: "16:00", privacy: "reserved", host: "", desc: "Birthday party booking." },
    { id: uid(), title: "Open Mic & Coffee", space: "cafe", date: day(t.getDate() + 6), start: "19:00", end: "21:00", privacy: "public", host: "Café team", desc: "Sign up at the counter. Free entry." },
  ];
}

export default function App() {
  const [events, setEvents]         = useState([]);
  const [config, setConfig]         = useState({ password: DEFAULT_PASSWORD });
  const [loading, setLoading]       = useState(true);
  const [err, setErr]               = useState(null);
  const [saving, setSaving]         = useState(false);

  const now = new Date();
  const [year, setYear]             = useState(now.getFullYear());
  const [month, setMonth]           = useState(now.getMonth());
  const [view, setView]             = useState("month");
  const [filters, setFilters]       = useState({ dome: true, studio: true, cafe: true });
  const [selectedDay, setSelectedDay] = useState(null);

  const [isAdmin, setIsAdmin]       = useState(() => localStorage.getItem("ca-admin") === "true");
  const [showPwd, setShowPwd]       = useState(false);
  const [editing, setEditing]       = useState(null);
  const [showSettings, setShowSettings] = useState(false);

  /* ── load from Firestore ── */
  useEffect(() => {
    (async () => {
      try {
        // Load config (password)
        try {
          const snap = await getDoc(configDoc);
          if (snap.exists()) setConfig(snap.data());
        } catch { /* keep default */ }

        // Load events
        const snap = await getDocs(eventsCol);
        let evs = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Seed sample events if empty
        if (evs.length === 0) {
          evs = sampleEvents();
          await Promise.all(evs.map(e => setDoc(doc(db, "events", e.id), e)));
        }

        setEvents(evs);
      } catch (e) {
        setErr("Couldn't connect to the calendar database. Check your internet connection and try refreshing.");
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* ── Firestore write helpers ── */
  const saveEvent = useCallback(async (ev) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "events", ev.id), ev);
      setEvents(prev => {
        const exists = prev.some(e => e.id === ev.id);
        return exists ? prev.map(e => e.id === ev.id ? ev : e) : [...prev, ev];
      });
      setEditing(null);
    } catch (e) {
      setErr("Couldn't save the event. Please try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  const deleteEvent = useCallback(async (id) => {
    setSaving(true);
    try {
      await deleteDoc(doc(db, "events", id));
      setEvents(prev => prev.filter(e => e.id !== id));
      setEditing(null);
    } catch (e) {
      setErr("Couldn't delete the event. Please try again.");
    } finally {
      setSaving(false);
    }
  }, []);

  const saveConfig = useCallback(async (newConfig) => {
    try {
      await setDoc(configDoc, newConfig);
      setConfig(newConfig);
    } catch {
      setErr("Couldn't save settings.");
    }
  }, []);

  /* ── derived ── */
  const eventsByDay = useMemo(() => {
    const map = {};
    for (const e of events) {
      if (!filters[e.space]) continue;
      (map[e.date] ||= []).push(e);
    }
    for (const k in map) map[k].sort((a, b) => (a.start || "").localeCompare(b.start || ""));
    return map;
  }, [events, filters]);

  const grid = useMemo(() => {
    const first = new Date(year, month, 1).getDay();
    const days  = new Date(year, month + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < first; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(toKey(year, month, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [year, month]);

  const upcoming = useMemo(() => {
    const tk = todayKey();
    return events
      .filter(e => filters[e.space] && e.date >= tk)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 40);
  }, [events, filters]);

  const goMonth = (delta) => {
    let m = month + delta, y = year;
    if (m < 0) { m = 11; y--; } if (m > 11) { m = 0; y++; }
    setMonth(m); setYear(y); setSelectedDay(null);
  };
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); setSelectedDay(todayKey()); };
  const toggleFilter = (k) => setFilters(f => ({ ...f, [k]: !f[k] }));
  const tryLogout = () => { setIsAdmin(false); localStorage.removeItem("ca-admin"); setEditing(null); setShowSettings(false); };

  return (
    <div className="ca-root">
      <Style />
      <Butterfly />

      <header className="ca-header">
        <div className="ca-brand">
          <DomeMark />
          <div>
            <h1 className="ca-title">Casa Alegria</h1>
            <p className="ca-sub">Events &amp; space bookings</p>
          </div>
        </div>

        <div className="ca-head-actions">
          <div className="ca-view-toggle" role="tablist" aria-label="Calendar view">
            <button role="tab" aria-selected={view === "month"} className={view === "month" ? "on" : ""} onClick={() => setView("month")}>Month</button>
            <button role="tab" aria-selected={view === "agenda"} className={view === "agenda" ? "on" : ""} onClick={() => setView("agenda")}>Agenda</button>
          </div>
          {isAdmin ? (
            <div className="ca-admin-cluster">
              <span className="ca-badge">Admin</span>
              <button className="ca-icon-btn" title="Settings" aria-label="Settings" onClick={() => setShowSettings(true)}>⚙</button>
              <button className="ca-text-btn" onClick={tryLogout}>Lock</button>
            </div>
          ) : (
            <button className="ca-icon-btn ca-fly-btn" title="Admin sign-in" aria-label="Admin sign-in" onClick={() => setShowPwd(true)}>
              <svg width="22" height="19" viewBox="0 0 34 30" aria-hidden="true">
                <path d="M17 15 C9 2 -2 6 4 14 C-1 20 9 24 17 15 Z" fill="#E2922F" opacity="0.9"/>
                <path d="M17 15 C25 2 36 6 30 14 C35 20 25 24 17 15 Z" fill="#C5604A" opacity="0.9"/>
                <rect x="16.2" y="6" width="1.6" height="18" rx="0.8" fill="#23503D"/>
              </svg>
            </button>
          )}
        </div>
      </header>

      <div className="ca-legend">
        {SPACE_KEYS.map(k => (
          <button key={k} className={`ca-chip ${filters[k] ? "" : "off"}`} onClick={() => toggleFilter(k)}
            style={{ "--c": SPACES[k].color, "--soft": SPACES[k].soft }} aria-pressed={filters[k]}>
            <span className="ca-dot" /> {SPACES[k].name}
          </button>
        ))}
      </div>

      {err && <div className="ca-error" role="alert">{err} <button className="ca-text-btn sm" onClick={() => setErr(null)}>✕</button></div>}
      {saving && <div className="ca-saving">Saving…</div>}

      {loading ? (
        <div className="ca-loading">Opening the doors…</div>
      ) : view === "month" ? (
        <main className="ca-cal">
          <div className="ca-monthbar">
            <button className="ca-nav" onClick={() => goMonth(-1)} aria-label="Previous month">‹</button>
            <h2 className="ca-month">{MONTHS[month]} <span>{year}</span></h2>
            <button className="ca-nav" onClick={() => goMonth(1)} aria-label="Next month">›</button>
            <button className="ca-today" onClick={goToday}>Today</button>
            {isAdmin && (
              <button className="ca-add" onClick={() => setEditing(blankEvent(selectedDay))}>+ New event</button>
            )}
          </div>

          <div className="ca-dow">{DOW.map(d => <div key={d}>{d}</div>)}</div>

          <div className="ca-grid">
            {grid.map((k, i) => {
              if (!k) return <div key={i} className="ca-cell empty" />;
              const dayEvents = eventsByDay[k] || [];
              const isToday = k === todayKey();
              const isSel   = k === selectedDay;
              return (
                <button key={k} className={`ca-cell ${isToday ? "today" : ""} ${isSel ? "sel" : ""}`}
                  onClick={() => setSelectedDay(k)}>
                  <span className="ca-daynum">{Number(k.split("-")[2])}</span>
                  <span className="ca-pills">
                    {dayEvents.slice(0, 3).map(e => (
                      <span key={e.id} className="ca-pill" style={{ "--c": SPACES[e.space].color, "--soft": SPACES[e.space].soft }}>
                        {e.start && <b>{fmtTime(e.start)}</b>}{" "}
                        {e.privacy === "reserved" && !isAdmin ? "Reserved" : e.title}
                      </span>
                    ))}
                    {dayEvents.length > 3 && <span className="ca-more">+{dayEvents.length - 3} more</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </main>
      ) : (
        <main className="ca-agenda">
          {upcoming.length === 0 && <div className="ca-empty">No upcoming events in the spaces you're viewing.</div>}
          {upcoming.map(e => (
            <button key={e.id} className="ca-agenda-row" onClick={() => { setSelectedDay(e.date); setView("month"); }}>
              <span className="ca-agenda-date">
                <b>{parseKey(e.date).getDate()}</b>
                <i>{MONTHS[parseKey(e.date).getMonth()].slice(0, 3)}</i>
              </span>
              <span className="ca-agenda-bar" style={{ background: SPACES[e.space].color }} />
              <span className="ca-agenda-main">
                <span className="ca-agenda-title">{e.privacy === "reserved" && !isAdmin ? `Reserved — ${SPACES[e.space].name}` : e.title}</span>
                <span className="ca-agenda-meta">
                  {SPACES[e.space].name}{e.start ? ` · ${fmtTime(e.start)}${e.end ? `–${fmtTime(e.end)}` : ""}` : ""}
                </span>
              </span>
            </button>
          ))}
        </main>
      )}

      {selectedDay && view === "month" && (
        <DayPanel dayKey={selectedDay} events={eventsByDay[selectedDay] || []}
          isAdmin={isAdmin} onClose={() => setSelectedDay(null)}
          onAdd={() => setEditing(blankEvent(selectedDay))}
          onEdit={e => setEditing(e)} />
      )}

      {showPwd && (
        <PasswordModal onClose={() => setShowPwd(false)}
          onSubmit={p => {
            if (p === config.password) { setIsAdmin(true); localStorage.setItem("ca-admin", "true"); setShowPwd(false); }
            else return "That password doesn't match. Try again.";
          }} />
      )}

      {showSettings && isAdmin && (
        <SettingsModal current={config.password} onClose={() => setShowSettings(false)}
          onSave={async np => { await saveConfig({ ...config, password: np }); setShowSettings(false); }} />
      )}

      {editing && isAdmin && (
        <EventEditor event={editing} saving={saving}
          onCancel={() => setEditing(null)} onSave={saveEvent} onDelete={deleteEvent} />
      )}

      <footer className="ca-footer">
        <span>Casa Alegria · Butterfly Dome · Yoga Studio · Café</span>
        <span className="ca-foot-note">Public calendar. Tap a day to see what's on.</span>
      </footer>
    </div>
  );
}

/* ───────────────────────── components ───────────────────────── */

function blankEvent(dateKey) {
  return { id: uid(), title: "", space: "dome", date: dateKey || todayKey(), start: "10:00", end: "11:00", privacy: "public", host: "", desc: "" };
}

function DayPanel({ dayKey, events, isAdmin, onClose, onAdd, onEdit }) {
  return (
    <div className="ca-overlay" onClick={onClose}>
      <aside className="ca-panel" onClick={e => e.stopPropagation()}>
        <div className="ca-panel-head">
          <h3>{fmtLongDate(dayKey)}</h3>
          <button className="ca-close" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {events.length === 0 ? (
          <p className="ca-empty">Nothing scheduled. {isAdmin ? "Add the first event below." : "The spaces are open this day."}</p>
        ) : (
          <ul className="ca-day-list">
            {events.map(e => (
              <li key={e.id} className="ca-day-item" style={{ "--c": SPACES[e.space].color, "--soft": SPACES[e.space].soft }}>
                <div className="ca-day-item-head">
                  <span className="ca-space-tag">{SPACES[e.space].name}</span>
                  {isAdmin && <button className="ca-text-btn sm" onClick={() => onEdit(e)}>Edit</button>}
                </div>
                <strong>{e.privacy === "reserved" && !isAdmin ? "Reserved" : e.title}</strong>
                {(e.start || e.end) && <span className="ca-day-time">{fmtTime(e.start)}{e.end ? `–${fmtTime(e.end)}` : ""}</span>}
                {!(e.privacy === "reserved" && !isAdmin) && e.host && <span className="ca-day-host">with {e.host}</span>}
                {!(e.privacy === "reserved" && !isAdmin) && e.desc && <p className="ca-day-desc">{e.desc}</p>}
                {isAdmin && e.privacy === "reserved" && <span className="ca-priv">Private booking — public sees "Reserved"</span>}
              </li>
            ))}
          </ul>
        )}
        {isAdmin && <button className="ca-add full" onClick={onAdd}>+ New event this day</button>}
      </aside>
    </div>
  );
}

function PasswordModal({ onClose, onSubmit }) {
  const [val, setVal] = useState("");
  const [error, setError] = useState("");
  const submit = () => { const msg = onSubmit(val); if (msg) setError(msg); };
  return (
    <div className="ca-overlay center" onClick={onClose}>
      <div className="ca-modal" onClick={e => e.stopPropagation()}>
        <h3>Admin sign-in</h3>
        <p className="ca-modal-sub">Enter the password to add or edit events.</p>
        <input autoFocus type="password" className="ca-input" placeholder="Password" value={val}
          onChange={e => { setVal(e.target.value); setError(""); }}
          onKeyDown={e => e.key === "Enter" && submit()} />
        {error && <span className="ca-field-err">{error}</span>}
        <div className="ca-modal-actions">
          <button className="ca-text-btn" onClick={onClose}>Cancel</button>
          <button className="ca-add" onClick={submit}>Unlock</button>
        </div>
      </div>
    </div>
  );
}

function SettingsModal({ current, onClose, onSave }) {
  const [np, setNp] = useState("");
  return (
    <div className="ca-overlay center" onClick={onClose}>
      <div className="ca-modal" onClick={e => e.stopPropagation()}>
        <h3>Settings</h3>
        <label className="ca-label">New admin password</label>
        <input type="text" className="ca-input" placeholder="Leave blank to keep current" value={np} onChange={e => setNp(e.target.value)} />
        <p className="ca-modal-sub">Shared by everyone who manages the calendar.</p>
        <div className="ca-modal-actions">
          <button className="ca-text-btn" onClick={onClose}>Close</button>
          <button className="ca-add" onClick={() => onSave(np.trim() ? np.trim() : current)}>Save</button>
        </div>
      </div>
    </div>
  );
}

function EventEditor({ event, saving, onCancel, onSave, onDelete }) {
  const [f, setF] = useState(event);
  const set = (k, v) => setF(p => ({ ...p, [k]: v }));
  const valid = f.title.trim() && f.date;
  return (
    <div className="ca-overlay center" onClick={onCancel}>
      <div className="ca-modal wide" onClick={e => e.stopPropagation()}>
        <h3>{event.title ? "Edit event" : "New event"}</h3>

        <label className="ca-label">Title</label>
        <input className="ca-input" value={f.title} autoFocus onChange={e => set("title", e.target.value)} placeholder="e.g. Sunset Yoga" />

        <label className="ca-label">Space</label>
        <div className="ca-space-picker">
          {SPACE_KEYS.map(k => (
            <button key={k} className={`ca-space-opt ${f.space === k ? "on" : ""}`} style={{ "--c": SPACES[k].color }}
              onClick={() => set("space", k)}>{SPACES[k].name}</button>
          ))}
        </div>

        <div className="ca-row3">
          <div>
            <label className="ca-label">Date</label>
            <input type="date" className="ca-input" value={f.date} onChange={e => set("date", e.target.value)} />
          </div>
          <div>
            <label className="ca-label">Start</label>
            <input type="time" className="ca-input" value={f.start} onChange={e => set("start", e.target.value)} />
          </div>
          <div>
            <label className="ca-label">End</label>
            <input type="time" className="ca-input" value={f.end} onChange={e => set("end", e.target.value)} />
          </div>
        </div>

        <label className="ca-label">Host / contact (optional)</label>
        <input className="ca-input" value={f.host} onChange={e => set("host", e.target.value)} placeholder="e.g. Marisol" />

        <label className="ca-label">Visibility</label>
        <div className="ca-space-picker">
          <button className={`ca-space-opt ${f.privacy === "public" ? "on" : ""}`} style={{ "--c": "#3F8466" }} onClick={() => set("privacy", "public")}>Public event</button>
          <button className={`ca-space-opt ${f.privacy === "reserved" ? "on" : ""}`} style={{ "--c": "#8A8A8A" }} onClick={() => set("privacy", "reserved")}>Private booking</button>
        </div>
        <p className="ca-hint">Private bookings show the public only that the space is reserved — no title or details.</p>

        <label className="ca-label">Description (optional)</label>
        <textarea className="ca-input area" rows={3} value={f.desc} onChange={e => set("desc", e.target.value)} placeholder="Details for attendees…" />

        <div className="ca-modal-actions split">
          {event.title ? <button className="ca-text-btn danger" disabled={saving} onClick={() => onDelete(f.id)}>Delete</button> : <span />}
          <div>
            <button className="ca-text-btn" onClick={onCancel}>Cancel</button>
            <button className="ca-add" disabled={!valid || saving} onClick={() => valid && !saving && onSave(f)}>
              {saving ? "Saving…" : "Save event"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function DomeMark() {
  // Dome base aligned with mountain bases at y=42
  return (
    <svg width="64" height="52" viewBox="0 0 64 52" aria-hidden="true" className="ca-dome">
      {/* Back mountains (lighter) */}
      <path d="M0 42 L11 14 L22 42 Z" fill="#3F8466" opacity="0.22" />
      <path d="M42 42 L53 10 L64 42 Z" fill="#3F8466" opacity="0.22" />
      {/* Front mountains (darker) */}
      <path d="M2 42 L13 22 L24 42 Z" fill="#3F8466" opacity="0.38" />
      <path d="M40 42 L51 18 L62 42 Z" fill="#3F8466" opacity="0.38" />
      {/* Valley floor */}
      <line x1="0" y1="42" x2="64" y2="42" stroke="#3F8466" strokeWidth="1" opacity="0.25" />
      {/* Dome — base at y=42, apex at y=22, half-circle proportions */}
      <path d="M32 22 C23 22 18 31 18 42 H46 C46 31 41 22 32 22 Z" fill="none" stroke="#1C2E27" strokeWidth="1.8" />
      <path d="M32 22 V42 M18 42 H46 M20 28 H44 M18 35 H46 M32 22 C28 26 26 33 25 42 M32 22 C36 26 38 33 39 42" fill="none" stroke="#1C2E27" strokeWidth="1" opacity="0.45" />
      <circle cx="32" cy="42" r="2" fill="#E2922F" />
    </svg>
  );
}

function Butterfly() {
  return (
    <svg className="ca-fly" width="34" height="30" viewBox="0 0 34 30" aria-hidden="true">
      <g className="ca-fly-wings">
        <path d="M17 15 C9 2 -2 6 4 14 C-1 20 9 24 17 15 Z" fill="#E2922F" opacity="0.9" />
        <path d="M17 15 C25 2 36 6 30 14 C35 20 25 24 17 15 Z" fill="#C5604A" opacity="0.9" />
      </g>
      <rect x="16.2" y="6" width="1.6" height="18" rx="0.8" fill="#23503D" />
    </svg>
  );
}

function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700&family=Hanken+Grotesk:wght@400;500;600;700&display=swap');

.ca-root{
  --bg:#EDF1E9; --surface:#FCFCF8; --ink:#1C2E27; --muted:#5E6E64;
  --line:#D6DED1; --green:#3F8466; --amber:#E2922F; --clay:#C5604A;
  min-height:100vh; background:
    radial-gradient(1100px 520px at 78% -8%, #FBEACB55, transparent 60%),
    radial-gradient(900px 520px at 8% 4%, #DCEDE388, transparent 55%),
    var(--bg);
  color:var(--ink); font-family:'Hanken Grotesk',system-ui,sans-serif;
  padding:18px clamp(12px,4vw,40px) 64px; position:relative; overflow-x:hidden;
}
.ca-root *{box-sizing:border-box}
.ca-root button{font-family:inherit;cursor:pointer}
.ca-root button:focus-visible,.ca-root input:focus-visible,.ca-root textarea:focus-visible{outline:2.5px solid var(--green);outline-offset:2px}

/* header */
.ca-header{display:flex;justify-content:space-between;align-items:center;gap:16px;flex-wrap:wrap;margin-bottom:14px}
.ca-brand{display:flex;align-items:center;gap:12px}
.ca-dome{color:var(--green);flex:none;overflow:visible}
.ca-fly-btn{overflow:hidden}
.ca-title{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(26px,4.6vw,40px);line-height:.95;margin:0;letter-spacing:-.5px}
.ca-sub{margin:2px 0 0;color:var(--muted);font-size:13px;font-weight:500;letter-spacing:.2px}
.ca-head-actions{display:flex;align-items:center;gap:10px}
.ca-view-toggle{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:999px;padding:3px}
.ca-view-toggle button{border:none;background:none;padding:7px 16px;border-radius:999px;font-size:13.5px;font-weight:600;color:var(--muted)}
.ca-view-toggle button.on{background:var(--ink);color:#fff}
.ca-icon-btn{width:40px;height:40px;border-radius:50%;border:1px solid var(--line);background:var(--surface);font-size:16px;display:grid;place-items:center}
.ca-icon-btn:hover{border-color:var(--green)}
.ca-text-btn{border:none;background:none;color:var(--muted);font-weight:600;font-size:13.5px;padding:8px 10px;border-radius:8px}
.ca-text-btn:hover{color:var(--ink);background:#0000000a}
.ca-text-btn.sm{font-size:12px;padding:4px 8px}
.ca-text-btn.danger{color:var(--clay)}
.ca-admin-cluster{display:flex;align-items:center;gap:6px}
.ca-badge{background:var(--green);color:#fff;font-size:11px;font-weight:700;letter-spacing:.5px;text-transform:uppercase;padding:5px 9px;border-radius:999px}

/* legend */
.ca-legend{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.ca-chip{display:inline-flex;align-items:center;gap:8px;border:1px solid var(--line);background:var(--soft);
  color:var(--ink);padding:7px 13px;border-radius:999px;font-size:13px;font-weight:600}
.ca-chip .ca-dot{width:10px;height:10px;border-radius:50%;background:var(--c)}
.ca-chip.off{background:var(--surface);color:var(--muted);opacity:.6}
.ca-chip.off .ca-dot{background:var(--muted)}

.ca-error{background:#F6DDD4;color:#7C3322;padding:10px 14px;border-radius:10px;font-size:13.5px;margin-bottom:12px;font-weight:500;display:flex;justify-content:space-between;align-items:center}
.ca-saving{background:#DCEDE3;color:#23503D;padding:8px 14px;border-radius:10px;font-size:13px;margin-bottom:10px;font-weight:600}
.ca-loading,.ca-empty{color:var(--muted);text-align:center;padding:48px 12px;font-size:15px}

/* month bar */
.ca-monthbar{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap}
.ca-month{font-family:'Fraunces',serif;font-weight:600;font-size:clamp(20px,3vw,28px);margin:0 4px}
.ca-month span{color:var(--muted);font-weight:500}
.ca-nav{width:36px;height:36px;border-radius:10px;border:1px solid var(--line);background:var(--surface);font-size:20px;line-height:1;color:var(--ink)}
.ca-nav:hover{border-color:var(--green)}
.ca-today{margin-left:4px;border:1px solid var(--line);background:var(--surface);border-radius:999px;padding:8px 15px;font-weight:600;font-size:13px;color:var(--ink)}
.ca-add{margin-left:auto;background:var(--green);color:#fff;border:none;border-radius:999px;padding:9px 18px;font-weight:600;font-size:13.5px}
.ca-add:hover{filter:brightness(1.05)}
.ca-add:disabled{opacity:.4;cursor:not-allowed}
.ca-add.full{margin:14px 0 0;width:100%}

/* grid */
.ca-dow{display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:6px}
.ca-dow div{text-align:center;font-size:11.5px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.ca-grid{display:grid;grid-template-columns:repeat(7,1fr);gap:6px}
.ca-cell{min-height:104px;width:100%;min-width:0;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:7px 7px 6px;
  text-align:left;display:flex;flex-direction:column;gap:4px;transition:border-color .12s,box-shadow .12s}
.ca-cell.empty{background:transparent;border:none}
.ca-cell:not(.empty):hover{border-color:var(--green);box-shadow:0 3px 12px #3f846618}
.ca-cell.today{border-color:var(--amber);box-shadow:inset 0 0 0 1px var(--amber)}
.ca-cell.sel{border-color:var(--green);box-shadow:0 0 0 2px var(--green)}
.ca-daynum{font-size:13px;font-weight:700;color:var(--ink)}
.ca-cell.today .ca-daynum{color:var(--amber)}
.ca-pills{display:flex;flex-direction:column;gap:3px;overflow:hidden}
.ca-pill{font-size:11px;line-height:1.25;background:var(--soft);color:var(--ink);border-left:3px solid var(--c);
  padding:2px 5px;border-radius:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ca-pill b{font-weight:700}
.ca-more{font-size:10.5px;color:var(--muted);font-weight:600;padding-left:3px}

/* agenda */
.ca-agenda{display:flex;flex-direction:column;gap:8px;max-width:680px}
.ca-agenda-row{display:flex;align-items:stretch;gap:0;background:var(--surface);border:1px solid var(--line);
  border-radius:12px;overflow:hidden;text-align:left;padding:0}
.ca-agenda-row:hover{border-color:var(--green)}
.ca-agenda-date{display:flex;flex-direction:column;align-items:center;justify-content:center;width:62px;padding:12px 0;flex:none}
.ca-agenda-date b{font-family:'Fraunces',serif;font-size:22px;line-height:1}
.ca-agenda-date i{font-style:normal;font-size:11px;font-weight:700;text-transform:uppercase;color:var(--muted);letter-spacing:.5px}
.ca-agenda-bar{width:4px;flex:none}
.ca-agenda-main{display:flex;flex-direction:column;gap:2px;padding:12px 14px;justify-content:center}
.ca-agenda-title{font-weight:600;font-size:15px}
.ca-agenda-meta{font-size:12.5px;color:var(--muted)}

/* overlay + panel */
.ca-overlay{position:fixed;inset:0;background:#1c2e2740;backdrop-filter:blur(2px);z-index:40;display:flex}
.ca-overlay.center{align-items:center;justify-content:center;padding:18px}
.ca-panel{margin-left:auto;width:min(420px,100%);height:100%;background:var(--surface);padding:22px;overflow-y:auto;
  box-shadow:-12px 0 40px #1c2e2722;animation:slideIn .22s ease}
@keyframes slideIn{from{transform:translateX(30px);opacity:0}to{transform:none;opacity:1}}
.ca-panel-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.ca-panel-head h3{font-family:'Fraunces',serif;font-weight:600;font-size:20px;margin:0;line-height:1.15}
.ca-close{border:none;background:none;font-size:16px;color:var(--muted);padding:4px 8px;border-radius:8px}
.ca-close:hover{background:#0000000a;color:var(--ink)}
.ca-day-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
.ca-day-item{background:var(--soft);border-left:4px solid var(--c);border-radius:10px;padding:11px 13px;display:flex;flex-direction:column;gap:3px}
.ca-day-item-head{display:flex;justify-content:space-between;align-items:center}
.ca-space-tag{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--c)}
.ca-day-item strong{font-size:15.5px}
.ca-day-time{font-size:13px;color:var(--muted);font-weight:600}
.ca-day-host{font-size:13px;color:var(--muted)}
.ca-day-desc{font-size:13.5px;margin:4px 0 0;line-height:1.45}
.ca-priv{font-size:11.5px;color:var(--muted);font-style:italic;margin-top:3px}

/* modal */
.ca-modal{background:var(--surface);border-radius:18px;padding:24px;width:min(380px,100%);box-shadow:0 24px 60px #1c2e2733;animation:pop .18s ease}
.ca-modal.wide{width:min(480px,100%);max-height:90vh;overflow-y:auto}
@keyframes pop{from{transform:scale(.97);opacity:0}to{transform:none;opacity:1}}
.ca-modal h3{font-family:'Fraunces',serif;font-weight:600;font-size:21px;margin:0 0 4px}
.ca-modal-sub{color:var(--muted);font-size:13px;margin:0 0 14px}
.ca-label{display:block;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:var(--muted);margin:12px 0 5px}
.ca-input{width:100%;border:1px solid var(--line);border-radius:10px;padding:10px 12px;font-size:14.5px;background:#fff;color:var(--ink);font-family:inherit}
.ca-input:focus{border-color:var(--green)}
.ca-input.area{resize:vertical}
.ca-field-err,.ca-hint{display:block;font-size:12.5px;margin-top:6px}
.ca-field-err{color:var(--clay);font-weight:600}
.ca-hint{color:var(--muted)}
.ca-space-picker{display:flex;gap:7px;flex-wrap:wrap}
.ca-space-opt{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:8px 14px;font-size:13px;font-weight:600;color:var(--muted)}
.ca-space-opt.on{border-color:var(--c);color:var(--c);background:color-mix(in srgb,var(--c) 9%,#fff)}
.ca-row3{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px}
.ca-modal-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:18px;align-items:center}
.ca-modal-actions.split{justify-content:space-between}
.ca-modal-actions.split>div{display:flex;gap:8px}

/* footer */
.ca-footer{margin-top:30px;padding-top:16px;border-top:1px solid var(--line);display:flex;justify-content:space-between;
  flex-wrap:wrap;gap:6px;color:var(--muted);font-size:12.5px}
.ca-foot-note{font-style:italic}

/* butterfly */
.ca-fly{position:fixed;top:14%;left:-40px;z-index:2;pointer-events:none;animation:flutterPath 26s linear infinite}
.ca-fly-wings{transform-origin:17px 15px;animation:flap .42s ease-in-out infinite}
@keyframes flap{0%,100%{transform:scaleX(1)}50%{transform:scaleX(.55)}}
@keyframes flutterPath{
  0%{transform:translate(0,0) rotate(8deg)}
  25%{transform:translate(40vw,8vh) rotate(-6deg)}
  50%{transform:translate(78vw,-3vh) rotate(10deg)}
  75%{transform:translate(96vw,12vh) rotate(-8deg)}
  100%{transform:translate(108vw,0) rotate(8deg)}
}

@media (max-width:720px){
  .ca-cell{min-height:74px;border-radius:9px;padding:5px}
  .ca-pill{font-size:9.5px}
  .ca-pill b{display:none}
  .ca-grid,.ca-dow{gap:4px}
  .ca-row3{grid-template-columns:1fr}
  .ca-panel{width:100%}
}
@media (prefers-reduced-motion:reduce){
  .ca-fly{display:none}
  .ca-panel,.ca-modal{animation:none}
}
    `}</style>
  );
}
