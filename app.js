// Автономное приложение "Генеалогическое древо семьи" — чистый React, без DC-рантайма.
// Подключается из index.html после React/ReactDOM (UMD) и family-data.js (ES module).
const h = React.createElement;
const BY = (people, id) => people.find(x => x.id === id) || null;

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

// Достоверность сведений — цветом на карточке и подписью в карточке-развороте.
const STATUS_COLOR = { confirmed: "var(--status-confirmed)", unknown: "var(--status-unknown)", hypothesis: "var(--color-accent)" };
const STATUS_LABEL = { confirmed: "Подтверждено документом", unknown: "Со слов родных", hypothesis: "Гипотеза" };

// Фон: силуэт дерева. Он должен читаться и не спорить с содержанием, поэтому
// живёт одной полупрозрачной картинкой под полотном, а не набором элементов.
const BACKDROP = (w, hgt) => {
  const cx = w / 2, base = hgt;
  const branch = (dx, dy, sw) =>
    `<path d="M ${cx} ${base - hgt * (dy - 0.06)} Q ${cx + dx * w * 0.08} ${base - hgt * dy} ${cx + dx * w * 0.17} ${base - hgt * (dy + 0.12)}" stroke-width="${sw}"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${hgt}" preserveAspectRatio="xMidYMax meet">
    <g fill="none" stroke="#201e1d" stroke-linecap="round" opacity="0.055" stroke-width="14">
      <path d="M ${cx} ${base} L ${cx} ${base - hgt * 0.62}"/>
      ${branch(-1, 0.3, 9)}${branch(1, 0.34, 8)}${branch(-1, 0.5, 7)}${branch(1, 0.54, 6)}
    </g></svg>`;
  return "url(\"data:image/svg+xml," + encodeURIComponent(svg) + "\")";
};
// ——— Состояние в адресе страницы ———
// Ссылку на предка пересылают родне, поэтому выбранный человек, поиск, масштаб
// и открытая карта обязаны переживать перезагрузку и кнопку «назад». Раньше всё
// это жило только в памяти вкладки: поделиться видом было нечем.
const SIDEBAR_W = 452;
const DEFAULT_ZOOM = 0.82;

// world-map.js достраивает прозрачность склейкой строк (`${t.ink}22`), поэтому
// var(--color-text) ему передать нельзя — получится мусор. Раньше из-за этого
// цвета карты дублировались в app.js хэксами и отставали при смене темы: она
// осталась на старом пергаменте, когда весь остальной интерфейс уже сменил
// палитру. Токен читается на месте и уходит в карту уже вычисленным.
function themeHex(name, fallback) {
  if (typeof getComputedStyle !== "function") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return /^#[0-9a-fA-F]{6}$/.test(v) ? v : fallback;
}

function readUrl() {
  const u = new URLSearchParams(location.search);
  const z = parseFloat(u.get("z"));
  return {
    sel: u.get("p") || null,
    q: u.get("q") || "",
    view: ["ring", "river"].includes(u.get("v")) ? u.get("v") : "tree",
    zoom: isFinite(z) ? Math.min(1.5, Math.max(0.35, z)) : DEFAULT_ZOOM,
    mapOpen: u.has("map"),
    mapMode: u.get("map") === "route" ? "route" : "all",
    mapRoute: u.get("route") || ""
  };
}

// Значения по умолчанию в адрес не пишутся: ссылка на человека должна
// выглядеть как «?p=I14», а не тащить за собой весь стан интерфейса.
function writeUrl(st, push) {
  const u = new URLSearchParams();
  if (st.sel) u.set("p", st.sel);
  if (st.q) u.set("q", st.q);
  if (st.view && st.view !== "tree") u.set("v", st.view);
  if (Math.abs(st.zoom - DEFAULT_ZOOM) > 0.001) u.set("z", st.zoom.toFixed(2));
  if (st.mapOpen) {
    u.set("map", st.mapMode || "all");
    if (st.mapRoute) u.set("route", st.mapRoute);
  }
  const qs = u.toString();
  const next = location.pathname + (qs ? "?" + qs : "") + location.hash;
  if (next === location.pathname + location.search + location.hash) return;
  history[push ? "pushState" : "replaceState"](null, "", next);
}

const CFG = window.FT_CONFIG || {};
// Учётных данных в клиенте нет и быть не должно: роль подтверждает только сервер.
const HAS_API = !!String(CFG.apiBase || "").trim();

class App extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      people: null, pending: [], sel: null, q: "", role: "Гость", zoom: DEFAULT_ZOOM, modOpen: false, mapOpen: false,
      editing: false, draft: {}, form: null, panning: false, toast: null, title: CFG.fallbackTitle || "Семейное древо", verified: {},
      demo: !HAS_API, authOpen: false, authRole: null, authLogin: "", authSecret: "", authErr: "", authBusy: false,
      scanOpen: false, scanRows: [], printOpen: false, printScale: 0.72, printLand: true,
      mapMode: "all", mapRoute: "", view: "tree", moreOpen: false,
      // Узкий экран — не «мобильная версия» отдельным файлом, а другая раскладка
      // тех же узлов: шапка переносится, карточка становится нижним листом.
      narrow: typeof window !== "undefined" && window.matchMedia("(max-width: 760px)").matches,
      // Адрес страницы — источник первичного вида. Разбирается до загрузки
      // данных, чтобы не мигнуть древом и только потом открыть карточку.
      ...readUrl()
    };
  }

  componentDidMount() {
    this._onPerson = (e) => {
      const id = e.detail && e.detail.id;
      if (!id) return;
      this.select(id);
      this.flash("Открыта карточка: " + (e.detail.name || id));
    };
    document.addEventListener("person-open", this._onPerson);

    // «Назад» и «вперёд» браузера возвращают ровно тот вид, что был: адрес —
    // единственный источник правды о выборе, поиске, масштабе и карте.
    this._onPop = () => this.setState({ ...readUrl(), editing: false });
    window.addEventListener("popstate", this._onPop);

    this._mq = window.matchMedia("(max-width: 760px)");
    this._onMq = (e) => this.setState({ narrow: e.matches });
    this._mq.addEventListener("change", this._onMq);

    import("./family-data.js").then((m) => {
      this.m = m;
      // Данные всегда берутся из источника (API сервера, иначе — демонстрационный
      // набор). Ничего не восстанавливается из localStorage: кеш браузера не
      // является хранилищем архива.
      return m.whenReady().then((d) => {
        // Человек из ссылки открывается, если он в архиве есть. Если нет —
        // карточка не открывается, но и молчать нельзя: ссылка могла указывать
        // на удалённую запись или на живущего, которого гостю не отдали.
        const wanted = this.state.sel;
        const found = wanted && d.people.some(p => p.id === wanted);
        if (wanted && !found) this.flash("Карточки из ссылки нет в архиве: " + wanted);
        this.setState({
          people: d.people.slice(),
          pending: d.moderation.slice(),
          title: d.title || this.state.title,
          sel: found ? wanted : null,
          demo: d.source !== "api",
          // Роль восстанавливается из сессии: cookie переживает перезагрузку,
          // и вводить пароль заново незачем.
          ...this.roleFromServer(d)
        });
        if (d.source !== "api") this.flash("Демонстрационный режим: сервер не подключён, изменения не сохраняются");
      });
    }).catch((err) => {
      this.setState({ people: [], pending: [] });
      this.flash("Не удалось загрузить архив: " + err.message);
    });
  }

  componentWillUnmount() {
    document.removeEventListener("person-open", this._onPerson);
    window.removeEventListener("popstate", this._onPop);
    this._mq.removeEventListener("change", this._onMq);
    this.revokeScans();
  }

  // Адрес переписывается сам при любой смене вида. Выбор человека кладётся
  // отдельной записью в историю (её и ждёт кнопка «назад»), всё остальное —
  // поиск, масштаб, карта — правит текущую, иначе история забивается мусором.
  componentDidUpdate(_prevProps, prev) {
    const s = this.state;
    if (prev.sel !== s.sel || prev.q !== s.q || prev.zoom !== s.zoom || prev.view !== s.view ||
        prev.mapOpen !== s.mapOpen || prev.mapMode !== s.mapMode || prev.mapRoute !== s.mapRoute) {
      writeUrl(s, this._push === true);
      this._push = false;
    }
  }

  select(id) {
    this._push = true;
    this.setState({ sel: id, editing: false }, () => { if (id) this.ensureVisible(id); });
  }

  // Боковая карточка лежит поверх полотна. Раньше под неё раздвигался отступ
  // самого полотна, и всё древо прыгало вбок при каждом клике — человек
  // оказывался не там, куда смотрели. Теперь полотно стоит, а к выбранному
  // подъезжает прокрутка, и только если он действительно закрыт.
  ensureVisible(id) {
    const box = this._scroll, L = this._layout;
    if (!box || !L) return;
    const n = L.nodes.find(x => x.id === id);
    if (!n) return;
    const z = this.state.zoom, PADL = 80, PADT = 60, M = 24;
    const x1 = (PADL + n.x) * z, x2 = x1 + n.w * z;
    const y1 = (PADT + n.y) * z, y2 = y1 + n.h * z;
    // Место, занятое карточкой: сбоку на широком экране, снизу на узком.
    const cutW = this.state.narrow ? 0 : SIDEBAR_W;
    const cutH = this.state.narrow ? Math.round(box.clientHeight * 0.62) : 0;
    const l = box.scrollLeft + M, r = box.scrollLeft + box.clientWidth - cutW - M;
    const t = box.scrollTop + M, b = box.scrollTop + box.clientHeight - cutH - M;
    let left = box.scrollLeft, top = box.scrollTop;
    if (x2 > r) left += x2 - r; else if (x1 < l) left -= l - x1;
    if (y2 > b) top += y2 - b; else if (y1 < t) top -= t - y1;
    if (Math.round(left) === Math.round(box.scrollLeft) && Math.round(top) === Math.round(box.scrollTop)) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: Math.max(0, left), top: Math.max(0, top), behavior: still ? "auto" : "smooth" });
  }

  flash(t) { clearTimeout(this._t); this.setState({ toast: t }); this._t = setTimeout(() => this.setState({ toast: null }), 3200); }

  // ——— Перетаскивание полотна мышью, как на карте. Полосы прокрутки остаются,
  // но по большому древу удобнее возить рукой.
  startPan(e) {
    if (e.button !== 0) return;
    const box = e.currentTarget;
    const from = { x: e.clientX, y: e.clientY, left: box.scrollLeft, top: box.scrollTop };
    this._panned = false;

    const move = (ev) => {
      const dx = ev.clientX - from.x, dy = ev.clientY - from.y;
      // Мелкое дрожание рукой не должно отменять выбор карточки.
      if (!this._panned && Math.abs(dx) + Math.abs(dy) < 5) return;
      this._panned = true;
      this.setState((st) => (st.panning ? null : { panning: true }));
      box.scrollLeft = from.left - dx;
      box.scrollTop = from.top - dy;
      ev.preventDefault();
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      this.setState({ panning: false });
      // Флаг снимается после всплытия click, иначе конец перетаскивания
      // открывал бы карточку, над которой отпустили кнопку.
      setTimeout(() => { this._panned = false; }, 0);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  }
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

  // Роль, подтверждённая сервером. Возвращается пустой объект, если сервера нет:
  // в демонстрационном режиме роль остаётся той, что выбрана в интерфейсе.
  roleFromServer(d) {
    if (!d || d.source !== "api" || !d.role) return {};
    return { role: d.role, verified: { ...this.state.verified, [d.role]: true } };
  }

  // Перечитать архив с сервера — после входа, правки или решения модератора.
  reload() {
    if (!this.m) return Promise.resolve();
    return this.m.loadArchive().then((d) => {
      this.setState({
        people: d.people.slice(), pending: d.moderation.slice(),
        title: d.title || this.state.title, demo: d.source !== "api",
        ...this.roleFromServer(d)
      });
    }).catch((err) => this.flash("Не удалось обновить данные: " + err.message));
  }

  // ——— Карточка: правка и добавление одной формой. Модератору сервер применяет
  // изменения сразу, родственнику ставит в очередь — решает роль сессии, не клиент.
  openForm(person) {
    // living и minor входят в образец наравне с остальным: без них отметки не
    // читались из карточки и при каждом открытии показывались снятыми, из-за
    // чего выглядели неработающими.
    const blank = {
      surname: "", name: "", patronymic: "", maidenName: "", sex: "m", status: "unknown",
      birthDate: "", birthPlace: "", deathDate: "", deathPlace: "", bio: "", sources: "",
      fatherId: "", motherId: "", spouseIds: [], living: false, minor: false
    };
    const fields = person
      ? Object.keys(blank).reduce((a, k) => (a[k] = Array.isArray(blank[k]) ? (person[k] || []).slice() : (person[k] ?? blank[k]), a), {})
      : { ...blank, living: true };   // о новом человеке ничего не известно — скрываем от гостей
    // Версия карточки на момент открытия правки. Сервер её ведёт; отправляя
    // её обратно, клиент даёт серверу возможность заметить, что за это время
    // карточку изменил кто-то ещё, и ответить 409 вместо тихой перезаписи.
    this.setState({ form: { id: person ? person.id : null, baseVersion: person ? person.version : undefined, fields, photos: [] }, editing: true });
  }

  setField(k, v) {
    const f = this.state.form;
    this.setState({ form: { ...f, fields: { ...f.fields, [k]: v } } });
  }

  submitForm() {
    const s = this.state, f = s.form;
    if (!f) return;
    const isNew = !f.id;
    const named = [f.fields.surname, f.fields.name, f.fields.patronymic].some(v => String(v || "").trim());
    if (!named) return this.flash("Укажите хотя бы фамилию или имя");
    if (!HAS_API) return this.flash("Без сервера правка не сохранится — работает только просмотр");

    if (isNew) {
      return this.m.apiCreatePerson({ fields: f.fields })
        .then((res) => {
          this.setState({ form: null, editing: false, sel: res.id || s.sel });
          this.flash(res.queued ? "Отправлено модератору: новый человек" : "Человек добавлен");
          return this.reload();
        })
        .catch((err) => this.flash("Не удалось добавить: " + err.message));
    }

    const before = (s.people || []).find(x => x.id === f.id) || {};
    const LABEL = {
      surname: "Фамилия", name: "Имя", patronymic: "Отчество", maidenName: "Девичья фамилия",
      sex: "Пол", status: "Достоверность", birthDate: "Дата рождения", birthPlace: "Место рождения",
      deathDate: "Дата смерти", deathPlace: "Место смерти", bio: "Биография", sources: "Источники",
      fatherId: "Отец", motherId: "Мать", spouseIds: "Супруги"
    };
    const idx = this.m.byId(s.people || []);
    const show = (k, v) => {
      if (k === "fatherId" || k === "motherId") return v && idx[v] ? this.m.fio(idx[v]) : "—";
      if (k === "spouseIds") return (v || []).map(id => idx[id] && this.m.fio(idx[id])).filter(Boolean).join(", ") || "—";
      if (k === "status") return STATUS_LABEL[v] || v;
      if (k === "sex") return v === "f" ? "женский" : "мужской";
      return String(v || "—");
    };
    const fields = {}, changes = [];
    Object.keys(f.fields).forEach(k => {
      const now = f.fields[k], was = before[k];
      // Отметки сравниваются как отметки, а не как строки: «снято» и «поля нет»
      // для сервера одно и то же, и лишней правки быть не должно.
      const same = Array.isArray(now)
        ? JSON.stringify(now.slice().sort()) === JSON.stringify((was || []).slice().sort())
        : typeof now === "boolean" ? now === !!was : String(now || "") === String(was || "");
      if (same) return;
      fields[k] = now;
      changes.push({ field: LABEL[k] || k, before: show(k, was), after: show(k, now) });
    });
    const photos = f.photos || [];
    if (!changes.length && !photos.length) { this.setState({ form: null, editing: false }); return this.flash("Изменений нет"); }

    this.setState({ form: null, editing: false });
    // Снимки уходят отдельным маршрутом: файл — не утверждение о человеке,
    // он сохраняется сразу, а поля карточки идут обычным путём через роль.
    const sendPhotos = photos.length
      ? this.m.apiUploadPhotos(f.id, photos.map(x => ({ full: x.full, thumb: x.src, caption: x.caption })))
          .then((r) => this.flash("Снимков сохранено: " + r.added))
          .catch((err) => this.flash("Снимки не сохранились: " + err.message))
      : Promise.resolve();

    const sendFields = changes.length
      ? this.m.apiSubmitEdit(f.id, { fields, changes, version: f.baseVersion })
          .then((res) => this.flash(res.queued ? "Отправлено модератору" : "Сохранено"))
          .catch((err) => this.flash(err.status === 409
            ? "Карточку успел изменить кто-то ещё. Ваша правка не применена — архив перечитан, откройте правку заново."
            : "Не удалось отправить правку: " + err.message))
      : Promise.resolve();

    return sendPhotos.then(() => sendFields).then(() => this.reload());
  }

  // Удаление правит древо у всех, кто ссылался на карточку, поэтому спрашиваем
  // подтверждение и называем, что именно исчезнет.
  deletePerson(p) {
    const s = this.state;
    const kids = (s.people || []).filter(x => x.fatherId === p.id || x.motherId === p.id).length;
    const text = "Удалить карточку: " + this.m.fio(p) + "?\n\n" +
      (kids ? "У " + kids + " человек в древе пропадёт связь с этим родителем.\n" : "") +
      "Действие необратимо.";
    if (!window.confirm(text)) return;
    this.m.apiDeletePerson(p.id)
      .then(() => { this.setState({ sel: null, editing: false, form: null }); this.flash("Карточка удалена"); return this.reload(); })
      .catch((err) => this.flash(/HTTP 403/.test(err.message) ? "Удалять может только модератор" : "Не удалось удалить: " + err.message));
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
    if (!this.state.form) return;
    this.flash("Готовлю снимки…");
    // Пересохранение в браузере уменьшает файл и снимает EXIF ещё до отправки.
    Promise.all(files.map(async (file) => ({
      uid: this.m.photoUid(),
      src: await this.m.compressImage(file, 320, 0.7),
      full: await this.m.compressImage(file, 1600, 0.82),
      caption: file.name.replace(/\.[a-z0-9]+$/i, "")
    }))).then((add) => {
      const form = this.state.form;
      if (form) this.setState({ form: { ...form, photos: [...(form.photos || []), ...add] } });
      this.flash("Снимков добавлено: " + add.length + ". Сохраните карточку.");
    }).catch((err) => this.flash("Не удалось прочитать снимок: " + err.message));
  }

  onScanPick(e) {
    const files = [...(e.target.files || [])].filter(f => /^image\//.test(f.type)).slice(0, 60);
    e.target.value = "";
    if (!files.length) return this.flash("Изображений в папке не найдено");
    const people = this.state.people || [];
    const norm = (t) => String(t || "").toLowerCase().replace(/ё/g, "е").replace(/[^а-яa-z]+/g, " ");
    const rows = files.map((f) => {
      const path = norm(f.webkitRelativePath || f.name);
      let best = null;
      people.forEach(p => {
        const words = norm(this.m.fio(p)).split(" ").filter(w => w.length > 3);
        const score = words.filter(w => path.includes(w)).length;
        if (score >= 2 && (!best || score > best.score)) best = { id: p.id, score };
      });
      // src здесь — только для предпросмотра в диалоге: blob-ссылка живёт до
      // перезагрузки страницы и в карточку попасть не должна. Сам файл едет
      // рядом и при подтверждении пересохраняется в data-URL, как и снимки,
      // добавленные поштучно.
      return { name: f.webkitRelativePath || f.name, file: f, src: URL.createObjectURL(f), personId: best ? best.id : (this.state.sel || people[0]?.id || ""), auto: !!best };
    });
    this.revokeScans();
    this._scanUrls = rows.map(r => r.src);
    this.setState({ scanOpen: true, scanRows: rows });
  }

  // Каждая blob-ссылка держит файл в памяти вкладки до перезагрузки. На папке
  // в шесть десятков снимков это заметно, поэтому ссылки отзываются, как
  // только предпросмотр закрыт — подтверждением или отменой.
  revokeScans() {
    (this._scanUrls || []).forEach(u => { try { URL.revokeObjectURL(u); } catch (e) { /* уже отозвана */ } });
    this._scanUrls = null;
  }

  closeScans() {
    this.revokeScans();
    this.setState({ scanOpen: false, scanRows: [] });
  }

  applyScans() {
    const s = this.state, rows = s.scanRows;
    if (!rows.length) return this.closeScans();
    this.flash("Готовлю " + rows.length + " снимков…");
    // Пересохранение в data-URL обязательно: blob-ссылка мертва после
    // перезагрузки, а на сервер ушла бы строкой вида blob:https://… — то есть
    // карточка осталась бы без фотографии, хотя интерфейс отчитался об успехе.
    Promise.all(rows.map(async (r) => ({
      personId: r.personId,
      uid: this.m.photoUid(),
      src: r.file ? await this.m.compressImage(r.file, 320, 0.7) : r.src,
      full: r.file ? await this.m.compressImage(r.file, 1600, 0.82) : r.src,
      caption: r.name.split("/").pop().replace(/\.[a-z0-9]+$/i, "")
    })))
      .then((ready) => this.commitScans(ready))
      .catch((err) => this.flash("Не удалось подготовить снимки: " + err.message));
  }

  commitScans(ready) {
    const s = this.state, rows = ready;
    const byPerson = {};
    rows.forEach(r => { (byPerson[r.personId] = byPerson[r.personId] || []).push({ uid: r.uid, src: r.src, full: r.full, caption: r.caption }); });
    const idx = this.m.byId(s.people);
    if (s.role === "Модератор") {
      const people = s.people.map(p => byPerson[p.id] ? { ...p, photos: [...(p.photos || []), ...byPerson[p.id]] } : p);
      this.revokeScans();
      this.setState({ people, scanOpen: false, scanRows: [] });
      return this.flash("Добавлено " + rows.length + " фото в " + Object.keys(byPerson).length + " карточек");
    }
    const recs = Object.keys(byPerson).map((pid, i) => ({
      id: "u" + Date.now() + i, author: "Вы", role: s.role.toLowerCase(), date: new Date().toISOString(),
      target: pid, targetName: idx[pid] ? this.m.fio(idx[pid]) : pid, kind: "photo",
      summary: "Сканы из папки: " + byPerson[pid].length + " файлов",
      changes: [{ field: "Галерея", before: ((idx[pid]?.photos || []).length) + " фото", after: ((idx[pid]?.photos || []).length + byPerson[pid].length) + " фото" },
        ...byPerson[pid].map(ph => ({ field: "Файл", before: "—", after: ph.caption }))],
      patch: { fields: {}, photos: byPerson[pid] }
    }));
    this.revokeScans();
    this.setState({ pending: [...recs, ...s.pending], scanOpen: false, scanRows: [] });
    this.flash("На модерацию отправлено " + rows.length + " фото");
  }

  onImport(e) {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      try {
        const txt = String(r.result);
        // При подключённом сервере разбор и запись выполняет он: иначе импорт
        // оседал бы в памяти вкладки и исчезал при перезагрузке страницы.
        if (HAS_API) return this.importToServer(f.name, txt);
        const res = /\.ged/i.test(f.name) ? this.m.parseGedcom(txt) : this.m.parseJson(txt);
        if (!res.people.length) return this.flash("В файле не найдено записей о людях");
        const patch = { people: res.people, sel: res.people[0].id };
        if (res.title) patch.title = res.title;
        this.setState(patch);
        this.flash("Импорт " + f.name + " (демонстрационный режим: в памяти вкладки, до перезагрузки): " + res.people.length + " человек");
      } catch (err) { this.flash("Не удалось разобрать файл: " + err.message); }
    };
    r.readAsText(f);
    e.target.value = "";
  }

  // Импорт на сервер в два захода. Сначала разбор без записи: признак «живущий»
  // решает, кого увидит гость, поэтому число таких карточек показывается до
  // того, как что-то сохранено, а не после.
  importToServer(name, text) {
    this.flash("Разбор файла на сервере…");
    return this.m.apiImport(name, text, { dryRun: true }).then((rep) => {
      // Файл со справочником мест людей не содержит — это не ошибка.
      if (!rep.accepted && rep.places) {
        if (!window.confirm("Файл: " + name + "\nКарточек нет, мест на карте: " + rep.places + ".\n\nЗагрузить координаты?")) {
          return this.flash("Импорт отменён");
        }
        return this.m.apiImport(name, text, { dryRun: false })
          .then((res) => { this.flash("Загружено мест: " + res.places); return this.reload(); });
      }
      if (!rep.accepted) {
        return this.flash("Записей о людях не найдено" + (rep.rejected.length ? ". Отклонено: " + rep.rejected.length : ""));
      }
      const shown = rep.living.slice(0, 15)
        .map(p => "  " + p.name + (p.year ? " (р. " + p.year + ")" : " (год рождения неизвестен)"));
      if (rep.living.length > shown.length) shown.push("  … ещё " + (rep.living.length - shown.length));
      const text0 = [
        "Файл: " + name,
        "Принято записей: " + rep.accepted + (rep.families ? ", семей: " + rep.families : ""),
        "Отклонено: " + rep.rejected.length + (rep.rejected.length ? " — " + rep.rejected.slice(0, 3).join("; ") : ""),
        "",
        "Помечены живущими, гостям не отдаются: " + rep.living.length,
        shown.join("\n"),
        "",
        "Записать в базу? Карточки с теми же идентификаторами будут заменены."
      ].filter(Boolean).join("\n");
      if (!window.confirm(text0)) return this.flash("Импорт отменён: база не изменялась");
      return this.m.apiImport(name, text, { dryRun: false }).then((res) => {
        this.flash("Загружено в базу: " + res.accepted + " карточек" + (res.places ? ", мест: " + res.places : ""));
        return this.reload();
      });
    }).catch((err) => this.flash(
      /HTTP 403/.test(err.message) ? "Импорт доступен только модератору — войдите" :
      /HTTP 413/.test(err.message) ? "Файл больше 20 МБ" :
      "Импорт не выполнен: " + err.message));
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
    // Каждому листу достаётся своя копия полотна: на большом древе это десятки
    // клонов, и операция ощутимо задумывается. Раньше она шла молча, и
    // подвисший интерфейс выглядел поломкой — теперь хотя бы понятно, что идёт
    // работа и сколько её.
    if (g.rows * g.cols > 4) this.flash("Собираю " + (g.rows * g.cols) + " листов…");
    for (let r = 0; r < g.rows; r++) for (let c = 0; c < g.cols; c++) {
      const sheet = document.createElement("div");
      sheet.className = "om-sheet";
      sheet.style.cssText = `position:relative;width:${g.PW}px;height:${g.PH}px;overflow:hidden;background:#fff`;
      const clone = canvas.cloneNode(true);
      clone.style.cssText = `position:absolute;left:0;top:0;padding:0;margin:0;background:none;transform-origin:0 0;transform:translate(${-c * g.PW}px,${-r * g.PH}px) scale(${g.SC}) translate(${-g.x0}px,${-g.y0}px)`;
      sheet.appendChild(clone);
      const tag = document.createElement("div");
      tag.style.cssText = "position:absolute;right:14px;bottom:10px;font:10px var(--font-body);color:var(--ink-60);letter-spacing:.08em";
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
      frame.style.cssText = `position:relative;width:${W}px;height:${Math.round(s.PH * k)}px;overflow:hidden;background:#fff;border:1px solid var(--ink-20);box-shadow:0 4px 12px var(--ink-12)`;
      const cl = sheet.cloneNode(true);
      cl.style.position = "absolute"; cl.style.left = "0"; cl.style.top = "0"; cl.style.transform = `scale(${k})`; cl.style.transformOrigin = "0 0";
      frame.appendChild(cl); cell.appendChild(frame);
      const cap = document.createElement("div");
      cap.style.cssText = "font:10px var(--font-body);color:var(--ink-60);margin-top:6px;letter-spacing:.06em";
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
  kicker(t) { return h("div", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ink-65)" } }, t); }

  renderHeader() {
    const s = this.state;
    const roleBtn = (r) => h("button", { key: r, onClick: () => (r === "Гость" ? this.setState({ role: "Гость", editing: false }) : this.askRole(r)),
      style: { padding: "6px 12px", border: "none", borderRight: r !== "Модератор" ? "1px solid var(--ink-15)" : "none", background: s.role === r ? "var(--color-text)" : "transparent", color: s.role === r ? "var(--color-bg)" : "var(--color-text)", font: "inherit", fontSize: "12px", cursor: "pointer" } }, r);
    // Шапка была лентой с горизонтальной прокруткой: на 1000 пикселях уже
    // пропадала кнопка «Карта», на телефоне оставался один логотип. Теперь
    // блоки переносятся строками на любой ширине — ни один элемент управления
    // не уезжает за край, и горизонтальной прокрутки у шапки нет вовсе.
    // Флаг narrow отвечает уже не за перенос, а за отступы и разделители.
    const nw = s.narrow;
    const sep = nw ? { borderBottom: "1px solid var(--ink-15)" } : { borderRight: "1px solid var(--ink-15)" };
    return h("header", { style: { display: "flex", alignItems: "stretch", flexWrap: "wrap", borderBottom: "1px solid var(--color-text)", background: "linear-gradient(var(--color-neutral-200),var(--color-bg))", flex: "none", overflowX: "visible" } },
      h("div", { style: { padding: nw ? "11px 14px" : "13px 20px", ...sep, minWidth: nw ? "100%" : "236px", display: "flex", alignItems: "center", gap: "13px", flex: "none" } },
        h("div", { style: { width: "38px", height: "38px", flex: "none", background: "var(--color-text)", color: "var(--color-bg)", display: "grid", placeItems: "center", fontSize: "19px", fontWeight: 600 } }, (s.title || "А").trim()[0].toUpperCase()),
        h("div", { style: { minWidth: 0 } },
          this.kicker("Семейный архив"),
          h("input", { value: s.title, onChange: (e) => this.setState({ title: e.target.value }), disabled: s.role !== "Модератор",
            title: s.role === "Модератор" ? "Название можно править здесь; также подтягивается из импорта (JSON: title, GEDCOM: 1 FILE)" : "Название меняет только модератор",
            style: { display: "block", width: "100%", border: "none", borderBottom: "1px " + (s.role === "Модератор" ? "dashed var(--ink-35)" : "solid transparent"), background: "transparent", font: "inherit", fontSize: "19px", fontWeight: 600, marginTop: "2px", padding: "1px 0", color: "var(--color-text)", outline: "none" } }))),
      h("div", { style: { flex: nw ? "1 1 240px" : 1, minWidth: "70px", display: "flex", alignItems: "center", gap: "10px", padding: nw ? "6px 14px" : "0 16px", ...(nw ? {} : sep) } },
        h("span", { style: { fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--ink-65)", flex: "none" } }, "Поиск"),
        h("input", { value: s.q, onChange: (e) => this.setState({ q: e.target.value }), placeholder: "фамилия, город, профессия",
          style: { flex: 1, minWidth: "60px", border: "none", borderBottom: "1px solid var(--ink-25)", background: "transparent", font: "inherit", fontSize: "14px", padding: "5px 2px", outline: "none", color: "var(--color-text)" } })),
      h("div", { style: { display: "flex", alignItems: "center", gap: "8px", padding: nw ? "8px 14px 0" : "0 14px", flex: "none", ...(nw ? {} : sep) } },
        h("div", { style: { display: "flex", border: "1px solid var(--ink-15)", flex: "none" } }, ["Гость", "Родственник", "Модератор"].map(roleBtn)),
        // Один архив — несколько взглядов. Древо отвечает «кто чей»,
        // круг — «чего мы не знаем»; вид попадает в адрес наравне с человеком.
        h("div", { style: { display: "flex", border: "1px solid var(--ink-15)", flex: "none" } },
          [["tree", "Древо"], ["ring", "Круг"], ["river", "Река"]].map(([v, label]) =>
            h("button", { key: v, onClick: () => this.setState({ view: v }),
              title: v === "ring" ? "Кольца предков: видно, каких предков не хватает"
                : v === "river" ? "Линии жизни на оси лет: кто кого застал и что пережил"
                : "Схема поколений",
              style: { padding: "6px 12px", border: "none", borderRight: v !== "river" ? "1px solid var(--ink-15)" : "none", background: s.view === v ? "var(--color-text)" : "transparent", color: s.view === v ? "var(--color-bg)" : "var(--color-text)", font: "inherit", fontSize: "12px", cursor: "pointer" } }, label))),
        s.demo ? h("span", { title: "Сервер не подключён: данные читаются из data/sample.json, изменения никуда не сохраняются",
          style: { fontFamily: "var(--font-body)", fontSize: "10.5px", letterSpacing: ".08em", textTransform: "uppercase", color: "var(--color-accent)", border: "1px solid var(--color-accent)", padding: "2px 7px", flex: "none" } }, "демо") : null),
      // На телефоне шапка занимала около трети экрана. «Импорт», «Сканы»,
      // «Экспорт» и «Печать» нужны редко и только за столом, поэтому на узком
      // экране они убраны под кнопку «Ещё». Часто нужные «+ Человек»,
      // «Модерация» и «Карта» остаются на виду всегда.
      h("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", padding: nw ? "8px 14px 10px" : "0 18px", flex: nw ? "1 1 auto" : "none" } },
        s.role !== "Гость" ? h("button", { onClick: () => this.openForm(null), className: "btn btn-primary" }, "+ Человек") : null,
        s.role === "Модератор" ? h("button", { onClick: () => this.setState({ modOpen: true }), className: "btn btn-primary", style: { position: "relative" } },
          "Модерация", s.pending.length ? h("span", { style: { marginLeft: "8px", background: "var(--color-accent)", color: "#fff", fontFamily: "var(--font-body)", fontSize: "10.5px", padding: "1px 6px" } }, s.pending.length) : null) : null,
        h("button", { onClick: () => this.setState({ mapOpen: !s.mapOpen, mapMode: "all", mapRoute: "" }), className: s.mapOpen ? "btn btn-primary" : "btn btn-secondary" }, "Карта"),
        nw ? h("button", { onClick: () => this.setState({ moreOpen: !s.moreOpen }), className: s.moreOpen ? "btn btn-primary" : "btn btn-secondary", "aria-expanded": String(!!s.moreOpen) }, s.moreOpen ? "Свернуть" : "Ещё") : null,
        (!nw || s.moreOpen) ? h("div", { style: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px", flex: nw ? "1 1 100%" : "none", marginTop: nw ? "2px" : 0 } },
          // Импорт заменяет карточки целиком, поэтому доступен только модератору:
          // сервер в этом маршруте отказывает всем остальным, и кнопка не должна
          // обещать того, чего не будет.
          s.role === "Модератор" ? h("label", { className: "btn btn-secondary", title: "Импорт .json / .ged — название архива берётся из поля title (JSON) или строки 1 FILE в блоке HEAD (GEDCOM)" },
            "Импорт", h("input", { type: "file", accept: ".json,.ged,.gedcom", onChange: (e) => this.onImport(e), style: { display: "none" } })) : null,
          h("label", { className: "btn btn-secondary", title: "Папка со сканами: после выбора откроется привязка файлов к людям" },
            "Сканы", h("input", { type: "file", accept: "image/*", multiple: true, webkitdirectory: "", onChange: (e) => this.onScanPick(e), style: { display: "none" } })),
          h("button", { onClick: () => this.m && this.m.download("family-archive-" + new Date().toISOString().slice(0, 10) + ".json", this.m.exportBackup(s.people || [], s.pending, { title: s.title })) || this.flash("Бэкап выгружен: люди, правки, название архива"), className: "btn btn-secondary", title: "Экспорт бэкапа в .json" }, "Экспорт"),
          h("button", { onClick: () => this.openPrint(), disabled: s.view !== "tree", className: "btn btn-secondary", title: s.view === "tree" ? "Печать древа: предпросмотр листов A4" : "Печать собирает листы из полотна древа — переключитесь на вид «Древо»" }, "Печать")) : null));
  }

  renderCanvas() {
    const s = this.state, m = this.m;
    if (!m || !s.people) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Загрузка…");
    const L = m.layout(s.people, { w: 200, h: 122, gx: 26, gy: 92 });
    this._layout = L;   // нужна ensureVisible, чтобы найти координаты карточки
    const q = s.q.trim().toLowerCase();
    const hit = (p) => !q || [p.surname, p.name, p.patronymic, p.maidenName, p.bio, p.birthPlace, p.deathPlace]
      .concat((p.residences || []).map(r => r.place)).filter(Boolean).join(" ").toLowerCase().includes(q);
    const depths = [...new Set(L.nodes.map(n => n.depth))].sort((a, b) => a - b);
    const bands = depths.map(d => h("div", { key: "band" + d, style: { position: "absolute", left: 0, top: (d * (122 + 92) - 30) + "px", width: L.width + "px", borderTop: "1px dashed var(--ink-15)", paddingTop: "7px", fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".16em", textTransform: "uppercase", color: "var(--ink-65)", pointerEvents: "none" } }, "Поколение " + (ROMAN[d] || d + 1) + " · " + L.nodes.filter(n => n.depth === d).length + " человек"));
    // Связи рисуются одним слоем SVG, а не набором тонких блоков. Полотно
    // масштабируется CSS-преобразованием, и линия толщиной в один пиксель при
    // масштабе 0,82 округлялась до нуля — часть связей просто исчезала и
    // проявлялась лишь при выделении, когда линия становилась толще.
    //
    // Связи выбранного человека — путь вверх к родителям и отводы вниз к детям —
    // рисуются цветом и толще, остальное древо приглушается: в архиве на полсотни
    // карточек иначе не проследить, кто кому кто.
    const edgeLayer = h("svg", {
      width: L.width, height: L.height,
      style: { position: "absolute", left: 0, top: 0, overflow: "visible", pointerEvents: "none" }
    }, L.edges.map((e, i) => {
      const on = s.sel && (e.ids || []).includes(s.sel);
      const dim = s.sel && !on;
      const len = Math.max(1, e.len);
      return h("line", {
        key: "e" + i,
        x1: e.x, y1: e.y,
        x2: e.type === "h" ? e.x + len : e.x,
        y2: e.type === "h" ? e.y : e.y + len,
        // Золото — только на пути выбранного человека. Если им покрасить все
        // связи, оно перестаёт что-либо значить и превращается в узор.
        stroke: on ? "var(--color-accent-2)" : "var(--ink-55)",
        strokeWidth: on ? 2.8 : 1.4,
        strokeDasharray: e.spouse ? "5 4" : null,
        strokeLinecap: "square",
        opacity: dim ? 0.28 : 1
      });
    }));
    // Ближайшая родня выбранного человека — отмечается рамкой, чтобы связь
    // читалась не только по линиям, но и по самим карточкам.
    const selected = s.sel ? (s.people || []).find(x => x.id === s.sel) : null;
    const kin = new Set();
    if (selected) {
      [selected.fatherId, selected.motherId, ...(selected.spouseIds || [])].forEach(id => id && kin.add(id));
      (s.people || []).forEach(x => { if (x.fatherId === selected.id || x.motherId === selected.id) kin.add(x.id); });
    }

    const nodes = L.nodes.map((n) => {
      const p = n.p, vis = this.visible(p), on = hit(p), isSel = p.id === s.sel;
      const isKin = kin.has(p.id);
      const ph = vis && (p.photos || []).find(x => x.src);
      const accent = "var(--color-accent-2)";
      // Полоса слева — достоверность сведений: в родословной это такая же часть
      // карточки, как имя, иначе гипотеза выглядит как установленный факт.
      const edge = isSel ? accent : (STATUS_COLOR[p.status] || STATUS_COLOR.unknown);
      // Веер раскрытия: карточка запаздывает на 40ms за поколение, как в
      // спецификации анимаций концепта. Древо не появляется разом плитой,
      // а прорастает сверху вниз.
      return h("div", { key: p.id, className: "unfold", style: { position: "absolute", left: n.x + "px", top: n.y + "px", width: n.w + "px", height: n.h + "px", opacity: on ? 1 : 0.22, transition: "opacity .2s", animationDelay: (n.depth * 40) + "ms" } },
        h("div", { className: "node-card", onClick: () => { if (this._panned) return; this.select(p.id); }, title: vis ? m.fio(p) : "Живущий человек — карточка скрыта",
          style: { display: "flex", height: "100%", boxSizing: "border-box", background: "linear-gradient(var(--color-neutral-100),var(--color-neutral-200))", border: "1px solid " + (isSel ? accent : isKin ? "var(--color-accent)" : "var(--ink-30)"), borderRadius: "var(--radius-md)", borderLeft: "5px solid " + edge, cursor: "pointer", position: "relative", boxShadow: isSel ? "0 6px 18px var(--accent-2-22), 0 0 0 1px " + accent : isKin ? "0 0 0 1px var(--color-accent)" : "0 2px 6px var(--ink-08), 2px 2px 0 var(--ink-05)" } },
          h("div", { style: { width: "58px", flex: "none", margin: "10px 11px 10px 10px", background: ph ? "#000" : (vis ? "linear-gradient(135deg,var(--color-neutral-200),var(--color-neutral-300))" : "var(--ink-05)"), backgroundImage: ph ? "url(" + ph.src + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center", borderRadius: "var(--radius-sm)", border: "1px solid var(--ink-20)", display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "13px", color: "var(--ink-65)" } }, vis ? (ph ? "" : m.initials(p)) : "•"),
          h("div", { style: { flex: 1, minWidth: 0, padding: "11px 12px 10px 0", display: "flex", flexDirection: "column", justifyContent: "center" } },
            h("div", { style: { flex: "none", fontSize: "14.5px", fontWeight: 600, lineHeight: 1.15, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, vis ? (p.surname || "—") : "Скрыто"),
            h("div", { style: { flex: "none", fontSize: "13px", lineHeight: 1.2, marginTop: "1px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, vis ? [p.name, p.patronymic].filter(Boolean).join(" ") : ""),
            h("div", { style: { flex: "none", fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginTop: "6px" } }, vis ? m.years(p) : "живущий человек"),
            h("div", { style: { flex: "none", fontSize: "11.5px", color: "var(--ink-60)", marginTop: "3px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } }, vis ? (p.bio || p.birthPlace || "") : "")),
          h("div", { style: { position: "absolute", right: "8px", top: "8px", width: "7px", height: "7px", borderRadius: "50%", background: p.living ? "var(--color-accent-2)" : "transparent" } })));
    });
    return h("div", { style: { flex: 1, position: "relative", overflow: "hidden" } },
      h("div", { "data-scroll": "", ref: (el) => { this._scroll = el; }, onMouseDown: (e) => this.startPan(e),
        style: { position: "absolute", inset: 0, overflow: "auto", cursor: s.panning ? "grabbing" : "grab", background: "var(--paper-grain), radial-gradient(120% 90% at 30% 0%,var(--color-neutral-100),var(--color-surface) 70%,var(--color-neutral-300))" } },
        h("div", { style: { position: "absolute", inset: 0, backgroundImage: BACKDROP(1200, 900), backgroundRepeat: "no-repeat", backgroundPosition: "center bottom", backgroundSize: "min(90%, 1100px) auto", pointerEvents: "none" } }),
        // Отступ постоянный. Раньше он раздвигался с 80 до 540 пикселей, когда
        // открывалась боковая карточка, — и всё древо пересчитывалось и уезжало
        // вбок при каждом клике. Теперь место под карточку не отвоёвывается у
        // полотна: она лежит поверх, а до закрытого ею человека довозит
        // ensureVisible.
        h("div", { "data-canvas": "", style: { position: "relative", transform: "scale(" + s.zoom + ")", transformOrigin: "0 0",
          padding: "60px 80px", width: "max-content" } }, bands, edgeLayer, nodes)),
      s.narrow && s.sel ? null : h("div", { style: { position: "absolute", left: "18px", bottom: "18px", display: "flex", border: "1px solid var(--ink-15)", background: "var(--color-bg)" } },
        h("button", { onClick: () => this.setState({ zoom: Math.max(0.35, s.zoom - 0.12) }), style: { width: "32px", height: "30px", border: "none", borderRight: "1px solid var(--ink-10)", background: "transparent", fontSize: "16px", cursor: "pointer", color: "var(--color-text)" } }, "−"),
        h("div", { style: { width: "52px", display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--ink-65)" } }, Math.round(s.zoom * 100) + "%"),
        h("button", { onClick: () => this.setState({ zoom: Math.min(1.5, s.zoom + 0.12) }), style: { width: "32px", height: "30px", border: "none", borderLeft: "1px solid var(--ink-10)", background: "transparent", fontSize: "16px", cursor: "pointer", color: "var(--color-text)" } }, "+")),
      s.narrow && s.sel ? null : h("div", { style: { position: "absolute", right: "18px", bottom: "18px", fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-60)", textAlign: "right", lineHeight: 1.6, background: "var(--color-neutral-100)", border: "1px solid var(--ink-12)", borderRadius: "var(--radius-md)", padding: "8px 13px", boxShadow: "var(--shadow-sm)" } },
        h("div", null, s.people.length + " человек · " + L.nodes.reduce((a, n) => Math.max(a, n.depth), 0) + " поколения · " + s.people.reduce((a, p) => a + (p.photos || []).length, 0) + " фото"),
        h("div", null, "роль: " + s.role.toLowerCase() + (s.role === "Гость" ? " · живущие скрыты" : ""))),
      s.sel ? this.renderSidebar() : null,
      s.form ? this.renderPersonForm() : null,
      s.modOpen ? this.renderModPanel() : null,
      s.mapOpen ? this.renderMapPanel() : null,
      s.authOpen ? this.renderAuthDialog() : null,
      s.scanOpen ? this.renderScanDialog() : null,
      s.printOpen ? this.renderPrintDialog() : null,
      s.toast ? h("div", { style: { position: "absolute", left: "50%", bottom: "26px", transform: "translateX(-50%)", background: "var(--color-text)", color: "var(--color-bg)", padding: "11px 20px", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 30px var(--scrim-20)", zIndex: 11 } }, h("span", { style: { width: "6px", height: "6px", background: "var(--color-accent)", flex: "none" } }), s.toast) : null);
  }

  // ——— «Круг рода»: кольца предков ————————————————————————————————
  //
  // Древо отвечает на вопрос «кто чей», круг — на вопрос «чего мы не знаем».
  // Пустые секторы здесь не дефект отрисовки, а содержание: это и есть список
  // того, что искать в архиве.
  //
  // Фактура нарочно та же, что и везде, — бумага. В концепте кольца описаны
  // древесными, но вторая фактура на экране нарушила бы правило «одна фактура»,
  // ради которого и переписывалась тема. Поколения различаются глубиной сепии,
  // а не породой дерева.
  renderRing() {
    const s = this.state, m = this.m;
    if (!m || !s.people) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Загрузка…");
    if (!s.people.length) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Архив пуст");

    const RINGS = 3;
    const rootId = (s.sel && s.people.some(p => p.id === s.sel)) ? s.sel : m.deepestRoot(s.people, RINGS);
    const data = rootId ? m.ancestorRings(s.people, rootId, RINGS) : null;
    if (!data) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Не удалось построить круг");

    const SIZE = 760, C = SIZE / 2, R0 = 78, RW = 82;
    const polar = (r, a) => [C + r * Math.cos(a), C + r * Math.sin(a)];
    // Дуга линией — шкала полноты карточки по внутреннему краю сектора.
    const arcLine = (r, a1, a2) => {
      const [x1, y1] = polar(r, a1), [x2, y2] = polar(r, a2);
      const big = (a2 - a1) > Math.PI ? 1 : 0;
      return "M" + x1.toFixed(1) + " " + y1.toFixed(1) +
        "A" + r + " " + r + " 0 " + big + " 1 " + x2.toFixed(1) + " " + y2.toFixed(1);
    };
    const arc = (r1, r2, a1, a2) => {
      const [x1, y1] = polar(r2, a1), [x2, y2] = polar(r2, a2);
      const [x3, y3] = polar(r1, a2), [x4, y4] = polar(r1, a1);
      const big = (a2 - a1) > Math.PI ? 1 : 0;
      return "M" + x1.toFixed(1) + " " + y1.toFixed(1) +
        "A" + r2 + " " + r2 + " 0 " + big + " 1 " + x2.toFixed(1) + " " + y2.toFixed(1) +
        "L" + x3.toFixed(1) + " " + y3.toFixed(1) +
        "A" + r1 + " " + r1 + " 0 " + big + " 0 " + x4.toFixed(1) + " " + y4.toFixed(1) + "Z";
    };
    // Патина: чем дальше поколение, тем глубже сепия. Подписи пергаментные,
    // поэтому контраст держится на всех трёх ступенях.
    const TONE = ["#6b5a48", "#57493a", "#43382c"];
    const q = s.q.trim().toLowerCase();
    const hit = (p) => !q || [p.surname, p.name, p.patronymic, p.maidenName, p.bio, p.birthPlace]
      .filter(Boolean).join(" ").toLowerCase().includes(q);

    const parts = [];
    data.levels.forEach((ring, di) => {
      const n = ring.length;
      const r1 = R0 + di * RW + 7;
      const r2 = r1 + RW - 9;
      ring.forEach((id, i) => {
        const a1 = -Math.PI / 2 + (i / n) * Math.PI * 2 + 0.013;
        const a2 = -Math.PI / 2 + ((i + 1) / n) * Math.PI * 2 - 0.013;
        const d = arc(r1, r2, a1, a2);
        const p = id ? BY(s.people, id) : null;

        if (!p) {
          parts.push(h("g", { key: "gap" + di + "-" + i },
            h("path", { d: d, fill: "var(--ink-05)", stroke: "var(--ink-25)", strokeDasharray: "5 6" }),
            h("text", {
              x: polar((r1 + r2) / 2, (a1 + a2) / 2)[0], y: polar((r1 + r2) / 2, (a1 + a2) / 2)[1] + 6,
              textAnchor: "middle", fontFamily: "var(--font-body)", fontSize: 17, fill: "var(--ink-45)"
            }, "?")));
          return;
        }

        const vis = this.visible(p);
        const nameless = !vis || p.name === "???" || !p.name;
        // Полнота карточки показана золотой дугой по внутреннему краю сектора,
        // а не плотностью заливки. Заливкой не вышло: чтобы пергаментная
        // подпись держала 4.5:1 на самом светлом кольце, нужна плотность
        // от 0.87 — на такой шкале ничего не разглядеть. Заливка осталась
        // сплошной, подпись читается всегда, а недостающая часть дуги прямо
        // показывает, чего в карточке не хватает.
        const fill = TONE[di];
        const rich = m.richness(p);
        const [tx, ty] = polar((r1 + r2) / 2, (a1 + a2) / 2);
        const deg = ((a1 + a2) / 2) * 180 / Math.PI;
        // Подпись идёт вдоль дуги: в 73 пикселя ширины кольца русская фамилия
        // по радиусу не помещается.
        const flip = (deg > 0 && deg < 180) ? 180 : 0;
        const label = !vis ? "скрыто" : (nameless ? "имя неизвестно" : (di === 0 ? m.fio(p) : m.shortName(p)));

        parts.push(h("g", {
          key: id + "-" + di + "-" + i,
          style: { cursor: "pointer", opacity: hit(p) ? 1 : 0.24, transition: "opacity .2s" },
          onClick: () => this.select(id),
          tabIndex: 0, role: "button", "aria-label": vis ? m.fio(p) : "Живущий человек",
          onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.select(id); } }
        },
          h("title", null, (vis ? m.fio(p) : "Живущий человек — карточка скрыта") + " · " + m.years(p)),
          h("path", { d: d, fill: fill, stroke: "var(--color-bg)", strokeWidth: 1.4 }),
          rich > 0 ? h("path", {
            d: arcLine(r1 + 5, a1 + 0.012, a1 + 0.012 + (a2 - a1 - 0.024) * rich),
            fill: "none", stroke: "var(--color-accent-2)", strokeWidth: 3.4, strokeLinecap: "round",
            style: { pointerEvents: "none" }
          }) : null,
          h("text", {
            transform: "translate(" + tx.toFixed(1) + "," + ty.toFixed(1) + ") rotate(" + (deg + 90 + flip).toFixed(1) + ")",
            textAnchor: "middle", dominantBaseline: "middle",
            fontFamily: "var(--font-body)", fontSize: di === 0 ? 15 : 12.5,
            fill: "var(--color-bg)", style: { pointerEvents: "none" }
          }, label)));
      });
    });

    const rp = data.root;
    const rootVis = this.visible(rp);
    return h("div", { style: { flex: 1, position: "relative", overflow: "auto", background: "var(--paper-grain), radial-gradient(120% 90% at 50% 0%,var(--color-neutral-100),var(--color-surface) 78%)" } },
      h("div", { style: { minHeight: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-start", padding: "18px 18px 26px" } },
        h("div", { style: { maxWidth: "620px", textAlign: "center", marginBottom: "6px" } },
          this.kicker("Круг рода · три колена вглубь"),
          h("p", { style: { margin: "8px 0 0", fontSize: "14px", lineHeight: 1.55, color: "var(--ink-65)" } },
            "Из " + data.total + " мест заполнено ",
            h("b", { style: { color: "var(--color-text)" } }, String(data.known)),
            ", пусто ",
            h("b", { style: { color: "var(--status-hypothesis)" } }, String(data.gaps)),
            ". Пустые секторы — это и есть список того, что искать в архиве. Золотая дуга у внутреннего края показывает, насколько полна карточка. Нажмите на предка, чтобы встать в центр круга.")),
        h("svg", {
          viewBox: "0 0 " + SIZE + " " + SIZE, role: "img",
          "aria-label": "Кольца предков: " + m.fio(rp),
          style: { display: "block", width: "100%", maxWidth: "min(78vh, 640px)", height: "auto" }
        },
          h("circle", { cx: C, cy: C, r: R0, fill: "var(--color-accent-2)", stroke: "var(--color-accent-2-700)", strokeWidth: 1.5 }),
          h("text", { x: C, y: C - 6, textAnchor: "middle", fontFamily: "var(--font-heading)", fontSize: 20, fontWeight: 600, fill: "#3a2c08" },
            rootVis ? (rp.name || "—") : "Скрыто"),
          h("text", { x: C, y: C + 16, textAnchor: "middle", fontFamily: "var(--font-body)", fontSize: 12, fill: "#5c4712" },
            rootVis ? (rp.surname || "") : ""),
          parts)));
  }

  // ——— «Река времени»: линии жизни ————————————————————————————————
  //
  // Человек здесь не узел, а отрезок жизни на общей оси лет. Сразу читается,
  // кто кого застал, кто сколько прожил и чья молодость пришлась на войну —
  // то, чего прямоугольная схема поколений не показывает в принципе.
  renderRiver() {
    const s = this.state, m = this.m;
    if (!m || !s.people) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Загрузка…");
    const R = m.riverRows(s.people, { hideLiving: s.role === "Гость" });
    if (!R.total) return h("div", { style: { padding: "60px", color: "var(--ink-65)" } }, "Не из чего строить реку: ни у одной записи нет дат и родни с датами");

    const W = 1100, PADL = 128, PADR = 22, TOP = 30, ROW = 26, BAR = 16, FOOT = 34;
    const xOf = (y) => PADL + (y - R.min) / (R.max - R.min) * (W - PADL - PADR);
    const rows = R.clans.reduce((a, c) => a + c.members.length + 1, 0);
    const H = TOP + rows * ROW + FOOT;

    const q = s.q.trim().toLowerCase();
    const hit = (p) => !q || [p.surname, p.name, p.patronymic, p.maidenName, p.bio, p.birthPlace]
      .filter(Boolean).join(" ").toLowerCase().includes(q);

    const bg = [], bars = [];
    // Эпохи — фоном под линиями, чтобы пересечение читалось само.
    m.ERAS.forEach((e, i) => {
      if (e.b < R.min || e.a > R.max) return;
      bg.push(h("rect", { key: "era" + i, x: xOf(e.a), y: TOP - 12, width: xOf(e.b) - xOf(e.a), height: H - TOP - FOOT + 16,
        fill: "var(--status-hypothesis)", fillOpacity: 0.13 }));
      bg.push(h("text", { key: "eratx" + i, x: xOf(e.a) + 5, y: TOP - 17, fontFamily: "var(--font-body)", fontSize: 10.5,
        letterSpacing: "0.06em", fill: "var(--status-hypothesis)" }, e.t));
    });
    m.ERA_MARKS.forEach((k, i) => {
      if (k.y < R.min || k.y > R.max) return;
      bg.push(h("line", { key: "mk" + i, x1: xOf(k.y), y1: TOP - 12, x2: xOf(k.y), y2: H - FOOT + 4,
        stroke: "var(--ink-25)", strokeDasharray: "3 4" }));
      bg.push(h("text", { key: "mktx" + i, x: xOf(k.y) + 4, y: TOP - 17, fontFamily: "var(--font-body)", fontSize: 10.5, fill: "var(--ink-65)" }, k.t));
    });
    // Ось десятилетий
    for (let d = Math.ceil(R.min / 20) * 20; d <= R.max; d += 20) {
      bg.push(h("text", { key: "ax" + d, x: xOf(d), y: H - 8, textAnchor: "middle", fontFamily: "var(--font-body)", fontSize: 10.5, fill: "var(--ink-65)" }, String(d)));
      bg.push(h("line", { key: "axl" + d, x1: xOf(d), y1: H - FOOT + 4, x2: xOf(d), y2: H - FOOT + 9, stroke: "var(--ink-25)" }));
    }

    let y = TOP;
    R.clans.forEach((clan) => {
      bars.push(h("text", { key: "cl" + clan.key, x: 0, y: y + 10, fontFamily: "var(--font-body)", fontSize: 11,
        letterSpacing: "0.14em", fill: "var(--ink-65)" }, clan.key.toUpperCase()));
      y += 18;
      clan.members.forEach(({ p, s: sp }) => {
        const x1 = xOf(sp.birth.y), x2 = xOf(sp.death.y), w = Math.max(4, x2 - x1);
        const isSel = p.id === s.sel;
        const dim = hit(p) ? 1 : 0.2;
        const yy = y;
        const kids = [];

        if (sp.inferred) {
          // Дат нет вовсе: отрезок выведен из родни и потому только контуром.
          kids.push(h("rect", { key: "b", x: x1, y: yy, width: w, height: BAR, rx: 3,
            fill: "none", stroke: "var(--ink-45)", strokeDasharray: "5 5" }));
        } else if (sp.sure) {
          kids.push(h("rect", { key: "b", x: x1, y: yy, width: w, height: BAR, rx: 3,
            fill: isSel ? "var(--color-accent-2)" : "var(--color-accent)" }));
        } else {
          // Даты приблизительные — концы отрезка растворяются.
          const f = Math.min(30, w * 0.34);
          kids.push(h("rect", { key: "b", x: x1 + f, y: yy, width: Math.max(1, w - f * 2), height: BAR,
            fill: isSel ? "var(--color-accent-2)" : "var(--color-accent)" }));
          kids.push(h("rect", { key: "fl", x: x1, y: yy, width: f, height: BAR, fill: "url(#riverFadeL)" }));
          kids.push(h("rect", { key: "fr", x: x2 - f, y: yy, width: f, height: BAR, fill: "url(#riverFadeR)" }));
        }
        if (sp.death.open) {
          kids.push(h("circle", { key: "now", cx: x2, cy: yy + BAR / 2, r: 3.4, fill: "var(--color-accent-2)" }));
        }
        kids.push(h("text", { key: "t", x: x1 + 8, y: yy + 11.5, fontFamily: "var(--font-body)", fontSize: 11,
          fill: sp.inferred ? "var(--ink-65)" : "var(--color-bg)", style: { pointerEvents: "none" } },
          (!p.name || p.name === "???") ? (p.surname || "без имени") : m.shortName(p)));
        kids.push(h("rect", { key: "hitbox", x: x1, y: yy, width: w, height: BAR, fill: "transparent" }));

        bars.push(h("g", {
          key: p.id,
          style: { cursor: "pointer", opacity: dim, transition: "opacity .2s" },
          onClick: () => this.select(p.id),
          tabIndex: 0, role: "button", "aria-label": m.fio(p) + ", " + m.years(p),
          onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); this.select(p.id); } }
        }, h("title", null, m.fio(p) + " · " + m.years(p) + (sp.inferred ? " · даты выведены из родни" : "")), kids));
        y += ROW;
      });
      y += 6;
    });

    return h("div", { style: { flex: 1, position: "relative", overflow: "auto", background: "var(--paper-grain), radial-gradient(120% 90% at 50% 0%,var(--color-neutral-100),var(--color-surface) 82%)" } },
      h("div", { style: { padding: "18px 18px 26px", minWidth: "760px" } },
        h("div", { style: { maxWidth: "760px", marginBottom: "10px" } },
          this.kicker("Река времени · " + R.min + "–" + R.max),
          h("p", { style: { margin: "8px 0 0", fontSize: "14px", lineHeight: 1.55, color: "var(--ink-65)" } },
            "Каждая полоса — одна жизнь; длина равна прожитым годам. Точные даты залиты сплошь, приблизительные растворяются по краям. Записей без единой даты — ",
            h("b", { style: { color: "var(--color-text)" } }, R.inferred + " из " + R.total),
            ": они показаны пунктиром, а границы выведены из дат родни.")),
        h("svg", { viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Линии жизни рода на оси времени",
          style: { display: "block", width: "100%", height: "auto" } },
          h("defs", null,
            h("linearGradient", { id: "riverFadeL", x1: "0", x2: "1" },
              h("stop", { offset: "0", stopColor: "var(--color-accent)", stopOpacity: "0" }),
              h("stop", { offset: "1", stopColor: "var(--color-accent)", stopOpacity: "1" })),
            h("linearGradient", { id: "riverFadeR", x1: "0", x2: "1" },
              h("stop", { offset: "0", stopColor: "var(--color-accent)", stopOpacity: "1" }),
              h("stop", { offset: "1", stopColor: "var(--color-accent)", stopOpacity: "0" }))),
          bg, bars)));
  }

  renderSidebar() {
    const s = this.state, m = this.m;
    const p = (s.people || []).find(x => x.id === s.sel);
    if (!p) return null;
    const vis = this.visible(p);
    const idx = m.byId(s.people);
    const isMod = s.role === "Модератор";
    const relatives = [
      p.fatherId ? { id: p.fatherId, r: "отец" } : null,
      p.motherId ? { id: p.motherId, r: "мать" } : null,
      ...(p.spouseIds || []).map(id => ({ id, r: "супруг" })),
      ...s.people.filter(x => x.fatherId === p.id || x.motherId === p.id).map(x => ({ id: x.id, r: "ребёнок" }))
    ].filter(r => r && idx[r.id]);
    const facts = [
      ["Родился", [p.birthDate, p.birthPlace].filter(Boolean).join(", ")],
      ["Умер", [p.deathDate, p.deathPlace].filter(Boolean).join(", ")],
      ["Достоверность", STATUS_LABEL[p.status] || STATUS_LABEL.unknown]
    ].filter(x => x[1]);

    // На широком экране карточка — панель у правого края. На телефоне те же
    // 452 пикселя были шире самого экрана, поэтому там она становится нижним
    // листом: привычный жест, и древо над ней остаётся видимым.
    const box = s.narrow
      ? { left: 0, right: 0, bottom: 0, top: "auto", maxHeight: "62%",
          borderRadius: "var(--radius-lg) var(--radius-lg) 0 0",
          boxShadow: "0 -14px 34px var(--ink-15)" }
      : { right: 0, top: 0, bottom: 0, width: SIDEBAR_W + "px",
          borderRadius: "var(--radius-lg) 0 0 var(--radius-lg)",
          boxShadow: "-14px 0 34px var(--ink-08)" };
    return h("aside", { className: "card elev-lg", style: { position: "absolute", zIndex: 9, padding: 0, background: "var(--color-neutral-100)", overflow: "auto", ...box } },
      h("div", { style: { padding: "22px 26px 18px", borderBottom: "1px solid var(--color-divider)", position: "sticky", top: 0, background: "var(--color-neutral-100)", zIndex: 2 } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px" } },
          h("div", { style: { minWidth: 0 } }, this.kicker("Карточка"),
            h("h2", { style: { fontSize: "25px", fontWeight: 600, lineHeight: 1.15, margin: "6px 0 0" } }, vis ? m.fio(p) : "Скрыто"),
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "12px", color: "var(--ink-65)", marginTop: "6px" } },
              m.years(p) + (p.maidenName ? " · урожд. " + p.maidenName : "")),
            h("div", { style: { display: "flex", alignItems: "center", gap: "9px", marginTop: "10px" } },
              h("span", { className: "seal", style: { "--seal-color": STATUS_COLOR[p.status] || STATUS_COLOR.unknown } }),
              h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-65)" } },
                STATUS_LABEL[p.status] || STATUS_LABEL.unknown))),
          h("button", { onClick: () => this.select(null), className: "btn btn-icon btn-ghost" }, "×")),
        s.role !== "Гость" ? h("div", { style: { display: "flex", gap: "8px", marginTop: "16px", flexWrap: "wrap" } },
          h("button", { onClick: () => this.openForm(p), className: "btn btn-primary" }, isMod ? "Редактировать" : "Предложить правку"),
          h("button", { onClick: () => this.setState({ mapOpen: true, mapMode: "route", mapRoute: p.id }), className: "btn btn-secondary" }, "На карте"),
          isMod ? h("button", { onClick: () => this.deletePerson(p), className: "btn btn-secondary", style: { color: "var(--color-accent)", borderColor: "var(--color-accent)" } }, "Удалить") : null
        ) : h("div", { style: { fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--ink-65)", marginTop: "14px" } }, "Правки доступны после входа")),

      !vis ? h("div", { style: { margin: "26px", border: "1px dashed var(--ink-25)", padding: "22px", textAlign: "center", color: "var(--ink-60)", fontSize: "13.5px", lineHeight: 1.6 } }, "Данные живущего человека скрыты от гостей.", h("br"), "Войдите как родственник, чтобы увидеть карточку.") : null,

      vis ? h("div", { style: { padding: "0 26px 40px" } },
        (p.photos || []).length ? h("div", { style: { display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "8px", margin: "20px 0 8px" } },
          (p.photos || []).map((ph, i) => h("div", { key: ph.uid || ("src" + String(ph.src || "").slice(-40)), style: { aspectRatio: "3/4", background: ph.src ? "#000" : "linear-gradient(135deg,var(--color-neutral-200),var(--color-neutral-300))", backgroundImage: ph.src ? "url(" + ph.src + ")" : undefined, backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--ink-20)", display: "flex", flexDirection: "column", justifyContent: "flex-end", padding: "7px", position: "relative" } },
            ph.src ? null : h("div", { style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", fontFamily: "var(--font-body)", fontSize: "9px", letterSpacing: ".14em", color: "var(--ink-65)" } }, "ФОТО"),
            ph.caption ? h("div", { style: { position: "relative", fontSize: "10.5px", lineHeight: 1.3, color: "var(--color-text)", background: "var(--color-neutral-100)", padding: "3px 5px" } }, ph.caption) : null))) : null,

        facts.map(([k, v], i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "126px 1fr", gap: "14px", padding: "9px 0", borderTop: "1px solid var(--ink-08)", alignItems: "baseline" } },
          h("div", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".11em", textTransform: "uppercase", color: "var(--ink-65)" } }, k),
          h("div", { style: { fontSize: "14.5px", lineHeight: 1.5 } }, v))),

        (p.residences || []).length ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Места"),
          (p.residences || []).map((r, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "96px 1fr", gap: "12px", padding: "6px 0", fontSize: "14px", alignItems: "baseline", marginTop: "10px" } },
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "11.5px", color: "var(--ink-65)" } }, [r.from, r.to].filter(Boolean).join("–") || "—"),
            h("div", null, r.place, r.note ? h("span", { style: { color: "var(--ink-65)", fontSize: "12.5px" } }, " · " + r.note) : null)))) : null,

        p.bio ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Биография"), h("p", { style: { fontSize: "15px", lineHeight: 1.62, margin: "8px 0 0", whiteSpace: "pre-wrap" } }, p.bio)) : null,

        p.sources ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Источники"), h("p", { style: { fontSize: "13px", lineHeight: 1.55, margin: "8px 0 0", whiteSpace: "pre-wrap", wordBreak: "break-word", color: "var(--color-neutral-800)" } }, p.sources)) : null,

        relatives.length ? h("div", { style: { marginTop: "26px", borderTop: "1px solid var(--color-text)", paddingTop: "14px" } },
          this.kicker("Связи"),
          h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "10px" } },
            relatives.map((rel, i) => h("button", { key: rel.id + rel.r + i, onClick: () => this.select(rel.id), style: { border: "1px solid var(--ink-15)", background: "transparent", font: "inherit", fontSize: "12.5px", padding: "5px 10px", cursor: "pointer", color: "var(--color-text)" } }, m.shortName(idx[rel.id]) + " · " + rel.r)))) : null)
        : null);
  }

  // Полная форма карточки: все поля, связи и фотографии. Для модератора это
  // прямое редактирование, для родственника — предложение правки.
  renderPersonForm() {
    const s = this.state, m = this.m, f = s.form;
    if (!f) return null;
    const isNew = !f.id;
    const isMod = s.role === "Модератор";
    const v = f.fields;
    const people = s.people || [];

    // В родители нельзя поставить самого себя и собственного потомка: иначе
    // счёт поколений зацикливается.
    const banned = {};
    if (f.id) {
      banned[f.id] = true;
      for (let pass = 0; pass < people.length; pass++) {
        let grew = false;
        people.forEach(x => {
          if (banned[x.id]) return;
          if (banned[x.fatherId] || banned[x.motherId]) { banned[x.id] = true; grew = true; }
        });
        if (!grew) break;
      }
    }
    const options = people.filter(x => !banned[x.id]).sort((a, b) => m.fio(a).localeCompare(m.fio(b), "ru"));

    const label = (t) => h("span", { style: { display: "block", fontFamily: "var(--font-body)", fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-65)", marginBottom: "4px" } }, t);
    const inputStyle = { width: "100%", boxSizing: "border-box", border: "1px solid var(--ink-20)", background: "#fff", font: "inherit", fontSize: "14px", padding: "8px 9px", color: "var(--color-text)" };
    const field = (key, title, opts = {}) => h("label", { key, style: { display: "block", marginBottom: "12px", flex: 1, minWidth: 0 } }, label(title),
      opts.area
        ? h("textarea", { value: v[key] || "", rows: opts.rows || 3, placeholder: opts.hint || "", onChange: (e) => this.setField(key, e.target.value), style: { ...inputStyle, resize: "vertical", lineHeight: 1.45 } })
        : h("input", { value: v[key] || "", placeholder: opts.hint || "", onChange: (e) => this.setField(key, e.target.value), style: inputStyle }));
    const select = (key, title, list) => h("label", { key, style: { display: "block", marginBottom: "12px", flex: 1, minWidth: 0 } }, label(title),
      h("select", { value: v[key] || "", onChange: (e) => this.setField(key, e.target.value), style: inputStyle },
        list.map(([val, text]) => h("option", { key: val, value: val }, text))));
    const row = (...kids) => h("div", { style: { display: "flex", gap: "10px" } }, kids);
    const parentOptions = [["", "— не указан —"]].concat(options.map(x => [x.id, m.fio(x) + " · " + m.years(x)]));

    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "32px 0", zIndex: 12 } },
      h("div", { className: "dialog", style: { width: "660px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px var(--scrim-25)" } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--color-text)" } },
          h("div", null, this.kicker(isNew ? "Новый человек" : "Карточка"),
            h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, isNew ? "Добавление в древо" : m.fio(v)),
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginTop: "6px" } },
              isMod ? "Изменения применяются сразу — вы модератор" : "Изменения уйдут модератору на проверку")),
          h("button", { onClick: () => this.setState({ form: null, editing: false }), className: "btn btn-icon btn-ghost" }, "×")),

        h("div", { style: { overflow: "auto", padding: "18px 24px 24px" } },
          row(field("surname", "Фамилия", { hint: "Назукин" }), field("name", "Имя", { hint: "Василий" })),
          row(field("patronymic", "Отчество", { hint: "Фёдорович" }), field("maidenName", "Девичья фамилия")),
          row(select("sex", "Пол", [["m", "мужской"], ["f", "женский"]]),
            select("status", "Достоверность", [["confirmed", "подтверждено документом"], ["unknown", "со слов родных"], ["hypothesis", "гипотеза"]])),
          row(field("birthDate", "Дата рождения", { hint: "08.04.1988 или ок. 1910" }), field("deathDate", "Дата смерти", { hint: "до 1988" })),
          row(field("birthPlace", "Место рождения"), field("deathPlace", "Место смерти")),

          h("div", { style: { borderTop: "1px solid var(--color-text)", margin: "8px 0 14px", paddingTop: "12px" } }, this.kicker("Связи")),
          row(select("fatherId", "Отец", parentOptions), select("motherId", "Мать", parentOptions)),
          h("div", { style: { marginBottom: "12px" } }, label("Супруги"),
            h("div", { style: { display: "flex", flexWrap: "wrap", gap: "6px" } },
              options.length ? options.map(x => {
                const on = (v.spouseIds || []).includes(x.id);
                return h("button", { key: x.id, type: "button",
                  onClick: () => this.setField("spouseIds", on ? v.spouseIds.filter(z => z !== x.id) : [...(v.spouseIds || []), x.id]),
                  style: { border: "1px solid " + (on ? "var(--color-accent-2)" : "var(--ink-15)"), background: on ? "var(--color-accent-2)" : "transparent", color: on ? "#fff" : "var(--color-text)", font: "inherit", fontSize: "12.5px", padding: "5px 10px", cursor: "pointer" } },
                  m.shortName(x));
              }) : h("span", { style: { fontSize: "12.5px", color: "var(--ink-65)" } }, "Пока некого выбрать"))),

          h("div", { style: { borderTop: "1px solid var(--color-text)", margin: "8px 0 14px", paddingTop: "12px" } }, this.kicker("Биография и источники")),
          field("bio", "Чем занимался, где жил, что известно от родных", { area: true, rows: 4 }),
          field("sources", "Архив, фонд, опись, дело, ссылки", { area: true, rows: 3, hint: "ГАПК ф. 719 оп. 11 д. 1234, л. 45" }),

          isMod ? h("div", { style: { display: "flex", gap: "18px", alignItems: "center", padding: "10px 0", borderTop: "1px solid var(--ink-08)", marginBottom: "10px" } },
            h("label", { style: { display: "flex", gap: "8px", alignItems: "center", fontSize: "13.5px" } },
              h("input", { type: "checkbox", checked: !!v.living, onChange: (e) => this.setField("living", e.target.checked) }), "живущий — гостям не показывать"),
            h("label", { style: { display: "flex", gap: "8px", alignItems: "center", fontSize: "13.5px" } },
              h("input", { type: "checkbox", checked: !!v.minor, onChange: (e) => this.setField("minor", e.target.checked) }), "несовершеннолетний")) : null,

          h("div", { style: { borderTop: "1px solid var(--color-text)", margin: "8px 0 12px", paddingTop: "12px" } }, this.kicker("Фотографии")),
          h("div", { style: { display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "7px" } },
            (f.photos || []).map((ph, i) => h("div", { key: ph.uid || ("src" + String(ph.src || "").slice(-40)), style: { position: "relative", aspectRatio: "3/4", background: "#000", backgroundImage: "url(" + ph.src + ")", backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--ink-20)" } },
              h("button", { onClick: () => this.setState({ form: { ...f, photos: f.photos.filter((_, j) => j !== i) } }), title: "Убрать", style: { position: "absolute", right: "3px", top: "3px", width: "18px", height: "18px", border: "none", background: "var(--ink-80)", color: "#fff", fontSize: "11px", cursor: "pointer" } }, "×"),
              h("input", { value: ph.caption, onChange: (e) => { const arr = f.photos.slice(); arr[i] = { ...arr[i], caption: e.target.value }; this.setState({ form: { ...f, photos: arr } }); }, placeholder: "подпись",
                style: { position: "absolute", left: 0, right: 0, bottom: 0, width: "100%", boxSizing: "border-box", border: "none", background: "var(--color-neutral-100)", font: "inherit", fontSize: "9.5px", padding: "3px 4px", color: "var(--color-text)", outline: "none" } }))),
            h("label", { style: { aspectRatio: "3/4", border: "1px dashed var(--ink-35)", background: "#fff9", display: "grid", placeItems: "center", cursor: "pointer", fontSize: "11px", color: "var(--ink-65)", textAlign: "center", padding: "4px" } }, "+ фото",
              h("input", { type: "file", accept: "image/*", multiple: true, onChange: (e) => this.onDraftPhotos(e), style: { display: "none" } }))),
          h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10px", color: "var(--ink-65)", marginTop: "7px" } },
            "Снимок уменьшается в браузере и теряет EXIF ещё до отправки: геометка и модель камеры на сервер не попадают.")),

        h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end", padding: "14px 24px", borderTop: "1px solid var(--color-divider)" } },
          h("button", { onClick: () => this.setState({ form: null, editing: false }), className: "btn btn-secondary" }, "Отмена"),
          h("button", { onClick: () => this.submitForm(), className: "btn btn-primary" }, isMod ? "Сохранить" : "Отправить на проверку"))));
  }

  renderModPanel() {
    const s = this.state;
    const kinds = { edit: ["правка", "var(--color-text)"], photo: ["фото", "var(--color-accent-2)"], new: ["новый человек", "var(--color-accent)"] };
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "44px 0", zIndex: 9 } },
      h("div", { className: "dialog", style: { width: "860px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px var(--scrim-25)" } },
        h("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: "1px solid var(--color-text)" } },
          h("div", null, this.kicker("Очередь модерации"),
            h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, s.pending.length + " правки ждут решения"),
            h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginTop: "6px" } }, "уведомления: телеграм-бот + счётчик в шапке")),
          h("button", { onClick: () => this.setState({ modOpen: false }), className: "btn btn-secondary" }, "×")),
        h("div", { style: { overflow: "auto", padding: "6px 24px 24px" } },
          s.pending.map((x) => {
            const [label, color] = kinds[x.kind] || kinds.edit;
            return h("div", { key: x.id, style: { borderBottom: "1px solid var(--ink-10)", padding: "20px 0" } },
              h("div", { style: { display: "flex", justifyContent: "space-between", gap: "20px", alignItems: "flex-start" } },
                h("div", { style: { flex: 1, minWidth: 0 } },
                  h("div", { style: { display: "flex", alignItems: "center", gap: "9px", flexWrap: "wrap" } },
                    h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".12em", textTransform: "uppercase", color: "#fff", background: color, padding: "3px 7px" } }, label),
                    h("span", { style: { fontSize: "16px", fontWeight: 600 } }, x.targetName)),
                  h("div", { style: { fontSize: "13.5px", color: "var(--ink-65)", marginTop: "5px" } }, x.summary),
                  h("div", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginTop: "7px" } }, x.author + " · " + x.role + " · " + new Date(x.date).toLocaleString("ru-RU", { day: "2-digit", month: "long", hour: "2-digit", minute: "2-digit" }))),
                h("div", { style: { display: "flex", gap: "7px", flex: "none" } },
                  h("button", { onClick: () => this.approve(x), style: { padding: "7px 14px", border: "1px solid var(--color-text)", background: "var(--color-text)", color: "var(--color-neutral-100)", fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Принять"),
                  h("button", { onClick: () => this.reject(x), style: { padding: "7px 14px", border: "1px solid var(--color-accent)", background: "transparent", color: "var(--color-accent)", fontSize: "12.5px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Отклонить"))),
              h("div", { style: { marginTop: "14px", border: "1px solid var(--ink-10)", background: "#fff" } },
                x.changes.map((c, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "150px 1fr 1fr", borderBottom: "1px solid var(--ink-05)", fontSize: "13.5px" } },
                  h("div", { style: { padding: "9px 12px", fontFamily: "var(--font-body)", fontSize: "10px", letterSpacing: ".1em", textTransform: "uppercase", color: "var(--ink-65)", borderRight: "1px solid var(--ink-05)" } }, c.field),
                  h("div", { style: { padding: "9px 12px", background: "var(--accent-05)", color: "var(--ink-60)", textDecoration: "line-through", borderRight: "1px solid var(--ink-05)" } }, c.before),
                  h("div", { style: { padding: "9px 12px", background: "var(--accent-2-05)", color: "var(--color-text)" } }, c.after)))));
          }),
          s.pending.length === 0 ? h("div", { style: { padding: "60px 0", textAlign: "center", color: "var(--ink-65)", fontSize: "14px" } }, "Очередь пуста. Все правки обработаны.") : null)));
  }

  renderMapPanel() {
    const s = this.state;
    return h("div", { style: { position: "absolute", inset: 0, background: "var(--color-bg)", borderTop: "1px solid var(--color-text)", zIndex: 8 } },
      h("div", { style: { position: "absolute", right: "18px", top: "18px", zIndex: 6 } },
        h("button", { onClick: () => this.setState({ mapOpen: false }), style: { padding: "8px 15px", border: "1px solid var(--color-text)", background: "var(--color-text)", color: "var(--color-bg)", fontSize: "13px", cursor: "pointer", whiteSpace: "nowrap", borderRadius: "999px" } }, "Закрыть карту")),
      h("family-map", { "data-route": s.mapRoute || "", "data-mode": s.mapMode || "all",
        paper: themeHex("--color-bg", "#fbf7ef"),
        ink: themeHex("--color-text", "#2c221e"),
        accent: themeHex("--color-accent", "#446c57"),
        land: themeHex("--color-neutral-300", "#e3d9c7"),
        muted: themeHex("--color-neutral-600", "#82796a"),
        font: "Manrope, system-ui, sans-serif", radius: "16px", style: { width: "100%", height: "100%" } }));
  }

  renderAuthDialog() {
    const s = this.state, isMod = s.authRole === "Модератор";
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "grid", placeItems: "center", zIndex: 12 } },
      h("div", { className: "dialog", style: { width: "520px", boxShadow: "0 24px 60px var(--scrim-28)" } },
        h("div", { style: { padding: "20px 24px 16px", borderBottom: "1px solid var(--ink-10)" } },
          this.kicker("Вход в архив"), h("div", { style: { fontSize: "21px", fontWeight: 600, marginTop: "4px" } }, isMod ? "Вход для хранителя архива" : "Вход по приглашению")),
        h("div", { style: { padding: "20px 24px 24px" } },
          h("div", { style: { fontSize: "13.5px", lineHeight: 1.6, color: "var(--ink-80)", marginBottom: "18px" } }, isMod
            ? "Модераторов заводит владелец архива вручную: e-mail плюс пароль от 10 символов. Сессия живёт 30 дней, потом вход заново."
            : "Родственник получает персональную ссылку-приглашение на свой e-mail и четырёхзначный код из того же письма. Ссылка действует 14 дней; все правки идут в очередь модерации и подписаны его именем."),
          h("label", { style: { display: "block", fontSize: "11.5px", color: "var(--ink-60)", marginBottom: "4px" } }, isMod ? "E-mail хранителя" : "E-mail из приглашения"),
          h("input", { value: s.authLogin, onChange: (e) => this.setState({ authLogin: e.target.value }), placeholder: "name@example.org", style: { width: "100%", boxSizing: "border-box", border: "1px solid var(--ink-20)", background: "#fff", font: "inherit", fontSize: "14px", padding: "8px 10px", marginBottom: "12px", color: "var(--color-text)" } }),
          h("label", { style: { display: "block", fontSize: "11.5px", color: "var(--ink-60)", marginBottom: "4px" } }, isMod ? "Пароль" : "Код из письма"),
          h("input", { value: s.authSecret, onChange: (e) => this.setState({ authSecret: e.target.value }), type: "password", placeholder: isMod ? "минимум 10 символов" : "4 цифры", style: { width: "100%", boxSizing: "border-box", border: "1px solid var(--ink-20)", background: "#fff", font: "inherit", fontSize: "14px", padding: "8px 10px", color: "var(--color-text)" } }),
          s.authErr ? h("div", { style: { fontSize: "12.5px", color: "var(--color-accent)", marginTop: "10px" } }, s.authErr) : null,
          h("div", { style: { display: "flex", gap: "8px", marginTop: "18px", alignItems: "center" } },
            h("button", { onClick: () => this.authSubmit(), className: "btn btn-primary", disabled: s.authBusy }, "Войти"),
            h("button", { onClick: () => this.setState({ authOpen: false, authErr: "", authLogin: "", authSecret: "" }), className: "btn btn-secondary" }, "Отмена"),
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginLeft: "auto" } }, s.authBusy ? "проверяем…" : "проверяет сервер")))));
  }

  renderScanDialog() {
    const s = this.state, idx = this.m.byId(s.people);
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 0", zIndex: 10 } },
      h("div", { className: "dialog", style: { width: "820px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px var(--scrim-25)" } },
        h("div", { style: { padding: "18px 24px 15px", borderBottom: "1px solid var(--color-text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" } },
          h("div", null, this.kicker("Загрузка сканов"),
            h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, s.scanRows.length + " файлов — к каким людям отнести"),
            h("div", { style: { fontSize: "12.5px", color: "var(--ink-65)", marginTop: "6px", lineHeight: 1.5, maxWidth: "560px" } }, "Привязка определяется по имени папки или файла. Что не распознано — поправьте вручную.")),
          h("button", { onClick: () => this.setState({ scanOpen: false, scanRows: [] }), className: "btn btn-secondary" }, "×")),
        h("div", { style: { overflow: "auto", padding: "8px 24px 16px" } },
          s.scanRows.map((row, i) => h("div", { key: i, style: { display: "grid", gridTemplateColumns: "56px 1fr 260px 74px", gap: "14px", alignItems: "center", padding: "9px 0", borderBottom: "1px solid var(--ink-08)" } },
            h("div", { style: { width: "56px", height: "56px", background: "#000", backgroundImage: "url(" + row.src + ")", backgroundSize: "cover", backgroundPosition: "center", border: "1px solid var(--ink-20)" } }),
            h("div", { style: { fontSize: "13px", lineHeight: 1.35, wordBreak: "break-all" } }, row.name),
            h("select", { value: row.personId, onChange: (e) => { const arr = s.scanRows.slice(); arr[i] = { ...arr[i], personId: e.target.value, auto: false }; this.setState({ scanRows: arr }); }, style: { width: "100%", border: "1px solid var(--ink-20)", background: "#fff", font: "inherit", fontSize: "13px", padding: "7px 8px", color: "var(--color-text)" } },
              (s.people || []).map(p => h("option", { key: p.id, value: p.id }, this.m.fio(p) + " · " + this.m.years(p)))),
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".1em", textTransform: "uppercase", color: row.auto ? "var(--color-accent-2)" : "var(--ink-55)", textAlign: "right" } }, row.auto ? "авто" : "вручную")))),
        h("div", { style: { padding: "14px 24px", borderTop: "1px solid var(--ink-10)", display: "flex", gap: "8px", alignItems: "center" } },
          h("button", { onClick: () => this.applyScans(), className: "btn btn-primary" }, s.role === "Модератор" ? "Добавить в карточки" : "Отправить на модерацию"),
          h("button", { onClick: () => this.closeScans(), className: "btn btn-secondary" }, "Отмена"),
          h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginLeft: "auto" } }, s.role === "Модератор" ? "вы модератор — фото появятся сразу" : "фото появятся после подтверждения"))));
  }

  renderPrintDialog() {
    const s = this.state;
    const scaleBtn = (v, label) => h("button", { key: label, onClick: () => { this.setState({ printScale: v }); setTimeout(() => this.renderPreview(), 60); },
      style: { padding: "6px 11px", border: "none", borderRight: v === 1 ? "none" : "1px solid var(--ink-10)", background: s.printScale === v ? "var(--color-text)" : "transparent", color: s.printScale === v ? "var(--color-neutral-100)" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, label);
    return h("div", { className: "dialog-backdrop", style: { position: "absolute", inset: 0, display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "36px 0", zIndex: 10 } },
      h("div", { className: "dialog", style: { width: "900px", maxHeight: "100%", display: "flex", flexDirection: "column", boxShadow: "0 24px 60px var(--scrim-28)" } },
        h("div", { style: { padding: "18px 24px 15px", borderBottom: "1px solid var(--color-text)", display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "20px" } },
          h("div", null, this.kicker("Печать древа"), h("div", { style: { fontSize: "20px", fontWeight: 600, marginTop: "3px" } }, "Предпросмотр листов"), h("div", { "data-print-info": "", style: { fontFamily: "var(--font-body)", fontSize: "11px", color: "var(--ink-65)", marginTop: "7px" } }, "считаю раскладку…")),
          h("button", { onClick: () => { this.clearSheets(); this.setState({ printOpen: false }); }, className: "btn btn-secondary" }, "×")),
        h("div", { style: { padding: "14px 24px 4px", display: "flex", gap: "22px", alignItems: "center", flexWrap: "wrap" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-65)" } }, "Масштаб"),
            h("div", { style: { display: "flex", border: "1px solid var(--ink-15)" } }, [scaleBtn("fit", "В один лист"), scaleBtn(0.5, "50%"), scaleBtn(0.72, "72%"), scaleBtn(1, "100%")])),
          h("div", { style: { display: "flex", alignItems: "center", gap: "8px" } },
            h("span", { style: { fontFamily: "var(--font-body)", fontSize: "9.5px", letterSpacing: ".14em", textTransform: "uppercase", color: "var(--ink-65)" } }, "Лист A4"),
            h("div", { style: { display: "flex", border: "1px solid var(--ink-15)" } },
              h("button", { onClick: () => { this.setState({ printLand: true }); setTimeout(() => this.renderPreview(), 60); }, style: { padding: "6px 11px", border: "none", borderRight: "1px solid var(--ink-10)", background: s.printLand ? "var(--color-text)" : "transparent", color: s.printLand ? "var(--color-neutral-100)" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, "Альбом"),
              h("button", { onClick: () => { this.setState({ printLand: false }); setTimeout(() => this.renderPreview(), 60); }, style: { padding: "6px 11px", border: "none", background: !s.printLand ? "var(--color-text)" : "transparent", color: !s.printLand ? "var(--color-neutral-100)" : "var(--color-text)", fontSize: "12px", cursor: "pointer" } }, "Портрет")))),
        h("div", { "data-preview": "", style: { overflow: "auto", padding: "18px 24px 24px", display: "flex", flexWrap: "wrap", gap: "16px", alignContent: "flex-start" } }),
        h("div", { style: { padding: "14px 24px", borderTop: "1px solid var(--ink-10)", display: "flex", gap: "8px", alignItems: "center" } },
          h("button", { onClick: () => this.doPrint(), className: "btn btn-primary" }, "Отправить на печать"),
          h("button", { onClick: () => { this.clearSheets(); this.setState({ printOpen: false }); }, className: "btn btn-secondary" }, "Отмена"),
          h("span", { style: { fontFamily: "var(--font-body)", fontSize: "10.5px", color: "var(--ink-65)", marginLeft: "auto" } }, "листы клеятся по порядку: слева направо, сверху вниз"))));
  }

  // Все виды делят одно окружение: карточку, карту, диалоги, уведомление.
  // Отличается только полотно, поэтому накладки собираются здесь, а не
  // дублируются внутри каждого вида.
  renderViewScreen(canvas) {
    const s = this.state;
    return h("div", { style: { flex: 1, position: "relative", overflow: "hidden", display: "flex" } },
      canvas,
      s.sel ? this.renderSidebar() : null,
      s.form ? this.renderPersonForm() : null,
      s.modOpen ? this.renderModPanel() : null,
      s.mapOpen ? this.renderMapPanel() : null,
      s.authOpen ? this.renderAuthDialog() : null,
      s.scanOpen ? this.renderScanDialog() : null,
      s.toast ? h("div", { style: { position: "absolute", left: "50%", bottom: "26px", transform: "translateX(-50%)", background: "var(--color-text)", color: "var(--color-bg)", padding: "11px 20px", fontSize: "13.5px", display: "flex", alignItems: "center", gap: "12px", boxShadow: "0 10px 30px var(--scrim-20)", zIndex: 11 } },
        h("span", { style: { width: "6px", height: "6px", background: "var(--color-accent-2)", flex: "none" } }), s.toast) : null);
  }

  render() {
    const s = this.state;
    return h("div", { style: { height: "100vh", display: "flex", flexDirection: "column", background: "var(--color-bg)", color: "var(--color-text)", fontFamily: "var(--font-body)", fontSize: "15px", overflow: "hidden" } },
      this.renderHeader(),
      s.view === "ring" ? this.renderViewScreen(this.renderRing()) :
      s.view === "river" ? this.renderViewScreen(this.renderRiver()) :
      this.renderCanvas());
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(h(App));
