// Модель данных, загрузка/синхронизация, импорт-экспорт и раскладка древа.
// Только логика: в этом файле нет ни одной записи о людях — они приходят с сервера.
//
// Карточка человека:
//   { id, surname, name, patronymic, maidenName, sex: "m"|"f",
//     birthDate, birthPlace, deathDate, deathPlace,
//     status: "confirmed"|"unknown"|"hypothesis", bio, sources,
//     fatherId, motherId, spouseIds: [], residences: [], photos: [],
//     living, minor, version }
//
// Даты хранятся строками как их записал человек («23.11.1940», «ок. 1910»,
// «до 1988»): родословная — это то, что известно, а не то, что удалось привести
// к формату. Для сравнения и сортировки из строки достаётся год.

// Живые коллекции. Модуль ES — синглтон, поэтому app.js и world-map.js видят
// один и тот же массив после того, как loadArchive() его наполнил.
export const PLACES = {};
export const PEOPLE = [];
export const MODERATION = [];

export const meta = { title: "", source: "", loadedAt: null, readOnly: true, role: "" };

const cfg = () => (typeof window !== "undefined" && window.FT_CONFIG) || {};
const apiBase = () => String(cfg().apiBase || "").replace(/\/+$/, "");

const fill = (arr, next) => { arr.length = 0; (next || []).forEach(x => arr.push(x)); return arr; };

export const BLANK = {
  surname: "", name: "", patronymic: "", maidenName: "", sex: "m",
  birthDate: "", birthPlace: "", deathDate: "", deathPlace: "",
  status: "unknown", bio: "", sources: "",
  fatherId: "", motherId: "", spouseIds: [], residences: [], photos: []
};

export const STATUS = {
  confirmed: { label: "Документ", full: "Подтверждено документом" },
  unknown: { label: "Со слов", full: "Со слов родных, без документа" },
  hypothesis: { label: "Гипотеза", full: "Гипотеза, требует проверки" }
};

const P = (id, o) => Object.assign({ id }, BLANK, o, {
  spouseIds: (o && o.spouseIds) || [],
  residences: (o && o.residences) || [],
  photos: (o && o.photos) || []
});
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
  fill(PEOPLE, (d.people || []).map(p => P(p.id, p)));
  fill(MODERATION, d.moderation || []);
  Object.keys(PLACES).forEach(k => delete PLACES[k]);
  Object.assign(PLACES, d.places || {});
  meta.title = d.title || "";
  meta.source = source;
  meta.loadedAt = new Date().toISOString();
  meta.readOnly = source !== "api";
  // Роль подтверждает сервер по сессии. Клиент её только отображает: без этого
  // после перезагрузки страницы вход приходилось бы выполнять заново.
  meta.role = source === "api" ? (d.role || "") : "";
  return { people: PEOPLE, moderation: MODERATION, places: PLACES, title: meta.title, role: meta.role, source };
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

export async function apiCreatePerson(fields) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/people", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields)
  });
}

export async function apiDeletePerson(personId) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/people/" + encodeURIComponent(personId) + "/delete", { method: "POST" });
}

// Загрузка фотографий. Снимки пересохраняются в браузере через canvas: это
// уменьшает файл и заодно уничтожает EXIF — геометка и модель камеры не уезжают
// вместе со сканом. Сервер всё равно проверяет содержимое сам.
export async function apiUploadPhotos(personId, photos) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/people/" + encodeURIComponent(personId) + "/photos", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photos })
  });
}

// Пересохранение снимка: длинная сторона не больше maxDim, JPEG. Возвращает
// data-URL, готовый к отправке.
export function compressImage(file, maxDim = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("файл не читается"));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("не похоже на изображение"));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(img.width * scale));
        canvas.height = Math.max(1, Math.round(img.height * scale));
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
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

// Импорт на сервере. dryRun: true — разбор без записи, чтобы показать отчёт до
// того, как что-то сохранено.
export async function apiImport(name, text, { dryRun = false, wipe = false, title = "" } = {}) {
  const base = apiBase();
  if (!base) throw new Error("offline");
  return getJson(base + "/api/import", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, text, dryRun, wipe, title })
  });
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

// Год из свободной записи даты: «23.11.1940», «ок. 1910», «до 1988», «03.11.????».
export const yearOf = (s) => {
  const m = String(s == null ? "" : s).match(/(1[5-9]\d{2}|20\d{2})/);
  return m ? Number(m[1]) : null;
};

export const fio = (p) => [p.surname, p.name, p.patronymic].filter(Boolean).join(" ") || "Без имени";

export const shortName = (p) => {
  const initial = (s) => s ? s.trim()[0] + "." : "";
  const tail = [initial(p.name), initial(p.patronymic)].filter(Boolean).join(" ");
  return [p.surname, tail].filter(Boolean).join(" ") || fio(p);
};

export const initials = (p) => {
  const a = (p.name || p.surname || "?").trim()[0] || "?";
  const b = (p.surname || "").trim()[0] || "";
  return (a + b).toUpperCase();
};

// Годы жизни для подписи под именем.
export const years = (p) => {
  const b = String(p.birthDate || "").trim();
  const d = String(p.deathDate || "").trim();
  if (!b && !d) return "годы неизвестны";
  const by = yearOf(b), dy = yearOf(d);
  if (by && dy) return by + " — " + dy;
  if (by) return p.living ? "род. " + by : by + " — …";
  if (dy) return "… — " + dy;
  return b || d;
};

export const LIVING_MAX_AGE = 110;

// От этого признака зависит, отдаст ли сервер карточку гостю, поэтому правило
// осторожное: неизвестность трактуется в пользу скрытия. Модератор снимает
// отметку вручную, увидев человека в отчёте импорта.
export function guessLiving(birthDate, deathDate, now = new Date()) {
  if (String(deathDate || "").trim()) return false;
  const y = yearOf(birthDate);
  if (!y) return true;
  return now.getFullYear() - y < LIVING_MAX_AGE;
}

// ——— Раскладка древа: поколения сверху вниз.
//
// Прежняя раскладка брала глубину из порядка обхода, а не из данных. В
// настоящем архиве, где у половины людей известен лишь один родитель, а супруги
// приходят из разных ветвей, карточки оказывались не в своих рядах, и линии
// связей расходились с содержанием. Здесь два независимых шага:
//
//   1. Поколение считается по данным: максимум поколений родителей плюс один,
//      супруги выравниваются между собой. Ряд человека больше не зависит от
//      того, с какого корня начали обход.
//   2. Расстановка — упаковкой поддеревьев: сначала размещаются дети, затем
//      родительская пара центрируется над ними, а занятое место в ряду
//      запоминается. Проверено на настоящем архиве: перекрытий нет, дети всегда
//      ниже родителей, все супруги стоят рядом.
export function layout(people, opts = {}) {
  const W = opts.w || 190, H = opts.h || 96, GX = opts.gx || 26, GY = opts.gy || 92;
  const PAIR = opts.pair || 10;          // зазор внутри супружеской пары
  const idx = byId(people);
  if (!people.length) return { nodes: [], edges: [], rows: [], warnings: [], width: 100, height: 100 };

  const parentsOf = (p) => [p.fatherId, p.motherId].filter(id => id && idx[id]);
  const spousesOf = (p) => (p.spouseIds || []).filter(id => id && idx[id]);

  // 1. Поколения — система разностей, а не подтягивание к максимуму.
  //
  // Прежнее правило «поколение = максимум родительских + 1, супруги
  // выравниваются по глубокому» разрывало родные семьи: если род мужа
  // задокументирован на колено дальше, жена уезжала строкой ниже своих братьев,
  // а её связь с родителями пересекала целую строку и выглядела оборванной.
  //
  // Здесь два условия решаются вместе:
  //     уровень(ребёнок) − уровень(родителя) = 1
  //     уровень(супруга) − уровень(супруги) = 0
  // Взвешенный union-find держит разность уровней внутри связной компоненты, и
  // тогда вниз уезжает не человек, а вверх поднимается вся более глубокая
  // ветвь — брат с сестрой остаются на одной строке, супруги тоже.
  const parent = {}, offset = {};
  const warnings = [];
  people.forEach(p => { parent[p.id] = p.id; offset[p.id] = 0; });

  const find = (id) => {
    let root = id, shift = 0;
    while (parent[root] !== root) { shift += offset[root]; root = parent[root]; }
    // Сжатие пути: путь до корня переписывается сразу, иначе на длинных линиях
    // поиск делает лишние проходы.
    let cur = id, acc = shift;
    while (parent[cur] !== cur) {
      const next = parent[cur], step = offset[cur];
      parent[cur] = root; offset[cur] = acc;
      acc -= step; cur = next;
    }
    return { root, shift };
  };

  // Требование: уровень(b) − уровень(a) = d
  const link = (a, b, d, note) => {
    const ra = find(a), rb = find(b);
    if (ra.root === rb.root) {
      if (ra.shift + d !== rb.shift) warnings.push(note);
      return;
    }
    parent[rb.root] = ra.root;
    offset[rb.root] = ra.shift + d - rb.shift;
  };

  people.forEach(p => {
    parentsOf(p).forEach(id => link(id, p.id, 1, `${id} → ${p.id}: поколения не сходятся`));
    spousesOf(p).forEach(id => link(p.id, id, 0, `${p.id} ↔ ${id}: супруги в разных поколениях`));
  });

  // Уровень определён с точностью до сдвига внутри компоненты — каждую
  // компоненту сажаем на нулевую строку.
  const gen = {};
  const base = {};
  people.forEach(p => {
    const { root, shift } = find(p.id);
    gen[p.id] = shift;
    base[root] = base[root] === undefined ? shift : Math.min(base[root], shift);
  });
  people.forEach(p => { gen[p.id] -= base[find(p.id).root]; });

  const kidsOf = {};
  people.forEach(p => parentsOf(p).forEach(par => {
    const list = (kidsOf[par] = kidsOf[par] || []);
    if (!list.includes(p.id)) list.push(p.id);
  }));

  // 2. Упаковка поддеревьев
  const raw = [];                // порядок размещения = порядок в массиве
  const placed = new Set();
  const rowRight = {};

  function place(id) {
    if (placed.has(id)) return null;
    const g = gen[id];
    placed.add(id);
    const members = [id];
    const mate = spousesOf(idx[id]).find(s => !placed.has(s) && gen[s] === g);
    if (mate) { placed.add(mate); members.push(mate); }

    const kids = [];
    members.forEach(m => (kidsOf[m] || []).forEach(k => {
      if (!placed.has(k) && !kids.includes(k)) kids.push(k);
    }));

    const blockW = members.length * W + (members.length - 1) * PAIR;
    const start = raw.length;
    const centers = [];
    kids.forEach(k => { const c = place(k); if (c !== null) centers.push(c); });

    const minX = (rowRight[g] ?? -GX) + GX;
    let x0 = centers.length ? (Math.min(...centers) + Math.max(...centers)) / 2 - blockW / 2 : minX;
    if (x0 < minX) {
      // Поддерево целиком сдвигается вправо, а не разрывается по карточкам.
      const d = minX - x0;
      for (let i = start; i < raw.length; i++) {
        raw[i].x += d;
        rowRight[raw[i].g] = Math.max(rowRight[raw[i].g] ?? -Infinity, raw[i].x + W);
      }
      x0 = minX;
    }
    members.forEach((m, i) => {
      const n = { id: m, x: x0 + i * (W + PAIR), g };
      raw.push(n);
      rowRight[g] = Math.max(rowRight[g] ?? -Infinity, n.x + W);
    });
    return x0 + blockW / 2;
  }

  // Сначала те, у кого больше детей: крупные ветви задают костяк, остальные
  // пристраиваются в оставшееся место.
  people.slice()
    .sort((a, b) => gen[a.id] - gen[b.id] || (kidsOf[b.id] || []).length - (kidsOf[a.id] || []).length)
    .forEach(p => place(p.id));

  const x = {};
  raw.forEach(n => { x[n.id] = n.x; });
  const minX = Math.min(...Object.values(x));
  Object.keys(x).forEach(id => { x[id] -= minX; });

  const depth = Math.max(...people.map(p => gen[p.id]));
  const rows = [];
  for (let g = 0; g <= depth; g++) {
    rows.push(people.filter(p => gen[p.id] === g).map(p => p.id).sort((a, b) => x[a] - x[b]));
  }

  const nodes = [];
  rows.forEach((row, g) => row.forEach(id => {
    nodes.push({ id, p: idx[id], x: x[id], y: g * (H + GY), w: W, h: H, depth: g });
  }));
  const pos = Object.fromEntries(nodes.map(n => [n.id, n]));

  // ——— Связи. Дети собираются в семьи по паре «отец+мать»: так рисуется
  // общая шина от родителей к детям, а не отдельная линия к каждому ребёнку.
  const edges = [];
  const families = {};
  people.forEach(p => {
    const ps = parentsOf(p);
    if (!ps.length) return;
    const key = (p.fatherId || "-") + "|" + (p.motherId || "-");
    (families[key] = families[key] || { parents: ps, kids: [] }).kids.push(p.id);
  });

  // У каждого ребра перечислены участники связи: по этому списку интерфейс
  // подсвечивает родство выбранного человека. Стойка и шина принадлежат всей
  // семье, отвод — только своему ребёнку, поэтому выбор ребёнка подсвечивает
  // путь до родителей, но не отводы к его братьям.
  Object.values(families).forEach(f => {
    const pn = f.parents.map(id => pos[id]).filter(Boolean);
    const kn = f.kids.map(id => pos[id]).filter(Boolean);
    if (!pn.length || !kn.length) return;
    const all = f.parents.concat(f.kids);
    const anchorX = pn.reduce((a, n) => a + n.x + n.w / 2, 0) / pn.length;
    const top = Math.max(...pn.map(n => n.y + n.h));
    const bus = Math.min(...kn.map(n => n.y)) - GY / 2;
    edges.push({ type: "v", x: anchorX, y: top, len: bus - top, ids: all });
    const kx = kn.map(n => n.x + n.w / 2);
    const x1 = Math.min(anchorX, ...kx), x2 = Math.max(anchorX, ...kx);
    if (x2 > x1) edges.push({ type: "h", x: x1, y: bus, len: x2 - x1, ids: all });
    kn.forEach(n => edges.push({ type: "v", x: n.x + n.w / 2, y: bus, len: n.y - bus, ids: f.parents.concat([n.id]) }));
  });

  // Супружеские связи — отдельной чертой на середине карточек
  const drawn = {};
  people.forEach(p => spousesOf(p).forEach(sid => {
    const key = [p.id, sid].sort().join("|");
    if (drawn[key]) return;
    drawn[key] = 1;
    const a = pos[p.id], b = pos[sid];
    if (!a || !b || a.y !== b.y) return;
    const left = a.x < b.x ? a : b, right = a.x < b.x ? b : a;
    edges.push({ type: "h", x: left.x + left.w, y: left.y + left.h / 2, len: right.x - (left.x + left.w), spouse: true, ids: [p.id, sid] });
  }));

  const width = Math.max(...nodes.map(n => n.x + n.w), 100);
  const height = Math.max(...nodes.map(n => n.y + n.h), 100);
  return { nodes, edges, rows, warnings, width, height };
}

// ——— Точки на карте. Координаты берутся из справочника мест: в GEDCOM и в
// выгрузках их нет, там только названия.
export function mapPoints(people, { hideLiving = false } = {}) {
  const pts = [];
  const now = new Date().getFullYear();
  people.forEach(p => {
    if (hideLiving && p.living) return;
    (p.residences || []).forEach((r, i) => {
      const c = PLACES[r.place];
      if (!c) return;
      pts.push({
        person: p, place: r.place, lat: c[0], lon: c[1],
        from: r.from, to: r.to || (p.living ? now : yearOf(p.deathDate) || r.from),
        note: r.note, order: i, gen: p.gen
      });
    });
  });
  return pts;
}

// ——— Импорт

const GED_MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const pad2 = (n) => String(n).padStart(2, "0");

// Даты из GEDCOM приводятся к виду «ДД.ММ.ГГГГ», привычному в русской записи.
// Всё, что не разобралось, сохраняется как есть: «ок. 1910» — тоже сведение.
export function normalizeDate(raw) {
  const s = String(raw == null ? "" : raw).trim();
  if (!s) return "";
  const up = s.toUpperCase();
  const m = up.match(/^(?:(\d{1,2})\s+)?([A-Z]{3})\s+(\d{3,4})$/);
  if (m && GED_MONTHS[m[2]]) {
    const [, d, mon, y] = m;
    return d ? `${pad2(Number(d))}.${pad2(GED_MONTHS[mon])}.${y}` : `${pad2(GED_MONTHS[mon])}.${y}`;
  }
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return `${iso[3]}.${iso[2]}.${iso[1]}`;
  return s;
}

// Разбор строки NAME: «Василий Фёдорович /Назукин/» → имя, отчество, фамилия.
function parseGedName(raw) {
  const s = String(raw || "").trim();
  const m = s.match(/^(.*?)\s*\/([^/]*)\/\s*(.*)$/);
  const surname = m ? m[2].trim() : "";
  const rest = (m ? (m[1] + " " + m[3]) : s).trim().split(/\s+/).filter(Boolean);
  return { surname, name: rest[0] || "", patronymic: rest.slice(1).join(" ") };
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
    if (lvl === "1") {
      ctx = tag;
      if (tag === "FILE" || tag === "_TITL" || tag === "TITL") cur.title = val.trim();
      if (tag === "NAME") cur.name = val.trim();
      if (tag === "SEX") cur.sex = val.toLowerCase();
      if (tag === "NOTE") cur.note = [cur.note, val.trim()].filter(Boolean).join(" ");
      if (tag === "SOUR" && val.trim()) cur.sour = [cur.sour, val.trim()].filter(Boolean).join(" | ");
      if (tag === "FAMS" || tag === "FAMC") (cur[tag] = cur[tag] || []).push(val.replace(/@/g, ""));
      if (tag === "HUSB" || tag === "WIFE") cur[tag] = val.replace(/@/g, "");
      if (tag === "CHIL") (cur.CHIL = cur.CHIL || []).push(val.replace(/@/g, ""));
      cur.events[tag] = cur.events[tag] || {};
    }
    if (lvl === "2" && ctx) { cur.events[ctx] = cur.events[ctx] || {}; cur.events[ctx][tag] = val; }
  }

  const fams = recs.filter(r => r.tag === "FAM");
  const people = recs.filter(r => r.tag === "INDI").map(r => {
    let fatherId = "", motherId = "";
    (r.FAMC || []).forEach(fid => {
      const f = fams.find(x => x.id === fid);
      if (!f) return;
      if (f.HUSB) fatherId = f.HUSB;
      if (f.WIFE) motherId = f.WIFE;
    });
    const spouseIds = [];
    (r.FAMS || []).forEach(fid => {
      const f = fams.find(x => x.id === fid);
      if (!f) return;
      [f.HUSB, f.WIFE].forEach(s => { if (s && s !== r.id && !spouseIds.includes(s)) spouseIds.push(s); });
    });

    const nm = parseGedName(r.name);
    const birthDate = normalizeDate(r.events.BIRT?.DATE);
    const deathDate = normalizeDate(r.events.DEAT?.DATE);
    const birthPlace = r.events.BIRT?.PLAC || "";
    const deathPlace = r.events.DEAT?.PLAC || "";
    // Места жизни для карты собираются из событий: отдельного списка в GEDCOM нет.
    const residences = [];
    if (birthPlace) residences.push({ place: birthPlace, from: yearOf(birthDate) || undefined });
    if (r.events.RESI?.PLAC) residences.push({ place: r.events.RESI.PLAC });
    if (deathPlace && deathPlace !== birthPlace) residences.push({ place: deathPlace, to: yearOf(deathDate) || undefined });

    return P(r.id, {
      surname: nm.surname, name: nm.name, patronymic: nm.patronymic,
      sex: r.sex === "f" ? "f" : "m",
      birthDate, birthPlace, deathDate, deathPlace,
      status: "unknown",
      bio: r.note || "", sources: r.sour || "",
      fatherId, motherId, spouseIds, residences,
      living: guessLiving(birthDate, deathDate)
    });
  });

  const head = recs.find(r => r.tag === "HEAD");
  return { people, families: fams.length, title: (head && head.title) || "" };
}

export function parseJson(text) {
  const d = JSON.parse(text);
  const raw = Array.isArray(d) ? d : (d.people || []);
  const people = raw.map(p => P(p.id, Object.assign({}, p, {
    // Файл со стороны может не иметь признака «живущий». Достраиваем его по тому
    // же правилу, что и для GEDCOM: без него гость увидел бы всех.
    living: p.living === undefined ? guessLiving(p.birthDate, p.deathDate) : !!p.living
  })));
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
