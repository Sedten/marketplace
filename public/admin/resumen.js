const PERIODOS = [
  { id: 'semana', texto: 'Esta semana' },
  { id: 'anterior', texto: 'Semana pasada' },
  { id: 'mes', texto: 'Este mes' },
  { id: 'todo', texto: 'Todo' }
];
let periodo = 'semana';
let base = 'pagados';
let datos = null;

const $ = id => document.getElementById(id);
function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dinero(n) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function textoNumero(n) { return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }

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

async function api(url) {
  const r = await fetch(url, { credentials: 'same-origin' });
  if (r.status === 401) { location.href = '/login'; throw new Error('Sesión vencida'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}

// La semana de pedidos va de sábado a viernes
function inicioSemana(f) {
  const d = new Date(f);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return d;
}

function rango() {
  const ahora = new Date();
  if (periodo === 'semana') return { desde: inicioSemana(ahora), hasta: null };
  if (periodo === 'anterior') {
    const hasta = inicioSemana(ahora);
    const desde = new Date(hasta);
    desde.setDate(desde.getDate() - 7);
    return { desde, hasta };
  }
  if (periodo === 'mes') return { desde: new Date(ahora.getFullYear(), ahora.getMonth(), 1), hasta: null };
  return { desde: null, hasta: null };
}

function fechaCorta(d) { return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }); }

async function cargar() {
  const r = rango();
  const q = new URLSearchParams({ base });
  if (r.desde) q.set('desde', r.desde.toISOString());
  if (r.hasta) q.set('hasta', r.hasta.toISOString());
  try {
    datos = await api('/api/admin/resumen?' + q);
    renderPeriodos();
    $('rango').textContent = r.desde
      ? 'Desde el ' + fechaCorta(r.desde) + (r.hasta ? ' hasta el ' + fechaCorta(new Date(r.hasta - 1)) : ' hasta hoy')
      : 'Todos los pedidos';
    renderTarjetas();
    renderProductos();
    calcularComision();
  } catch (e) { toast(e.message, true); }
}

function renderPeriodos() {
  $('periodos').innerHTML = PERIODOS.map(p => `
    <button onclick="elegirPeriodo('${p.id}')"
      class="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${p.id === periodo
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-white text-slate-600 border-slate-200'}">${p.texto}</button>`).join('');
}

function tarjeta(titulo, valor, sub, color) {
  return `
    <div class="bg-white rounded-2xl border border-slate-100 p-3">
      <p class="text-[11px] font-semibold text-slate-400">${titulo}</p>
      <p class="text-lg font-bold ${color || 'text-slate-900'}">${valor}</p>
      <p class="text-[11px] text-slate-400">${sub}</p>
    </div>`;
}

function renderTarjetas() {
  const d = datos;
  $('tarjetas').innerHTML =
    tarjeta('Pagados', dinero(d.pagados.total), d.pagados.cantidad + ' pedido' + (d.pagados.cantidad === 1 ? '' : 's'), 'text-emerald-600') +
    tarjeta('Pendientes', dinero(d.pendientes.total),
      d.pendientes.en_espera + ' en espera · ' + d.pendientes.en_proceso + ' en proceso', 'text-amber-600') +
    tarjeta('Ticket promedio', dinero(d.pagados.promedio), 'sobre pedidos pagados') +
    tarjeta('Clientes', d.clientes, d.clientesPagaron + ' pagaron (celulares distintos)') +
    tarjeta('Cancelados', d.cancelados.cantidad, 'pedidos');
}

function renderProductos() {
  const lista = datos.productos;
  $('productos').innerHTML = lista.length
    ? lista.map(p => `
        <div class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0">
            <p class="text-sm font-medium text-slate-800 truncate">${esc(p.nombre)}</p>
            <p class="text-[11px] text-slate-400">${p.unidad === 'kg' ? textoNumero(p.cantidad) + ' kg' : textoNumero(p.cantidad) + ' ' + esc(p.unidad)}</p>
          </div>
          <span class="text-sm font-bold text-slate-900 shrink-0">${dinero(p.monto)}</span>
        </div>`).join('')
    : '<p class="text-center text-sm text-slate-400 py-8">Sin datos en este período.</p>';
}

function calcularComision() {
  const v = $('comision').value;
  try { localStorage.setItem('elgringo_comision', v); } catch (e) {}
  const pct = parseFloat(String(v).replace(',', '.'));
  const total = datos ? datos.pagados.total : 0;
  $('comision-monto').textContent = dinero(Number.isFinite(pct) && pct > 0 ? Math.round(total * pct) / 100 : 0);
}

function elegirPeriodo(id) { periodo = id; cargar(); }
function cambiarBase(v) { base = v; cargar(); }

// ---------- CSV ----------
function descargar(nombre, filas) {
  const csv = '\ufeff' + filas.map(f => f.map(c => '"' + String(c).replace(/"/g, '""') + '"').join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Descargado: ' + nombre);
}

function csvComprobantes() {
  if (!datos || !datos.comprobantes.length) { toast('No hay comprobantes pagados en este período', true); return; }
  descargar('comprobantes-pagados.csv',
    [['comprobante', 'fecha', 'total']].concat(datos.comprobantes.map(c => [c.codigo, c.fecha.slice(0, 16).replace('T', ' '), c.total])));
}

function csvProductos() {
  if (!datos || !datos.productos.length) { toast('No hay productos en este período', true); return; }
  descargar('productos-resumen.csv',
    [['producto', 'unidad', 'cantidad', 'monto']].concat(datos.productos.map(p => [p.nombre, p.unidad, p.cantidad, p.monto])));
}

async function salir() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  location.href = '/login';
}

window.addEventListener('load', () => {
  try { $('comision').value = localStorage.getItem('elgringo_comision') || ''; } catch (e) {}
  cargar();
});
