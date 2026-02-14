(() => {
  const PAGE_SIZE = 50;
  const ROOT_CANDIDATES = ["textures", "Textures", "Текстуры", "texture"];
  const IMAGE_EXT = ["jpg", "jpeg", "png", "webp", "tif", "tiff"];
  const TYPE_ALIASES = {
    basecolor: ["basecolor", "albedo", "diffuse", "color", "col"],
    normal: ["normal", "nrm", "nor"],
    roughness: ["roughness", "rough"],
    metalness: ["metalness", "metallic", "metal"],
    ao: ["ao", "ambientocclusion", "occlusion"],
    displacement: ["displacement", "height", "disp"],
  };

  const i18n = {
    ru: {
      title: "Коллекция Текстур от Нейросетей",
      subtitle: "Просмотр, категоризация и скачивание твоих AI-генерированных текстур",
      hint: "Автозагрузка из репозитория: структура textures/категория/текстура/файлы. Каждая папка текстуры отображается отдельной карточкой и архивируется целиком.",
      search: "Поиск: oak, wood, metal...",
      idle: "Загрузка текстур из репозитория...",
      loading: "Читаю структуру репозитория GitHub...",
      ready: "Готово: найдено текстур",
      loadErr: "Не удалось прочитать репозиторий. Проверьте, что папка textures загружена в ветку GitHub Pages.",
      all: "Все",
      unc: "Без категории",
      view: "Просмотр",
      zip: "Скачать архив",
      empty: "Нет текстур для текущего фильтра.",
      textures: "текстур",
      map: "Карта",
      close: "Закрыть",
      seamless: "Бесшовность",
      sphere: "3D",
      modeHint: "В обычном режиме зумит изображение. В «Бесшовность» меняет размер тайла. В «3D» меняет дистанцию камеры.",
      zipStart: "Создаю ZIP...",
      zipDone: "ZIP скачан:",
      zipErr: "Не удалось создать ZIP.",
    },
    en: {
      title: "AI Texture Collection",
      subtitle: "Browse, categorize, and download your AI-generated textures",
      hint: "Auto-load from repository: textures/category/texture/files. Every texture folder becomes one card and one ZIP.",
      search: "Search: oak, wood, metal...",
      idle: "Loading textures from repository...",
      loading: "Reading GitHub repository tree...",
      ready: "Done: textures found",
      loadErr: "Cannot read repository tree. Ensure textures folder is in the GitHub Pages branch.",
      all: "All",
      unc: "Uncategorized",
      view: "View",
      zip: "Download ZIP",
      empty: "No textures match current filter.",
      textures: "textures",
      map: "Map",
      close: "Close",
      seamless: "Seamless",
      sphere: "3D",
      modeHint: "In normal mode zoom scales image. In Seamless mode it changes tile size. In 3D mode it changes camera distance.",
      zipStart: "Creating ZIP...",
      zipDone: "ZIP saved:",
      zipErr: "Failed to create ZIP.",
    },
  };

  const state = {
    items: [],
    filtered: [],
    categories: [],
    category: "all",
    query: "",
    page: 1,
    lang: localStorage.getItem("texture-lang") || "ru",
    theme: localStorage.getItem("texture-theme") || "dark",
    modal: { open: false, index: -1, file: 0, zoom: 1, view: "image" },
    sphere3d: { renderer: null, scene: null, camera: null, mesh: null, frame: 0, ready: false },
  };

  const el = {
    title: document.getElementById("title"),
    subtitle: document.getElementById("subtitle"),
    themeBtn: document.getElementById("themeBtn"),
    langBtn: document.getElementById("langBtn"),
    deployHint: document.getElementById("deployHint"),
    searchInput: document.getElementById("searchInput"),
    searchLabel: document.getElementById("searchLabel"),
    categories: document.getElementById("categories"),
    statusText: document.getElementById("statusText"),
    countText: document.getElementById("countText"),
    progress: document.getElementById("progress"),
    bar: document.getElementById("bar"),
    grid: document.getElementById("grid"),
    empty: document.getElementById("empty"),
    pager: document.getElementById("pager"),
    modal: document.getElementById("modal"),
    modalTitle: document.getElementById("modalTitle"),
    closeModal: document.getElementById("closeModal"),
    thumbs: document.getElementById("thumbs"),
    viewer: document.getElementById("viewer"),
    modalImage: document.getElementById("modalImage"),
    seamless: document.getElementById("seamless"),
    sphereView: document.getElementById("sphereView"),
    mapLabel: document.getElementById("mapLabel"),
    prevBtn: document.getElementById("prevBtn"),
    nextBtn: document.getElementById("nextBtn"),
    seamBtn: document.getElementById("seamBtn"),
    sphereBtn: document.getElementById("sphereBtn"),
    zoomOut: document.getElementById("zoomOut"),
    zoomIn: document.getElementById("zoomIn"),
    zoomReset: document.getElementById("zoomReset"),
    modalHint: document.getElementById("modalHint"),
  };

  const t = key => i18n[state.lang][key] || key;
  const norm = value => String(value || "").trim().toLowerCase();
  const debounce = (fn, ms = 220) => { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); }; };
  const isImage = p => IMAGE_EXT.includes(norm(p.split(".").pop()));

  function setStatus(text) { el.statusText.textContent = text; }
  function setCount(n) { el.countText.textContent = `${n} ${t("textures")}`; }
  function setProgress(p, show = true) { el.progress.dataset.show = show ? "1" : "0"; el.bar.style.width = `${Math.max(0, Math.min(100, p))}%`; }

  function mapType(name) {
    const chunks = norm(name.replace(/\.[^.]+$/, "")).split(/[_\-\s.]+/g);
    for (const [key, aliases] of Object.entries(TYPE_ALIASES)) if (aliases.some(a => chunks.includes(a))) return key;
    return chunks[chunks.length - 1] || "map";
  }

  function previewScore(name) {
    const s = norm(name);
    let p = 0;
    if (s.includes("basecolor") || s.includes("albedo") || s.includes("diffuse")) p += 12;
    if (s.includes("preview") || s.includes("thumb")) p += 8;
    if (s.includes("normal")) p -= 2;
    return p;
  }

  function pickPreview(files) {
    if (!files.length) return null;
    return [...files].sort((a, b) => previewScore(b.name) - previewScore(a.name) || a.name.localeCompare(b.name))[0];
  }

  async function createPreviewUrl(src) {
    try {
      const img = await new Promise((resolve, reject) => {
        const i = new Image();
        i.onload = () => resolve(i);
        i.onerror = reject;
        i.src = src;
      });
      const c = document.createElement("canvas");
      c.width = 300;
      c.height = 300;
      const ctx = c.getContext("2d");
      const ratio = Math.max(300 / img.width, 300 / img.height);
      const w = img.width * ratio;
      const h = img.height * ratio;
      ctx.drawImage(img, (300 - w) / 2, (300 - h) / 2, w, h);
      const b = await new Promise(ok => c.toBlob(ok, "image/webp", 0.88));
      return b ? URL.createObjectURL(b) : src;
    } catch {
      return src;
    }
  }
  async function fetchDefaultBranch(owner, repo) {
    const r = await fetch(`https://api.github.com/repos/${owner}/${repo}`, { cache: "no-store" });
    if (!r.ok) throw new Error("repo");
    const data = await r.json();
    return data.default_branch || "main";
  }

  function detectRepoFromLocation() {
    const host = location.hostname;
    const owner = host.endsWith(".github.io") ? host.split(".")[0] : null;
    const repo = location.pathname.split("/").filter(Boolean)[0] || null;
    if (!owner || !repo) throw new Error("location");
    return { owner, repo };
  }

  async function fetchTree(owner, repo, preferred) {
    const branchCandidates = [...new Set([preferred, "gh-pages", "master", "main"].filter(Boolean))];
    for (const branch of branchCandidates) {
      const r = await fetch(`https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`, { cache: "no-store" });
      if (!r.ok) continue;
      const data = await r.json();
      const tree = Array.isArray(data.tree) ? data.tree : [];
      if (tree.length) return { tree, branch };
    }
    throw new Error("tree");
  }

  async function loadFromGitHub() {
    setStatus(t("loading"));
    setProgress(8, true);
    try {
      const { owner, repo } = detectRepoFromLocation();
      const preferredBranch = await fetchDefaultBranch(owner, repo);
      const { tree, branch } = await fetchTree(owner, repo, preferredBranch);

      const files = tree.filter(item => item.type === "blob" && isImage(item.path));
      const grouped = new Map();
      let processed = 0;

      for (const file of files) {
        const parts = file.path.split("/");
        if (parts.length < 3) continue;
        if (!ROOT_CANDIDATES.includes(parts[0])) continue;

        const category = parts[1] || t("unc");
        const texture = parts[2] || (parts[parts.length - 1].split("_")[0] || "texture");
        const relInTexture = parts.slice(3).join("/") || parts[parts.length - 1];
        const key = `${norm(category)}::${norm(texture)}`;
        const entry = grouped.get(key) || { name: texture, category, files: [] };
        const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${file.path}`;
        entry.files.push({
          name: parts[parts.length - 1],
          type: mapType(parts[parts.length - 1]),
          src: rawUrl,
          relInTexture,
        });
        grouped.set(key, entry);

        processed += 1;
        if (processed % 25 === 0 || processed === files.length) {
          setProgress(Math.min(78, 8 + Math.round((processed / files.length) * 70)), true);
        }
      }

      const textures = [...grouped.values()].filter(x => x.files.length).sort((a, b) => a.name.localeCompare(b.name));
      await Promise.all(textures.map(async (tx, i) => {
        const p = pickPreview(tx.files) || tx.files[0];
        tx.preview = p ? await createPreviewUrl(p.src) : "";
        setProgress(80 + Math.round(((i + 1) / Math.max(1, textures.length)) * 20), true);
      }));

      state.items = textures;
      state.category = "all";
      state.page = 1;
      updateCategories();
      filterItems();
      setStatus(`${t("ready")}: ${state.items.length}`);
    } catch {
      setStatus(t("loadErr"));
    } finally {
      setTimeout(() => setProgress(0, false), 300);
    }
  }

  function updateCategories() {
    const map = new Map();
    for (const tx of state.items) map.set(norm(tx.category) || "unc", tx.category || t("unc"));
    state.categories = [{ key: "all", label: t("all") }, ...[...map.entries()].map(([key, label]) => ({ key, label }))];
  }

  function filterItems() {
    const q = norm(state.query);
    state.filtered = state.items.filter(tx => {
      if (state.category !== "all" && norm(tx.category) !== state.category) return false;
      if (!q) return true;
      const hay = `${tx.name} ${tx.category} ${tx.files.map(f => f.type).join(" ")}`.toLowerCase();
      return hay.includes(q);
    });
    const maxPage = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    state.page = Math.min(state.page, maxPage);
    render();
  }

  function pageItems() {
    const start = (state.page - 1) * PAGE_SIZE;
    return state.filtered.slice(start, start + PAGE_SIZE);
  }

  function summary(files) {
    const unique = [...new Set(files.map(f => f.type))].slice(0, 4);
    return `${files.length} maps: ${unique.join(", ")}${files.length > unique.length ? ", ..." : ""}`;
  }

  function createCard(tx, absIndex) {
    const card = document.createElement("article");
    card.className = "card";
    const src = tx.preview || pickPreview(tx.files)?.src || "";
    card.innerHTML = `
      <div class="preview-wrap">${src ? `<img class="preview" src="${src}" alt="${tx.name}" loading="lazy" decoding="async" />` : `<div class="placeholder">no preview</div>`}</div>
      <div class="card-body">
        <span class="badge">${tx.category || t("unc")}</span>
        <h3 class="title">${tx.name}</h3>
        <p class="meta">${summary(tx.files)}</p>
        <div class="actions">
          <button class="small" type="button" data-action="view" data-index="${absIndex}">${t("view")}</button>
          <button class="small zip" type="button" data-action="zip" data-index="${absIndex}">${t("zip")}</button>
        </div>
      </div>
    `;
    return card;
  }

  function renderCategories() {
    el.categories.innerHTML = "";
    for (const c of state.categories) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `chip${state.category === c.key ? " active" : ""}`;
      b.textContent = c.label;
      b.dataset.key = c.key;
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", state.category === c.key ? "true" : "false");
      el.categories.appendChild(b);
    }
  }

  function renderGrid() {
    el.grid.innerHTML = "";
    if (!state.filtered.length) {
      el.empty.dataset.show = "1";
      el.empty.textContent = t("empty");
      return;
    }
    el.empty.dataset.show = "0";
    const start = (state.page - 1) * PAGE_SIZE;
    pageItems().forEach((tx, i) => el.grid.appendChild(createCard(tx, start + i)));
  }

  function renderPager() {
    const total = Math.max(1, Math.ceil(state.filtered.length / PAGE_SIZE));
    el.pager.innerHTML = "";
    const mk = (label, p, dis = false, active = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `page${active ? " active" : ""}`;
      b.textContent = label;
      b.disabled = dis;
      b.dataset.page = String(p);
      return b;
    };

    el.pager.appendChild(mk("◀", Math.max(1, state.page - 1), state.page <= 1));
    const pages = new Set([1, total]);
    for (let i = state.page - 2; i <= state.page + 2; i += 1) if (i > 1 && i < total) pages.add(i);
    [...pages].sort((a, b) => a - b).forEach(p => el.pager.appendChild(mk(String(p), p, false, p === state.page)));
    el.pager.appendChild(mk("▶", Math.min(total, state.page + 1), state.page >= total));
  }

  function render() {
    renderCategories();
    renderGrid();
    renderPager();
    setCount(state.filtered.length || state.items.length || 0);
  }
  async function downloadZip(item) {
    if (typeof JSZip === "undefined" || typeof saveAs === "undefined") {
      setStatus(t("zipErr"));
      return;
    }
    setStatus(`${t("zipStart")} ${item.name}`);
    const zip = new JSZip();
    const folderName = String(item.name || "texture").replace(/[\\/:*?"<>|]+/g, "_").trim() || "texture";
    const folder = zip.folder(folderName);

    for (const f of item.files) {
      const r = await fetch(f.src);
      const b = await r.blob();
      folder.file(f.relInTexture || f.name, b);
    }

    const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } }, m => setProgress(Math.round(m.percent), true));
    saveAs(blob, `${folderName}.zip`);
    setProgress(0, false);
    setStatus(`${t("zipDone")} ${folderName}.zip`);
  }

  function ensureSphereRenderer() {
    if (state.sphere3d.ready || typeof THREE === "undefined") return state.sphere3d.ready;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 100);
    camera.position.set(0, 0, 2.4);
    scene.add(new THREE.AmbientLight(0xffffff, 0.65));
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.15);
    keyLight.position.set(2.2, 1.8, 2.4);
    scene.add(keyLight);
    const rim = new THREE.DirectionalLight(0x8ed8ff, 0.45);
    rim.position.set(-2.1, -1.2, -2.2);
    scene.add(rim);
    const geometry = new THREE.SphereGeometry(0.95, 96, 96);
    const material = new THREE.MeshStandardMaterial({ color: 0xb8c3d2, roughness: 0.7, metalness: 0.2 });
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);
    el.sphereView.appendChild(renderer.domElement);
    state.sphere3d = { renderer, scene, camera, mesh, frame: 0, ready: true };
    return true;
  }

  function resizeSphereRenderer() {
    if (!state.sphere3d.ready) return;
    const rect = el.sphereView.getBoundingClientRect();
    const width = Math.max(10, Math.floor(rect.width));
    const height = Math.max(10, Math.floor(rect.height));
    state.sphere3d.renderer.setSize(width, height, false);
    state.sphere3d.camera.aspect = width / height;
    state.sphere3d.camera.updateProjectionMatrix();
  }

  function set3DMaterial(tx) {
    if (!state.sphere3d.ready || !tx) return;
    const loader = new THREE.TextureLoader();
    const maps = {
      map: tx.files.find(f => f.type === "basecolor") || null,
      normalMap: tx.files.find(f => f.type === "normal") || null,
      roughnessMap: tx.files.find(f => f.type === "roughness") || null,
      metalnessMap: tx.files.find(f => f.type === "metalness") || null,
      aoMap: tx.files.find(f => f.type === "ao") || null,
      displacementMap: tx.files.find(f => f.type === "displacement") || null,
    };
    const material = state.sphere3d.mesh.material;
    Object.entries(maps).forEach(([slot, file]) => {
      if (material[slot]) material[slot].dispose();
      material[slot] = null;
      if (file) {
        const texture = loader.load(file.src);
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.anisotropy = 4;
        material[slot] = texture;
      }
    });
    material.displacementScale = maps.displacementMap ? 0.05 : 0;
    material.roughness = maps.roughnessMap ? 1 : 0.65;
    material.metalness = maps.metalnessMap ? 1 : 0.18;
    material.needsUpdate = true;
  }

  function startSphereLoop() {
    if (!state.sphere3d.ready || state.sphere3d.frame) return;
    const tick = () => {
      if (state.modal.view !== "sphere" || !state.modal.open) {
        state.sphere3d.frame = 0;
        return;
      }
      state.sphere3d.mesh.rotation.y += 0.006;
      state.sphere3d.renderer.render(state.sphere3d.scene, state.sphere3d.camera);
      state.sphere3d.frame = requestAnimationFrame(tick);
    };
    state.sphere3d.frame = requestAnimationFrame(tick);
  }

  function updateViewerScale() {
    if (state.modal.view === "image") {
      el.modalImage.style.display = "block";
      el.seamless.dataset.on = "0";
      el.sphereView.dataset.on = "0";
      el.modalImage.style.transform = `scale(${state.modal.zoom})`;
      return;
    }
    if (state.modal.view === "seamless") {
      el.modalImage.style.display = "none";
      el.seamless.dataset.on = "1";
      el.sphereView.dataset.on = "0";
      const tile = Math.max(16, Math.min(1024, Math.round(256 * state.modal.zoom)));
      el.seamless.style.backgroundSize = `${tile}px ${tile}px`;
      return;
    }
    el.modalImage.style.display = "none";
    el.seamless.dataset.on = "0";
    el.sphereView.dataset.on = "1";
    if (ensureSphereRenderer()) {
      resizeSphereRenderer();
      state.sphere3d.camera.position.z = Math.max(1.4, Math.min(5.2, 2.4 / Math.max(0.2, state.modal.zoom)));
      startSphereLoop();
    } else {
      state.modal.view = "image";
      el.sphereBtn.classList.remove("active");
      updateViewerScale();
    }
  }

  function openModal(index, fileIndex = 0) {
    const tx = state.filtered[index];
    if (!tx) return;
    state.modal.open = true;
    state.modal.index = index;
    state.modal.file = Math.max(0, Math.min(fileIndex, tx.files.length - 1));
    state.modal.zoom = 1;
    state.modal.view = "image";
    el.modal.dataset.open = "1";
    el.modal.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    renderModal();
  }

  function closeModal() {
    state.modal.open = false;
    el.modal.dataset.open = "0";
    el.modal.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (state.sphere3d.frame) {
      cancelAnimationFrame(state.sphere3d.frame);
      state.sphere3d.frame = 0;
    }
  }

  function renderModal() {
    if (!state.modal.open) return;
    const tx = state.filtered[state.modal.index];
    if (!tx) return;
    const f = tx.files[state.modal.file] || tx.files[0];
    if (!f) return;

    el.modalTitle.textContent = `${tx.name} • ${tx.category}`;
    el.modalImage.src = f.src;
    el.modalImage.alt = `${tx.name} ${f.type}`;
    el.mapLabel.textContent = `${t("map")}: ${f.type} (${state.modal.file + 1}/${tx.files.length})`;
    el.seamless.style.backgroundImage = `url("${f.src}")`;
    el.seamBtn.classList.toggle("active", state.modal.view === "seamless");
    el.sphereBtn.classList.toggle("active", state.modal.view === "sphere");

    el.thumbs.innerHTML = "";
    tx.files.forEach((file, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `thumb${i === state.modal.file ? " active" : ""}`;
      b.dataset.index = String(i);
      b.innerHTML = `<img src="${file.src}" alt="${file.type}" loading="lazy" />`;
      el.thumbs.appendChild(b);
    });

    if (state.modal.view === "sphere") set3DMaterial(tx);
    updateViewerScale();
  }

  function modalStep(delta) {
    const tx = state.filtered[state.modal.index];
    if (!tx) return;
    state.modal.file = (state.modal.file + delta + tx.files.length) % tx.files.length;
    state.modal.zoom = 1;
    renderModal();
  }

  function setZoom(v) {
    state.modal.zoom = Math.max(0.2, Math.min(6, v));
    updateViewerScale();
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.theme);
    localStorage.setItem("texture-theme", state.theme);
    el.themeBtn.textContent = state.theme === "dark" ? "☼" : "☾";
  }

  function applyLang() {
    const L = i18n[state.lang];
    document.documentElement.lang = state.lang;
    document.title = L.title;
    el.title.textContent = L.title;
    el.subtitle.textContent = L.subtitle;
    el.deployHint.textContent = L.hint;
    el.searchInput.placeholder = L.search;
    el.searchLabel.textContent = L.search;
    el.closeModal.textContent = L.close;
    el.seamBtn.textContent = L.seamless;
    el.sphereBtn.textContent = L.sphere;
    el.modalHint.textContent = L.modeHint;
    el.langBtn.textContent = state.lang === "ru" ? "EN" : "RU";
    el.empty.textContent = L.empty;
    if (!state.items.length) { setStatus(L.idle); setCount(0); }
    localStorage.setItem("texture-lang", state.lang);
  }

  function bindEvents() {
    el.themeBtn.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      applyTheme();
    });

    el.langBtn.addEventListener("click", () => {
      state.lang = state.lang === "ru" ? "en" : "ru";
      applyLang();
      updateCategories();
      render();
    });

    el.searchInput.addEventListener("input", debounce(e => {
      state.query = e.target.value;
      state.page = 1;
      filterItems();
    }));

    el.categories.addEventListener("click", e => {
      const b = e.target.closest("button[data-key]");
      if (!b) return;
      state.category = b.dataset.key;
      state.page = 1;
      filterItems();
    });

    el.pager.addEventListener("click", e => {
      const b = e.target.closest("button[data-page]");
      if (!b || b.disabled) return;
      state.page = Number(b.dataset.page) || 1;
      render();
    });

    el.grid.addEventListener("click", async e => {
      const b = e.target.closest("button[data-action]");
      if (!b) return;
      const i = Number(b.dataset.index);
      const item = state.filtered[i];
      if (!item) return;
      if (b.dataset.action === "view") openModal(i);
      if (b.dataset.action === "zip") {
        try { await downloadZip(item); } catch { setStatus(t("zipErr")); setProgress(0, false); }
      }
    });

    el.closeModal.addEventListener("click", closeModal);
    el.prevBtn.addEventListener("click", () => modalStep(-1));
    el.nextBtn.addEventListener("click", () => modalStep(1));
    el.seamBtn.addEventListener("click", () => {
      state.modal.view = state.modal.view === "seamless" ? "image" : "seamless";
      updateViewerScale();
      el.seamBtn.classList.toggle("active", state.modal.view === "seamless");
      el.sphereBtn.classList.toggle("active", state.modal.view === "sphere");
    });
    el.sphereBtn.addEventListener("click", () => {
      if (state.modal.view === "sphere") {
        state.modal.view = "image";
      } else {
        state.modal.view = ensureSphereRenderer() ? "sphere" : "image";
        if (state.modal.view === "sphere") {
          const tx = state.filtered[state.modal.index];
          set3DMaterial(tx);
        }
      }
      updateViewerScale();
      el.seamBtn.classList.toggle("active", state.modal.view === "seamless");
      el.sphereBtn.classList.toggle("active", state.modal.view === "sphere");
    });
    el.zoomIn.addEventListener("click", () => setZoom(state.modal.zoom + 0.2));
    el.zoomOut.addEventListener("click", () => setZoom(state.modal.zoom - 0.2));
    el.zoomReset.addEventListener("click", () => setZoom(1));

    el.thumbs.addEventListener("click", e => {
      const b = e.target.closest("button[data-index]");
      if (!b) return;
      state.modal.file = Number(b.dataset.index) || 0;
      state.modal.zoom = 1;
      renderModal();
    });

    el.viewer.addEventListener("wheel", e => {
      if (!state.modal.open) return;
      e.preventDefault();
      setZoom(state.modal.zoom + (e.deltaY > 0 ? -0.08 : 0.08));
    }, { passive: false });

    el.modal.addEventListener("click", e => { if (e.target === el.modal) closeModal(); });
    window.addEventListener("resize", () => { if (state.modal.view === "sphere") resizeSphereRenderer(); });

    window.addEventListener("keydown", e => {
      if (!state.modal.open) return;
      if (e.key === "Escape") closeModal();
      if (e.key === "ArrowRight") modalStep(1);
      if (e.key === "ArrowLeft") modalStep(-1);
      if (e.key === "+" || e.key === "=") setZoom(state.modal.zoom + 0.2);
      if (e.key === "-") setZoom(state.modal.zoom - 0.2);
    });
  }

  async function bootstrap() {
    applyTheme();
    applyLang();
    updateCategories();
    filterItems();
    bindEvents();
    await loadFromGitHub();
  }

  bootstrap();
})();
