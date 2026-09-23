(async function () {
  const CATEGORY_ORDER = ["套組時裝", "幸運箱", "通行證", "聯動", "其他商城"];

  const state = {
    items: [],
    category: "all",
    twOnly: false,
    query: "",
  };

  const timelineEl = document.getElementById("timeline");
  const statsEl = document.getElementById("stats");
  const filtersEl = document.getElementById("categoryFilters");
  const searchBox = document.getElementById("searchBox");
  const twOnlyToggle = document.getElementById("twOnlyToggle");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");

  function twTimestampToDateStr(ts) {
    if (!ts) return null;
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  }

  function krDateParts(krDate) {
    const [y, m, d] = krDate.split(".").map(Number);
    return { y, m, d };
  }

  async function loadData() {
    const res = await fetch("data/fashion.json");
    const items = await res.json();
    return items;
  }

  function buildFilters(items) {
    const counts = {};
    items.forEach((i) => (counts[i.category] = (counts[i.category] || 0) + 1));
    const cats = CATEGORY_ORDER.filter((c) => counts[c]);
    filtersEl.innerHTML = "";
    const allBtn = document.createElement("button");
    allBtn.className = "chip active";
    allBtn.dataset.category = "all";
    allBtn.textContent = `全部 (${items.length})`;
    filtersEl.appendChild(allBtn);
    cats.forEach((c) => {
      const btn = document.createElement("button");
      btn.className = "chip";
      btn.dataset.category = c;
      btn.textContent = `${c} (${counts[c]})`;
      filtersEl.appendChild(btn);
    });
    filtersEl.addEventListener("click", (e) => {
      const btn = e.target.closest(".chip");
      if (!btn) return;
      state.category = btn.dataset.category;
      [...filtersEl.children].forEach((c) => c.classList.toggle("active", c === btn));
      render();
    });
  }

  function matchesFilters(item) {
    if (state.category !== "all" && item.category !== state.category) return false;
    if (state.twOnly && item.twReleased) return false;
    if (state.query) {
      const q = state.query.toLowerCase();
      const hay = `${item.name} ${item.title} ${item.displayName || ""}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }

  function createCard(item) {
    const card = document.createElement("div");
    card.className = "card";

    const media = document.createElement("div");
    media.className = "card-media";

    const imgs = item.localImages && item.localImages.length ? item.localImages : [];
    const img = document.createElement("img");
    let idx = 0;
    img.src = imgs[0] || "";
    img.alt = item.name;
    img.loading = "lazy";
    img.addEventListener("click", () => openLightbox(imgs, idx));
    media.appendChild(img);

    function setIdx(i) {
      idx = (i + imgs.length) % imgs.length;
      img.src = imgs[idx];
      if (media._dots) {
        [...media._dots.children].forEach((d, di) => d.classList.toggle("active", di === idx));
      }
      if (media._counter) media._counter.textContent = `${idx + 1}/${imgs.length}`;
    }

    if (imgs.length > 1) {
      const prevBtn = document.createElement("button");
      prevBtn.className = "img-arrow prev";
      prevBtn.type = "button";
      prevBtn.setAttribute("aria-label", "上一張圖");
      prevBtn.textContent = "‹";
      prevBtn.addEventListener("click", (e) => { e.stopPropagation(); setIdx(idx - 1); });

      const nextBtn = document.createElement("button");
      nextBtn.className = "img-arrow next";
      nextBtn.type = "button";
      nextBtn.setAttribute("aria-label", "下一張圖");
      nextBtn.textContent = "›";
      nextBtn.addEventListener("click", (e) => { e.stopPropagation(); setIdx(idx + 1); });

      const nav = document.createElement("div");
      nav.className = "img-nav";
      imgs.forEach((_, i) => {
        const dot = document.createElement("button");
        dot.type = "button";
        dot.className = "img-dot" + (i === 0 ? " active" : "");
        dot.setAttribute("aria-label", `第 ${i + 1} 張圖`);
        dot.addEventListener("click", (e) => { e.stopPropagation(); setIdx(i); });
        nav.appendChild(dot);
      });
      media._dots = nav;
      media.appendChild(prevBtn);
      media.appendChild(nextBtn);
      media.appendChild(nav);

      const counter = document.createElement("span");
      counter.className = "img-counter";
      counter.textContent = `1/${imgs.length}`;
      media.appendChild(counter);
      media._counter = counter;
    }

    const badge = document.createElement("span");
    if (item.twReleased && !item.twFullyReleased) {
      badge.className = "tw-badge partial";
      badge.textContent = "台服部分發行";
    } else if (item.twReleased) {
      badge.className = "tw-badge released";
      badge.textContent = "台服已發行";
    } else {
      badge.className = "tw-badge pending";
      badge.textContent = "台服未發行";
    }
    media.appendChild(badge);

    const body = document.createElement("div");
    body.className = "card-body";

    const catTag = document.createElement("span");
    catTag.className = "cat-tag " + item.category;
    catTag.textContent = item.category;
    body.appendChild(catTag);

    const name = document.createElement("p");
    name.className = "card-name";
    name.textContent = item.displayName || item.name;
    body.appendChild(name);

    const date = document.createElement("div");
    date.className = "card-date";
    date.textContent = `韓服上線:${item.krDate}`;
    body.appendChild(date);

    if (item.twReleased) {
      const twLine = document.createElement("div");
      twLine.className = "card-tw-line";
      twLine.textContent = `台服上線:${twTimestampToDateStr(item.twDate)}`;
      body.appendChild(twLine);
    }

    const source = document.createElement("a");
    source.className = "card-source";
    source.href = item.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener";
    source.textContent = "查看韓服官方公告 →";
    body.appendChild(source);

    card.appendChild(media);
    card.appendChild(body);
    return card;
  }

  function openLightbox(imgs, startIdx) {
    if (!imgs.length) return;
    lightboxImg.src = imgs[startIdx];
    lightbox.classList.add("open");
  }
  lightboxClose.addEventListener("click", () => lightbox.classList.remove("open"));
  lightbox.addEventListener("click", (e) => {
    if (e.target === lightbox) lightbox.classList.remove("open");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") lightbox.classList.remove("open");
  });

  function render() {
    const filtered = state.items.filter(matchesFilters);
    statsEl.textContent = `共 ${filtered.length} 筆時裝資料`;

    timelineEl.innerHTML = "";
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "沒有符合條件的時裝資料";
      timelineEl.appendChild(empty);
      return;
    }

    const groups = new Map();
    filtered.forEach((item) => {
      const { y, m } = krDateParts(item.krDate);
      const key = `${y}-${String(m).padStart(2, "0")}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });

    const sortedKeys = [...groups.keys()].sort().reverse();
    sortedKeys.forEach((key) => {
      const [y, m] = key.split("-");
      const groupEl = document.createElement("div");
      groupEl.className = "month-group";

      const label = document.createElement("div");
      label.className = "month-label";
      label.innerHTML = `<span class="y">${y}年${parseInt(m, 10)}月</span>`;
      groupEl.appendChild(label);

      const grid = document.createElement("div");
      grid.className = "card-grid";
      groups.get(key)
        .sort((a, b) => b.krDate.localeCompare(a.krDate))
        .forEach((item) => grid.appendChild(createCard(item)));
      groupEl.appendChild(grid);

      timelineEl.appendChild(groupEl);
    });
  }

  searchBox.addEventListener("input", (e) => {
    state.query = e.target.value.trim();
    render();
  });
  twOnlyToggle.addEventListener("change", (e) => {
    state.twOnly = e.target.checked;
    render();
  });

  try {
    state.items = await loadData();
    buildFilters(state.items);
    render();
  } catch (e) {
    timelineEl.innerHTML = `<div class="empty-state">資料載入失敗:${e.message}</div>`;
  }
})();
