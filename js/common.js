/* =====================================================================
   Funciones compartidas por la página de clientas y el panel
   ===================================================================== */

const CFG = window.APP_CONFIG || {};
const NOCONFIG = !CFG.SUPABASE_URL || CFG.SUPABASE_URL.includes("TU-PROYECTO") ||
                 !CFG.SUPABASE_ANON_KEY || CFG.SUPABASE_ANON_KEY.includes("TU-LLAVE");
const sb = NOCONFIG ? null : window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY);

const TZ = "America/Mexico_City";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

// Escapa texto que viene de clientas antes de ponerlo en HTML
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
));

const money = n => "$" + Number(n).toLocaleString("es-MX");
const pad = n => String(n).padStart(2, "0");

// "10:30:00" -> "10:30"
const hm = t => String(t).slice(0, 5);
// "10:30" -> 630
const toMin = t => { const [h, m] = String(t).split(":").map(Number); return h * 60 + (m || 0); };
// 630 -> "10:30"
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

// "2026-10-14" -> Date local (sin saltos de zona horaria)
const parseDay = s => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
const prettyDay = s => parseDay(s).toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const shortDay = s => parseDay(s).toLocaleDateString("es-MX", { weekday: "short", day: "numeric", month: "short" });

// Fecha y hora actuales en la zona de México
const todayISO = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const nowMin = () => {
  const [h, m] = new Date().toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).split(":").map(Number);
  return h * 60 + m;
};
const addDays = (iso, n) => {
  const d = parseDay(iso); d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const dayDiff = (a, b) => Math.round((parseDay(a) - parseDay(b)) / 86400000);

// Enlace de WhatsApp. `phone`: solo dígitos; si trae 10 dígitos se le agrega el 52 de México
const waLink = (phone, text) => {
  let p = String(phone).replace(/\D/g, "");
  if (p.length === 10) p = "52" + p;
  return `https://wa.me/${p}?text=${encodeURIComponent(text)}`;
};

// Almacenamiento local con protección contra errores (modo privado, etc.)
const store = {
  get(key, fallback = null) { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; } },
  set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* ignorar */ } }
};

// Traduce los errores de la base de datos a mensajes entendibles
function errMsg(e) {
  const m = String((e && (e.message || e.details)) || e || "");
  const map = {
    HORARIO_OCUPADO: "Ese horario acaba de ser ocupado. Elige otro, por favor.",
    FUERA_DE_HORARIO: "Ese horario está fuera del horario de atención.",
    DIA_CERRADO: "Ese día no hay atención.",
    FECHA_INVALIDA: "La fecha u hora elegida ya no está disponible.",
    DATOS_INVALIDOS: "Revisa tu nombre y tu teléfono (10 dígitos).",
    SERVICIO_INVALIDO: "Uno de los servicios ya no está disponible. Recarga la página.",
    NO_ENCONTRADA: "No se encontró la cita o ya estaba cancelada."
  };
  for (const k in map) if (m.includes(k)) return map[k];
  if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Sin conexión. Revisa tu internet e intenta de nuevo.";
  return "Ocurrió un error. Intenta de nuevo.";
}
