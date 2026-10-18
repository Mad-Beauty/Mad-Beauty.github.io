/* =====================================================================
   Panel de la manicurista
   ===================================================================== */

let settings = null;
let filtro = "proximas";
let refreshTimer = null;
const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const ESTADOS = { pending: "Pendiente", confirmed: "Confirmada", rejected: "Rechazada", cancelled: "Cancelada" };

/* ---------------- Sesión ---------------- */
function show(view) {
  $("#login").hidden = view !== "login";
  $("#panel").hidden = view !== "panel";
}

async function checkSession() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { show("login"); return; }

  // Solo quien esté en la tabla `admins` puede entrar
  const { data: row, error } = await sb.from("admins").select("user_id").eq("user_id", session.user.id).maybeSingle();
  if (error || !row) {
    await sb.auth.signOut();
    show("login");
    $("#loginErr").textContent = "Esta cuenta no tiene permiso para entrar al panel.";
    return;
  }
  show("panel");
  await loadSettings();
  await Promise.all([loadCitas(), loadBloqueos(), loadServicios()]);
  clearInterval(refreshTimer);
  refreshTimer = setInterval(loadCitas, 60000);          // se actualiza solo cada minuto
}

$("#btnLogin").onclick = async () => {
  const err = $("#loginErr"); err.textContent = "";
  const email = $("#email").value.trim(), password = $("#pass").value;
  if (!email || !password) return err.textContent = "Escribe tu correo y contraseña.";
  const btn = $("#btnLogin"); btn.disabled = true;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  btn.disabled = false;
  if (error) return err.textContent = "Correo o contraseña incorrectos.";
  $("#pass").value = "";
  checkSession();
};
$("#pass").addEventListener("keydown", e => { if (e.key === "Enter") $("#btnLogin").click(); });

$("#btnOut").onclick = async () => {
  clearInterval(refreshTimer);
  await sb.auth.signOut();
  show("login");
};

/* ---------------- Pestañas ---------------- */
function irA(tab) {
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === tab));
  ["citas", "bloqueos", "servicios", "ajustes"].forEach(id => { $("#p-" + id).hidden = id !== tab; });
}
$$(".tab").forEach(t => t.onclick = () => irA(t.dataset.tab));

/* ---------------- Ajustes ---------------- */
async function loadSettings() {
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).single();
  if (error) return;
  settings = data;
  $("#panelTitle").textContent = "Panel · " + data.business_name;
  $("#aNombre").value = data.business_name;
  $("#aWa").value = data.whatsapp;
  $("#aAbre").value = hm(data.open_time);
  $("#aCierra").value = hm(data.close_time);
  $("#aStep").value = String(data.slot_step);
  $("#aAviso").value = data.min_notice_minutes;
  $("#aDias").value = data.max_days_ahead;
  const box = $("#aCerrados"); box.innerHTML = "";
  DIAS.forEach((n, i) => {
    const l = document.createElement("label"); l.className = "check";
    l.innerHTML = `<input type="checkbox" value="${i}" ${data.closed_days.includes(i) ? "checked" : ""}> ${n}`;
    box.appendChild(l);
  });
}

$("#btnAjustes").onclick = async () => {
  const err = $("#aErr"); err.textContent = "";
  const abre = $("#aAbre").value, cierra = $("#aCierra").value;
  const wa = $("#aWa").value.replace(/\D/g, "");
  if (!$("#aNombre").value.trim()) return err.textContent = "Escribe el nombre del negocio.";
  if (wa.length < 10) return err.textContent = "Escribe el WhatsApp con lada (ej. 528332660757).";
  if (!abre || !cierra || toMin(abre) >= toMin(cierra)) return err.textContent = "La hora de apertura debe ser antes que la de cierre.";
  const dias = Number($("#aDias").value), aviso = Number($("#aAviso").value);
  if (!(dias >= 1) || !(aviso >= 0)) return err.textContent = "Revisa los números.";

  const { error } = await sb.from("settings").update({
    business_name: $("#aNombre").value.trim(),
    whatsapp: wa,
    open_time: abre, close_time: cierra,
    slot_step: Number($("#aStep").value),
    min_notice_minutes: aviso, max_days_ahead: dias,
    closed_days: $$("#aCerrados input:checked").map(i => Number(i.value))
  }).eq("id", 1);
  if (error) return err.textContent = "No se pudo guardar. Intenta de nuevo.";
  await loadSettings();
  err.style.color = "var(--ok)"; err.textContent = "Ajustes guardados.";
  setTimeout(() => { err.textContent = ""; err.style.color = ""; }, 2500);
};

/* ---------------- Citas ---------------- */
$$("#filtroCitas .chip").forEach(c => c.onclick = () => {
  filtro = c.dataset.f;
  $$("#filtroCitas .chip").forEach(x => x.setAttribute("aria-pressed", x === c));
  loadCitas();
});
$("#btnRefrescar").onclick = () => loadCitas();

async function loadCitas() {
  const today = todayISO();
  let q = sb.from("bookings").select("*");
  if (filtro === "proximas") q = q.gte("day", today).in("status", ["pending", "confirmed"]).order("day").order("start_time");
  else if (filtro === "pendientes") q = q.eq("status", "pending").order("day").order("start_time");
  else q = q.lt("day", today).order("day", { ascending: false }).order("start_time", { ascending: false }).limit(100);

  const { data, error } = await q;
  const box = $("#listaCitas");
  if (error) { box.innerHTML = '<p class="empty">No se pudieron cargar las citas.</p>'; return; }

  const pend = (await sb.from("bookings").select("id", { count: "exact", head: true }).eq("status", "pending").gte("day", today)).count || 0;
  $("#citasInfo").textContent = pend ? `${pend} cita(s) pendiente(s) por confirmar.` : "Sin citas pendientes por confirmar.";

  if (!data.length) { box.innerHTML = '<p class="empty">No hay citas en esta vista.</p>'; return; }

  box.innerHTML = "";
  let lastDay = "";
  data.forEach(b => {
    if (b.day !== lastDay) {
      lastDay = b.day;
      const h = document.createElement("div"); h.className = "dayhead"; h.textContent = prettyDay(b.day);
      box.appendChild(h);
    }
    box.appendChild(bookingCard(b));
  });
}

function mensajeClienta(b, tipo) {
  const when = `${prettyDay(b.day)} a las ${hm(b.start_time)}`;
  const nombre = (settings && settings.business_name) || "Mad Beauty";
  if (tipo === "confirmed") return `Hola ${b.name} 💅 Tu cita en ${nombre} quedó *confirmada* para el ${when}. ¡Te esperamos!`;
  if (tipo === "rejected") return `Hola ${b.name}, lamentablemente no podemos atenderte el ${when}. ¿Te gustaría elegir otro horario?`;
  return `Hola ${b.name} 💅 Te escribo de ${nombre} sobre tu cita del ${when}.`;
}

function bookingCard(b) {
  const d = document.createElement("div"); d.className = "bk";
  const activa = b.status === "pending" || b.status === "confirmed";
  d.innerHTML = `
    <div class="top">
      <strong>${hm(b.start_time)} – ${hm(b.end_time)} · ${esc(b.name)}</strong>
      <span class="tag ${b.status}">${ESTADOS[b.status]}</span>
    </div>
    <div class="muted">${b.services.map(s => esc(s.name)).join(", ")} · <strong>${money(b.total)}</strong></div>
    <div class="muted">WhatsApp: ${esc(b.phone)}</div>
    ${b.notes ? `<div class="notes">Notas: ${esc(b.notes)}</div>` : ""}
    <div class="actions"></div>`;
  const acts = d.querySelector(".actions");

  const mk = (txt, cls, fn) => {
    const el = document.createElement(fn ? "button" : "a");
    el.className = "btn small " + cls; el.textContent = txt;
    if (fn) { el.type = "button"; el.onclick = fn; }
    acts.appendChild(el); return el;
  };
  const wa = (txt, tipo, cls = "wa") => {
    const a = mk(txt, cls); a.href = waLink(b.phone, mensajeClienta(b, tipo)); a.target = "_blank"; a.rel = "noopener";
  };

  if (b.status === "pending") {
    mk("Confirmar", "", () => setStatus(b, "confirmed", "confirmed"));
    mk("Rechazar", "danger", () => { if (confirm("¿Rechazar esta cita?")) setStatus(b, "rejected", "rejected"); });
  }
  if (b.status === "confirmed") {
    wa("Avisar por WhatsApp", "confirmed");
    mk("Cancelar", "danger", () => { if (confirm("¿Cancelar esta cita?")) setStatus(b, "cancelled", "rejected"); });
  }
  if (!activa && b.status !== "cancelled") wa("Escribir a la clienta", "other", "ghost");
  return d;
}

async function setStatus(b, status, avisoTipo) {
  const { error } = await sb.from("bookings").update({ status }).eq("id", b.id);
  if (error) { alert("No se pudo actualizar la cita."); return; }
  await loadCitas();

  // En iPhone, Safari bloquea abrir WhatsApp solo después de esperar a la base de datos.
  // Por eso se muestra un botón: al tocarlo, funciona en cualquier teléfono.
  const textos = { confirmed: "Cita confirmada.", rejected: "Cita rechazada.", cancelled: "Cita cancelada." };
  const url = waLink(b.phone, mensajeClienta(b, avisoTipo));
  $("#waBannerText").textContent = `${textos[status] || "Cita actualizada."} ¿Avisar a ${b.name}?`;
  $("#waBannerLink").href = url;
  $("#waBanner").hidden = false;
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.open(url, "_blank", "noopener");      // en Android se abre solo; en iPhone se ignora
}
$("#waBannerClose").onclick = () => { $("#waBanner").hidden = true; };

/* ---------------- Bloqueos ---------------- */
$("#bTodo").onchange = e => { $("#bHoras").hidden = e.target.checked; };
$("#bDia").min = todayISO();

async function loadBloqueos() {
  const { data, error } = await sb.from("blocks").select("*").gte("day", todayISO()).order("day").order("start_time");
  const box = $("#listaBloqueos");
  if (error) { box.innerHTML = '<p class="empty">No se pudieron cargar los bloqueos.</p>'; return; }
  if (!data.length) { box.innerHTML = '<p class="empty">No hay bloqueos activos.</p>'; return; }
  box.innerHTML = "";
  data.forEach(k => {
    const todo = hm(k.start_time) === "00:00" && hm(k.end_time) === "23:59";
    const d = document.createElement("div"); d.className = "appt";
    d.innerHTML = `<div><strong>${esc(prettyDay(k.day))}</strong><br>
      <small>${todo ? "Todo el día" : hm(k.start_time) + " – " + hm(k.end_time)}${k.reason ? " · " + esc(k.reason) : ""}</small></div>
      <button class="x" type="button">Quitar</button>`;
    d.querySelector("button").onclick = async () => {
      const { error: e } = await sb.from("blocks").delete().eq("id", k.id);
      if (e) alert("No se pudo quitar el bloqueo."); else loadBloqueos();
    };
    box.appendChild(d);
  });
}

$("#btnBloquear").onclick = async () => {
  const err = $("#bErr"); err.textContent = "";
  const day = $("#bDia").value, todo = $("#bTodo").checked;
  if (!day) return err.textContent = "Elige el día.";
  const desde = todo ? "00:00" : $("#bDesde").value, hasta = todo ? "23:59:59" : $("#bHasta").value;
  if (!todo && (!desde || !hasta || toMin(desde) >= toMin(hasta))) return err.textContent = "La hora inicial debe ser antes que la final.";
  const { error } = await sb.from("blocks").insert({ day, start_time: desde, end_time: hasta, reason: $("#bMotivo").value.trim() });
  if (error) return err.textContent = "No se pudo guardar el bloqueo.";
  $("#bMotivo").value = ""; $("#bDia").value = "";
  loadBloqueos();
};

/* ---------------- Servicios ---------------- */
async function loadServicios() {
  const { data, error } = await sb.from("services").select("*").order("sort").order("name");
  const box = $("#listaServicios");
  if (error) { box.innerHTML = '<p class="empty">No se pudieron cargar los servicios.</p>'; return; }
  box.innerHTML = "";
  data.forEach(s => box.appendChild(serviceCard(s)));
}

function serviceCard(s) {
  const d = document.createElement("div"); d.className = "card";
  d.innerHTML = `
    <div class="grid2">
      <div class="field"><label>Nombre</label><input type="text" data-k="name" maxlength="80" value="${esc(s.name)}"></div>
      <div class="field"><label>Categoría</label><input type="text" data-k="category" maxlength="40" value="${esc(s.category)}"></div>
    </div>
    <div class="field"><label>Descripción</label><input type="text" data-k="description" maxlength="200" value="${esc(s.description)}"></div>
    <div class="grid2">
      <div class="field"><label>Precio ($)</label><input type="number" data-k="price" min="0" step="10" value="${s.price}"></div>
      <div class="field"><label>Duración (minutos)</label><input type="number" data-k="minutes" min="5" step="5" value="${s.minutes}"></div>
    </div>
    <label class="check" style="margin-bottom:12px"><input type="checkbox" data-k="active" ${s.active ? "checked" : ""}> Visible para las clientas</label>
    <div class="err"></div>
    <div class="row">
      <button class="btn small" type="button" data-a="save">Guardar</button>
      <button class="btn danger small" type="button" data-a="del">Eliminar</button>
    </div>`;
  const err = d.querySelector(".err");
  const val = k => { const el = d.querySelector(`[data-k="${k}"]`); return el.type === "checkbox" ? el.checked : el.value.trim(); };

  d.querySelector('[data-a="save"]').onclick = async () => {
    err.style.color = ""; err.textContent = "";
    const row = { name: val("name"), category: val("category"), description: val("description"),
                  price: Number(val("price")), minutes: Number(val("minutes")), active: val("active") };
    if (!row.name || !row.category) return err.textContent = "Nombre y categoría son obligatorios.";
    if (!(row.price >= 0) || !(row.minutes > 0)) return err.textContent = "Revisa el precio y la duración.";
    const { error } = await sb.from("services").update(row).eq("id", s.id);
    if (error) return err.textContent = "No se pudo guardar.";
    err.style.color = "var(--ok)"; err.textContent = "Guardado.";
    setTimeout(() => { err.textContent = ""; err.style.color = ""; }, 2000);
  };
  d.querySelector('[data-a="del"]').onclick = async () => {
    if (!confirm(`¿Eliminar "${s.name}"? Las citas ya hechas conservan su nombre y precio.`)) return;
    const { error } = await sb.from("services").delete().eq("id", s.id);
    if (error) err.textContent = "No se pudo eliminar."; else loadServicios();
  };
  return d;
}

$("#btnNuevoSvc").onclick = async () => {
  const { error } = await sb.from("services").insert({
    category: "Manicure", name: "Nuevo servicio", description: "", price: 100, minutes: 60, active: false, sort: 999
  });
  if (error) { alert("No se pudo agregar el servicio."); return; }
  loadServicios();
};

/* ---------------- Inicio ---------------- */
if (NOCONFIG) { $("#setupBanner").hidden = false; }
else checkSession();

/* ---------------- App instalable (PWA) ---------------- */
let installEvent = null;
const yaInstalada = () => window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw-admin.js", { scope: "./admin.html" }).catch(() => { /* sin app instalable, el panel sigue funcionando */ });
  });
}

// Android / Chrome: botón "Instalar app"
window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  installEvent = e;
  if (!yaInstalada()) $("#btnInstall").hidden = false;
});
$("#btnInstall").onclick = async () => {
  if (!installEvent) return;
  installEvent.prompt();
  await installEvent.userChoice;
  installEvent = null;
  $("#btnInstall").hidden = true;
};
window.addEventListener("appinstalled", () => { $("#btnInstall").hidden = true; });

// iPhone / Safari: no existe el botón automático, se muestra la instrucción una vez
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
if (esIOS && !yaInstalada() && !store.get("unas:iosHint")) $("#iosHint").hidden = false;
$("#iosHintClose").onclick = () => { $("#iosHint").hidden = true; store.set("unas:iosHint", true); };
