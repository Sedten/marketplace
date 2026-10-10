const ESTADOS = {
  en_espera: { texto: 'En espera', clase: 'bg-amber-100 text-amber-700' },
  en_proceso: { texto: 'En proceso', clase: 'bg-sky-100 text-sky-700' },
  pagado: { texto: 'Pagado', clase: 'bg-emerald-100 text-emerald-700' },
  cancelado: { texto: 'Cancelado', clase: 'bg-slate-200 text-slate-600' }
};
const EVENTOS = { creado: 'Creado', modificado: 'Modificado por el cliente' };
const TABS = [
  { id: 'pendientes', texto: 'Pendientes' },
  { id: 'pagados', texto: 'Pagados' },
  { id: 'cancelados', texto: 'Cancelados' },
  { id: 'todos', texto: 'Todos' }
];

let rol = 'vendedor';
let grupo = 'pendientes';
let orden = 'recientes';
let busqueda = '';
let conteos = { en_espera: 0, en_proceso: 0, pagado: 0, cancelado: 0 };
let lista = [];
let abierto = null;
let ultimoAuto = '';
let tBusqueda = null;

const $ = id => document.getElementById(id);
function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dinero(n) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function textoNumero(n) { return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function fecha(s) {
  return new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function toast(msg, error) {
  const t = $('toast');
  t.textContent = msg;
  t.style.background = error ? '#be123c' : '#0f172a';
  t.classList.remove('opacity-0');
  t.classList.add('opacity-100');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.classList.remove('opacity-100');
    t.classList.add('opacity-0');
  }, 2200);
}

async function api(url, opciones) {
  const r = await fetch(url, Object.assign({ credentials: 'same-origin' }, opciones));
  if (r.status === 401) { location.href = '/login'; throw new Error('Sesión vencida'); }
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Error ' + r.status);
  return datos;
}

// ---------- Lista ----------
async function cargar(manual) {
  const q = busqueda.trim();
  const estado = q ? 'todos' : grupo; // al buscar se mira en todos los pedidos
  try {
    const d = await api(`/api/staff/pedidos?estado=${estado}&orden=${orden}&q=${encodeURIComponent(q)}`);
    conteos = d.conteos;
    lista = d.pedidos;
    renderTabs();
    renderLista();
    if (manual) toast('Actualizado');

    // Si se pegó un comprobante completo y hay un solo resultado, se abre solo
    const codigo = q.toUpperCase();
    if (!q) ultimoAuto = '';
    if (/^GRN-\d{3,}-[A-Z0-9]{3}$/.test(codigo) && lista.length === 1 && codigo !== ultimoAuto && !abierto) {
      ultimoAuto = codigo;
      abrir(lista[0].codigo);
    }
  } catch (e) { toast(e.message, true); }
}

function numerosTabs() {
  return {
    pendientes: conteos.en_espera + conteos.en_proceso,
    pagados: conteos.pagado,
    cancelados: conteos.cancelado,
    todos: conteos.en_espera + conteos.en_proceso + conteos.pagado + conteos.cancelado
  };
}

function renderTabs() {
  const n = numerosTabs();
  const buscando = !!busqueda.trim();
  $('tabs').innerHTML = TABS.map(t => `
    <button onclick="elegirTab('${t.id}')"
      class="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${t.id === grupo && !buscando
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-white text-slate-600 border-slate-200'}">
      ${t.texto} <span class="opacity-70">${n[t.id]}</span>
    </button>`).join('');
}

function tarjeta(p) {
  const e = ESTADOS[p.estado] || ESTADOS.en_espera;
  return `
    <div onclick="abrir('${p.codigo}')" class="bg-white rounded-2xl p-3 border border-slate-100 shadow-sm flex items-center justify-between gap-3 cursor-pointer">
      <div class="min-w-0">
        <p class="font-mono font-bold text-slate-900 text-sm">${esc(p.codigo)}</p>
        <p class="text-[11px] text-slate-400 mt-0.5">${fecha(p.creado)} · ${p.productos} producto${p.productos === 1 ? '' : 's'}</p>
      </div>
      <div class="text-right shrink-0">
        <p class="text-sm font-bold text-slate-900">${dinero(p.total)}</p>
        <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-0.5 ${e.clase}">${e.texto}</span>
      </div>
    </div>`;
}

function renderLista() {
  const suma = lista.reduce((s, p) => s + p.total, 0);
  const buscando = busqueda.trim();
  $('resumen').textContent = (buscando ? 'Búsqueda en todos los pedidos · ' : '') +
    `${lista.length} pedido${lista.length === 1 ? '' : 's'} · ${dinero(Math.round(suma * 100) / 100)}`;
  $('lista').innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<p class="text-center text-sm text-slate-400 py-10">No hay pedidos.</p>';
}

function elegirTab(id) {
  grupo = id;
  busqueda = '';
  $('buscar').value = '';
  cargar();
}
function cambiarOrden(v) { orden = v; cargar(); }

function buscar(texto) {
  // Si pegan el mensaje completo de WhatsApp, se extrae solo el comprobante
  const m = String(texto).match(/GRN-\d{3,}-[A-Z0-9]{3}/i);
  busqueda = m ? m[0].toUpperCase() : String(texto);
  if (m) $('buscar').value = busqueda;
  clearTimeout(tBusqueda);
  tBusqueda = setTimeout(cargar, 250);
}

async function pegar() {
  try {
    const t = await navigator.clipboard.readText();
    $('buscar').value = t.trim();
    buscar(t.trim());
  } catch (e) {
    toast('No se pudo leer el portapapeles. Pega el texto en el buscador.', true);
  }
}

// ---------- Detalle ----------
async function abrir(codigo) {
  try {
    abierto = await api('/api/staff/pedidos/' + encodeURIComponent(codigo));
    renderDetalle();
    $('detalle').style.display = 'flex';
  } catch (e) { toast(e.message, true); }
}

function cerrar() {
  $('detalle').style.display = 'none';
  abierto = null;
}

function acciones(p) {
  const btn = (estado, texto, clase) =>
    `<button onclick="cambiarEstado('${estado}')" class="w-full ${clase} text-sm font-semibold py-3 rounded-2xl">${texto}</button>`;
  const neutro = 'bg-white border border-slate-200 text-slate-700';
  const peligro = 'bg-white border border-slate-200 text-rose-600';
  let h = '';

  if (p.estado === 'en_espera') {
    h += btn('en_proceso', 'Pasar a En proceso', 'bg-sky-600 text-white');
    h += btn('pagado', 'Marcar como pagado', 'bg-emerald-600 text-white');
    h += btn('cancelado', 'Cancelar pedido', peligro);
  } else if (p.estado === 'en_proceso') {
    h += btn('pagado', 'Marcar como pagado', 'bg-emerald-600 text-white');
    h += btn('en_espera', 'Volver a En espera', neutro);
    h += btn('cancelado', 'Cancelar pedido', peligro);
  } else if (rol === 'admin') {
    h += p.estado === 'pagado'
      ? btn('en_proceso', 'Revertir a En proceso', neutro)
      : btn('en_espera', 'Reabrir en En espera', neutro);
  } else {
    h = '<p class="text-xs text-slate-400 text-center">Solo el admin puede modificar este pedido.</p>';
  }
  return `<div class="space-y-2">${h}</div>`;
}

function renderDetalle() {
  const p = abierto;
  if (!p) return;
  const e = ESTADOS[p.estado] || ESTADOS.en_espera;
  const filas = p.items.map(i => `
    <li class="flex justify-between gap-3 py-1.5 border-b border-slate-100 last:border-0">
      <span class="text-slate-700">${i.unidad === 'kg' ? textoNumero(i.cantidad) + ' kg' : i.cantidad + ' ×'} ${esc(i.nombre)}</span>
      <span class="shrink-0 font-medium text-slate-900">${dinero(i.subtotal)}</span>
    </li>`).join('');
  const hist = (p.historial || []).slice().reverse().map(h => {
    const nombre = EVENTOS[h.evento] || (ESTADOS[h.evento] ? 'Estado: ' + ESTADOS[h.evento].texto : h.evento);
    return `<li>${esc(nombre)} · ${h.por === 'cliente' ? 'Cliente' : esc(h.por)} · ${fecha(h.fecha)}</li>`;
  }).join('');

  $('detalle-contenido').innerHTML = `
    <div class="text-center mb-3">
      <span class="inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${e.clase}">${e.texto}</span>
      <p class="font-mono font-bold text-2xl tracking-wider text-slate-900 mt-1 select-all">${esc(p.codigo)}</p>
      <p class="text-sm text-slate-500">Total a cobrar <b class="text-slate-900 text-lg">${dinero(p.total)}</b></p>
    </div>
    <ul class="text-sm mb-3">${filas}</ul>
    ${acciones(p)}
    <a href="/vendedor/remito.html?codigo=${encodeURIComponent(p.codigo)}" class="block text-center text-sm font-semibold text-slate-700 bg-white border border-slate-200 py-3 rounded-2xl mt-2"><i class="fa-solid fa-receipt mr-1"></i>Remito (imprimir / imagen)</a>
    <p class="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mt-4 mb-1">Historial</p>
    <ul class="text-[11px] text-slate-500 space-y-0.5">${hist}</ul>`;
}

async function cambiarEstado(nuevo) {
  if (!abierto) return;
  const pregunta = { pagado: 'marcar como PAGADO', cancelado: 'CANCELAR' }[nuevo];
  if (pregunta && !confirm(`¿Seguro que quieres ${pregunta} el pedido ${abierto.codigo}?`)) return;
  try {
    abierto = await api('/api/staff/pedidos/' + encodeURIComponent(abierto.codigo) + '/estado', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ estado: nuevo })
    });
    renderDetalle();
    toast('Estado: ' + ESTADOS[nuevo].texto);
    cargar();
  } catch (e) { toast(e.message, true); }
}

async function salir() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  location.href = '/login';
}

async function iniciar() {
  try {
    const yo = await api('/api/staff/yo');
    rol = yo.rol;
    $('rol').textContent = rol === 'admin' ? 'Admin · ' + yo.usuario : 'Vendedor · ' + yo.usuario;
    if (rol === 'admin') $('link-admin').style.display = 'inline-block';
  } catch (e) { return; }
  cargar();
  setInterval(() => {
    if (document.visibilityState === 'visible' && !abierto) cargar();
  }, 20000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cargar();
  });
}

window.addEventListener('load', iniciar);
