(async function () {
  const CATEGORY_ORDER = ["傳說時裝", "套組時裝", "幸運箱", "通行證", "聯動", "商城樂器", "其他商城"];
  const HIDDEN_CHOICE_KINDS = ["dye"];
  const utils = window.timelineUtils;
  const formatRerunNote = window.timelineUiFormatters?.formatRerunNote || (() => "");

  const state = {
    items: [],
    category: "all",
    twStatus: "all",
    month: "all",
    order: "asc",
    query: "",
  };

  const timelineEl = document.getElementById("timeline");
  const statsEl = document.getElementById("stats");
  const filtersEl = document.getElementById("categoryFilters");
  const searchBox = document.getElementById("searchBox");
  const statusFilter = document.getElementById("statusFilter");
  const monthFilter = document.getElementById("monthFilter");
  const sortOrder = document.getElementById("sortOrder");
  const jumpToday = document.getElementById("jumpToday");
  const clearFilters = document.getElementById("clearFilters");
  const dataLatest = document.getElementById("dataLatest");
  const lightbox = document.getElementById("lightbox");
  const lightboxImg = document.getElementById("lightboxImg");
  const lightboxClose = document.getElementById("lightboxClose");
  const lightboxPrev = document.getElementById("lightboxPrev");
  const lightboxNext = document.getElementById("lightboxNext");
  const lightboxCounter = document.getElementById("lightboxCounter");
  const lightboxCategory = document.getElementById("lightboxCategory");
  const lightboxTitle = document.getElementById("lightboxTitle");
  const lightboxMeta = document.getElementById("lightboxMeta");
  let lightboxItem = null;
  let lightboxIndex = 0;

  function updateLightboxImageQuality() {
    const isLowResolution = lightboxImg.complete
      && (lightboxImg.naturalWidth < 400 || lightboxImg.naturalHeight < 500);
    lightboxImg.classList.toggle("lightbox-image-low-res", isLowResolution);
  }

  function getLightboxImages(item) {
    return item.lightboxImages?.length
      ? item.lightboxImages
      : (item.localImages || []).map((src) => ({ src }));
  }

  function twTimestampToDateStr(timestamp) {
    if (!timestamp) return null;
    const date = new Date(timestamp * 1000);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, "0")}.${String(date.getDate()).padStart(2, "0")}`;
  }

  function statusInfo(item) {
    const status = utils.getPublicTwStatus(item);
    return {
      status,
      label: status === "confirmed" ? "台服已上線" : "台服未上線",
    };
  }

  async function loadData() {
    const response = await fetch("data/fashion.json?v=timeline-6");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const items = await response.json();
    return items.filter((item) => utils.isPublicTimelineItem(item, HIDDEN_CHOICE_KINDS));
  }

  function buildCategoryFilters() {
    const counts = {};
    state.items.forEach((item) => { counts[item.category] = (counts[item.category] || 0) + 1; });
    filtersEl.innerHTML = "";
    const categories = [{ key: "all", label: "全部", count: state.items.length }]
      .concat(CATEGORY_ORDER.filter((category) => counts[category]).map((category) => ({
        key: category,
        label: category,
        count: counts[category],
      })));
    categories.forEach(({ key, label, count }) => {
      const button = document.createElement("button");
      button.className = `chip${state.category === key ? " active" : ""}`;
      button.dataset.category = key;
      button.type = "button";
      button.textContent = `${label} ${count}`;
      filtersEl.appendChild(button);
    });
  }

  function buildMonthFilter() {
    const months = utils.getMonthOptions(state.items);
    monthFilter.innerHTML = "<option value=\"all\">全部月份</option>";
    months.forEach(({ key, label }) => {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = label;
      monthFilter.appendChild(option);
    });
  }

  function updateLatestData() {
    const latest = state.items
      .map((item) => item.krDate)
      .filter(Boolean)
      .sort()
      .at(-1);
    dataLatest.textContent = latest || "—";
  }

  function todayDateKey() {
    const today = new Date();
    return `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, "0")}.${String(today.getDate()).padStart(2, "0")}`;
  }

  function dateOrdinal(key) {
    const [year, month, day] = String(key).split(".").map(Number);
    return Date.UTC(year, (month || 1) - 1, day || 1);
  }

  function nearestDateKey() {
    const dates = [...new Set(state.items.map((item) => item.krDate).filter(Boolean))];
    if (!dates.length) return null;
    const target = dateOrdinal(todayDateKey());
    return dates.reduce((nearest, current) => {
      const currentDistance = Math.abs(dateOrdinal(current) - target);
      const nearestDistance = Math.abs(dateOrdinal(nearest) - target);
      return currentDistance < nearestDistance ? current : nearest;
    });
  }

  function formatDateLabel(key) {
    const [year, month, day] = String(key).split(".").map(Number);
    return `${year}年${month}月${day}日`;
  }

  function createCard(item) {
    const card = document.createElement("article");
    card.className = "card";
    card.dataset.itemId = item.id;
    card.dataset.rerun = item.isRerun ? "true" : "false";

    const media = document.createElement("div");
    media.className = "card-media";
    const images = item.localImages?.length ? item.localImages : [];

    if (images.length) {
      const image = document.createElement("img");
      image.src = images[0];
      image.alt = item.name;
      image.loading = "lazy";
      media.appendChild(image);
    } else {
      const emptyMedia = document.createElement("div");
      emptyMedia.className = "media-empty";
      emptyMedia.textContent = "圖片待補";
      media.appendChild(emptyMedia);
    }

    const badge = document.createElement("span");
    const info = statusInfo(item);
    badge.className = `tw-badge ${info.status}`;
    badge.textContent = info.label;
    media.appendChild(badge);

    const body = document.createElement("div");
    body.className = "card-body";
    const labels = document.createElement("div");
    labels.className = "card-labels";
    const category = document.createElement("span");
    category.className = `cat-tag ${item.category}`;
    category.textContent = item.category;
    labels.appendChild(category);
    if (item.isRerun) {
      const rerun = document.createElement("span");
      rerun.className = "rerun-tag";
      rerun.textContent = "復刻／再販";
      rerun.title = formatRerunNote(item);
      labels.appendChild(rerun);
    }
    body.appendChild(labels);

    const primaryName = info.status === "confirmed" && item.displayName ? item.displayName : item.name;
    const name = document.createElement("h3");
    name.className = "card-name";
    name.textContent = primaryName;
    body.appendChild(name);
    const secondaryName = primaryName === item.name ? (item.displayName && item.displayName !== item.name ? `中文：${item.displayName}` : "") : `韓文：${item.name}`;
    if (secondaryName) {
      const secondary = document.createElement("p");
      secondary.className = "card-name-secondary";
      secondary.textContent = secondaryName;
      body.appendChild(secondary);
    }

    const date = document.createElement("div");
    date.className = "card-date";
    date.innerHTML = `<span>韓服上線</span>${item.krDate}`;
    body.appendChild(date);
    if (item.isRerun) {
      const rerunNote = document.createElement("div");
      rerunNote.className = "card-rerun-note";
      rerunNote.textContent = formatRerunNote(item);
      body.appendChild(rerunNote);
    }
    if (info.status === "confirmed" && item.twDate) {
      const twLine = document.createElement("div");
      twLine.className = "card-tw-line";
      twLine.innerHTML = `<span>台服上線</span>${twTimestampToDateStr(item.twDate)}`;
      body.appendChild(twLine);
    }

    if (item.choiceKind === "instrument" && item.components?.length) {
      const details = document.createElement("details");
      details.className = "choice-details";
      const summary = document.createElement("summary");
      summary.textContent = `選擇內容（${item.components.length} 種樂器）`;
      details.appendChild(summary);
      const list = document.createElement("ul");
      item.components.forEach((component) => {
        const entry = document.createElement("li");
        entry.textContent = component.replace(/\s+([23])\s*화음$/u, " · $1 和弦");
        list.appendChild(entry);
      });
      details.appendChild(list);
      body.appendChild(details);
    }

    const source = document.createElement("a");
    source.className = "card-source";
    source.href = item.sourceUrl;
    source.target = "_blank";
    source.rel = "noopener";
    source.textContent = "查看韓服公告 ↗";
    body.appendChild(source);

    card.append(media, body);
    if (images.length) {
      media.tabIndex = 0;
      media.setAttribute("role", "button");
      media.setAttribute("aria-label", `查看${primaryName}圖片`);
      const openMedia = () => openLightbox(item);
      card.addEventListener("click", (event) => {
        if (utils.isCardMediaTarget(event.target)) openMedia();
      });
      media.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openMedia();
      });
    }
    return card;
  }

  function updateLightbox() {
    if (!lightboxItem) return;
    const images = getLightboxImages(lightboxItem);
    lightboxIndex = (lightboxIndex + images.length) % images.length;
    const image = images[lightboxIndex];
    lightboxImg.className = image.className || "";
    lightboxImg.dataset.fallback = image.fallback || "";
    lightboxImg.src = image.src;
    lightboxImg.alt = lightboxItem.name;
    lightboxCounter.textContent = `${lightboxIndex + 1} / ${images.length}`;
    lightboxCategory.textContent = lightboxItem.category;
    lightboxTitle.textContent = lightboxItem.displayName || lightboxItem.name;
    const componentNote = lightboxItem.choiceKind === "instrument" && lightboxItem.components?.length
      ? ` · ${lightboxItem.components.length} 種可選樂器`
      : "";
    const imageNote = image.note ? ` · ${image.note}` : "";
    lightboxMeta.textContent = `韓文：${lightboxItem.name} · 韓服上線 ${lightboxItem.krDate}${componentNote}${imageNote}`;
    lightboxPrev.hidden = images.length < 2;
    lightboxNext.hidden = images.length < 2;
  }

  lightboxImg.addEventListener("load", updateLightboxImageQuality);
  lightboxImg.addEventListener("error", () => {
    const fallback = lightboxImg.dataset.fallback;
    if (!fallback || lightboxImg.src.endsWith(fallback)) return;
    lightboxImg.className = "lightbox-image-low-res";
    lightboxImg.src = fallback;
  });

  function openLightbox(item) {
    if (!getLightboxImages(item).length) return;
    lightboxItem = item;
    lightboxIndex = 0;
    updateLightbox();
    lightbox.classList.add("open");
    lightbox.setAttribute("aria-hidden", "false");
    lightboxClose.focus();
  }

  function closeLightbox() {
    lightbox.classList.remove("open");
    lightbox.setAttribute("aria-hidden", "true");
    lightboxImg.removeAttribute("src");
    lightboxItem = null;
  }

  function shiftLightbox(delta) {
    if (!lightboxItem || !getLightboxImages(lightboxItem).length) return;
    lightboxIndex += delta;
    updateLightbox();
  }

  function render() {
    const filtered = utils.filterTimelineItems(state.items, {
      category: state.category,
      twStatus: state.twStatus,
      month: state.month,
      query: state.query,
    });
    const ordered = utils.sortTimelineItems(filtered, state.order);
    statsEl.textContent = `顯示 ${filtered.length} / ${state.items.length} 筆 · ${state.order === "asc" ? "由舊到新" : "由新到舊"}`;
    clearFilters.hidden = !(state.category !== "all" || state.twStatus !== "all" || state.month !== "all" || state.query);
    timelineEl.innerHTML = "";
    if (!ordered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      const title = document.createElement("strong");
      title.textContent = "找不到符合的資料";
      const hint = document.createElement("span");
      hint.textContent = "試著放寬搜尋字詞或清除篩選條件。";
      empty.append(title, hint);
      timelineEl.appendChild(empty);
      return;
    }

    const groups = new Map();
    ordered.forEach((item) => {
      const key = String(item.krDate || "未知日期");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
    const currentDate = nearestDateKey();
    const groupKeys = [...groups.keys()].sort((a, b) => state.order === "asc" ? a.localeCompare(b) : b.localeCompare(a));
    groupKeys.forEach((key, dateIndex) => {
      const group = document.createElement("section");
      group.className = `month-group date-group${key === currentDate ? " is-current" : ""}`;
      group.dataset.date = key;
      group.dataset.month = key.slice(0, 7).replace(".", "-");
      const label = document.createElement("div");
      label.className = "month-label";
      const index = document.createElement("span");
      index.className = "month-index";
      index.textContent = String(dateIndex + 1).padStart(2, "0");
      const dateName = document.createElement("span");
      dateName.className = "month-name";
      dateName.textContent = formatDateLabel(key);
      const count = document.createElement("span");
      count.className = "month-count";
      count.textContent = `${groups.get(key).length} 項`;
      label.append(index, dateName, count);
      if (key === currentDate) {
        const today = document.createElement("span");
        today.className = "today-mark";
        today.textContent = "今天附近";
        label.appendChild(today);
      }
      group.append(label);
      const grid = document.createElement("div");
      grid.className = "card-grid";
      groups.get(key).forEach((item) => grid.appendChild(createCard(item)));
      group.appendChild(grid);
      timelineEl.appendChild(group);
    });
  }

  filtersEl.addEventListener("click", (event) => {
    const button = event.target.closest(".chip");
    if (!button) return;
    state.category = button.dataset.category;
    [...filtersEl.children].forEach((chip) => chip.classList.toggle("active", chip === button));
    render();
  });
  searchBox.addEventListener("input", (event) => { state.query = event.target.value.trim(); render(); });
  statusFilter.addEventListener("change", (event) => { state.twStatus = event.target.value; render(); });
  monthFilter.addEventListener("change", (event) => { state.month = event.target.value; render(); });
  sortOrder.addEventListener("change", (event) => { state.order = event.target.value; render(); });
  clearFilters.addEventListener("click", () => {
    state.category = "all";
    state.twStatus = "all";
    state.month = "all";
    state.query = "";
    searchBox.value = "";
    statusFilter.value = "all";
    monthFilter.value = "all";
    buildCategoryFilters();
    render();
  });
  jumpToday.addEventListener("click", () => {
    const target = nearestDateKey();
    if (!target) return;
    state.month = target.slice(0, 7).replace(".", "-");
    monthFilter.value = state.month;
    render();
    document.querySelector(`.date-group[data-date="${target}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  lightboxClose.addEventListener("click", closeLightbox);
  lightboxPrev.addEventListener("click", () => shiftLightbox(-1));
  lightboxNext.addEventListener("click", () => shiftLightbox(1));
  lightbox.addEventListener("click", (event) => { if (event.target === lightbox) closeLightbox(); });
  document.addEventListener("keydown", (event) => {
    if (!lightbox.classList.contains("open")) return;
    if (event.key === "Escape") closeLightbox();
    if (event.key === "ArrowLeft") shiftLightbox(-1);
    if (event.key === "ArrowRight") shiftLightbox(1);
  });

  try {
    state.items = await loadData();
    buildCategoryFilters();
    buildMonthFilter();
    updateLatestData();
    render();
  } catch (error) {
    timelineEl.innerHTML = "";
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const title = document.createElement("strong");
    title.textContent = "資料載入失敗";
    const detail = document.createElement("span");
    detail.textContent = error.message;
    empty.append(title, detail);
    timelineEl.appendChild(empty);
  }
}());
