const ETIQUETA = { unidad: 'UNIDAD', bulto: 'BULTO', caja: 'CAJA', kg: 'KG' };
const COLOR = {
  unidad: 'bg-sky-100 text-sky-700',
  bulto: 'bg-orange-100 text-orange-700',
  caja: 'bg-orange-100 text-orange-700',
  kg: 'bg-emerald-100 text-emerald-700'
};

let productos = [];
let imagenes = [];
let editandoId = null;
let imagenActual = 'null.jpg';

const $ = id => document.getElementById(id);
function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function dinero(n) { return '$' + n.toLocaleString('es-AR', { maximumFractionDigits: 2 }); }
function normalizar(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''); }
function num(t) {
  const v = parseFloat(String(t).replace(',', '.'));
  return Number.isFinite(v) ? v : NaN;
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
  if (r.status === 401) throw new Error('No autorizado. Recarga la página e ingresa tus datos.');
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(datos.error || 'Error ' + r.status);
  return datos;
}

async function iniciar() {
  try {
    productos = await api('/api/admin/productos');
    imagenes = await api('/api/admin/imagenes');
    render();
  } catch (e) {
    $('lista').innerHTML = `<p class="text-center text-sm text-rose-500 py-10">${esc(e.message)}</p>`;
  }
}

// ---------- Lista ----------
function fila(p) {
  const oferta = p.oferta && p.precio_oferta != null;
  const precio = oferta
    ? `<span class="text-xs font-bold text-rose-600">${dinero(p.precio_oferta)}</span>
       <span class="text-[10px] text-slate-400 line-through">${dinero(p.precio)}</span>`
    : `<span class="text-xs font-bold text-slate-900">${dinero(p.precio)}</span>`;
  return `
    <div onclick="editar(${p.id})" class="bg-white rounded-2xl p-3 flex items-center gap-3 shadow-sm border border-slate-100 ${p.activo ? '' : 'opacity-50'}">
      <img src="/img/productos/${encodeURIComponent(p.imagen)}" alt=""
        class="w-14 h-14 rounded-xl object-cover bg-slate-100"
        onerror="this.onerror=null;this.src='/img/productos/null.jpg'">
      <div class="flex-1 min-w-0">
        <h3 class="text-sm font-semibold text-slate-800 truncate">${esc(p.nombre)}</h3>
        <p class="text-[11px] text-slate-500 truncate">${esc(p.categoria)}${p.activo ? '' : ' · Oculto'}</p>
        <div class="flex items-center gap-1.5 mt-1">
          <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-md ${COLOR[p.unidad] || 'bg-slate-100 text-slate-600'}">${ETIQUETA[p.unidad] || esc(p.unidad)}</span>
          ${precio}
        </div>
      </div>
      <button onclick="event.stopPropagation();alternarActivo(${p.id})"
        class="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center ${p.activo ? 'text-emerald-600' : 'text-slate-400'}">
        <i class="fa-solid ${p.activo ? 'fa-eye' : 'fa-eye-slash'} text-sm"></i>
      </button>
    </div>`;
}

function render() {
  const q = normalizar($('buscar').value.trim());
  const lista = productos
    .filter(p => normalizar(p.nombre + ' ' + p.categoria).includes(q))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
  $('conteo').textContent = lista.length + ' de ' + productos.length + ' productos';
  $('lista').innerHTML = lista.length
    ? lista.map(fila).join('')
    : '<p class="text-center text-sm text-slate-400 py-10">No hay productos.</p>';
  $('categorias-dl').innerHTML = [...new Set(productos.map(p => p.categoria))]
    .map(c => `<option value="${esc(c)}">`).join('');
}

function reemplazar(nuevo) {
  const i = productos.findIndex(p => p.id === nuevo.id);
  if (i === -1) productos.push(nuevo);
  else productos[i] = nuevo;
  render();
}

async function alternarActivo(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  try {
    const nuevo = await api('/api/admin/productos/' + id, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.assign({}, p, { activo: !p.activo }))
    });
    reemplazar(nuevo);
    toast(nuevo.activo ? 'Producto visible' : 'Producto oculto');
  } catch (e) { toast(e.message, true); }
}

// ---------- Formulario ----------
function llenarForm(p) {
  $('f-nombre').value = p.nombre;
  $('f-categoria').value = p.categoria;
  $('f-unidad').value = p.unidad;
  $('f-precio').value = p.precio === '' ? '' : String(p.precio);
  $('f-oferta').checked = p.oferta;
  $('f-precio-oferta').value = p.precio_oferta != null ? String(p.precio_oferta) : '';
  $('f-activo').checked = p.activo;
  $('f-error').textContent = '';
  imagenActual = p.imagen || 'null.jpg';
  alternarOferta();
  mostrarImagen();
  $('form-modal').style.display = 'flex';
}

function nuevo() {
  editandoId = null;
  $('form-titulo').textContent = 'Nuevo producto';
  $('f-eliminar').style.display = 'none';
  llenarForm({ nombre: '', categoria: '', unidad: 'unidad', precio: '', oferta: false, precio_oferta: null, imagen: 'null.jpg', activo: true });
}

function editar(id) {
  const p = productos.find(x => x.id === id);
  if (!p) return;
  editandoId = id;
  $('form-titulo').textContent = 'Editar producto';
  $('f-eliminar').style.display = 'block';
  llenarForm(p);
}

function cerrarForm() { $('form-modal').style.display = 'none'; }

function alternarOferta() {
  $('f-precio-oferta').disabled = !$('f-oferta').checked;
}

function mostrarImagen() {
  $('f-preview').src = '/img/productos/' + encodeURIComponent(imagenActual);
  const lista = imagenes.includes(imagenActual) ? imagenes : [imagenActual].concat(imagenes);
  $('f-imagen-sel').innerHTML = lista
    .map(i => `<option value="${esc(i)}" ${i === imagenActual ? 'selected' : ''}>${esc(i)}</option>`)
    .join('');
}

function elegirImagen(v) { imagenActual = v; mostrarImagen(); }

// Reduce la foto a 800 px para que la tienda cargue rápido
async function reducirImagen(archivo, max) {
  max = max || 600;
  const bmp = await createImageBitmap(archivo);
  const escala = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const w = Math.round(bmp.width * escala);
  const h = Math.round(bmp.height * escala);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bmp, 0, 0, w, h);
  const codificar = (tipo, calidad) => new Promise(ok => c.toBlob(ok, tipo, calidad));
  let blob = await codificar('image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await codificar('image/jpeg', 0.82);
  if (!blob) throw new Error('No se pudo procesar la imagen');
  return blob;
}

async function subirFoto(input) {
  const archivo = input.files[0];
  input.value = '';
  if (!archivo) return;
  $('f-subiendo').style.display = 'block';
  try {
    const blob = await reducirImagen(archivo);
    const nombre = $('f-nombre').value.trim() || archivo.name;
    const r = await api('/api/admin/imagenes?nombre=' + encodeURIComponent(nombre), {
      method: 'POST',
      headers: { 'Content-Type': blob.type },
      body: blob
    });
    imagenes.push(r.archivo);
    imagenes.sort();
    imagenActual = r.archivo;
    mostrarImagen();
    toast('Foto subida');
  } catch (e) { toast(e.message, true); }
  $('f-subiendo').style.display = 'none';
}

async function guardar() {
  const oferta = $('f-oferta').checked;
  const datos = {
    nombre: $('f-nombre').value.trim(),
    categoria: $('f-categoria').value.trim(),
    unidad: $('f-unidad').value,
    precio: num($('f-precio').value),
    oferta: oferta,
    precio_oferta: oferta ? num($('f-precio-oferta').value) : null,
    imagen: imagenActual,
    activo: $('f-activo').checked
  };

  let error = '';
  if (!datos.nombre) error = 'Escribe el nombre del producto.';
  else if (!datos.categoria) error = 'Escribe o elige una categoría.';
  else if (!Number.isFinite(datos.precio) || datos.precio < 0) error = 'El precio no es válido.';
  else if (oferta && (!Number.isFinite(datos.precio_oferta) || datos.precio_oferta >= datos.precio))
    error = 'El precio de oferta debe ser menor al precio normal.';
  $('f-error').textContent = error;
  if (error) return;

  try {
    const url = editandoId ? '/api/admin/productos/' + editandoId : '/api/admin/productos';
    const guardado = await api(url, {
      method: editandoId ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    });
    reemplazar(guardado);
    cerrarForm();
    toast('Producto guardado');
  } catch (e) { $('f-error').textContent = e.message; }
}

async function eliminarProducto() {
  const p = productos.find(x => x.id === editandoId);
  if (!p) return;
  if (!confirm('¿Eliminar "' + p.nombre + '"? No se puede deshacer. Si solo quieres sacarlo de la tienda, mejor ocúltalo.')) return;
  try {
    await api('/api/admin/productos/' + p.id, { method: 'DELETE' });
    productos = productos.filter(x => x.id !== p.id);
    render();
    cerrarForm();
    toast('Producto eliminado');
  } catch (e) { toast(e.message, true); }
}

window.addEventListener('load', iniciar);

async function salir() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  location.href = '/login';
}
