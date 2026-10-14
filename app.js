"use strict";

/* =====================================================================
   LoL Squad (versión web del flujo general)
   Equivale a: Routes.kt + SessionViewModel.kt + AppNavigation.kt + Screens.kt
   ===================================================================== */

/* ---------- Constantes ---------- */
const Route = Object.freeze({
  SPLASH: "splash",
  WELCOME: "welcome",
  LINK: "link-account",
  PROFILE: "create-profile",
  HOME: "home",
});

const SessionState = Object.freeze({
  LOADING: "loading",
  LOGGED_OUT: "logged_out",
  NEEDS_PROFILE: "needs_profile",
  READY: "ready",
});

const TABS = ["explore", "ads", "chats", "profile"];
const ROLES = ["Top", "Jungla", "Mid", "ADC", "Support"];
const LANGS = ["Español", "English", "Português"];
const STYLES = ["Competitivo", "Casual"];

// "platform" es el código que usará tu backend con summoner-v4 y league-v4.
const REGIONS = [
  { id: "LAS", label: "LAS (Latinoamérica Sur)", platform: "la2" },
  { id: "LAN", label: "LAN (Latinoamérica Norte)", platform: "la1" },
  { id: "NA", label: "NA (Norteamérica)", platform: "na1" },
  { id: "BR", label: "BR (Brasil)", platform: "br1" },
  { id: "EUW", label: "EUW (Europa Oeste)", platform: "euw1" },
  { id: "EUNE", label: "EUNE (Europa Nórdica y Este)", platform: "eun1" },
];

const RIOT_ID_RE = /^[^#]{3,16}#[A-Za-z0-9]{3,5}$/;

// Datos de ejemplo hasta que exista el backend.
const SAMPLE_PLAYERS = [
  { riotId: "Kaelith#LAS", rank: "Plata II", role: "Support", champs: ["Nami", "Lux", "Janna"], schedule: "Noches", style: "Competitivo" },
  { riotId: "TorreAlta#0421", rank: "Oro IV", role: "Top", champs: ["Ornn", "Malphite", "Sett"], schedule: "Tardes", style: "Casual" },
  { riotId: "Lunaris#LAN", rank: "Plata I", role: "Jungla", champs: ["Lee Sin", "Vi", "Elise"], schedule: "Fines de semana", style: "Competitivo" },
  { riotId: "Brujo#7783", rank: "Platino IV", role: "Mid", champs: ["Ahri", "Syndra", "Viktor"], schedule: "Noches", style: "Competitivo" },
  { riotId: "Dardo#BR1", rank: "Plata III", role: "ADC", champs: ["Jinx", "Ezreal", "Kai'Sa"], schedule: "Tardes", style: "Casual" },
];

/* ---------- Utilidades ---------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value);
  }
  node.append(...children.flat().filter((c) => c != null));
  return node;
}

let toastTimer;
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2400);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = el("textarea", { "aria-hidden": "true" });
    area.value = text;
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand("copy"); } catch { /* sin permiso */ }
    area.remove();
    return ok;
  }
}

/* ---------- Sesión (equivale a SessionViewModel + FakeSessionRepository) ---------- */
const STORAGE_KEY = "lolsquad.session.v1";

const sessionRepo = {
  load() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (data && Object.values(SessionState).includes(data.state)) return data;
    } catch { /* almacenamiento vacío o bloqueado */ }
    return { state: SessionState.LOGGED_OUT };
  },
  save(data) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch { /* ignorar */ }
  },
  clear() {
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignorar */ }
  },
};

const session = {
  data: { state: SessionState.LOADING },
  init() { this.data = sessionRepo.load(); },
  update(patch) {
    this.data = { ...this.data, ...patch };
    sessionRepo.save(this.data);
  },
  logout() {
    sessionRepo.clear();
    this.data = { state: SessionState.LOGGED_OUT };
  },
  onAccountVerified(riotId, region) {
    this.update({ state: SessionState.NEEDS_PROFILE, riotId, region });
  },
  onProfileCreated(profile) {
    this.update({ state: SessionState.READY, profile });
  },
};

/* ---------- Navegación (equivale a AppNavigation.kt) ---------- */
let booted = false;
let lastRoute = null;

function entryRoute(state) {
  if (state === SessionState.READY) return Route.HOME;
  if (state === SessionState.NEEDS_PROFILE) return Route.PROFILE;
  return Route.WELCOME;
}

// Evita entrar a pantallas que no corresponden al estado de la sesión.
function guard(route) {
  const state = session.data.state;
  if (route === Route.SPLASH) return booted ? entryRoute(state) : Route.SPLASH;
  if (state === SessionState.READY) return Route.HOME;
  if (state === SessionState.NEEDS_PROFILE) return Route.PROFILE;
  return route === Route.WELCOME || route === Route.LINK ? route : Route.WELCOME;
}

function parseHash() {
  const [route = "", tab = ""] = location.hash.replace(/^#\/?/, "").split("/");
  return {
    route: Object.values(Route).includes(route) ? route : Route.SPLASH,
    tab: TABS.includes(tab) ? tab : "explore",
  };
}

function go(path, { replace = false } = {}) {
  const hash = `#/${path}`;
  if (replace) history.replaceState(null, "", hash);
  else history.pushState(null, "", hash);
  render();
}

function render() {
  const { route, tab } = parseHash();
  const allowed = guard(route);
  if (allowed !== route) {
    history.replaceState(null, "", `#/${allowed}`);
    return render();
  }

  $$(".screen").forEach((screen) => { screen.hidden = screen.dataset.route !== route; });

  if (route === Route.LINK && lastRoute !== Route.LINK) showLinkStep(1);
  if (route === Route.PROFILE && lastRoute !== Route.PROFILE) resetProfileForm();
  if (route === Route.HOME) showTab(tab);

  if (route !== lastRoute && route !== Route.SPLASH) {
    const target = $(`.screen[data-route="${route}"] [data-focus]`) || $(`.screen[data-route="${route}"] .panel:not([hidden]) h1`);
    target?.focus({ preventScroll: true });
  }
  lastRoute = route;
}

/* ---------- Splash ---------- */
function boot() {
  session.init();
  history.replaceState(null, "", `#/${Route.SPLASH}`);
  render();
  setTimeout(() => {
    booted = true;
    go(entryRoute(session.data.state), { replace: true });
  }, reduceMotion ? 300 : 1400);
}

/* ---------- Bienvenida ---------- */
function setupWelcome() {
  $("#btn-continue-riot").addEventListener("click", () => go(Route.LINK));
  // Marcador de posición: aquí irán tus páginas reales de términos y privacidad.
  $("#link-terms").addEventListener("click", (e) => {
    e.preventDefault();
    showToast("Los términos y la privacidad se agregarán antes de publicar.");
  });
}

/* ---------- Vincular cuenta ---------- */
let pendingAccount = null;

function showLinkStep(step) {
  $("#link-step-1").hidden = step !== 1;
  $("#link-step-2").hidden = step !== 2;
  if (step === 1) {
    $("#riot-id").value = pendingAccount?.riotId ?? "";
    $("#riot-id-error").textContent = "";
    $("#riot-id").removeAttribute("aria-invalid");
  }
}

function setupLink() {
  const select = $("#region");
  REGIONS.forEach((r) => select.append(el("option", { value: r.id }, r.label)));

  $("#btn-back").addEventListener("click", () => {
    if (!$("#link-step-2").hidden) showLinkStep(1);
    else go(Route.WELCOME);
  });

  $("#form-riot").addEventListener("submit", (e) => {
    e.preventDefault();
    const input = $("#riot-id");
    const riotId = input.value.trim();
    if (!RIOT_ID_RE.test(riotId)) {
      input.setAttribute("aria-invalid", "true");
      $("#riot-id-error").textContent = "Escribe tu Riot ID completo, por ejemplo Nombre#LAS.";
      input.focus();
      return;
    }
    // TODO backend: POST /verify/start con { riotId, region } y mostrar el ícono que devuelva.
    pendingAccount = { riotId, region: select.value };
    $("#icon-number").textContent = String(Math.floor(Math.random() * 29));
    $("#verify-account").textContent = `${riotId} en ${select.value}`;
    showLinkStep(2);
    $("[data-focus-step2]").focus({ preventScroll: true });
  });

  $("#btn-edit-id").addEventListener("click", () => showLinkStep(1));

  $("#btn-verify").addEventListener("click", (e) => {
    const button = e.currentTarget;
    button.disabled = true;
    button.textContent = "Verificando";
    // TODO backend: POST /verify/confirm. Aquí se simula una respuesta exitosa.
    setTimeout(() => {
      session.onAccountVerified(pendingAccount.riotId, pendingAccount.region);
      button.disabled = false;
      button.textContent = "Verificar";
      go(Route.PROFILE, { replace: true });
    }, 1200);
  });
}

/* ---------- Crear perfil ---------- */
function chipGroup(host, { name, options, type = "radio", selected = [] }) {
  host.replaceChildren(
    ...options.map((option) =>
      el("label", { class: "chip" },
        el("input", { type, name, value: option, ...(selected.includes(option) ? { checked: "" } : {}) }),
        el("span", {}, option),
      ),
    ),
  );
}

const checkedValues = (host) => $$("input:checked", host).map((i) => i.value);

function syncSecondaryRole() {
  const main = checkedValues($("#chips-main-role"))[0];
  $$("input", $("#chips-second-role")).forEach((input) => {
    input.disabled = input.value === main;
    if (input.disabled && input.checked) $("input[value='Ninguno']", $("#chips-second-role")).checked = true;
  });
}

function resetProfileForm() {
  chipGroup($("#chips-main-role"), { name: "mainRole", options: ROLES });
  chipGroup($("#chips-second-role"), { name: "secondRole", options: ["Ninguno", ...ROLES], selected: ["Ninguno"] });
  chipGroup($("#chips-langs"), { name: "langs", options: LANGS, type: "checkbox", selected: ["Español"] });
  chipGroup($("#chips-style"), { name: "style", options: STYLES });
  $("#bio").value = "";
  $("#bio-count").textContent = "0/120";
  $("#profile-error").textContent = "";
}

function setupProfileForm() {
  $("#chips-main-role").addEventListener("change", syncSecondaryRole);
  $("#bio").addEventListener("input", (e) => { $("#bio-count").textContent = `${e.target.value.length}/120`; });

  $("#form-profile").addEventListener("submit", (e) => {
    e.preventDefault();
    const mainRole = checkedValues($("#chips-main-role"))[0];
    const secondRole = checkedValues($("#chips-second-role"))[0];
    const languages = checkedValues($("#chips-langs"));
    const style = checkedValues($("#chips-style"))[0];
    const error = $("#profile-error");

    if (!mainRole) { error.textContent = "Elige tu rol principal."; return; }
    if (!languages.length) { error.textContent = "Elige al menos un idioma."; return; }
    if (!style) { error.textContent = "Elige tu estilo de juego."; return; }

    // TODO backend: PUT /profile y luego POST /profile/sync para traer rango y campeones.
    session.onProfileCreated({
      mainRole,
      secondRole: secondRole === "Ninguno" ? null : secondRole,
      languages,
      style,
      bio: $("#bio").value.trim(),
    });
    go(`${Route.HOME}/explore`, { replace: true });
  });
}

/* ---------- Inicio: pestañas ---------- */
function showTab(tab) {
  $$(".panel").forEach((panel) => { panel.hidden = panel.dataset.panel !== tab; });
  $$(".tab").forEach((button) => {
    if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  if (tab === "profile") renderOwnProfile();
}

function setupHome() {
  $$(".tab").forEach((button) =>
    button.addEventListener("click", () => go(`${Route.HOME}/${button.dataset.tab}`, { replace: true })),
  );

  // Explorar: filtro por rol
  const filters = $("#explore-filters");
  chipGroup(filters, { name: "filterRole", options: ["Todos", ...ROLES], selected: ["Todos"] });
  filters.addEventListener("change", renderPlayers);
  renderPlayers();

  $("#btn-new-ad").addEventListener("click", () => showToast("Los anuncios llegan en la fase 2."));
  $("#btn-logout").addEventListener("click", () => {
    session.logout();
    pendingAccount = null;
    go(Route.WELCOME, { replace: true });
  });
}

function renderPlayers() {
  const role = checkedValues($("#explore-filters"))[0] ?? "Todos";
  const players = SAMPLE_PLAYERS.filter((p) => role === "Todos" || p.role === role);
  const list = $("#player-list");

  if (!players.length) {
    list.replaceChildren(el("li", { class: "empty" },
      el("p", { class: "empty__title" }, "Nadie con ese rol por ahora"),
      el("p", { class: "muted" }, "Prueba con otro filtro o publica un anuncio."),
    ));
    return;
  }

  list.replaceChildren(...players.map((p) =>
    el("li", { class: "player" },
      el("div", { class: "player__head" },
        el("div", { class: "avatar", "aria-hidden": "true" }, p.riotId[0]),
        el("div", {},
          el("p", { class: "player__id" }, p.riotId),
          el("p", { class: "player__rank" }, `${p.rank}, ${p.role}`),
        ),
      ),
      el("p", { class: "player__meta" }, `${p.champs.join(", ")}. ${p.schedule}. ${p.style}.`),
      el("div", { class: "player__actions" },
        el("button", {
          class: "btn btn--ghost btn--small", type: "button",
          onclick: async () => showToast((await copyText(p.riotId)) ? "Riot ID copiado" : "No se pudo copiar el Riot ID"),
        }, "Copiar ID"),
        el("button", {
          class: "btn btn--primary btn--small", type: "button",
          onclick: () => showToast(`Solicitud enviada a ${p.riotId} (simulado)`),
        }, "Enviar solicitud"),
      ),
    ),
  ));
}

function renderOwnProfile() {
  const { riotId = "Sin Riot ID", region = "", profile = {} } = session.data;
  const row = (label, value) => [el("dt", {}, label), el("dd", {}, value || "Sin definir")];

  $("#own-profile").replaceChildren(
    el("div", { class: "me" },
      el("div", { class: "me__head" },
        el("div", { class: "avatar", "aria-hidden": "true" }, riotId[0]),
        el("div", {},
          el("p", { class: "player__id" }, riotId),
          el("p", { class: "player__rank" }, `Región ${region || "sin definir"}`),
        ),
      ),
      el("dl", { class: "me__rows" },
        ...row("Rango", "Se sincroniza con Riot más adelante"),
        ...row("Rol principal", profile.mainRole),
        ...row("Rol secundario", profile.secondRole ?? "Ninguno"),
        ...row("Idiomas", (profile.languages ?? []).join(", ")),
        ...row("Estilo", profile.style),
        ...row("Presentación", profile.bio),
      ),
    ),
  );
}

/* ---------- Arranque ---------- */
window.addEventListener("popstate", render);
setupWelcome();
setupLink();
setupProfileForm();
setupHome();
boot();
