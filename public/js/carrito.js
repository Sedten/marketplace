const CLAVE_CARRITO = 'elgringo_carrito';
const IMG_DEFECTO = '/img/productos/null.jpg';
const ETIQUETA = { unidad: 'UNIDAD', bulto: 'BULTO', caja: 'CAJA', kg: 'KG' };
const COLOR_UNIDAD = {
  unidad: 'bg-sky-100 text-sky-700',
  bulto: 'bg-orange-100 text-orange-700',
  caja: 'bg-orange-100 text-orange-700',
  kg: 'bg-emerald-100 text-emerald-700'
};

let productos = [];
let carrito = cargarCarrito();

// ---------- Utilidades ----------
function cargarCarrito() {
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE_CARRITO));
    return g && typeof g === 'object' ? g : {};
  } catch (e) { return {}; }
}
function guardarCarrito() {
  try { localStorage.setItem(CLAVE_CARRITO, JSON.stringify(carrito)); } catch (e) {}
}
function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dinero(n) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function redondear(n) { return Math.round(n * 100) / 100; }
function buscarProducto(id) { return productos.find(p => p.id === Number(id)); }
function esKg(p) { return p.unidad === 'kg'; }
function paso(p) { return esKg(p) ? 0.5 : 1; }
function minimo(p) { return esKg(p) ? 0.1 : 1; }
function enOferta(p) { return p.oferta && p.precio_oferta != null && p.precio_oferta < p.precio; }
function precioActual(p) { return enOferta(p) ? p.precio_oferta : p.precio; }
function textoNumero(n) { return n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('opacity-0');
  t.classList.add('opacity-100');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    t.classList.remove('opacity-100');
    t.classList.add('opacity-0');
  }, 1500);
}

// ---------- Operaciones del carrito ----------
function agregar(id) {
  const p = buscarProducto(id);
  if (!p) return;
  const actual = carrito[id] || 0;
  carrito[id] = redondear(actual + (esKg(p) && !actual ? 1 : paso(p)));
  guardarCarrito();
  actualizarCarritoUI();
  toast('Agregado: ' + p.nombre);
}

function cambiarCantidad(id, dir) {
  const p = buscarProducto(id);
  if (!p) return;
  const nueva = redondear((carrito[id] || 0) + dir * paso(p));
  if (nueva < minimo(p)) delete carrito[id];
  else carrito[id] = nueva;
  guardarCarrito();
  actualizarCarritoUI();
}

function setCantidad(id, texto) {
  const p = buscarProducto(id);
  if (!p) return;
  let v = parseFloat(String(texto).replace(',', '.'));
  if (!Number.isFinite(v) || v <= 0) { actualizarCarritoUI(); return; }
  v = esKg(p) ? redondear(v) : Math.round(v);
  if (v < minimo(p)) v = minimo(p);
  carrito[id] = v;
  guardarCarrito();
  actualizarCarritoUI();
}

function eliminar(id) {
  delete carrito[id];
  guardarCarrito();
  actualizarCarritoUI();
}

function vaciarCarrito() {
  if (!Object.keys(carrito).length) return;
  if (!confirm('¿Vaciar todo el carrito?')) return;
  carrito = {};
  guardarCarrito();
  actualizarCarritoUI();
}

// Quita del carrito productos que ya no existen en el catálogo
function limpiarCarritoObsoleto() {
  for (const id of Object.keys(carrito)) {
    if (!buscarProducto(id)) delete carrito[id];
  }
  guardarCarrito();
}

function totales() {
  let lineas = 0, total = 0;
  for (const [id, q] of Object.entries(carrito)) {
    const p = buscarProducto(id);
    if (!p) continue;
    lineas++;
    total += precioActual(p) * q;
  }
  return { lineas, total: redondear(total) };
}

// ---------- Interfaz ----------
function actualizarCarritoUI() {
  const { lineas, total } = totales();
  ['header-counter', 'nav-cart-counter'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = lineas;
    el.style.display = lineas > 0 ? 'flex' : 'none';
  });
  document.getElementById('header-total').textContent = dinero(total);
  document.getElementById('modal-total').textContent = dinero(total);
  renderizarCarrito();
}

function abrirCarrito() {
  renderizarCarrito();
  document.getElementById('cart-modal').style.display = 'flex';
}
function cerrarCarrito() {
  document.getElementById('cart-modal').style.display = 'none';
}

function renderizarCarrito() {
  const cont = document.getElementById('cart-items-container');
  const entradas = Object.entries(carrito).filter(([id]) => buscarProducto(id));

  if (!entradas.length) {
    cont.innerHTML = `
      <div class="text-center py-10 text-slate-400">
        <i class="fa-solid fa-cart-arrow-down text-3xl mb-2"></i>
        <p class="text-sm">Tu carrito está vacío</p>
      </div>`;
    return;
  }

  cont.innerHTML = entradas.map(([id, q]) => {
    const p = buscarProducto(id);
    const kg = esKg(p);
    const etiqueta = ETIQUETA[p.unidad] || p.unidad.toUpperCase();
    const color = COLOR_UNIDAD[p.unidad] || 'bg-slate-100 text-slate-600';
    return `
      <div class="bg-slate-50 p-3 rounded-2xl">
        <div class="flex items-start gap-3">
          <img src="/img/productos/${encodeURIComponent(p.imagen)}" alt=""
            class="w-12 h-12 rounded-xl object-cover bg-white"
            onerror="this.onerror=null;this.src='${IMG_DEFECTO}'">
          <div class="flex-1 min-w-0">
            <h4 class="text-xs font-semibold text-slate-800 leading-tight">${esc(p.nombre)}</h4>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md ${color}">${etiqueta}</span>
              <span class="text-[11px] text-slate-500">${dinero(precioActual(p))}${kg ? ' / kg' : ''}</span>
            </div>
          </div>
          <button onclick="eliminar(${p.id})" class="w-7 h-7 text-slate-400 active:text-rose-500 flex items-center justify-center">
            <i class="fa-solid fa-trash-can text-sm"></i>
          </button>
        </div>
        <div class="flex items-center justify-between mt-2">
          <div class="flex items-center gap-1.5">
            <button onclick="cambiarCantidad(${p.id}, -1)" class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-600 shadow-sm">
              <i class="fa-solid fa-minus text-[10px]"></i>
            </button>
            <input type="text" inputmode="${kg ? 'decimal' : 'numeric'}" value="${textoNumero(q)}"
              onchange="setCantidad(${p.id}, this.value)"
              class="w-14 h-8 text-center text-xs font-bold bg-white rounded-lg border border-slate-200 focus:outline-none focus:border-emerald-500">
            ${kg ? '<span class="text-xs text-slate-500">kg</span>' : ''}
            <button onclick="cambiarCantidad(${p.id}, 1)" class="w-8 h-8 bg-white rounded-lg flex items-center justify-center text-slate-600 shadow-sm">
              <i class="fa-solid fa-plus text-[10px]"></i>
            </button>
          </div>
          <span class="text-sm font-bold text-slate-900">${dinero(redondear(precioActual(p) * q))}</span>
        </div>
      </div>`;
  }).join('');
}

// ---------- Pedido por WhatsApp ----------
function plural(u, q) {
  if (q === 1) return u;
  return u === 'unidad' ? 'unidades' : u + 's';
}

function ordenarPedido() {
  const { lineas, total } = totales();
  if (!lineas) { toast('Tu carrito está vacío'); return; }

  const filas = [];
  for (const [id, q] of Object.entries(carrito)) {
    const p = buscarProducto(id);
    if (!p) continue;
    const cant = esKg(p) ? textoNumero(q) + ' kg' : q + ' ' + plural(p.unidad, q);
    filas.push(`• ${cant} - ${p.nombre} - ${dinero(redondear(precioActual(p) * q))}`);
  }

  const mensaje = `*Pedido - El Gringo despensa*\n\n${filas.join('\n')}\n\n*Total: ${dinero(total)}*`;
  window.location.href = 'https://wa.me/?text=' + encodeURIComponent(mensaje);
}
