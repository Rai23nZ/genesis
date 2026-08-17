// Модель данных, загрузка/синхронизация, импорт-экспорт и раскладки древа.
// Только логика: в этом файле нет ни одной записи о людях — они приходят с сервера.

// Источник истины — сервер. Пока API не поднят, приложение читает демонстрационный
// набор data/sample.json (синтетические записи, персональных данных не содержит).
// Ни здесь, ни в любом другом файле репозитория не должно появляться реальных
// имён, адресов, паролей и кодов доступа — им место в базе на сервере.

// Живые коллекции. Модуль ES — синглтон, поэтому app.js и world-map.js видят
// один и тот же массив после того, как loadArchive() его наполнил.
export const PLACES = {};
export const PEOPLE = [];
export const MODERATION = [];

export const meta = { title: "", source: "", loadedAt: null, readOnly: true };

const cfg = () => (typeof window !== "undefined" && window.FT_CONFIG) || {};
const apiBase = () => String(cfg().apiBase || "").replace(/\/+$/, "");

const fill = (arr, next) => { arr.length = 0; (next || []).forEach(x => arr.push(x)); return arr; };

const P = (id, o) => Object.assign({ id, photos: [], residences: [], documents: [], sources: [], notes: "" }, o);
export { P as person };

async function getJson(url, init) {
  const res = await fetch(url, Object.assign({ credentials: "include", headers: { "Accept": "application/json" } }, init));
  if (!res.ok) throw new Error(url + " → HTTP " + res.status);
  return res.json();
}

// Единственная точка входа для данных. Порядок: API сервера → локальный образец.
// Ничего не кэшируется в localStorage: перезагрузка страницы всегда идёт к источнику.
export async function loadArchive() {
  const base = apiBase();
  if (base) {
    const d = await getJson(base + "/api/archive");
    return apply(d, "api");
  }
  const d = await getJson("./data/sample.json");
  return apply(d, "sample");
}

function apply(d, source) {
  fill(PEOPLE, d.people);
  fill(MODERATION, d.moderation);
  Object.keys(PLACES).forEach(k => delete PLACES[k]);
  Object.assign(PLACES, d.places || {});
  meta.title = d.title || "";
  meta.source = source;
  meta.loadedAt = new Date().toISOString();
  meta.readOnly = source !== "api";
  return { people: PEOPLE, moderation: MODERATION, places: PLACES, title: meta.title, source };
}

let _ready = null;
// Ждать готовности данных из любого модуля (карта вызывает это перед отрисовкой).
export function whenReady() { return (_ready = _ready || loadArchive()); }

// ——— Запись. Без сервера возвращает отказ: молча писать «в никуда» приложение не должно.
export async function apiSubmitEdit(personId, patch) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/people/" + encodeURIComponent(personId) + "/edit",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
}

export async function apiModerate(recordId, action) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/moderation/" + encodeURIComponent(recordId) + "/" + action, { method: "POST" });
}

export async function apiLogin(role, login, secret) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/auth/login",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, login, secret }) });
}

export async function apiLogout() {
  const base = apiBase();
  if (!base) return null;
  return getJson(base + "/api/auth/logout", { method: "POST" });
}

// ——— Экранирование пользовательского текста перед вставкой в HTML-строку.
// Имена и подписи приходят из импорта и правок родственников — доверять им нельзя.
export const escapeHtml = (v) => String(v == null ? "" : v)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const byId = (people) => Object.fromEntries(people.map(p => [p.id, p]));

export const years = (p) => {
  const b = p.birth?.date?.slice(0, 4) || "?";
  if (p.living) return `род. ${b}`;
  return `${b} — ${p.death?.date?.slice(0, 4) || "?"}`;
};

export const initials = (p) => (p.name || "").split(" ").filter(Boolean).slice(0, 2).map(w => w[0]).join("");

export const shortName = (p) => {
  const parts = (p.name || "").split(" ");
  return parts.length >= 3 ? `${parts[parts.length - 1]} ${parts[0][0]}. ${parts[1][0]}.` : p.name;
};

// ——— Раскладка: поколения сверху вниз, супруги парой, дети центрированы под родителями
export function layout(people, opts = {}) {
  const W = opts.w || 190, H = opts.h || 96, GX = opts.gx || 26, GY = opts.gy || 92;
  const idx = byId(people);
  const kidsOf = (a, b) => people.filter(p => p.parents?.length && p.parents.includes(a) && (!b || p.parents.includes(b)));
  const placed = new Set();
  const nodes = [];
  const unions = [];
  const rowRight = {};
  const GAP = GX * 2;

  const bump = (n) => { rowRight[n.depth] = Math.max(rowRight[n.depth] ?? -Infinity, n.x + n.w); };
  const shift = (from, d) => { for (let i = from; i < nodes.length; i++) { nodes[i].x += d; bump(nodes[i]); } };

  function block(p, depth) {
    if (placed.has(p.id)) return null;
    placed.add(p.id);
    const sp = (p.spouse || []).map(id => idx[id]).find(s => s && !placed.has(s.id));
    if (sp) placed.add(sp.id);
    const members = sp ? [p, sp] : [p];
    const kids = kidsOf(p.id, sp?.id).concat(sp ? [] : kidsOf(p.id, null)).filter((v, i, a) => a.indexOf(v) === i);
    const blockW = members.length * W + (members.length - 1) * GX;

    const startIdx = nodes.length;
    const centers = [];
    kids.forEach(k => { const b = block(k, depth + 1); if (b) centers.push(b.center); });

    let x0 = centers.length
      ? (Math.min(...centers) + Math.max(...centers)) / 2 - blockW / 2
      : (rowRight[depth] ?? -GAP) + GAP;
    const minX = (rowRight[depth] ?? -GAP) + GAP;
    if (x0 < minX) { shift(startIdx, minX - x0); x0 = minX; }

    const y = depth * (H + GY);
    members.forEach((m, i) => { const n = { id: m.id, p: m, x: x0 + i * (W + GX), y, w: W, h: H, depth, unionIdx: i }; nodes.push(n); bump(n); });
    const rec = { center: x0 + blockW / 2, depth, members: members.map(m => m.id), kids: kids.map(k => k.id), spouse: !!sp };
    unions.push(rec);
    return rec;
  }

  people.filter(p => !p.parents?.length).forEach(p => { if (!placed.has(p.id)) block(p, 0); });
  people.forEach(p => { if (!placed.has(p.id)) block(p, p.gen || 0); });

  const pos = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = [];
  unions.forEach(u => {
    const first = pos[u.members[0]];
    if (!first) return;
    if (u.spouse) {
      const [a, b] = u.members.map(id => pos[id]);
      if (a && b) edges.push({ type: "h", x: a.x + a.w, y: a.y + a.h / 2, len: b.x - (a.x + a.w) });
    }
    if (u.kids.length) {
      const second = pos[u.members[1]];
      const anchorX = u.spouse && second ? (first.x + first.w + (second.x - first.x - first.w) / 2) : (first.x + W / 2);
      const top = first.y + H, bus = top + GY / 2;
      edges.push({ type: "v", x: anchorX, y: top, len: bus - top });
      const kx = u.kids.map(id => pos[id]).filter(Boolean).map(n => n.x + n.w / 2);
      if (kx.length) {
        const x1 = Math.min(anchorX, ...kx), x2 = Math.max(anchorX, ...kx);
        edges.push({ type: "h", x: x1, y: bus, len: x2 - x1 });
        u.kids.forEach(id => { const n = pos[id]; if (n) edges.push({ type: "v", x: n.x + n.w / 2, y: bus, len: n.y - bus }); });
      }
    }
  });

  const width = Math.max(...nodes.map(n => n.x + n.w), 100);
  const height = Math.max(...nodes.map(n => n.y + n.h), 100);
  return { nodes, edges, width, height, unions };
}

// Горизонтальная раскладка = транспонированная вертикальная
export function layoutH(people, opts = {}) {
  const r = layout(people, Object.assign({ w: 108, h: 176, gx: 22, gy: 120 }, opts));
  const nodes = r.nodes.map(n => ({ ...n, x: n.y, y: n.x, w: n.h, h: n.w }));
  const edges = r.edges.map(e => e.type === "h"
    ? { type: "v", x: e.y, y: e.x, len: e.len }
    : { type: "h", x: e.y, y: e.x, len: e.len });
  return { nodes, edges, width: r.height, height: r.width, unions: r.unions };
}

// ——— Веер предков: кольца по поколениям вокруг фокусной персоны
export function fan(people, focusId, opts = {}) {
  const idx = byId(people);
  const R0 = opts.r0 || 86, RW = opts.rw || 96, SPAN = opts.span || 300, START = opts.start || -150;
  const MAXD = opts.depth || 3;
  const segs = [];
  function walk(p, depth, a0, a1) {
    if (depth > MAXD) return;
    segs.push({ id: p ? p.id : null, p, ghost: !p, depth, a0, a1, r0: depth === 0 ? 0 : R0 + (depth - 1) * RW, r1: depth === 0 ? R0 : R0 + depth * RW, mid: (a0 + a1) / 2 });
    if (depth === MAXD) return;
    const par = p ? (p.parents || []).map(i => idx[i]).filter(Boolean) : [];
    const father = par.find(x => x.sex === "m") || par[0] || null;
    const mother = par.find(x => x.sex === "f" && x !== father) || null;
    const half = (a1 - a0) / 2;
    walk(father, depth + 1, a0, a0 + half);
    walk(mother, depth + 1, a0 + half, a1);
  }
  walk(idx[focusId], 0, START, START + SPAN);
  const polar = (r, deg) => { const a = (deg - 90) * Math.PI / 180; return [Math.cos(a) * r, Math.sin(a) * r]; };
  segs.forEach(s => {
    if (s.depth === 0) { s.d = null; return; }
    const [x0, y0] = polar(s.r0, s.a0), [x1, y1] = polar(s.r1, s.a0);
    const [x2, y2] = polar(s.r1, s.a1), [x3, y3] = polar(s.r0, s.a1);
    const large = (s.a1 - s.a0) > 180 ? 1 : 0;
    s.d = `M${x0.toFixed(1)} ${y0.toFixed(1)}L${x1.toFixed(1)} ${y1.toFixed(1)}A${s.r1} ${s.r1} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}L${x3.toFixed(1)} ${y3.toFixed(1)}A${s.r0} ${s.r0} 0 ${large} 0 ${x0.toFixed(1)} ${y0.toFixed(1)}Z`;
    const [lx, ly] = polar((s.r0 + s.r1) / 2, s.mid);
    s.lx = lx; s.ly = ly;
    let rot = s.mid; if (rot > 90 || rot < -90) rot += 180;
    s.rot = rot;
  });
  return segs;
}

// ——— Потомки фокусной персоны (для варианта «Веер»: нижние кольца)
export function descendants(people, rootId) {
  const kids = (id) => people.filter(p => (p.parents || []).includes(id));
  const out = []; const walk = (id, d) => { kids(id).forEach(k => { out.push({ p: k, depth: d }); walk(k.id, d + 1); }); };
  walk(rootId, 1); return out;
}

// ——— Точки на карте
export function mapPoints(people, { hideLiving = false } = {}) {
  const pts = [];
  people.forEach(p => {
    if (hideLiving && p.living) return;
    (p.residences || []).forEach((r, i) => {
      const c = PLACES[r.place];
      if (!c) return;
      const now = new Date().getFullYear();
      pts.push({ person: p, place: r.place, lat: c[0], lon: c[1], from: r.from, to: r.to || (p.living ? now : Number(p.death?.date?.slice(0, 4)) || r.from), note: r.note, order: i, gen: p.gen });
    });
  });
  return pts;
}

// ——— Импорт

const GED_MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad2 = (n) => String(n).padStart(2, "0");

// GEDCOM пишет даты десятком способов: "14 MAR 1902", "ABT 1902",
// "BET 1900 AND 1910", "INT 1902 (со слов)". Клиент везде берёт из даты первые
// четыре символа как год, поэтому приводим к ISO здесь — один раз, на входе.
// Из диапазона берётся начало: в модели у события одна дата, а не период.
export function normalizeDate(raw) {
  const s = String(raw == null ? "" : raw).trim().toUpperCase();
  if (!s) return "";
  if (/^\d{4}(-\d{2}(-\d{2})?)?$/.test(s)) return s;
  const range = s.match(/^(?:BET|FROM)\s+(.+?)\s+(?:AND|TO)\s+/);
  const body = (range ? range[1] : s)
    .replace(/^(?:ABT|EST|CAL|INT|BEF|AFT|FROM|TO)\s+/, "")
    .replace(/\(.*\)$/, "")
    .trim();
  const m = body.match(/^(?:(\d{1,2})\s+)?(?:([A-Z]{3})\s+)?(\d{3,4})$/);
  if (!m) return "";
  const [, d, mon, y] = m;
  const year = y.padStart(4, "0");
  if (!mon || !GED_MONTHS[mon]) return year;
  const month = pad2(GED_MONTHS[mon]);
  return d ? `${year}-${month}-${pad2(Number(d))}` : `${year}-${month}`;
}

export const LIVING_MAX_AGE = 110;

// От этого признака зависит, отдаст ли сервер карточку гостю, поэтому правило
// осторожное: неизвестность трактуется в пользу скрытия. Модератор снимает
// отметку вручную, увидев человека в отчёте импорта.
export function guessLiving(birthDate, hasDeath, now = new Date()) {
  if (hasDeath) return false;
  const y = Number(String(birthDate || "").slice(0, 4));
  if (!y) return true;
  return now.getFullYear() - y < LIVING_MAX_AGE;
}

export function parseGedcom(text) {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const recs = []; let cur = null, ctx = null;
  for (const line of lines) {
    const m = line.match(/^(\d+)\s+(@[^@]+@\s+)?(\w+)\s*(.*)$/);
    if (!m) continue;
    const [, lvl, ptr, tag, val] = m;
    if (lvl === "0") { cur = { id: ptr ? ptr.trim().replace(/@/g, "") : null, tag, name: "", events: {} }; recs.push(cur); ctx = null; continue; }
    if (!cur) continue;
    if (lvl === "1") { ctx = tag; if (tag === "FILE" || tag === "_TITL" || tag === "TITL") cur.title = val.trim(); if (tag === "NAME") cur.name = val.replace(/\//g, "").trim(); if (tag === "SEX") cur.sex = val.toLowerCase(); if (tag === "FAMS" || tag === "FAMC") (cur[tag] = cur[tag] || []).push(val.replace(/@/g, "")); if (tag === "HUSB" || tag === "WIFE") cur[tag] = val.replace(/@/g, ""); if (tag === "CHIL") (cur.CHIL = cur.CHIL || []).push(val.replace(/@/g, "")); cur.events[tag] = cur.events[tag] || {}; }
    if (lvl === "2" && ctx) { cur.events[ctx] = cur.events[ctx] || {}; cur.events[ctx][tag] = val; }
  }
  const fams = recs.filter(r => r.tag === "FAM");
  const people = recs.filter(r => r.tag === "INDI").map(r => {
    const parents = [];
    (r.FAMC || []).forEach(fid => { const f = fams.find(x => x.id === fid); if (f) { if (f.HUSB) parents.push(f.HUSB); if (f.WIFE) parents.push(f.WIFE); } });
    const spouse = [];
    (r.FAMS || []).forEach(fid => { const f = fams.find(x => x.id === fid); if (f) { [f.HUSB, f.WIFE].forEach(s => { if (s && s !== r.id) spouse.push(s); }); } });
    const hasDeath = !!r.events.DEAT;
    const birth = r.events.BIRT ? { date: normalizeDate(r.events.BIRT.DATE), place: r.events.BIRT.PLAC } : undefined;
    return P(r.id, {
      name: r.name, sex: r.sex, parents, spouse,
      birth,
      death: hasDeath ? { date: normalizeDate(r.events.DEAT.DATE), place: r.events.DEAT.PLAC } : undefined,
      living: guessLiving(birth?.date, hasDeath),
      residences: r.events.RESI?.PLAC ? [{ place: r.events.RESI.PLAC }] : []
    });
  });
  const head = recs.find(r => r.tag === "HEAD");
  const title = (head && (head.events?.FILE?.__val || head.title)) || "";
  return { people, families: fams.length, title };
}

export function parseJson(text) {
  const d = JSON.parse(text);
  const raw = Array.isArray(d) ? d : (d.people || []);
  // Файл со стороны может не иметь признака «живущий». Достраиваем его по тому же
  // правилу, что и для GEDCOM: без него гость увидел бы всех.
  const people = raw.map(p => p.living === undefined ? { ...p, living: guessLiving(p.birth?.date, !!p.death) } : p);
  return { people, families: 0, title: d.title || "", subtitle: d.subtitle || "" };
}

export function exportBackup(people, moderation, meta = {}) {
  return JSON.stringify({
    format: "family-tree-backup", version: 1, exported: new Date().toISOString(),
    title: meta.title || "", subtitle: meta.subtitle || "",
    counts: { people: people.length, pending: moderation.length },
    // Координаты мест входят в копию: без них восстановленный архив открывается
    // с пустой картой.
    places: meta.places || PLACES,
    people, moderation
  }, null, 2);
}

export function download(name, text, type = "application/json") {
  const b = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(b); a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
