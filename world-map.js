// <family-map> — карта мира на реальной геометрии Natural Earth (d3-geo + topojson).
// Зум колесом, панорама перетаскиванием, приближение к городу по клику.
// Тема задаётся атрибутами: paper, ink, accent, muted, land, font, radius.
(function () {
  const TOPO = "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-110m.json";

  class FamilyMap extends HTMLElement {
    static get observedAttributes() { return ["data-route", "data-mode"]; }

    attributeChangedCallback(name, _old, val) {
      if (!this._init || !val) return;
      if (name === "data-mode") this.mode = val;
      if (name === "data-route") { this.routeId = val; this.mode = "route"; }
      if (this.world) { this.controls(); this.draw(); }
    }

    connectedCallback() {
      if (this._init) return; this._init = true;
      this.theme = {
        paper: this.getAttribute("paper") || "#f6f2ea",
        ink: this.getAttribute("ink") || "#1d1b16",
        accent: this.getAttribute("accent") || "#8a3324",
        muted: this.getAttribute("muted") || "#a09a8c",
        land: this.getAttribute("land") || "#e6e0d3",
        font: this.getAttribute("font") || "inherit",
        radius: this.getAttribute("radius") || "0px"
      };
      this.mode = this.getAttribute("data-mode") || (this.getAttribute("data-route") ? "route" : "all");
      this.year = 2026; this.gens = new Set([0, 1, 2, 3, 4]);
      this.routeId = this.getAttribute("data-route") || null;
      this.k = 1;
      this.build();
      this.load();
    }

    build() {
      const t = this.theme;
      this.style.cssText = `display:block;position:relative;width:100%;height:100%;background:${t.paper};font-family:${t.font};color:${t.ink};overflow:hidden`;
      this.innerHTML = `
        <div data-svg style="position:absolute;inset:0"></div>
        <div data-panel style="position:absolute;left:20px;top:20px;width:252px;background:${t.paper};border:1px solid ${t.ink}22;border-radius:${t.radius};padding:16px 16px 14px;box-shadow:0 8px 28px ${t.ink}14;font-size:12px;line-height:1.45"></div>
        <div data-zoom style="position:absolute;right:20px;top:64px;display:flex;flex-direction:column;border:1px solid ${t.ink}22;border-radius:${t.radius};overflow:hidden;background:${t.paper};box-shadow:0 4px 14px ${t.ink}14">
          <button data-z="in" title="Приблизить" style="width:34px;height:32px;border:none;border-bottom:1px solid ${t.ink}1a;background:transparent;font:inherit;font-size:17px;cursor:pointer;color:${t.ink}">+</button>
          <button data-z="out" title="Отдалить" style="width:34px;height:32px;border:none;border-bottom:1px solid ${t.ink}1a;background:transparent;font:inherit;font-size:17px;cursor:pointer;color:${t.ink}">−</button>
          <button data-z="reset" title="Весь мир" style="width:34px;height:30px;border:none;background:transparent;font:inherit;font-size:11px;cursor:pointer;color:${t.muted}">⤢</button>
        </div>
        <div data-legend style="position:absolute;right:20px;bottom:20px;background:${t.paper};border:1px solid ${t.ink}22;border-radius:${t.radius};padding:10px 13px;font-size:11px;color:${t.ink}99;line-height:1.55;max-width:300px"></div>
        <div data-tip style="position:absolute;pointer-events:none;opacity:0;transition:opacity .12s;background:${t.ink};color:${t.paper};padding:7px 10px;border-radius:${t.radius};font-size:11.5px;line-height:1.4;max-width:240px;z-index:5"></div>
        <div data-status style="position:absolute;inset:0;display:grid;place-items:center;font-size:12px;color:${t.muted};letter-spacing:.08em;text-transform:uppercase">Загрузка географии…</div>`;
      this.$ = (s) => this.querySelector(s);
    }

    async load() {
      const waitFor = (f, ms = 12000) => new Promise((res, rej) => {
        const t0 = Date.now();
        (function tick() { if (f()) return res(); if (Date.now() - t0 > ms) return rej(new Error("timeout")); setTimeout(tick, 60); })();
      });
      try {
        await waitFor(() => window.d3 && window.topojson);
        const data = await import("./family-data.js");
        this.data = data;
        this.people = data.PEOPLE;
        this.points = data.mapPoints(this.people);
        const topo = await (await fetch(TOPO)).json();
        this.world = window.topojson.feature(topo, topo.objects.countries);
        this.$("[data-status]").remove();
        if (!this.routeId || !this.people.some(p => p.id === this.routeId && (p.residences || []).length > 1)) {
          this.routeId = (this.people.find(p => (p.residences || []).length > 2) || this.people[0]).id;
        }
        this.draw();
        this.controls();
        new ResizeObserver(() => { this._tf = null; this.k = 1; this.draw(); }).observe(this);
      } catch (e) {
        const s = this.$("[data-status]"); if (s) s.textContent = "Не удалось загрузить карту";
        console.error(e);
      }
    }

    activePoints() {
      return this.points.filter(p => this.gens.has(p.gen ?? 0) && (p.from ?? 0) <= this.year);
    }

    controls() {
      const t = this.theme, d = this.data;
      const label = (s) => `<div style="font-size:9.5px;letter-spacing:.14em;text-transform:uppercase;color:${t.muted};margin:0 0 7px">${s}</div>`;
      const modes = [["all", "Все точки"], ["route", "Маршрут"], ["cluster", "Кластеры"]];
      const people = this.people.filter(p => (p.residences || []).length > 1);
      this.$("[data-panel]").innerHTML = `
        ${label("Режим")}
        <div data-modes style="display:flex;gap:4px;margin-bottom:14px">${modes.map(([k, n]) =>
          `<button data-m="${k}" style="flex:1;padding:6px 4px;font:inherit;font-size:11px;cursor:pointer;border:1px solid ${t.ink}22;border-radius:${t.radius};background:${this.mode === k ? t.ink : "transparent"};color:${this.mode === k ? t.paper : t.ink}">${n}</button>`).join("")}</div>
        <div data-routebox style="display:${this.mode === "route" ? "block" : "none"};margin-bottom:14px">
          ${label("Чей маршрут")}
          <select data-route style="width:100%;padding:6px;font:inherit;font-size:11.5px;border:1px solid ${t.ink}22;border-radius:${t.radius};background:transparent;color:${t.ink}">
            ${people.map(p => `<option value="${p.id}" ${p.id === this.routeId ? "selected" : ""}>${d.shortName(p)} · ${d.years(p)}</option>`).join("")}
          </select>
        </div>
        ${label("Поколение")}
        <div data-gens style="display:flex;gap:4px;margin-bottom:14px">${[0, 1, 2, 3, 4].map(g =>
          `<button data-g="${g}" style="width:28px;height:26px;font:inherit;font-size:11px;cursor:pointer;border:1px solid ${t.ink}22;border-radius:${t.radius};background:${this.gens.has(g) ? t.accent : "transparent"};color:${this.gens.has(g) ? "#fff" : t.ink}99">${g + 1}</button>`).join("")}</div>
        ${label("Год")}
        <input data-year type="range" min="1900" max="2026" step="1" value="${this.year}" style="width:100%;accent-color:${t.accent}">
        <div style="display:flex;justify-content:space-between;font-size:11px;color:${t.muted};margin-top:3px"><span>1900</span><b data-yl style="color:${t.ink};font-weight:600">${this.year}</b><span>2026</span></div>
        ${label("Приблизить к городу")}
        <select data-city style="width:100%;padding:6px;font:inherit;font-size:11.5px;border:1px solid ${t.ink}22;border-radius:${t.radius};background:transparent;color:${t.ink}">
          <option value="">— выберите город —</option>
          ${[...new Set(this.points.map(p => p.place))].sort().map(c => `<option value="${c}">${c}</option>`).join("")}
        </select>`;

      this.$("[data-modes]").onclick = (e) => { const b = e.target.closest("[data-m]"); if (!b) return; this.mode = b.dataset.m; this.controls(); this.draw(); };
      this.$("[data-gens]").onclick = (e) => {
        const b = e.target.closest("[data-g]"); if (!b) return; const g = +b.dataset.g;
        this.gens.has(g) ? this.gens.delete(g) : this.gens.add(g); this.controls(); this.draw();
      };
      const yr = this.$("[data-year]");
      yr.oninput = () => { this.year = +yr.value; this.$("[data-yl]").textContent = this.year; this.draw(); };
      const rt = this.$("[data-route]"); if (rt) rt.onchange = () => { this.routeId = rt.value; this.draw(); };
      const ct = this.$("[data-city]");
      ct.onchange = () => { const c = this.data.PLACES[ct.value]; if (c) this.zoomTo(c[1], c[0], 8); };
    }

    zoomTo(lon, lat, k) {
      if (!this._proj || !this._zoom) return;
      const d3 = window.d3, [x, y] = this._proj([lon, lat]);
      const w = this.clientWidth, h = this.clientHeight;
      this._svg.transition().duration(600).call(this._zoom.transform,
        d3.zoomIdentity.translate(w / 2 - 60 + 130, h / 2).scale(k).translate(-x, -y));
    }

    openPerson(person, place) {
      this.dispatchEvent(new CustomEvent("person-open", {
        bubbles: true, composed: true,
        detail: { id: person.id, name: person.name, place }
      }));
    }

    rescale() {
      const k = this.k || 1;
      if (!this.g) return;
      this.g.selectAll("[data-mx]").attr("transform", function () {
        return `translate(${this.getAttribute("data-mx")},${this.getAttribute("data-my")}) scale(${1 / k})`;
      });
      this.g.selectAll("[data-lw]").attr("stroke-width", function () { return (+this.getAttribute("data-lw")) / k; });
      this.g.selectAll("[data-geo]").attr("stroke-width", function () { return (+this.getAttribute("data-geo")) / k; });
    }

    draw() {
      if (!this.world) return;
      const d3 = window.d3, t = this.theme, d = this.data;
      const w = this.clientWidth || 900, h = this.clientHeight || 600;
      const host = this.$("[data-svg]"); host.innerHTML = "";
      const svg = d3.select(host).append("svg").attr("width", w).attr("height", h)
        .style("display", "block").style("cursor", "grab");
      const g = svg.append("g");
      this._svg = svg; this.g = g;

      const pts = this.activePoints();
      const fc = { type: "FeatureCollection", features: (pts.length ? pts : this.points).map(p => ({ type: "Feature", geometry: { type: "Point", coordinates: [p.lon, p.lat] } })) };
      const proj = d3.geoMercator().fitExtent([[Math.min(300, w * 0.32), 70], [w - 60, h - 70]], fc);
      if (proj.scale() > 900) proj.scale(900).translate([w / 2 + 60, h / 2]);
      const path = d3.geoPath(proj);
      this._proj = proj;

      const zoom = d3.zoom().scaleExtent([1, 60])
        .translateExtent([[-w * 0.4, -h * 0.4], [w * 1.4, h * 1.4]])
        .on("zoom", (ev) => { this.k = ev.transform.k; this._tf = ev.transform; g.attr("transform", ev.transform); this.rescale(); this.updateHint(); });
      this._zoom = zoom;
      svg.call(zoom).on("dblclick.zoom", null)
        .on("mousedown.c", () => svg.style("cursor", "grabbing"))
        .on("mouseup.c", () => svg.style("cursor", "grab"));
      this.$("[data-zoom]").onclick = (e) => {
        const b = e.target.closest("[data-z]"); if (!b) return;
        if (b.dataset.z === "reset") { this._tf = null; svg.transition().duration(350).call(zoom.transform, d3.zoomIdentity); }
        else svg.transition().duration(280).call(zoom.scaleBy, b.dataset.z === "in" ? 1.7 : 1 / 1.7);
      };
      svg.on("dblclick", (ev) => {
        const [mx, my] = d3.pointer(ev, g.node());
        const ll = proj.invert([mx, my]);
        if (ll) this.zoomTo(ll[0], ll[1], Math.min(60, this.k * 2.2));
      });

      g.append("path").datum({ type: "Sphere" }).attr("d", path).attr("fill", t.paper);
      g.append("g").selectAll("path").data(this.world.features).join("path")
        .attr("d", path).attr("fill", t.land).attr("stroke", t.paper).attr("data-geo", 0.8).attr("stroke-width", 0.8);
      g.append("path").datum(d3.geoGraticule10()).attr("d", path).attr("fill", "none")
        .attr("stroke", t.ink).attr("stroke-opacity", 0.05).attr("data-geo", 0.5).attr("stroke-width", 0.5);

      const tip = this.$("[data-tip]");
      const show = (html, ev) => {
        tip.innerHTML = html; tip.style.opacity = 1;
        const r = this.getBoundingClientRect();
        tip.style.left = Math.min(ev.clientX - r.left + 14, w - 258) + "px";
        tip.style.top = Math.min(ev.clientY - r.top + 14, h - 70) + "px";
      };
      const hide = () => { tip.style.opacity = 0; };
      const marker = (x, y) => g.append("g").attr("data-mx", x).attr("data-my", y)
        .attr("transform", `translate(${x},${y}) scale(${1 / (this.k || 1)})`);

      if (this.mode === "route") {
        const p = this.people.find(x => x.id === this.routeId) || this.people[0];
        const stops = (p.residences || []).map(r => ({ ...r, c: d.PLACES[r.place] })).filter(s => s.c);
        const line = { type: "LineString", coordinates: stops.map(s => [s.c[1], s.c[0]]) };
        const pl = g.append("path").datum(line).attr("d", path).attr("fill", "none")
          .attr("stroke", t.accent).attr("data-lw", 2).attr("stroke-width", 2).attr("stroke-linecap", "round");
        const L = pl.node().getTotalLength();
        pl.attr("stroke-dasharray", `${L} ${L}`).attr("stroke-dashoffset", L).transition().duration(1300).attr("stroke-dashoffset", 0);
        stops.forEach((s, i) => {
          const [x, y] = proj([s.c[1], s.c[0]]);
          const mk = marker(x, y).style("cursor", "pointer")
            .on("click", () => this.zoomTo(s.c[1], s.c[0], 8))
            .on("mousemove", (ev) => show(`<b>${s.place}</b> · остановка ${i + 1}<br>${s.from}${s.to ? "–" + s.to : " → наст. время"}${s.note ? "<br><i style='opacity:.75'>" + s.note + "</i>" : ""}`, ev))
            .on("mouseleave", hide);
          const dy = i % 2 ? 21 : -13;
          mk.append("line").attr("x1", 0).attr("y1", 0).attr("x2", 0).attr("y2", dy * 0.6).attr("stroke", t.accent).attr("stroke-opacity", .4);
          mk.append("circle").attr("r", 6.5).attr("fill", t.paper).attr("stroke", t.accent).attr("stroke-width", 2);
          mk.append("text").attr("text-anchor", "middle").attr("y", 3).attr("font-size", 9).attr("font-weight", 700)
            .attr("fill", t.accent).style("pointer-events", "none").text(i + 1);
          const lab = mk.append("text").attr("text-anchor", "middle").attr("y", dy).attr("font-size", 11.5)
            .attr("fill", t.ink).style("pointer-events", "none").text(`${s.place} · ${s.from}${s.to ? "–" + s.to : "→"}`);
          const bb = lab.node().getBBox();
          mk.insert("rect", () => lab.node()).attr("x", bb.x - 4).attr("y", bb.y - 2)
            .attr("width", bb.width + 8).attr("height", bb.height + 4).attr("fill", t.paper).attr("fill-opacity", .88)
            .style("pointer-events", "none");
        });
        this.legend(`<b style="color:${t.ink}">${p.name}</b><br>${stops.length} мест · ${stops[0]?.from}–${stops[stops.length - 1]?.to || "наст. время"}<br><span style="opacity:.8">клик по остановке — приблизить, двойной клик по карте — зум, перетаскивание — сдвиг</span>`);
        if (this._tf) svg.call(zoom.transform, this._tf); else this.rescale();
        return;
      }

      const groups = d3.group(pts, p => p.place);
      if (this.mode === "cluster") {
        const arr = [...groups].map(([place, list]) => ({ place, list, people: new Set(list.map(l => l.person.id)).size }));
        const rs = d3.scaleSqrt().domain([1, d3.max(arr, a => a.people) || 1]).range([9, 27]);
        arr.sort((a, b) => b.people - a.people).forEach(a => {
          const c = d.PLACES[a.place], [x, y] = proj([c[1], c[0]]);
          const mk = marker(x, y).style("cursor", "pointer")
            .on("click", () => this.zoomTo(c[1], c[0], 8))
            .on("mousemove", (ev) => show(`<b>${a.place}</b> · ${a.people} человек<br>${[...new Set(a.list.map(l => l.person.name))].join("<br>")}<br><i style="opacity:.7">клик — приблизить</i>`, ev))
            .on("mouseleave", hide);
          const r = rs(a.people);
          mk.append("circle").attr("r", r).attr("fill", t.accent).attr("fill-opacity", 0.2)
            .attr("stroke", t.accent).attr("stroke-width", 1.3);
          mk.append("text").attr("text-anchor", "middle").attr("y", 4).attr("font-size", 11).attr("font-weight", 700)
            .attr("fill", t.accent).style("pointer-events", "none").text(a.people);
          mk.append("text").attr("text-anchor", "middle").attr("y", r + 13).attr("font-size", 11)
            .attr("fill", t.ink).attr("fill-opacity", .75).style("pointer-events", "none").text(a.place);
        });
        this.legend(`${arr.length} городов · ${new Set(pts.map(p => p.person.id)).size} человек<br>размер круга — число людей<br><span style="opacity:.8">клик по городу — приблизить</span>`);
        if (this._tf) svg.call(zoom.transform, this._tf); else this.rescale();
        return;
      }

      [...groups].forEach(([place, list]) => {
        const c = d.PLACES[place], [x, y] = proj([c[1], c[0]]);
        const mk = marker(x, y);
        const spread = list.length > 1 ? 7 + list.length * 0.9 : 0;
        mk.append("text").attr("text-anchor", "middle").attr("y", -(spread + 8)).attr("font-size", 11)
          .attr("fill", t.ink).attr("fill-opacity", .6).style("pointer-events", "none").text(place);
        list.forEach((p, i) => {
          const a = (i / list.length) * Math.PI * 2;
          mk.append("circle").attr("cx", Math.cos(a) * spread).attr("cy", Math.sin(a) * spread).attr("r", 4.4)
            .attr("fill", p.person.living ? t.accent : t.ink).attr("fill-opacity", p.person.living ? 0.92 : 0.6)
            .attr("stroke", t.paper).attr("stroke-width", 1)
            .style("cursor", "pointer")
            .on("mousemove", (ev) => show(`<b>${p.person.name}</b><br>${place} · ${p.from}${p.to && p.to !== p.from ? "–" + p.to : ""}${p.note ? "<br><i style='opacity:.75'>" + p.note + "</i>" : ""}<br><i style="opacity:.7">клик — открыть карточку, двойной — приблизить</i>`, ev))
            .on("mouseleave", hide)
            .on("mousedown", (ev) => { this._down = [ev.clientX, ev.clientY, Date.now()]; })
            .on("mouseup", (ev) => {
              const d = this._down;
              if (!d) return;
              this._down = null;
              if (Math.hypot(ev.clientX - d[0], ev.clientY - d[1]) > 5) return; // это был сдвиг карты
              if (Date.now() - (this._lastOpen || 0) < 400) return;
              this._lastOpen = Date.now();
              ev.stopPropagation();
              this.openPerson(p.person, place);
            })
            .on("click", (ev) => {
              ev.stopPropagation();
              if (Date.now() - (this._lastOpen || 0) < 400) return;
              this._lastOpen = Date.now();
              this.openPerson(p.person, place);
            })
            .on("dblclick", (ev) => { ev.stopPropagation(); this.zoomTo(c[1], c[0], 8); });
        });
      });
      this.legend(`${pts.length} точек до ${this.year} года · <span style="color:${t.accent}">●</span> живущие · <span style="opacity:.6">●</span> ушедшие<br><span style="opacity:.8">колесо или двойной клик — зум, перетаскивание — сдвиг</span>`);
      if (this._tf) svg.call(zoom.transform, this._tf); else this.rescale();
    }

    legend(html) { this._legendHtml = html; this.updateHint(); }
    updateHint() {
      const el = this.$("[data-legend]"); if (!el) return;
      el.innerHTML = (this._legendHtml || "") + `<br><span style="opacity:.6">масштаб ×${(this.k || 1).toFixed(1)}</span>`;
    }
  }
  if (!customElements.get("family-map")) customElements.define("family-map", FamilyMap);
})();
