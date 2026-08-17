// Автономное приложение "Генеалогическое древо семьи" — чистый React, без DC-рантайма.
// Подключается из index.html после React/ReactDOM (UMD) и family-data.js (ES module).
const h = React.createElement;

const GEN = ["#56633f", "#8c491a", "#645c50", "#728157", "#b2622d"];
const ROMAN = ["I", "II", "III", "IV", "V", "VI"];
const CFG = window.FT_CONFIG || {};
// Учётных данных в клиенте нет и быть не должно: роль подтверждает только сервер.
const HAS_API = !!String(CFG.apiBase || "").trim();

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      people: null, pending: [], sel: null, q: "", role: "Гость", zoom: 0.82, modOpen: false, mapOpen: false,
      editing: false, draft: {}, toast: null, title: CFG.fallbackTitle || "Семейное древо", verified: {},
      demo: !HAS_API, authOpen: false, authRole: null, authLogin: "", authSecret: "", authErr: "", authBusy: false,
      scanOpen: false, scanRows: [], printOpen: false, printScale: 0.72, printLand: true,
      mapMode: "all", mapRoute: ""
    };
  }

  componentDidMount() {
    this._onPerson = (e) => {
      const id = e.detail && e.detail.id;
      if (!id) return;
      this.setState({ sel: id, editing: false });
      this.flash("Открыта карточка: " + (e.detail.name || id));
    };
    document.addEventListener("person-open", this._onPerson);
    import("./family-data.js").then((m) => {
      this.m = m;
      // Данные всегда берутся из источника (API сервера, иначе — демонстрационный
      // набор). Ничего не восстанавливается из localStorage: кеш браузера не
      // является хранилищем архива.
      return m.whenReady().then((d) => {
        this.setState({
          people: d.people.slice(),
          pending: d.moderation.slice(),
          title: d.title || this.state.title,
          sel: d.people[0] ? d.people[0].id : null,
          demo: d.source !== "api"
        });
        if (d.source !== "api") this.flash("Демонстрационный режим: сервер не подключён, изменения не сохраняются");
      });
    }).catch((err) => {
      this.setState({ people: [], pending: [] });
      this.flash("Не удалось загрузить архив: " + err.message);
    });
  }

  componentWillUnmount() { document.removeEventListener("person-open", this._onPerson); }

  flash(t) { clearTimeout(this._t); this.setState({ toast: t }); this._t = setTimeout(() => this.setState({ toast: null }), 3200); }
  visible(p) { return !(this.state.role === "Гость" && p.living); }

  askRole(role) {
    if (this.state.verified[role]) return this.setState({ role, editing: false });
    if (!HAS_API) {
      // Без сервера роль повысить нельзя: проверять пароль в браузере бессмысленно.
      return this.flash("Вход недоступен: сервер не подключён (apiBase в config.js)");
    }
    this.setState({ authOpen: true, authRole: role, authLogin: "", authSecret: "", authErr: "" });
  }

  authSubmit() {
    const s = this.state;
    const login = (s.authLogin || "").trim();
    if (!login) return this.setState({ authErr: "Укажите e-mail из приглашения" });
    if (!(s.authSecret || "").trim()) return this.setState({ authErr: "Укажите код или пароль" });
    this.setState({ authBusy: true, authErr: "" });
    // Проверку выполняет сервер: клиент видит только «да/нет» и выданную им роль.
    this.m.apiLogin(s.authRole, login, s.authSecret).then((res) => {
      const role = res.role || s.authRole;
      this.setState({
        role, verified: { ...s.verified, [role]: true },
        authOpen: false, authErr: "", authLogin: "", authSecret: "", authBusy: false
      });
      this.flash("Вход выполнен: " + role.toLowerCase());
      return this.reload();
    }).catch((err) => {
      this.setState({ authBusy: false, authSecret: "", authErr: /HTTP 401|HTTP 403/.test(err.message) ? "Неверный e-mail, код или срок доступа истёк" : "Сервер недоступен: " + err.message });
    });
  }

  // Перечитать архив с сервера — после входа, правки или решения модератора.
  reload() {
    if (!this.m) return Promise.resolve();
    return this.m.loadArchive().then((d) => {
      this.setState({
        people: d.people.slice(), pending: d.moderation.slice(),
        title: d.title || this.state.title, demo: d.source !== "api"
      });
    }).catch((err) => this.flash("Не удалось обновить данные: " + err.message));
  }

  submitEdit() {
    const s = this.state, p = (s.people || []).find(x => x.id === s.sel);
    if (!p) return;
    const changes = [], fields = {};
    const photos = s.draft.photos || [];
    if (s.draft.occupation !== (p.occupation || "")) { changes.push({ field: "Профессия", before: p.occupation || "—", after: s.draft.occupation || "—" }); fields.occupation = s.draft.occupation; }
    if (s.draft.notes !== (p.notes || "")) { changes.push({ field: "Заметки", before: p.notes || "—", after: s.draft.notes || "—" }); fields.notes = s.draft.notes; }
    if (photos.length) {
      changes.push({ field: "Галерея", before: (p.photos || []).length + " фото", after: ((p.photos || []).length + photos.length) + " фото" });
      photos.forEach(ph => changes.push({ field: "Новое фото", before: "—", after: ph.caption || "без подписи" }));
    }
    if (!changes.length) { this.setState({ editing: false }); return this.flash("Изменений нет"); }
    const rec = { id: "u" + Date.now(), author: "Вы", role: s.role.toLowerCase(), date: new Date().toISOString(), target: p.id, targetName: p.name, kind: photos.length && changes.length <= photos.length + 1 ? "photo" : "edit", summary: "Правка из карточки", changes, patch: { fields, photos } };
    if (HAS_API) {
      // Решение о том, публиковать сразу или отправить в очередь, принимает сервер
      // по роли сессии — клиент только передаёт правку.
      this.setState({ editing: false, draft: {} });
      return this.m.apiSubmitEdit(p.id, { fields, changes, photos: photos.map(x => ({ caption: x.caption })) })
        .then((res) => { this.flash(res.queued ? "Отправлено модератору" : "Сохранено"); return this.reload(); })
        .catch((err) => this.flash("Не удалось отправить правку: " + err.message));
    }
    if (s.role === "Модератор") {
      const people = s.people.map(x => x.id === p.id ? { ...x, ...fields, photos: [...(x.photos || []), ...photos] } : x);
      this.setState({ people, editing: false, draft: {} });
      return this.flash("Сохранено без очереди — вы модератор");
    }
    this.setState({ pending: [rec, ...s.pending], editing: false, draft: {} });
    this.flash("Отправлено модератору. На лендинге появится после подтверждения");
  }

  approve(x) {
    if (HAS_API) return this.moderate(x, "approve", "Принято: изменения опубликованы");
    const st = this.state;
    let people = st.people;
    if (x.patch && people) {
      people = people.map(p => p.id === x.target ? { ...p, ...(x.patch.fields || {}), photos: [...(p.photos || []), ...(x.patch.photos || [])] } : p);
    }
    this.setState({ people, pending: st.pending.filter(y => y.id !== x.id) });
    this.flash("Принято (демонстрационный режим: на сервере ничего не изменилось)");
  }

  reject(x) {
    if (HAS_API) return this.moderate(x, "reject", "Отклонено: автор получит уведомление");
    this.setState({ pending: this.state.pending.filter(y => y.id !== x.id) });
    this.flash("Отклонено (демонстрационный режим)");
  }

  moderate(x, action, okText) {
    return this.m.apiModerate(x.id, action)
      .then(() => { this.flash(okText); return this.reload(); })
      .catch((err) => this.flash("Не удалось выполнить: " + err.message));
  }

  onDraftPhotos(e) {
    const files = [...(e.target.files || [])].filter(f => /^image\//.test(f.type)).slice(0, 12);
    e.target.value = "";
    if (!files.length) return;
    const add = files.map(f => ({ src: URL.createObjectURL(f), caption: f.name.replace(/\.[a-z0-9]+$/i, "") }));
    this.setState({ draft: { ...this.state.draft, photos: [...(this.state.draft.photos || []), ...add] } });
  }

  onScanPick(e) {
    const files = [...(e.target.files || [])].filter(f => /^image\//.test(f.type)).slice(0, 60);
    e.target.value = "";
    if (!files.length) return this.flash("Изображений в папке не найдено");
    const people = this.state.people || [];
    const norm = (t) => t.toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z]+/g, " ");
    const rows = files.map((f) => {
      const path = norm(f.webkitRelativePath || f.name);
      let best = null;
      people.forEach(p => {
        const words = norm(p.name).split(" ").filter(w => w.length > 3);
        const score = words.filter(w => path.includes(w)).length;
        if (score >= 2 && (!best || score > best.score)) best = { id: p.id, score };
      });
      return { name: f.webkitRelativePath || f.name, src: URL.createObjectURL(f), personId: best ? best.id : (this.state.sel || people[0]?.id || ""), auto: !!best };
    });
    this.setState({ scanOpen: true, scanRows: rows });
  }

  applyScans() {
    const s = this.state, rows = s.scanRows;
    if (!rows.length) return this.setState({ scanOpen: false });
    const byPerson = {};
    rows.forEach(r => { (byPerson[r.personId] = byPerson[r.personId] || []).push({ src: r.src, caption: r.name.split("/").pop().replace(/\.[a-z0-9]+$/i, "") }); });
    const idx = this.m.byId(s.people);
    if (s.role === "Модератор") {
      const people = s.people.map(p => byPerson[p.id] ? { ...p, photos: [...(p.photos || []), ...byPerson[p.id]] } : p);
      this.setState({ people, scanOpen: false, scanRows: [] });
      return this.flash("Добавлено " + rows.length + " фото в " + Object.keys(byPerson).length + " карточек");
    }
    const recs = Object.keys(byPerson).map((pid, i) => ({
      id: "u" + Date.now() + i, author: "Вы", role: s.role.toLowerCase(), date: new Date().toISOString(),
      target: pid, targetName: idx[pid] ? idx[pid].name : pid, kind: "photo",
      summary: "Сканы из папки: " + byPerson[pid].length + " файлов",
      changes: [{ field: "Галерея", before: ((idx[pid]?.photos || []).length) + " фото", after: ((idx[pid]?.photos || []).length + byPerson[pid].length) + " фото" },
        ...byPerson[pid].map(ph => ({ field: "Файл", before: "—", after: ph.caption }))],
      patch: { fields: {}, photos: byPerson[pid] }
    }));
    this.setState({ pending: [...recs, ...s.pending], scanOpen: false, scanRows: [] });
    this.flash("На модерацию отправлено " + rows.length + " фото");
  }

  onImport(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const txt = String(r.result);
        const res = /\.ged/i.test(f.name) ? this.m.parseGedcom(txt) : this.m.parseJson(txt);
        if (!res.people.length) return this.flash("В файле не найдено записей о людях");
        const patch = { people: res.people, sel: res.people[0].id };
        if (res.title) patch.title = res.title;
        this.setState(patch);
        this.flash("Импорт " + f.name + ": " + res.people.length + " человек" + (res.families ? ", " + res.families + " семей" : "") + (res.title ? " · название из файла" : " · название в файле не указано, поправьте в шапке"));
      } catch (err) { this.flash("Не удалось разобрать файл: " + err.message); }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  openPrint() { this.setState({ printOpen: true }); setTimeout(() => this.renderPreview(), 90); }
  clearSheets() { document.querySelectorAll("[data-print-layer]").forEach(n => n.remove()); this._sheets = null; }

  sheetGeom() {
    const canvas = document.querySelector("[data-canvas]");
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    [...canvas.children].forEach(el => {
      const w = el.offsetWidth, hh = el.offsetHeight;
      if (!w || !hh) return;
      x0 = Math.min(x0, el.offsetLeft); y0 = Math.min(y0, el.offsetTop);
      x1 = Math.max(x1, el.offsetLeft + w); y1 = Math.max(y1, el.offsetTop + hh);
    });
    if (!isFinite(x0)) { x0 = 0; y0 = 0; x1 = 800; y1 = 600; }
    const PAD = 16; x0 -= PAD; y0 -= PAD;
    const cw = x1 - x0 + PAD, ch = y1 - y0 + PAD;
    const land = this.state.printLand;
    const PW = land ? 1052 : 730, PH = land ? 730 : 1052;
    let SC = this.state.printScale;
    if (SC === "fit") SC = Math.min(PW / cw, PH / ch);
    let cols = Math.max(1, Math.round((cw * SC) / PW)), rows = Math.max(1, Math.round((ch * SC) / PH));
    SC = Math.min(SC, (cols * PW) / cw, (rows * PH) / ch);
    return { x0, y0, cw, ch, PW, PH, SC, cols, rows };
  }

  buildSheets() {
    const canvas = document.querySelector("[data-canvas]");
    if (!canvas) return null;
    this.clearSheets();
    const g = this.sheetGeom();
    const layer = document.createElement("div");
    layer.setAttribute("data-print-layer", "");
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const sheet = document.createElement("div");
      sheet.className = "om-sheet";
      sheet.style.cssText = `position:relative;width:${g.PW}px;height:${g.PH}px;overflow:hidden;background:#fff`;
      const clone = canvas.cloneNode(true);
      clone.style.cssText = `position:absolute;left:0;top:0;padding:0;margin:0;background:none;transform-origin:0 0;transform:translate(${-c * g.PW}px,${-r * g.PH}px) scale(${g.SC}) translate(${-g.x0}px,${-g.y0}px)`;
      sheet.appendChild(clone);
      const tag = document.createElement("div");
      tag.style.cssText = "position:absolute;right:14px;bottom:10px;font:10px 'Figtree',system-ui,sans-serif;color:#201e1d99;letter-spacing:.08em";
      tag.textContent = `${this.state.title} — лист ${r + 1}·${c + 1} из ${g.rows}·${g.cols}`;
      sheet.appendChild(tag);
      layer.appendChild(sheet);
    }
    document.body.appendChild(layer);
    this._sheets = { layer, ...g };
    return this._sheets;
  }

  renderPreview() {
    const box = document.querySelector("[data-preview]");
    if (!box) return;
    const s = this.buildSheets();
    if (!s) return;
    box.innerHTML = "";
    const W = s.PW > s.PH ? 252 : 186, k = W / s.PW;
    [...s.layer.children].forEach((sheet, i) => {
      const cell = document.createElement("div"); cell.style.cssText = `width:${W}px`;
      const frame = document.createElement("div");
      frame.style.cssText = `position:relative;width:${W}px;height:${Math.round(s.PH * k)}px;overflow:hidden;background:#fff;border:1px solid #201e1d33;box-shadow:0 4px 12px #201e1d1f`;
      const cl = sheet.cloneNode(true);
      cl.style.position = "absolute"; cl.style.left = "0"; cl.style.top = "0"; cl.style.transform = `scale(${k})`; cl.style.transformOrigin = "0 0";
      frame.appendChild(cl); cell.appendChild(frame);
      const cap = document.createElement("div");
      cap.style.cssText = "font:10px 'Figtree',system-ui,sans-serif;color:#201e1d99;margin-top:6px;letter-spacing:.06em";
      cap.textContent = `лист ${i + 1} из ${s.layer.children.length}`;
      cell.appendChild(cap);
      box.appendChild(cell);
    });
    const info = document.querySelector("[data-print-info]");
    if (info) info.textContent = `${s.rows} × ${s.cols} = ${s.rows * s.cols} лист(ов) A4 ${this.state.printLand ? "альбом" : "портрет"} · масштаб ${Math.round(s.SC * 100)}%`;
  }

  doPrint() {
    const s = this._sheets || this.buildSheets();
    if (!s) return;
    document.body.setAttribute("data-printing", "");
    const done = () => { document.body.removeAttribute("data-printing"); this.clearSheets(); window.removeEventListener("afterprint", done); this.setState({ printOpen: false }); };
    window.addEventListener("afterprint", done);
    setTimeout(() => window.print(), 80);
  }

  // ---- render helpers ----
  kicker(t) { return h("div", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".18em", textTransform: "uppercase", color: "#201e1d8c" } }, t); }

  renderHeader() {
    const s = this.state;
    const roleBtn = (r) => h("button", { key: r, onClick: () => (r === "Гость" ? this.setState({ role: "Гость", editing: false }) : this.askRole(r)),
      style: { padding: "6px 12px", border: "none", borderRight: r !== "Модератор" ? "1px solid #201e1d26" : "none", background: s.role === r ? "var(--color-text)" : "transparent", color: s.role === r ? "var(--color-bg)" : "var(--color-text)", font: "inherit", fontSize: "12px", cursor: "pointer" } }, r);
    return h("header", { style: { display: "flex", alignItems: "stretch", borderBottom: "1px solid var(--color-text)", background: "linear-gradient(#eee7db,var(--color-bg))", flex: "none", overflowX: "auto" } },
      h("div", { style: { padding: "13px 20px", borderRight: "1px solid #201e1d26", minWidth: "236px", display: "flex", alignItems: "center", gap: "13px", flex: "none" } },
        h("div", { style: { width: "38px", height: "38px", flex: "none", background: "var(--color-text)", color: "var(--color-bg)", display: "grid", placeItems: "center", fontSize: "19px", fontWeight: 600 } }, (s.title || "А").trim()[0].toUpperCase()),
        h("div", { style: { minWidth: 0 } },
          this.kicker("Семейный архив"),
          h("input", { value: s.title, onChange: (e) => this.setState({ title: e.target.value }), disabled: s.role !== "Модератор",
            title: s.role === "Модератор" ? "Название можно править здесь; также подтягивается из импорта (JSON: title, GEDCOM: 1 FILE)" : "Название меняет только модератор",
            style: { display: "block", width: "100%", border: "none", borderBottom: "1px " + (s.role === "Модератор" ? "dashed #201e1d59" : "solid transparent"), background: "transparent", font: "inherit", fontSize: "19px", fontWeight: 600, marginTop: "2px", padding: "1px 0", color: "var(--color-text)", outline: "none" } }))),
      h("div", { style: { flex: 1, minWidth: "70px", display: "flex", alignItems: "center", gap: "10px", padding: "0 16px", borderRight: "1px solid #201e1d26" } },
        h("span", { style: { fontFamily: "var(--font-body)", fontSize: "11px", color: "#201e1d8c", flex: "none" } }, "Поиск"),
        h("input", { value: s.q, onChange: (e) => this.setState({ q: e.target.value }), placeholder: "фамилия, город, профессия",
          style: { flex: 1, minWidth: "60px", border: "none", borderBottom: "1px solid #201e1d40", background: "transparent", font: "inherit", fontSize: "14px", padding: "5px 2px", outline: "none", color: "var(--color-text)" } })),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "0 14px", flex: "none", borderRight: "1px solid #201e1d26" } },
        h("div", { style: { display: "flex", border: "1px solid #201e1d26", flex: "none" } }, ["Гость", "Родственник", "Модератор"].map(roleBtn)),
        s.demo ? h("span", { title: "Сервер не подключён: данные читаются из data/sample.json, изменения никуда не сохраняются",
          style: { fontFamily: "var(--font-body)", fontSize: "10.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent)", border: "1px solid var(--color-accent)", padding: "2px 7px", flex: "none" } }, "демо") : null),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: "0 18px", flex: "none" } },
        h("button", { onClick: () => this.setState({ modOpen: true }), className: "btn btn-primary", style: { position: "relative" } },
          "Модерация", s.pending.length ? h("span", { style: { marginLeft: "8px", background: "var(--color-accent)", color: "#fff", fontFamily: "var(--font-body)", fontSize: "10.5px", padding: "1px 6px" } }, s.pending.length) : null),
        h("label", { className: "btn btn-secondary", title: "Импорт .json / .ged — название архива берётся из поля title (JSON) или строки 1 FILE в блоке HEAD (GEDCOM)" },
          "Импорт", h("input", { type: "file", accept: ".json,.ged,.gedcom", onChange: (e) => this.onImport(e), style: { display: "none" } })),
        h("label", { className: "btn btn-secondary", title: "Папка со сканами: после выбора откроется привязка файлов к людям" },
          "Сканы", h("input", { type: "file", accept: "image/*", multiple: true, webkitdirectory: "", onChange: (e) => this.onScanPick(e), style: { display: "none" } })),
        h("button", { onClick: () => this.m && this.m.download("family-archive-" + new Date().toISOString().slice(0, 10) + ".json", this.m.exportBackup(s.people || [], s.pending, { title: s.title })) || this.flash("Бэкап выгружен: люди, правки, название архива"), className: "btn btn-secondary", title: "Экспорт бэкапа в .json" }, "Экспорт"),
        h("button", { onClick: () => this.openPrint(), className: "btn btn-secondary", title: "Печать древа: предпросмотр листов A4" }, "Печать"),
        h("button", { onClick: () => this.setState({ mapOpen: !s.mapOpen, mapMode: "all", mapRoute: "" }), className: s.mapOpen ? "btn btn-primary" : "btn btn-secondary" }, "Карта")));
  }

  renderCanvas() {
    const s = this.state, m = this.m;
    if (!m || !s.people) return h("div", { style: { padding: "60px", color: "#201e1d8c" } }, "Загрузка…");
    const L = m.layout(s.people, { w: 200, h: 122, gx: 26, gy: 92 });
    const q = s.q.trim().toLowerCase();
    const hit = (p) => !q || [p.name, p.maiden, p.occupation, p.employer, ...(p.residences || []).map(r => r.place)].filter(Boolean).join(" ").toLowerCase().includes(q);
    const depths = [...new Set(L.nodes.map(n => n.depth))].sort((a, b) => a - b);
    const bands = depths.map(d => h("div", { key: "band" + d, style: { position: "absolute", left: 0, top: (d * (122 + 92) - 30) + "px", width: L.width + "px", borderTop: "1px dashed #201e1d26", paddingTop: "7px", fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".16em", textTransform: "uppercase", color: "#201e1d73", pointerEvents: "none" } }, "Поколение " + (ROMAN[d] || d + 1) + " · " + L.nodes.filter(n => n.depth === d).length + " человек"));
    const edges = L.edges.map((e, i) => h("div", { key: "e" + i, style: e.type === "h" ? { position: "absolute", left: e.x + "px", top: e.y + "px", width: Math.max(1, e.len) + "px", height: "1px", background: "#201e1d66" } : { position: "absolute", left: e.x + "px", top: e.y + "px", width: "1px", height: Math.max(1, e.len) + "px", background: "#201e1d66" } }));
    const nodes = L.nodes.map((n) => {
      const p = n.p, vis = this.visible(p), on = hit(p), isSel = p.id === s.sel;
      const nm = (p.name || "").split(" ");
      const ph = vis && (p.photos || []).find(x => x.src);
      const accent = "var(--color-accent-2)";
      return h("div", { key: p.id, style: { position: "absolute", left: n.x + "px", top: n.y + "px", width: n.w + "px", height: n.h + "px", opacity: on ? 1 : 0.22, transition: "opacity .2s" } },
        h("div", { onClick: () => this.setState({ sel: p.id, editing: false }),
          style: { display: "flex", height: "100%", boxSizing: "border-box", background: "linear-gradient(#f9f4ed,#eee7db)", border: "1px solid " + (isSel ? accent : "#201e1d4d"), borderRadius: "var(--radius-md)", borderLeft: "5px solid " + (isSel ? accent : GEN[n.depth % 5]), cursor: "pointer", position: "relative", boxShadow: isSel ? "0 6px 18px #7a8a5e38, 0 0 0 1px " + accent : "0 2px 6px #201e1d14, 2px 2px 0 #201e1d0d" } },
          h("div", { style: { width: "58px", flex: "none", margin: "10px 11px 10px 10px", background: ph ? "#000" : (vis ? "linear-gradient(135deg,#eee7db,#dcd3c4)" : "#201e1d0d"), backgroundImage: ph ? "url(" + ph.src + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "var(--radius-sm)", border: "1px solid #201e1d33", display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "13px", color: "#201e1d73" } }, vis ? (ph ? "" : m.initials(p)) : "•"),
          h("div", { style: { flex: 1, minWidth: 0, padding: "11px 12px 10px 0", display: "flex", flexDirection: "column", justifyContent: "center" } },
            h("div", { style: { flex: "none", fontSize: "14.5px", fontWeight: 600, lineHeight: 1.15 } }, vis ? nm.slice(0, 1).join(" ") : "Скрыто"),
            h("div", { style: { flex: "none", fontSize: "13px", lineHeight: 1.2, marginTop: "1px" } }, vis ? nm.slice(1).join(" ") : ""),
            h("div", { style: { flex: "none", fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1da6", marginTop: "6px" } }, vis ? m.years(p) : "живущий человек"),
            h("div", { style: { flex: "none", fontSize: "11.5px", color: "#201e1d99", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, vis ? (p.occupation || "") : "")),
          h("div", { style: { position: "absolute", right: "8px", top: "8px", width: "7px", height: "7px", borderRadius: "50%", background: p.living ? "var(--color-accent-2)" : "transparent" } })));
    });
    return h("div", { style: { flex: 1, position: "relative", overflow: "hidden" } },
      h("div", { style: { position: "absolute", inset: 0, overflow: "auto", background: "radial-gradient(120% 90% at 30% 0%,#f9f4ed,var(--color-surface) 70%,#dcd3c4)" } },
        h("div", { "data-canvas": "", style: { position: "relative", transform: "scale(" + s.zoom + ")", transformOrigin: "0 0", padding: "60px 80px", width: "max-content" } }, bands, edges, nodes)),
      h("div", { style: { position: "absolute", left: "18px", bottom: "18px", display: "flex", border: "1px solid #201e1d26", background: "var(--color-bg)" } },
        h("button", { onClick: () => this.setState({ zoom: Math.max(0.35, s.zoom - 0.12) }), style: { width: "32px", height: "30px", border: "none", borderRight: "1px solid #201e1d1a", background: "transparent", fontSize: "16px", cursor: "pointer", color: "var(--color-text)" } }, "−"),
        h("div", { style: { width: "52px", display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "11px", color: "#201e1da6" } }, Math.round(s.zoom * 100) + "%"),
        h("button", { onClick: () => this.setState({ zoom: Math.min(1.5, s.zoom + 0.12) }), style: { width: "32px", height: "30px", border: "none", borderLeft: "1px solid #201e1d1a", background: "transparent", fontSize: "16px", cursor: "pointer", color: "var(--color-text)" } }, "+")),
      h("div", { style: { position: "absolute", right: "18px", bottom: "18px", fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d9e", textAlign: "right", lineHeight: 1.6, background: "#f9f4ed", border: "1px solid #201e1d1f", borderRadius: "var(--radius-md)", padding: "8px 13px", boxShadow: "var(--shadow-sm)" } },
        h("div", null, s.people.length + " человек · " + L.nodes.reduce((a, n) => Math.max(a, n.depth), 0) + " поколения · " + s.people.reduce((a, p) => a + (p.photos || []).length, 0) + " фото"),
        h("div", null, "роль: " + s.role.toLowerCase() + (s.role === "Гость" ? " · живущие скрыты" : ""))),
      s.sel ? this.renderSidebar() : null,
      s.modOpen ? this.renderModPanel() : null,
      s.mapOpen ? this.renderMapPanel() : null,
      s.authOpen ? this.renderAuthDialog() : null,
      s.scanOpen ? this.renderScanDialog() : null,
      s.printOpen ? this.renderPrintDialog() : null,
      s.toast ? h("div", { style: { position: "absolute", left: "50%", bottom: "26px", transform: "translateX(-50%)", background: "var(--color-text)", color: "var(--color-bg)", padding: "11px 20px", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 30px #00000033", zIndex: 11 } }, h("span", { style: { width: "6px", height: "6px", background: "var(--color-accent)", flex: "none" } }), s.toast) : null);
  }

  renderSidebar() {
    const s = this.state, m = this.m;
    const p = (s.people || []).find(x => x.id === s.sel);
    if (!p) return null;
    const vis = this.visible(p);
    const idx = m.byId(s.people);
    const relatives = [
      ...(p.parents || []).map(id => ({ id, r: "родитель" })),
      ...(p.spouse || []).map(id => ({ id, r: "супруг" })),
      ...s.people.filter(x => (x.parents || []).includes(p.id)).map(x => ({ id: x.id, r: "ребёнок" }))
    ].filter(r => idx[r.id]);
    const facts = [["Родился", [p.birth?.date, p.birth?.place].filter(Boolean).join(", ")],
      ["Умер", p.living ? "" : [p.death?.date, p.death?.place].filter(Boolean).join(", ")],
      ["Профессия", p.occupation], ["Место работы", p.employer], ["Образование", p.education], ["Служба", p.military]].filter(x => x[1]);
    const docs = [...(p.documents || []).map(d => ({ tag: "док", text: d })), ...(p.sources || []).map(d => ({ tag: "ист", text: d }))];
    return h("aside", { className: "card elev-lg", style: { position: "absolute", right: 0, top: 0, bottom: 0, width: "452px", zIndex: 9, borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)", padding: 0, background: "#f9f4ed", overflow: "auto", boxShadow: "-14px 0 34px #201e1d14" } },
      h("div", { style: { padding: "22px 26px 18px", borderBottom: "1px solid var(--color-divider)", position: "sticky", top: 0, background: "#f9f4ed", zIndex: 2 } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" } },
          h("div", null, this.kicker("Карточка · " + p.id),
            h("h2", { style: { fontSize: "25px", fontWeight: 600, lineHeight: 1.15, margin: "6px 0 0" } }, p.name),
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "12px", color: "#201e1da6", marginTop: "6px" } }, m.years(p) + (p.maiden ? " · урожд. " + p.maiden : ""))),
          h("button", { onClick: () => this.setState({ sel: null, editing: false }), className: "btn btn-icon btn-ghost" }, "×")),
        h("div", { style: { display: "flex", gap: "8px", marginTop: "16px" } },
          h("button", { onClick: () => { this.setState({ editing: true, draft: { occupation: p.occupation || "", notes: p.notes || "", photos: [] } }); }, className: "btn btn-primary" }, "Предложить правку"),
          h("button", { onClick: () => this.setState({ mapOpen: true, mapMode: "route", mapRoute: p.id }), className: "btn btn-secondary" }, "Показать на карте"))),
      s.editing ? this.renderEditForm(p) : null,
      !vis ? h("div", { style: { margin: "26px", border: "1px dashed #201e1d40", padding: "22px", textAlign: "center", color: "#201e1d99", fontSize: "13.5px", lineHeight: 1.6 } }, "Данные живущего человека скрыты от гостей.", h("br"), "Войдите как родственник, чтобы увидеть карточку.") : null,
      vis ? h("div", { style: { padding: "0 26px 40px" } },
        h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", margin: "20px 0 8px" } },
          (p.photos || []).map((ph, i) => h("div", { key: i, style: { aspectRatio: "3/4", background: "linear-gradient(135deg,#eee7db,#dcd3c4)", border: "1px solid #201e1d2e", boxShadow: "0 2px 6px #201e1d14", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "7px", position: "relative" } },
            h("div", { style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "9px", letterSpacing: ".14em", color: "#201e1d59" } }, "ФОТО"),
            h("div", { style: { position: "relative", fontSize: "10.5px", lineHeight: 1.3, color: "var(--color-text)", background: "#f9f4ed", padding: "3px 5px" } }, ph.caption)))),
        h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10px", color: "#201e1d8c", marginBottom: "22px" } }, (p.photos || []).length ? (p.photos || []).length + " фотографии в карточке" : "фотографий пока нет"),
        facts.map(([k, v], i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "126px 1fr", gap: "14px", padding: "9px 0", borderTop: "1px solid #201e1d14", alignItems: "baseline" } },
          h("div", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".11em", textTransform: "uppercase", color: "#201e1d8c" } }, k),
          h("div", { style: { fontSize: "14.5px", lineHeight: 1.5 } }, v))),
        h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Места проживания"),
          (p.residences || []).map((r, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "96px 1fr", gap: "12px", padding: "6px 0", fontSize: "14px", alignItems: "baseline", marginTop: "10px" } },
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "11.5px", color: "#201e1da6" } }, r.from + (r.to ? "–" + r.to : "→")),
            h("div", null, r.place, r.note ? h("span", { style: { color: "#201e1d8c", fontSize: "12.5px" } }, " · " + r.note) : null)))),
        docs.length ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Документы и источники"),
          docs.map((d, i) => h("div", { key: i, style: { display: "flex", gap: "10px", padding: "6px 0", fontSize: "13.5px", lineHeight: 1.45, alignItems: "baseline", marginTop: "8px" } },
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", color: "var(--color-accent)", letterSpacing: ".1em", flex: "none", width: "44px" } }, d.tag), h("span", null, d.text)))) : null,
        p.notes ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Заметки"), h("p", { style: { fontSize: "15px", lineHeight: 1.62, margin: "8px 0 0", fontStyle: "italic", color: "#201e1de0" } }, p.notes)) : null,
        h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Связи"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" } },
            relatives.map((rel, i) => h("button", { key: i, onClick: () => this.setState({ sel: rel.id, editing: false }), style: { border: "1px solid #201e1d26", background: "transparent", font: "inherit", fontSize: "12.5px", padding: "5px 10px", cursor: "pointer", color: "var(--color-text)" } }, m.shortName(idx[rel.id]) + " · " + rel.r)))))
        : null);
  }

  renderEditForm(p) {
    const s = this.state, photos = s.draft.photos || [];
    return h("div", { style: { margin: "20px 26px", border: "1px solid var(--color-accent)", background: "#c671390a", padding: "16px 18px" } },
      h("div", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--color-accent)", marginBottom: "12px" } }, "Правка уйдёт на модерацию"),
      h("label", { style: { display: "block", fontSize: "11.5px", color: "#201e1d99", marginBottom: "4px" } }, "Профессия"),
      h("input", { value: s.draft.occupation || "", onChange: (e) => this.setState({ draft: { ...s.draft, occupation: e.target.value } }), style: { width: "100%", boxSizing: "border-box", border: "1px solid #201e1d33", background: "#fff", font: "inherit", fontSize: "14px", padding: "7px 9px", marginBottom: "12px", color: "var(--color-text)" } }),
      h("label", { style: { display: "block", fontSize: "11.5px", color: "#201e1d99", marginBottom: "4px" } }, "Заметки и истории"),
      h("textarea", { value: s.draft.notes || "", onChange: (e) => this.setState({ draft: { ...s.draft, notes: e.target.value } }), rows: 4, style: { width: "100%", boxSizing: "border-box", border: "1px solid #201e1d33", background: "#fff", font: "inherit", fontSize: "14px", padding: "7px 9px", resize: "vertical", color: "var(--color-text)" } }),
      h("label", { style: { display: "block", fontSize: "11.5px", color: "#201e1d99", margin: "12px 0 5px" } }, "Фотографии — по одной, с подписью"),
      h("div", { style: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "7px" } },
        photos.map((ph, i) => h("div", { key: i, style: { position: "relative", aspectRatio: "3/4", background: "#000", backgroundImage: "url(" + ph.src + ")", backgroundSize: "cover", backgroundPosition: "center", border: "1px solid #201e1d33" } },
          h("button", { onClick: () => this.setState({ draft: { ...s.draft, photos: photos.filter((_, j) => j !== i) } }), title: "Убрать", style: { position: "absolute", right: "3px", top: "3px", width: "18px", height: "18px", border: "none", background: "#201e1dcc", color: "#fff", fontSize: "11px", cursor: "pointer" } }, "×"),
          h("input", { value: ph.caption, onChange: (e) => { const arr = photos.slice(); arr[i] = { ...arr[i], caption: e.target.value }; this.setState({ draft: { ...s.draft, photos: arr } }); }, placeholder: "подпись, год",
            style: { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", boxSizing: "border-box", border: "none", borderTop: "1px solid #201e1d26", background: "#f9f4ed", font: "inherit", fontSize: "9.5px", padding: "3px 4px", color: "var(--color-text)", outline: "none" } }))),
        h("label", { style: { aspectRatio: "3/4", border: "1px dashed #201e1d59", background: "#fff9", display: "grid", placeItems: "center", cursor: "pointer", fontSize: "11px", color: "#201e1d8c", textAlign: "center", padding: "4px" } }, "+ фото", h("input", { type: "file", accept: "image/*", multiple: true, onChange: (e) => this.onDraftPhotos(e), style: { display: "none" } }))),
      h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10px", color: "#201e1d8c", marginTop: "7px" } }, photos.length ? "будет добавлено фото: " + photos.length : "фото можно добавлять по одной, каждая со своей подписью"),
      h("div", { style: { display: "flex", gap: "8px", marginTop: "13px" } },
        h("button", { onClick: () => this.submitEdit(), className: "btn btn-primary" }, "Отправить на проверку"),
        h("button", { onClick: () => this.setState({ editing: false }), className: "btn btn-secondary" }, "Отмена")));
  }

  renderModPanel() {
    const s = this.state;
    const kinds = { edit: ["правка", "var(--color-text)"], photo: ["фото", "var(--color-accent-2)"], new: ["новый человек", "var(--color-accent)"] };
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "44px 0", zIndex: 9 } },
      h("div", { className: "dialog", style: { width: "860px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px #00000040" } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--color-text)" } },
          h("div", null, this.kicker("Очередь модерации"),
            h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, s.pending.length + " правки ждут решения"),
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d8c", marginTop: "6px" } }, "уведомления: телеграм-бот + счётчик в шапке")),
          h("button", { onClick: () => this.setState({ modOpen: false }), className: "btn btn-secondary" }, "×")),
        h("div", { style: { overflow: "auto", padding: "6px 24px 24px" } },
          s.pending.map((x) => {
            const [label, color] = kinds[x.kind] || kinds.edit;
            return h("div", { key: x.id, style: { borderBottom: "1px solid #201e1d1a", padding: "20px 0" } },
              h("div", { style: { display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-start" } },
                h("div", { style: { flex: 1, minWidth: 0 } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" } },
                    h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", background: color, padding: "3px 7px" } }, label),
                    h("span", { style: { fontSize: "16px", fontWeight: 600 } }, x.targetName)),
                  h("div", { style: { fontSize: "13.5px", color: "#201e1da6", marginTop: "5px" } }, x.summary),
                  h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d8c", marginTop: "7px" } }, x.author + " · " + x.role + " · " + new Date(x.date).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }))),
                h("div", { style: { display: "flex", gap: "7px", flex: "none" } },
                  h("button", { onClick: () => this.approve(x), style: { padding: "7px 14px", border: "1px solid var(--color-text)", background: "var(--color-text)", color: "#f9f4ed", fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Принять"),
                  h("button", { onClick: () => this.reject(x), style: { padding: "7px 14px", border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent)", fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Отклонить"))),
              h("div", { style: { marginTop: "14px", border: "1px solid #201e1d1a", background: "#fff" } },
                x.changes.map((c, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "150px 1fr 1fr", borderBottom: "1px solid #201e1d0f", fontSize: "13.5px" } },
                  h("div", { style: { padding: "9px 12px", fontFamily: "var(--font-body)", fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: "#201e1d8c", borderRight: "1px solid #201e1d0f" } }, c.field),
                  h("div", { style: { padding: "9px 12px", background: "#c671390d", color: "#201e1d99", textDecoration: "line-through", borderRight: "1px solid #201e1d0f" } }, c.before),
                  h("div", { style: { padding: "9px 12px", background: "#7a8a5e0d", color: "var(--color-text)" } }, c.after)))));
          }),
          s.pending.length === 0 ? h("div", { style: { padding: "60px 0", textAlign: "center", color: "#201e1d8c", fontSize: "14px" } }, "Очередь пуста. Все правки обработаны.") : null)));
  }

  renderMapPanel() {
    const s = this.state;
    return h("div", { style: { position: "absolute", inset: 0, background: "var(--color-bg)", borderTop: "1px solid var(--color-text)", zIndex: 8 } },
      h("div", { style: { position: "absolute", right: "18px", top: "18px", zIndex: 6 } },
        h("button", { onClick: () => this.setState({ mapOpen: false }), style: { padding: "8px 15px", border: "1px solid var(--color-text)", background: "var(--color-text)", color: "var(--color-bg)", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Закрыть карту")),
      h("family-map", { "data-route": s.mapRoute || "", "data-mode": s.mapMode || "all", paper: "#f5ead8", ink: "#201e1d", accent: "#c67139", land: "#dcd3c4", muted: "#82796a", font: "Figtree, system-ui, sans-serif", radius: "16px", style: { width: "100%", height: "100%" } }));
  }

  renderAuthDialog() {
    const s = this.state, isMod = s.authRole === "Модератор";
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 12 } },
      h("div", { className: "dialog", style: { width: "520px", boxShadow: "0 24px 60px #00000047" } },
        h("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid #201e1d1a" } },
          this.kicker("Вход в архив"), h("div", { style: { fontSize: "21px", fontWeight: 600, marginTop: "4px" } }, isMod ? "Вход для хранителя архива" : "Вход по приглашению")),
        h("div", { style: { padding: "20px 24px 24px" } },
          h("div", { style: { fontSize: "13.5px", lineHeight: 1.6, color: "#201e1dbf", marginBottom: "18px" } }, isMod
            ? "Модераторов заводит владелец архива вручную: e-mail плюс пароль от 10 символов. Сессия живёт 30 дней, потом вход заново."
            : "Родственник получает персональную ссылку-приглашение на свой e-mail и четырёхзначный код из того же письма. Ссылка действует 14 дней; все правки идут в очередь модерации и подписаны его именем."),
          h("label", { style: { display: "block", fontSize: "11.5px", color: "#201e1d99", marginBottom: "4px" } }, isMod ? "E-mail хранителя" : "E-mail из приглашения"),
          h("input", { value: s.authLogin, onChange: (e) => this.setState({ authLogin: e.target.value }), placeholder: "name@example.org", style: { width: "100%", boxSizing: "border-box", border: "1px solid #201e1d33", background: "#fff", font: "inherit", fontSize: "14px", padding: "8px 10px", marginBottom: "12px", color: "var(--color-text)" } }),
          h("label", { style: { display: "block", fontSize: "11.5px", color: "#201e1d99", marginBottom: "4px" } }, isMod ? "Пароль" : "Код из письма"),
          h("input", { value: s.authSecret, onChange: (e) => this.setState({ authSecret: e.target.value }), type: "password", placeholder: isMod ? "минимум 10 символов" : "4 цифры", style: { width: "100%", boxSizing: "border-box", border: "1px solid #201e1d33", background: "#fff", font: "inherit", fontSize: "14px", padding: "8px 10px", color: "var(--color-text)" } }),
          s.authErr ? h("div", { style: { fontSize: "12.5px", color: "var(--color-accent)", marginTop: "10px" } }, s.authErr) : null,
          h("div", { style: { display: "flex", gap: "8px", marginTop: "18px", alignItems: "center" } },
            h("button", { onClick: () => this.authSubmit(), className: "btn btn-primary", disabled: s.authBusy }, "Войти"),
            h("button", { onClick: () => this.setState({ authOpen: false, authErr: "", authLogin: "", authSecret: "" }), className: "btn btn-secondary" }, "Отмена"),
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d8c", marginLeft: "auto" } }, s.authBusy ? "проверяем…" : "проверяет сервер")))));
  }

  renderScanDialog() {
    const s = this.state, idx = this.m.byId(s.people);
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 0", zIndex: 10 } },
      h("div", { className: "dialog", style: { width: "820px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px #00000040" } },
        h("div", { style: { padding: "18px 24px 15px", borderBottom: "1px solid var(--color-text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" } },
          h("div", null, this.kicker("Загрузка сканов"),
            h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, s.scanRows.length + " файлов — к каким людям отнести"),
            h("div", { style: { fontSize: "12.5px", color: "#201e1da6", marginTop: "6px", lineHeight: 1.5, maxWidth: "560px" } }, "Привязка определяется по имени папки или файла. Что не распознано — поправьте вручную.")),
          h("button", { onClick: () => this.setState({ scanOpen: false, scanRows: [] }), className: "btn btn-secondary" }, "×")),
        h("div", { style: { overflow: "auto", padding: "8px 24px 16px" } },
          s.scanRows.map((row, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "56px 1fr 260px 74px", gap: "14px", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #201e1d14" } },
            h("div", { style: { width: "56px", height: "56px", background: "#000", backgroundImage: "url(" + row.src + ")", backgroundSize: "cover", backgroundPosition: "center", border: "1px solid #201e1d33" } }),
            h("div", { style: { fontSize: "13px", lineHeight: 1.35, wordBreak: "break-all" } }, row.name),
            h("select", { value: row.personId, onChange: (e) => { const arr = s.scanRows.slice(); arr[i] = { ...arr[i], personId: e.target.value, auto: false }; this.setState({ scanRows: arr }); }, style: { width: "100%", border: "1px solid #201e1d33", background: "#fff", font: "inherit", fontSize: "13px", padding: "7px 8px", color: "var(--color-text)" } },
              (s.people || []).map(p => h("option", { key: p.id, value: p.id }, p.name + " · " + this.m.years(p)))),
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".1em", textTransform: "uppercase", color: row.auto ? "var(--color-accent-2)" : "#201e1d8c", textAlign: "right" } }, row.auto ? "авто" : "вручную")))),
        h("div", { style: { padding: "14px 24px", borderTop: "1px solid #201e1d1a", display: "flex", gap: "8px", alignItems: "center" } },
          h("button", { onClick: () => this.applyScans(), className: "btn btn-primary" }, s.role === "Модератор" ? "Добавить в карточки" : "Отправить на модерацию"),
          h("button", { onClick: () => this.setState({ scanOpen: false, scanRows: [] }), className: "btn btn-secondary" }, "Отмена"),
          h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d8c", marginLeft: "auto" } }, s.role === "Модератор" ? "вы модератор — фото появятся сразу" : "фото появятся после подтверждения"))));
  }

  renderPrintDialog() {
    const s = this.state;
    const scaleBtn = (v, label) => h("button", { key: label, onClick: () => { this.setState({ printScale: v }); setTimeout(() => this.renderPreview(), 60); },
      style: { padding: "6px 11px", border: "none", borderRight: v === 1 ? "none" : "1px solid #201e1d1a", background: s.printScale === v ? "var(--color-text)" : "transparent", color: s.printScale === v ? "#f9f4ed" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, label);
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "36px 0", zIndex: 10 } },
      h("div", { className: "dialog", style: { width: "900px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px #00000047" } },
        h("div", { style: { padding: "18px 24px 15px", borderBottom: "1px solid var(--color-text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" } },
          h("div", null, this.kicker("Печать древа"), h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, "Предпросмотр листов"), h("div", { "data-print-info": "", style: { fontFamily: "var(--font-body)", fontSize: "11px", color: "#201e1d8c", marginTop: "7px" } }, "считаю раскладку…")),
          h("button", { onClick: () => { this.clearSheets(); this.setState({ printOpen: false }); }, className: "btn btn-secondary" }, "×")),
        h("div", { style: { padding: "14px 24px 4px", display: "flex", gap: "22px", alignItems: "center", flexWrap: "wrap" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "#201e1d8c" } }, "Масштаб"),
            h("div", { style: { display: "flex", border: "1px solid #201e1d26" } }, [scaleBtn("fit", "В один лист"), scaleBtn(0.5, "50%"), scaleBtn(0.72, "72%"), scaleBtn(1, "100%")])),
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "#201e1d8c" } }, "Лист A4"),
            h("div", { style: { display: "flex", border: "1px solid #201e1d26" } },
              h("button", { onClick: () => { this.setState({ printLand: true }); setTimeout(() => this.renderPreview(), 60); }, style: { padding: "6px 11px", border: "none", borderRight: "1px solid #201e1d1a", background: s.printLand ? "var(--color-text)" : "transparent", color: s.printLand ? "#f9f4ed" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, "Альбом"),
              h("button", { onClick: () => { this.setState({ printLand: false }); setTimeout(() => this.renderPreview(), 60); }, style: { padding: "6px 11px", border: "none", background: !s.printLand ? "var(--color-text)" : "transparent", color: !s.printLand ? "#f9f4ed" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, "Портрет")))),
        h("div", { "data-preview": "", style: { overflow: "auto", padding: "18px 24px 24px", display: "flex", flexWrap: "wrap", gap: "16px", alignContent: "flex-start" } }),
        h("div", { style: { padding: "14px 24px", borderTop: "1px solid #201e1d1a", display: "flex", gap: "8px", alignItems: "center" } },
          h("button", { onClick: () => this.doPrint(), className: "btn btn-primary" }, "Отправить на печать"),
          h("button", { onClick: () => { this.clearSheets(); this.setState({ printOpen: false }); }, className: "btn btn-secondary" }, "Отмена"),
          h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "#201e1d8c", marginLeft: "auto" } }, "листы клеятся по порядку: слева направо, сверху вниз"))));
  }

  render() {
    return h("div", { style: { height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", fontSize: "15px", overflow: "hidden" } },
      this.renderHeader(), this.renderCanvas());
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
