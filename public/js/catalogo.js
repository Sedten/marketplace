let tab = 'home';
let categorias = ['Todas'];
let categoriaActiva = 'Todas';
let orden = 'az';
let busqueda = '';

function normalizar(t) {
  return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function cargarProductos() {
  const grid = document.getElementById('product-grid');
  try {
    const r = await fetch('/api/productos');
    if (!r.ok) throw new Error('Error ' + r.status);
    productos = await r.json();
    limpiarCarritoObsoleto();
    renderCategorias();
    renderProductos();
    actualizarCarritoUI();
  } catch (e) {
    grid.innerHTML = '<p class="col-span-3 text-center text-sm text-slate-400 py-10">No se pudo cargar el catálogo. Intenta de nuevo.</p>';
  }
}

// ---------- Filtros ----------
function renderCategorias() {
  const unicas = [...new Set(productos.map(p => p.categoria))].sort((a, b) => a.localeCompare(b, 'es'));
  categorias = ['Todas', ...unicas];
  document.getElementById('categorias').innerHTML = categorias.map((c, i) => `
    <button onclick="elegirCategoria(${i})"
      class="shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${c === categoriaActiva
        ? 'bg-emerald-600 text-white border-emerald-600'
        : 'bg-white text-slate-600 border-slate-200'}">${esc(c)}</button>
  `).join('');
}

function elegirCategoria(i) {
  categoriaActiva = categorias[i];
  renderCategorias();
  renderProductos();
}
function buscar(texto) { busqueda = texto; renderProductos(); }
function cambiarOrden(v) { orden = v; renderProductos(); }

function marcarTab() {
  const b = document.getElementById('tab-offers');
  b.classList.toggle('text-emerald-600', tab === 'offers');
  b.classList.toggle('text-slate-400', tab !== 'offers');
}

function filtrarTab(t) {
  tab = t;
  marcarTab();
  renderProductos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// El botón de inicio limpia todos los filtros
function irInicio() {
  tab = 'home';
  categoriaActiva = 'Todas';
  busqueda = '';
  orden = 'az';
  document.getElementById('buscador').value = '';
  document.getElementById('orden').value = 'az';
  marcarTab();
  renderCategorias();
  renderProductos();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function listaFiltrada() {
  const q = normalizar(busqueda.trim());
  const lista = productos.filter(p =>
    (tab !== 'offers' || enOferta(p)) &&
    (categoriaActiva === 'Todas' || p.categoria === categoriaActiva) &&
    normalizar(p.nombre).includes(q)
  );
  lista.sort((a, b) => {
    if (orden === 'za') return b.nombre.localeCompare(a.nombre, 'es');
    if (orden === 'menor') return precioActual(a) - precioActual(b);
    if (orden === 'mayor') return precioActual(b) - precioActual(a);
    return a.nombre.localeCompare(b.nombre, 'es');
  });
  return lista;
}

// ---------- Tarjetas ----------
function tarjeta(p) {
  const oferta = enOferta(p);
  const desc = oferta ? Math.round((1 - p.precio_oferta / p.precio) * 100) : 0;
  const etiqueta = ETIQUETA[p.unidad] || p.unidad.toUpperCase();
  const color = COLOR_UNIDAD[p.unidad] || 'bg-slate-100 text-slate-600';
  return `
    <div onclick="agregar(${p.id})" class="bg-white border border-slate-100 active:border-emerald-500 rounded-2xl p-2 flex flex-col cursor-pointer shadow-sm">
      <div class="relative w-full aspect-square bg-slate-50 rounded-xl mb-1.5 overflow-hidden">
        <img src="/img/productos/${encodeURIComponent(p.imagen)}" alt="${esc(p.nombre)}" loading="lazy"
          class="w-full h-full object-cover" onerror="this.onerror=null;this.src='${IMG_DEFECTO}'">
        ${desc > 0 ? `<span class="absolute top-1 left-1 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">-${desc}%</span>` : ''}
        <span class="absolute top-1 right-1 w-6 h-6 bg-white/90 text-emerald-600 rounded-full flex items-center justify-center text-[10px] shadow">
          <i class="fa-solid fa-plus"></i>
        </span>
      </div>
      <span class="self-start text-[9px] font-bold px-1.5 py-0.5 rounded-md ${color}">${etiqueta}</span>
      <h3 class="text-[11px] font-medium text-slate-800 leading-tight mt-1 line-clamp-2 min-h-[1.9rem]">${esc(p.nombre)}</h3>
      <div class="mt-0.5">
        ${oferta ? `<span class="text-[10px] text-slate-400 line-through block leading-none">${dinero(p.precio)}</span>` : ''}
        <span class="text-xs font-bold ${oferta ? 'text-rose-600' : 'text-slate-900'}">${dinero(precioActual(p))}</span>
      </div>
    </div>`;
}

function renderProductos() {
  const lista = listaFiltrada();
  document.getElementById('section-title').textContent = tab === 'offers' ? 'Ofertas' : 'Productos';
  document.getElementById('section-count').textContent =
    lista.length + (lista.length === 1 ? ' disponible' : ' disponibles');
  document.getElementById('product-grid').innerHTML = lista.length
    ? lista.map(tarjeta).join('')
    : '<p class="col-span-3 text-center text-sm text-slate-400 py-10">No encontramos productos.</p>';
}

window.addEventListener('load', () => {
  marcarTab();
  actualizarCarritoUI();
  cargarProductos();
});
