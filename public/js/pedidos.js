const CLAVE_PEDIDOS = 'elgringo_pedidos';
const CLAVE_CLIENTE = 'elgringo_cliente';
const CLAVE_EDICION = 'elgringo_editando';
const $ = id => document.getElementById(id);

const ESTADOS = {
  en_espera: { texto: 'En espera', clase: 'bg-amber-100 text-amber-700', ayuda: 'Compártelo con el vendedor para que lo atienda.' },
  en_proceso: { texto: 'En proceso', clase: 'bg-sky-100 text-sky-700', ayuda: 'El vendedor ya lo está atendiendo. Sigue sus indicaciones para pagar.' },
  pagado: { texto: 'Pagado', clase: 'bg-emerald-100 text-emerald-700', ayuda: 'Pago confirmado. ¡Gracias!' },
  cancelado: { texto: 'Cancelado', clase: 'bg-slate-200 text-slate-600', ayuda: 'Este pedido fue cancelado.' },
  desconocido: { texto: 'No disponible', clase: 'bg-rose-100 text-rose-600', ayuda: 'No se encontró este pedido en el servidor.' }
};

function leerLS(clave, defecto) {
  try {
    const v = JSON.parse(localStorage.getItem(clave));
    return v == null ? defecto : v;
  } catch (e) { return defecto; }
}
function escribirLS(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch (e) {}
}

let misPedidos = leerLS(CLAVE_PEDIDOS, []);
let editando = leerLS(CLAVE_EDICION, null);
let resaltado = null;

function guardarMisPedidos() {
  misPedidos = misPedidos.slice(0, 30);
  escribirLS(CLAVE_PEDIDOS, misPedidos);
}

// Identificador anónimo del celular (sin datos personales)
function idCliente() {
  try {
    let id = localStorage.getItem(CLAVE_CLIENTE);
    if (!id) {
      const b = new Uint8Array(6);
      crypto.getRandomValues(b);
      id = 'c-' + Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(CLAVE_CLIENTE, id);
    }
    return id;
  } catch (e) { return ''; }
}

async function apiPedidos(url, metodo, cuerpo, clave) {
  const opciones = { method: metodo || 'GET', headers: {} };
  if (cuerpo) {
    opciones.headers['Content-Type'] = 'application/json';
    opciones.body = JSON.stringify(cuerpo);
  }
  if (clave) opciones.headers['X-Clave'] = clave;
  const r = await fetch(url, opciones);
  const datos = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(datos.error || 'Error ' + r.status);
    e.status = r.status;
    throw e;
  }
  return datos;
}

// ---------- Pestañas del modal ----------
function mostrarTab(t) {
  const enCarrito = t === 'carrito';
  $('panel-carrito').style.display = enCarrito ? 'flex' : 'none';
  $('panel-pedidos').style.display = enCarrito ? 'none' : 'flex';
  $('tab-carrito').className = 'px-4 py-1.5 rounded-full ' + (enCarrito ? 'bg-white shadow text-slate-900' : 'text-slate-500');
  $('tab-pedidos').className = 'px-4 py-1.5 rounded-full ' + (!enCarrito ? 'bg-white shadow text-slate-900' : 'text-slate-500');
  if (!enCarrito) {
    renderPedidos();
    refrescarEstados();
  }
}

// El botón del carrito siempre abre en la pestaña "Carrito"
const abrirCarritoBase = abrirCarrito;
abrirCarrito = function () {
  abrirCarritoBase();
  mostrarTab('carrito');
};

function actualizarModoEdicion() {
  const e = !!editando;
  $('aviso-edicion').style.display = e ? 'block' : 'none';
  $('aviso-edicion-codigo').textContent = editando || '';
  $('btn-comprar').textContent = e ? 'Guardar cambios' : 'Comprar';
  $('btn-cancelar-edicion').style.display = e ? 'block' : 'none';
  $('btn-vaciar').style.display = e ? 'none' : 'block';
}

function salirEdicion() {
  editando = null;
  escribirLS(CLAVE_EDICION, null);
  actualizarModoEdicion();
}

function cancelarEdicion() {
  carrito = {};
  guardarCarrito();
  salirEdicion();
  actualizarCarritoUI();
  toast('Edición cancelada');
}

// ---------- Comprar / guardar cambios ----------
async function comprar() {
  const items = Object.entries(carrito)
    .filter(([id]) => buscarProducto(id))
    .map(([id, q]) => ({ id: Number(id), cantidad: q }));
  if (!items.length) { toast('Tu carrito está vacío'); return; }

  const btn = $('btn-comprar');
  btn.disabled = true;
  try {
    let codigo;
    if (editando) {
      const p = misPedidos.find(x => x.codigo === editando);
      if (!p) { salirEdicion(); throw new Error('No se encontró el pedido a modificar'); }
      const d = await apiPedidos('/api/pedidos/' + p.codigo, 'PUT', { items }, p.clave);
      Object.assign(p, d, { modificado: true });
      codigo = p.codigo;
      toast('Pedido actualizado');
    } else {
      const d = await apiPedidos('/api/pedidos', 'POST', { items, cliente: idCliente() });
      misPedidos.unshift(d);
      codigo = d.codigo;
      toast('Pedido creado');
    }
    guardarMisPedidos();
    carrito = {};
    guardarCarrito();
    salirEdicion();
    actualizarCarritoUI();
    resaltado = codigo;
    mostrarTab('pedidos');
  } catch (e) {
    if (!editando && (e.status === 404 || e.status === 405)) {
      // Sin servidor de pedidos (versión de prueba): envía la lista por WhatsApp
      ordenarPedido();
    } else {
      if (editando && e.status === 404) salirEdicion();
      toast(e.message || 'No se pudo completar. Intenta de nuevo.');
    }
  }
  btn.disabled = false;
}

// ---------- Acciones sobre un pedido ----------
function compartir(codigo) {
  const p = misPedidos.find(x => x.codigo === codigo);
  if (!p) return;
  const lineas = ['*Pedido El Gringo*', 'Comprobante: ' + p.codigo, 'Total a pagar: ' + dinero(p.total)];
  if (p.modificado) lineas.push('(ACTUALIZADO)');
  window.location.href = 'https://wa.me/?text=' + encodeURIComponent(lineas.join('\n'));
}

function modificar(codigo) {
  const p = misPedidos.find(x => x.codigo === codigo);
  if (!p || p.estado !== 'en_espera') return;
  if (Object.keys(carrito).length && !confirm('Tu carrito actual se reemplazará por los productos de este pedido. ¿Continuar?')) return;

  carrito = {};
  let perdidos = 0;
  for (const i of p.items) {
    if (buscarProducto(i.id)) carrito[i.id] = i.cantidad;
    else perdidos++;
  }
  guardarCarrito();
  editando = codigo;
  escribirLS(CLAVE_EDICION, codigo);
  actualizarCarritoUI();
  actualizarModoEdicion();
  mostrarTab('carrito');
  if (perdidos) toast(perdidos + ' producto(s) ya no están disponibles');
}

async function cancelarPedido(codigo) {
  const p = misPedidos.find(x => x.codigo === codigo);
  if (!p || !confirm('¿Cancelar el pedido ' + codigo + '?')) return;
  try {
    const d = await apiPedidos('/api/pedidos/' + codigo + '/cancelar', 'POST', null, p.clave);
    Object.assign(p, d);
    if (editando === codigo) {
      carrito = {};
      guardarCarrito();
      salirEdicion();
      actualizarCarritoUI();
    }
    toast('Pedido cancelado');
  } catch (e) {
    toast(e.message || 'No se pudo cancelar');
    refrescarEstados();
    return;
  }
  guardarMisPedidos();
  renderPedidos();
}

function quitarPedido(codigo) {
  misPedidos = misPedidos.filter(x => x.codigo !== codigo);
  guardarMisPedidos();
  renderPedidos();
}

// Consulta al servidor el estado actual de los pedidos abiertos
async function refrescarEstados() {
  const abiertos = misPedidos.filter(p => p.estado === 'en_espera' || p.estado === 'en_proceso');
  if (!abiertos.length) return;
  await Promise.all(abiertos.map(async p => {
    try {
      const d = await apiPedidos('/api/pedidos/' + p.codigo, 'GET', null, p.clave);
      Object.assign(p, d);
    } catch (e) {
      if (e.status === 404) p.estado = 'desconocido';
    }
  }));
  guardarMisPedidos();
  renderPedidos();
}

// ---------- Lista "Mis pedidos" ----------
function renderPedidos() {
  const cont = $('lista-pedidos');
  if (!misPedidos.length) {
    cont.innerHTML = `
      <div class="text-center py-10 text-slate-400">
        <i class="fa-solid fa-receipt text-3xl mb-2"></i>
        <p class="text-sm">Aún no tienes pedidos</p>
      </div>`;
    return;
  }

  cont.innerHTML = misPedidos.map(p => {
    const e = ESTADOS[p.estado] || ESTADOS.desconocido;
    const activo = p.estado === 'en_espera' || p.estado === 'en_proceso';
    const fecha = new Date(p.creado).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    const filas = (p.items || []).map(i => `
      <li class="flex justify-between gap-2">
        <span>${i.unidad === 'kg' ? textoNumero(i.cantidad) + ' kg' : i.cantidad + ' ×'} ${esc(i.nombre)}</span>
        <span class="shrink-0">${dinero(i.subtotal)}</span>
      </li>`).join('');

    return `
      <div class="rounded-2xl bg-slate-50 p-3 border ${p.codigo === resaltado ? 'border-emerald-500 ring-2 ring-emerald-100' : 'border-slate-100'}">
        <div class="flex items-center justify-between">
          <span class="text-[10px] text-slate-400">${fecha}</span>
          <span class="text-[10px] font-bold px-2 py-0.5 rounded-full ${e.clase}">${e.texto}</span>
        </div>
        <p class="text-center font-mono font-bold tracking-wider text-slate-900 text-lg mt-1 select-all">${esc(p.codigo)}</p>
        <p class="text-center text-xs text-slate-500">Total a pagar <b class="text-slate-900">${dinero(p.total)}</b></p>
        <p class="text-center text-[11px] text-slate-400 mt-1">${e.ayuda}</p>
        <details class="mt-2">
          <summary class="text-xs text-slate-500 cursor-pointer">Ver productos (${(p.items || []).length})</summary>
          <ul class="mt-2 space-y-1 text-xs text-slate-600">${filas}</ul>
        </details>
        ${activo ? `
          <button onclick="compartir('${p.codigo}')" class="w-full bg-emerald-600 active:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-xl mt-3">
            <i class="fa-brands fa-whatsapp mr-1"></i>Compartir por WhatsApp
          </button>` : ''}
        ${p.estado === 'en_espera' ? `
          <div class="flex gap-2 mt-2">
            <button onclick="modificar('${p.codigo}')" class="flex-1 bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-2 rounded-xl">Modificar</button>
            <button onclick="cancelarPedido('${p.codigo}')" class="flex-1 bg-white border border-slate-200 text-rose-600 text-xs font-semibold py-2 rounded-xl">Cancelar</button>
          </div>` : ''}
        ${!activo ? `<button onclick="quitarPedido('${p.codigo}')" class="w-full text-xs text-slate-400 mt-2">Quitar de la lista</button>` : ''}
      </div>`;
  }).join('');
}

window.addEventListener('load', () => {
  // Si había una edición pendiente de un pedido que ya no existe, se descarta
  if (editando && !misPedidos.find(p => p.codigo === editando)) salirEdicion();
  actualizarModoEdicion();
  renderPedidos();
});


// ---------- Ventana de pedidos (avisos de horarios) ----------
let ventanaEstado = null;

function nombreDia(d) { return ((ventanaEstado && ventanaEstado.nombres) || {})[d] || d; }
function enHorario(h) { return 'el ' + nombreDia(h.dia) + ' a las ' + h.hora; }

function duracionTexto(min) {
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const partes = [];
  if (d) partes.push(d + ' d');
  if (h) partes.push(h + ' h');
  if (!d && m) partes.push(m + ' min');
  return partes.join(' ') || 'menos de 1 min';
}

function textoCerrado() {
  if (!ventanaEstado) return '';
  return 'Los pedidos están cerrados. ' + (ventanaEstado.modo === 'cerrado'
    ? 'El administrador los cerró por ahora.'
    : 'Se abren ' + enHorario(ventanaEstado.horarios.abre) + '.');
}

function renderBanner() {
  const cont = $('banner-ventana');
  const aviso = $('aviso-pago-pedidos');
  const e = ventanaEstado;
  if (!e) {
    if (cont) cont.innerHTML = '';
    if (aviso) aviso.style.display = 'none';
    return;
  }
  const h = e.horarios;
  let principal;
  if (e.abierto) {
    const resto = e.modo === 'auto' && e.minutosParaCerrar != null
      ? ' · faltan ' + duracionTexto(e.minutosParaCerrar)
      : (e.modo === 'abierto' ? ' · abierto por el administrador' : '');
    principal = `
      <div class="rounded-2xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-xs text-emerald-800">
        <b>Pedidos abiertos</b> hasta ${enHorario(h.cierra)}<span class="opacity-70">${resto}</span>
      </div>`;
  } else {
    const resto = e.modo === 'auto' && e.minutosParaAbrir != null ? ' · en ' + duracionTexto(e.minutosParaAbrir) : '';
    principal = `
      <div class="rounded-2xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-xs text-rose-800">
        <b>Pedidos cerrados.</b> ${e.modo === 'cerrado' ? 'El administrador los cerró por ahora.' : 'Se abren ' + enHorario(h.abre)}<span class="opacity-70">${resto}</span>
      </div>`;
  }
  if (cont) cont.innerHTML = principal + `
    <div class="rounded-2xl bg-amber-50 border border-amber-300 px-3 py-2.5 text-xs text-amber-900 flex gap-2">
      <i class="fa-solid fa-triangle-exclamation mt-0.5"></i>
      <span><b>Importante:</b> el pago se acepta hasta ${enHorario(h.pago)}.</span>
    </div>`;

  if (aviso) {
    aviso.style.display = 'block';
    aviso.innerHTML = '<i class="fa-solid fa-triangle-exclamation mr-1"></i>Recuerda pagar hasta ' + enHorario(h.pago) + '.';
  }
  const btn = $('btn-comprar');
  if (btn) btn.classList.toggle('opacity-50', !e.abierto);
}

async function cargarEstadoVentana() {
  try {
    const r = await fetch('/api/estado', { cache: 'no-store' });
    if (!r.ok) throw new Error('sin servidor de pedidos');
    ventanaEstado = await r.json();
  } catch (e) { ventanaEstado = null; }
  renderBanner();
}

// Si está cerrado, avisa en vez de intentar comprar o modificar
const comprarBase = comprar;
comprar = function () {
  if (ventanaEstado && !ventanaEstado.abierto) { toast(textoCerrado()); return; }
  return comprarBase();
};
const modificarBase = modificar;
modificar = function (codigo) {
  if (ventanaEstado && !ventanaEstado.abierto) { toast(textoCerrado()); return; }
  return modificarBase(codigo);
};

window.addEventListener('load', () => {
  const main = document.querySelector('main');
  if (main) main.insertAdjacentHTML('afterbegin', '<div id="banner-ventana" class="mb-3 space-y-2"></div>');
  const lista = $('lista-pedidos');
  if (lista) lista.insertAdjacentHTML('beforebegin',
    '<div id="aviso-pago-pedidos" style="display:none" class="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-2"></div>');
  cargarEstadoVentana();
  setInterval(cargarEstadoVentana, 60000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') cargarEstadoVentana();
  });
});
