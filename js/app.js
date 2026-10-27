/* =====================================================================
   Página de clientas
   ===================================================================== */

let settings = null;
let services = [];
let busy = [];                       // horarios ocupados del día elegido
const st = { cat: "Todos", sel: new Set(), day: "", start: "" };

/* ---------------- Pestañas ---------------- */
function irA(tab) {
  $$(".tab").forEach(t => t.setAttribute("aria-selected", t.dataset.tab === tab));
  ["servicios", "agendar", "cotizar"].forEach(id => { $("#" + id).hidden = id !== tab; });
  document.body.classList.toggle("compact", tab !== "servicios");   // encabezado compacto en Agendar y Cotizar
  window.scrollTo({ top: 0 });
}
$$(".tab").forEach(t => t.onclick = () => irA(t.dataset.tab));

/* ---------------- Servicios ---------------- */
function renderChips() {
  const cats = ["Todos", ...new Set(services.map(s => s.category))];
  const box = $("#chips"); box.innerHTML = "";
  cats.forEach(c => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = c;
    b.setAttribute("aria-pressed", c === st.cat);
    b.onclick = () => { st.cat = c; renderChips(); renderServicios(); };
    box.appendChild(b);
  });
}

function durText(min) {
  const h = Math.floor(min / 60), m = min % 60;
  return h ? (m ? `${h} h ${m} min` : `${h} h`) : `${m} min`;
}

function renderServicios() {
  const list = $("#svcList"); list.innerHTML = "";
  const items = services.filter(s => st.cat === "Todos" || s.category === st.cat);
  if (!items.length) { list.innerHTML = '<p class="empty">Aún no hay servicios publicados.</p>'; return; }
  items.forEach(s => {
    const d = document.createElement("div"); d.className = "svc";
    d.innerHTML = `<h3>${esc(s.name)}</h3><div class="price">${money(s.price)}</div>
      <p class="desc">${esc(s.description)}</p>
      <div class="meta">${durText(s.minutes)}</div>
      <button class="btn small act" type="button">Agendar</button>`;
    d.querySelector("button").onclick = () => {
      st.sel = new Set([s.id]); st.start = "";
      renderChecks(); updateTotal(); refreshSlots(); irA("agendar");
    };
    list.appendChild(d);
  });
}

/* ---------------- Agendar ---------------- */
function renderChecks() {
  const box = $("#checks"); box.innerHTML = "";
  services.forEach(s => {
    const l = document.createElement("label"); l.className = "check";
    l.innerHTML = `<input type="checkbox" ${st.sel.has(s.id) ? "checked" : ""}> ${esc(s.name)}<span class="p">${money(s.price)}</span>`;
    l.querySelector("input").onchange = e => {
      e.target.checked ? st.sel.add(s.id) : st.sel.delete(s.id);
      st.start = ""; updateTotal(); refreshSlots();
    };
    box.appendChild(l);
  });
}

const selected = () => services.filter(s => st.sel.has(s.id));
const duration = () => selected().reduce((a, s) => a + s.minutes, 0);

function updateTotal() {
  const sel = selected();
  $("#total").textContent = money(sel.reduce((a, s) => a + s.price, 0));
  $("#totalInfo").textContent = sel.length ? `${sel.length} servicio(s) · aprox. ${durText(duration())}` : "Sin servicios elegidos";
}

// Pide a la base de datos los horarios ocupados del día y recalcula los botones
async function refreshSlots() {
  const hint = $("#slotsHint");
  if (!st.day) { busy = []; renderSlots(); return; }
  hint.textContent = "Buscando horarios…";
  const { data, error } = await sb.rpc("get_busy", { p_from: st.day, p_to: st.day });
  if (error) { hint.textContent = "No se pudieron cargar los horarios. Intenta de nuevo."; $("#slots").innerHTML = ""; return; }
  busy = data || [];
  renderSlots();
}

function renderSlots() {
  const box = $("#slots"), hint = $("#slotsHint");
  box.innerHTML = "";
  const dur = duration();
  if (!dur) { hint.textContent = "Elige al menos un servicio."; return; }
  if (!st.day) { hint.textContent = "Elige una fecha."; return; }

  const open = toMin(settings.open_time), close = toMin(settings.close_time), step = settings.slot_step;
  const diff = dayDiff(st.day, todayISO());
  const limit = diff * 1440 + 0;                       // minutos desde hoy 00:00 al inicio del día elegido
  const earliest = nowMin() + settings.min_notice_minutes;
  let free = 0;

  for (let t = open; t + dur <= close; t += step) {
    const taken = busy.some(b => t < toMin(b.end_time) && t + dur > toMin(b.start_time));
    const past = limit + t < earliest;
    const b = document.createElement("button");
    b.type = "button"; b.className = "slot"; b.textContent = fromMin(t);
    b.disabled = taken || past;
    if (!b.disabled) free++;
    b.setAttribute("aria-pressed", st.start === fromMin(t));
    b.onclick = () => { st.start = fromMin(t); renderSlots(); };
    box.appendChild(b);
  }
  hint.textContent = free
    ? `Horarios disponibles (tu cita durará aprox. ${durText(dur)}).`
    : "No hay horarios disponibles ese día para esos servicios. Prueba con otra fecha.";
}

function onFecha() {
  const v = $("#fecha").value;
  st.start = ""; $("#fechaErr").textContent = "";
  if (!v) { st.day = ""; refreshSlots(); return; }
  if (v < todayISO() || v > addDays(todayISO(), settings.max_days_ahead)) {
    $("#fechaErr").textContent = "Elige una fecha dentro del rango permitido.";
    st.day = ""; refreshSlots(); return;
  }
  if (settings.closed_days.includes(parseDay(v).getDay())) {
    $("#fechaErr").textContent = "Ese día no hay atención. Elige otra fecha.";
    st.day = ""; refreshSlots(); return;
  }
  st.day = v; refreshSlots();
}

function mensajeNueva(c, r) {
  const lista = r.services.map(s => `• ${s.name} (${money(s.price)})`).join("\n");
  return `💅 *Nueva cita agendada*\n\n*Clienta:* ${c.name}\n*WhatsApp:* ${c.phone}\n*Fecha:* ${prettyDay(c.day)}\n*Hora:* ${hm(r.start_time)} a ${hm(r.end_time)}\n\n*Servicios:*\n${lista}\n\n*Total estimado:* ${money(r.total)}` +
         (c.notes ? `\n*Notas:* ${c.notes}` : "") + `\n\nEstado: pendiente de confirmar.`;
}

async function agendar() {
  const name = $("#nombre").value.trim(), phone = $("#tel").value.trim(), notes = $("#notas").value.trim();
  const err = $("#formErr"); err.textContent = "";
  const sel = selected();
  if (name.length < 2) return err.textContent = "Escribe tu nombre.";
  if (phone.replace(/\D/g, "").length < 10) return err.textContent = "Escribe tu WhatsApp con 10 dígitos.";
  if (!sel.length) return err.textContent = "Elige al menos un servicio.";
  if (!st.day) return err.textContent = "Elige una fecha.";
  if (!st.start) return err.textContent = "Elige una hora.";

  const btn = $("#btnAgendar"); btn.disabled = true; btn.textContent = "Agendando…";
  const { data, error } = await sb.rpc("create_booking", {
    p_name: name, p_phone: phone, p_service_ids: sel.map(s => s.id),
    p_day: st.day, p_start: st.start, p_notes: notes
  });
  btn.disabled = false; btn.textContent = "Agendar cita";

  if (error) { err.textContent = errMsg(error); refreshSlots(); return; }

  // Guardamos id + código en este teléfono para poder ver/cancelar la cita después
  const mine = store.get("unas:mine", []);
  mine.push({ id: data.id, code: data.cancel_code });
  store.set("unas:mine", mine);

  const c = { name, phone, day: st.day, notes };
  const url = waLink(settings.whatsapp, mensajeNueva(c, data));
  $("#doneSum").innerHTML = `<strong>${esc(prettyDay(st.day))}</strong><br>de <strong>${hm(data.start_time)}</strong> a <strong>${hm(data.end_time)}</strong><br>${data.services.map(s => esc(s.name)).join(", ")}<br>Total estimado: <strong>${money(data.total)}</strong>`;
  $("#doneWa").href = url;
  $("#formCard").hidden = true; $("#doneCard").hidden = false;
  renderRecordatorio($("#doneRemind"), { id: data.id, code: data.cancel_code, day: st.day, start: data.start_time, end: data.end_time, services: data.services });
  renderMisCitas();
  window.open(url, "_blank", "noopener");
}

function nuevaCita() {
  st.sel = new Set(); st.day = ""; st.start = "";
  ["#nombre", "#tel", "#notas", "#fecha"].forEach(s => $(s).value = "");
  renderChecks(); updateTotal(); refreshSlots();
  $("#doneCard").hidden = true; $("#formCard").hidden = false;
}

/* ---------------- Recordatorios ---------------- */
const pushOk = () => !!sb && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && !!CFG.VAPID_PUBLIC_KEY;
const recordadas = () => store.get("unas:remind", []);
const decir = (el, texto) => { el.textContent = texto; el.hidden = false; };
const b64aBytes = s => {
  const pad = "=".repeat((4 - s.length % 4) % 4);
  const raw = atob((s + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map(ch => ch.charCodeAt(0)));
};

// Activa el aviso automático (llega un día antes) en este dispositivo
async function activarRecordatorio(c, msg) {
  try {
    if (Notification.permission === "denied") {
      decir(msg, "Los avisos están bloqueados en tu navegador. Actívalos en la configuración del sitio, o agrega la cita a tu calendario.");
      return false;
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") { decir(msg, "No se activó el aviso. Puedes agregar la cita a tu calendario."); return false; }
    await navigator.serviceWorker.register("sw-clientas.js");
    const reg = await navigator.serviceWorker.ready;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(CFG.VAPID_PUBLIC_KEY) });
    const k = sub.toJSON();
    const { error } = await sb.rpc("save_client_push", { p_id: c.id, p_code: c.code, p_endpoint: k.endpoint, p_p256dh: k.keys.p256dh, p_auth: k.keys.auth });
    if (error) throw error;
    store.set("unas:remind", [...recordadas(), c.id]);
    decir(msg, "Listo. Te avisaremos un día antes de tu cita.");
    return true;
  } catch (e) {
    console.error("Recordatorio:", e);
    decir(msg, "No se pudo activar el aviso. Intenta de nuevo o agrega la cita a tu calendario.");
    return false;
  }
}

// Archivo de calendario (.ics) con alarmas: sirve en iPhone y en cualquier teléfono
function descargarIcs(c) {
  const [y, m, d] = c.day.split("-").map(Number);
  const utc = t => {
    const [h, mi] = String(t).split(":").map(Number);
    return new Date(Date.UTC(y, m - 1, d, h + 6, mi)).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); // México: UTC-6
  };
  const esc1 = s => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, ch => "\\" + ch).replace(/\n/g, "\\n");
  const negocio = (settings && settings.business_name) || "Mad Beauty";
  const alarma = (trigger, texto) => ["BEGIN:VALARM", "TRIGGER:" + trigger, "ACTION:DISPLAY", "DESCRIPTION:" + esc1(texto), "END:VALARM"];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//" + negocio + "//Citas//ES", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    "UID:" + c.id + "@citas",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""),
    "DTSTART:" + utc(c.start), "DTEND:" + utc(c.end),
    "SUMMARY:" + esc1("Cita en " + negocio),
    "DESCRIPTION:" + esc1((c.services || []).map(s => s.name).join(", ")),
    ...alarma("-P1D", "Mañana tienes tu cita en " + negocio),
    ...alarma("-PT2H", "Tu cita en " + negocio + " es en 2 horas"),
    "END:VEVENT", "END:VCALENDAR"
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = "cita-" + negocio.toLowerCase().replace(/\s+/g, "-") + ".ics";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

// Dibuja los botones de recordatorio de UNA cita dentro de `box`
// c = { id, code, day, start, end, services }
function renderRecordatorio(box, c) {
  box.innerHTML = "";
  const wrap = document.createElement("div"); wrap.className = "remind";
  const fila = document.createElement("div"); fila.className = "row";
  const msg = document.createElement("p"); msg.className = "muted remindMsg";

  if (pushOk()) {
    if (recordadas().includes(c.id)) {
      msg.textContent = "Te avisaremos un día antes de tu cita.";
    } else {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn ghost small"; b.textContent = "Avisarme un día antes";
      b.onclick = async () => { b.disabled = true; if (await activarRecordatorio(c, msg)) b.remove(); else b.disabled = false; };
      fila.appendChild(b);
    }
  } else {
    msg.textContent = "Para que tu teléfono te recuerde la cita, agrégala a tu calendario.";
  }
  const cal = document.createElement("button");
  cal.type = "button"; cal.className = "btn ghost small"; cal.textContent = "Agregar a mi calendario";
  cal.onclick = () => descargarIcs(c);
  fila.appendChild(cal);

  wrap.appendChild(fila);
  wrap.appendChild(msg);                       // siempre presente: aquí salen el "Listo" y los errores
  if (!msg.textContent) msg.hidden = true;
  box.appendChild(wrap);
}

/* ---------------- Mis citas ---------------- */
const ESTADOS = { pending: "Pendiente", confirmed: "Confirmada", rejected: "No disponible", cancelled: "Cancelada" };

async function renderMisCitas() {
  const box = $("#misCitas");
  const mine = store.get("unas:mine", []);
  if (!mine.length) { box.innerHTML = '<p class="empty">Aún no tienes citas agendadas en este teléfono.</p>'; return; }

  const { data, error } = await sb.rpc("my_bookings", { p: mine });
  if (error) { box.innerHTML = '<p class="empty">No se pudieron cargar tus citas.</p>'; return; }

  const today = todayISO();
  const list = (data || []).filter(b => b.day >= today || b.status === "pending" || b.status === "confirmed");
  if (!list.length) { box.innerHTML = '<p class="empty">No tienes citas próximas.</p>'; return; }

  box.innerHTML = "";
  list.forEach(b => {
    const d = document.createElement("div"); d.className = "appt";
    const activa = (b.status === "pending" || b.status === "confirmed") && b.day >= today;
    d.innerHTML = `<div><strong>${esc(prettyDay(b.day))} · ${hm(b.start_time)}</strong>
        <span class="tag ${b.status}">${ESTADOS[b.status] || b.status}</span><br>
        <small>${b.services.map(s => esc(s.name)).join(", ")} · ${money(b.total)}</small></div>
        ${activa ? '<button class="x" type="button">Cancelar</button>' : ""}`;
    const x = d.querySelector("button");
    if (x) x.onclick = () => cancelar(b, mine);
    if (activa) {
      const rb = document.createElement("div");
      d.firstElementChild.appendChild(rb);
      const mia = mine.find(m => m.id === b.id) || {};
      renderRecordatorio(rb, { id: b.id, code: mia.code, day: b.day, start: b.start_time, end: b.end_time, services: b.services });
    }
    box.appendChild(d);
  });
}

async function cancelar(b, mine) {
  if (!confirm("¿Cancelar esta cita?")) return;
  const rec = mine.find(m => m.id === b.id);
  const { data, error } = await sb.rpc("cancel_booking", { p_id: b.id, p_code: rec ? rec.code : "" });
  if (error) { alert(errMsg(error)); return; }
  renderMisCitas(); refreshSlots();
  const aviso = `❌ *Cita cancelada*\n\n*Clienta:* ${data.name}\n*Fecha:* ${prettyDay(data.day)}\n*Hora:* ${hm(data.start_time)}\n*Servicios:* ${data.services.map(s => s.name).join(", ")}`;
  const url = waLink(settings.whatsapp, aviso);

  // En iPhone, Safari bloquea abrir WhatsApp solo después de esperar a la base de datos.
  // Por eso siempre se muestra un botón: al tocarlo, funciona en cualquier teléfono.
  $("#cancelWa").href = url;
  $("#cancelBanner").hidden = false;
  $("#cancelBanner").scrollIntoView({ behavior: "smooth", block: "center" });
  window.open(url, "_blank", "noopener");      // en Android se abre solo; en iPhone se ignora
}
$("#cancelBannerClose").onclick = () => { $("#cancelBanner").hidden = true; };

/* ---------------- Cotizar ---------------- */
let fotoUrl = "", subiendoFoto = false;
const FOTO_MSG = "Una imagen de las uñas que te gustan. Le llegará a la manicurista en tu mensaje.";

function actualizaCotizar() {
  const n = $("#qNombre").value.trim(), d = $("#qDesc").value.trim();
  const txt = `Hola 👋${n ? " soy " + n + "." : ""} Quiero cotizar un diseño de uñas.` +
              (d ? `\n\n*Lo que busco:* ${d}` : "") +
              (fotoUrl ? `\n\n*Foto de referencia:* ${fotoUrl}` : "") +
              `\n\nTe mando más fotos de inspiración por aquí.`;
  const a = $("#btnCotizar");
  a.href = waLink(settings ? settings.whatsapp : CFG.WHATSAPP_FALLBACK || "", txt);
  a.setAttribute("aria-disabled", subiendoFoto ? "true" : "false");
}
$("#qNombre").oninput = actualizaCotizar;
$("#qDesc").oninput = actualizaCotizar;
$("#btnCotizar").addEventListener("click", e => { if (subiendoFoto) e.preventDefault(); });

// Reduce la foto (los celulares dan fotos enormes) antes de subirla
function cargarImagen(file) {
  return new Promise((res, rej) => {
    const u = URL.createObjectURL(file), im = new Image();
    im.onload = () => { URL.revokeObjectURL(u); res(im); };
    im.onerror = () => { URL.revokeObjectURL(u); rej(new Error("imagen")); };
    im.src = u;
  });
}
async function comprimirFoto(file, max = 1920, calidad = 0.88) {
  const im = await cargarImagen(file);
  const esc = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const w = Math.max(1, Math.round(im.naturalWidth * esc)), h = Math.max(1, Math.round(im.naturalHeight * esc));
  const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
  cv.getContext("2d").drawImage(im, 0, 0, w, h);
  return new Promise((res, rej) => cv.toBlob(b => b ? res(b) : rej(new Error("blob")), "image/jpeg", calidad));
}

function quitarFoto(limpiarMsg = true) {
  fotoUrl = "";
  $("#qFoto").value = "";
  $("#qFotoPrev").hidden = true;
  $("#qFotoBtn").textContent = "Subir una foto";
  if (limpiarMsg) $("#qFotoMsg").textContent = FOTO_MSG;
  actualizaCotizar();
}

async function subirFoto(file) {
  const msg = $("#qFotoMsg");
  if (!file) return;
  if (!sb) { msg.textContent = "La subida de fotos no está disponible. Envíala directo por WhatsApp."; return; }
  const esImagen = /^image\//.test(file.type) || /\.(jpe?g|jfif|png|webp|heic|heif|avif|gif|bmp)$/i.test(file.name);
  if (!esImagen) { msg.textContent = "Elige una imagen (JPG o PNG)."; return; }

  subiendoFoto = true; fotoUrl = ""; actualizaCotizar();
  msg.textContent = "Subiendo foto…";
  try {
    const blob = await comprimirFoto(file);
    const id = crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(36).slice(2);
    const path = `cotizaciones/${id}.jpg`;
    const { error } = await sb.storage.from("referencias").upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    fotoUrl = sb.storage.from("referencias").getPublicUrl(path).data.publicUrl;
    $("#qFotoImg").src = URL.createObjectURL(blob);
    $("#qFotoPrev").hidden = false;
    $("#qFotoBtn").textContent = "Cambiar foto";
    msg.textContent = "Foto lista. Irá en tu mensaje de WhatsApp.";
  } catch (e) {
    console.error("Foto:", e);
    const heic = /hei[cf]/i.test(file.type + " " + file.name);
    quitarFoto(false);
    msg.textContent = heic
      ? "Ese formato (HEIC) no se puede usar aquí. Elige una foto JPG o PNG."
      : (e && e.message === "imagen")
        ? "No se pudo leer esa imagen. Prueba con una foto JPG o PNG."
        : "No se pudo subir la foto. Intenta con otra, o envíala directo por WhatsApp.";
  } finally {
    subiendoFoto = false;
    actualizaCotizar();
  }
}
$("#qFoto").onchange = e => { const f = e.target.files[0]; e.target.value = ""; subirFoto(f); };
$("#qFotoQuitar").onclick = () => quitarFoto();

// Arrastrar y soltar (computadora)
const zona = $("#qDrop");
["dragenter", "dragover"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add("over"); }));
["dragleave", "drop"].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove("over"); }));
zona.addEventListener("drop", e => { const f = e.dataTransfer && e.dataTransfer.files[0]; if (f) subirFoto(f); });
// Si sueltan la foto fuera de la zona, que el navegador no la abra y se salga de la página
["dragover", "drop"].forEach(ev => window.addEventListener(ev, e => { if (!zona.contains(e.target)) e.preventDefault(); }));

/* ---------------- Inicio ---------------- */
async function init() {
  if (NOCONFIG) { $("#setupBanner").hidden = false; $("#btnAgendar").disabled = true; return; }

  const [s, sv] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).single(),
    sb.from("services").select("*").eq("active", true).order("sort").order("name")
  ]);
  if (s.error || sv.error) {
    const b = $("#loadBanner");
    b.textContent = "No se pudo conectar con la base de datos. Revisa config.js y que hayas ejecutado schema.sql.";
    b.hidden = false; $("#btnAgendar").disabled = true; return;
  }
  settings = s.data; services = sv.data;

  document.title = settings.business_name + " · Agenda tu cita";
  $("#fecha").min = todayISO();
  $("#fecha").max = addDays(todayISO(), settings.max_days_ahead);
  $("#fecha").onchange = onFecha;
  $("#btnAgendar").onclick = agendar;
  $("#btnOtra").onclick = nuevaCita;

  renderChips(); renderServicios(); renderChecks(); updateTotal(); renderSlots();
  actualizaCotizar(); renderMisCitas();
}
init();
