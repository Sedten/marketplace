const NEGOCIO = 'El Gringo despensa';
let ANCHO = 576;
let TERMICO = false;
const M = 24;        // margen
let ESCALA = 2;
const FUENTE = '"Courier New", Courier, monospace';
const ESTADOS = { en_espera: 'En espera', en_proceso: 'En proceso', pagado: 'Pagado', cancelado: 'Cancelado' };

let pedido = null;
let lienzoActual = null;
let tDibujo = null;

const $ = id => document.getElementById(id);
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

// Parte el texto en líneas que quepan en el ancho indicado
function envolver(ctx, texto, anchoMax) {
  const lineas = [];
  let actual = '';
  for (const w of String(texto).split(/\s+/).filter(Boolean)) {
    const prueba = actual ? actual + ' ' + w : w;
    if (!actual || ctx.measureText(prueba).width <= anchoMax) actual = prueba;
    else { lineas.push(actual); actual = w; }
  }
  if (actual) lineas.push(actual);
  return lineas;
}

// Dibuja el remito y devuelve el alto total usado
function trazar(ctx, p, d) {
  const der = ANCHO - M;
  const centro = ANCHO / 2;
  let y = 40;

  const texto = (t, x, tam, o) => {
    o = o || {};
    ctx.font = (o.negrita ? 'bold ' : '') + tam + 'px ' + FUENTE;
    ctx.textAlign = o.alinear || 'left';
    ctx.fillStyle = TERMICO ? '#000000' : (o.color || '#111111');
    ctx.fillText(t, x, y);
  };
  const separador = () => {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = TERMICO ? '#000000' : '#666666';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(M, y);
    ctx.lineTo(der, y);
    ctx.stroke();
    ctx.restore();
    y += 26;
  };
  const parrafo = (t, tam, o) => {
    ctx.font = ((o && o.negrita) ? 'bold ' : '') + tam + 'px ' + FUENTE;
    for (const l of envolver(ctx, t, der - M)) {
      texto(l, M, tam, o);
      y += tam + 7;
    }
  };

  // Encabezado
  texto(NEGOCIO, centro, 28, { negrita: true, alinear: 'center' }); y += 30;
  texto('REMITO DE PEDIDO', centro, 18, { alinear: 'center' }); y += 32;
  texto(p.codigo, centro, 28, { negrita: true, alinear: 'center' }); y += 28;
  const fecha = new Date(p.creado).toLocaleString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false
  });
  texto(fecha, centro, 16, { alinear: 'center' }); y += 22;
  texto('No válido como factura', centro, 15, { alinear: 'center', color: '#555555' }); y += 18;
  separador();

  // Datos del cliente (solo si se completaron)
  if (d.cliente) parrafo('Cliente: ' + d.cliente, 18, { negrita: true });
  if (d.unidad) parrafo('Pabellón/Casa: ' + d.unidad, 17);
  if (d.remito) parrafo('Remito proveedor: ' + d.remito, 17);
  if (d.cliente || d.unidad || d.remito) { y += 2; separador(); }

  // Encabezado de columnas
  texto('Cant', M, 16, { negrita: true });
  texto('Descripción', M + 84, 16, { negrita: true });
  texto('Subtotal', der, 16, { negrita: true, alinear: 'right' });
  y += 14;
  separador();

  // Productos
  for (const i of p.items) {
    const kg = i.unidad === 'kg';
    ctx.font = '17px ' + FUENTE;
    const lineas = envolver(ctx, i.nombre, der - 130 - (M + 84));
    texto(kg ? textoNumero(i.cantidad) + 'kg' : String(i.cantidad), M, 17, { negrita: true });
    texto(dinero(i.subtotal), der, 17, { negrita: true, alinear: 'right' });
    lineas.forEach((l, n) => {
      texto(l, M + 84, 17);
      if (n < lineas.length - 1) y += 22;
    });
    y += 20;
    texto(dinero(i.precio) + (kg ? ' por kg' : ' c/u'), M + 84, 14, { color: '#666666' });
    y += 28;
  }
  separador();

  // Total
  texto('TOTAL', M, 26, { negrita: true });
  texto(dinero(p.total), der, 28, { negrita: true, alinear: 'right' });
  y += 36;
  texto('Estado: ' + (ESTADOS[p.estado] || p.estado), M, 16);
  y += 26;

  if (d.nota) { y += 4; parrafo('Nota: ' + d.nota, 16); }

  separador();
  texto('Muchas gracias por su compra', centro, 17, { alinear: 'center' });
  y += 16;
  return y + 20;
}

function dibujarRemito(lienzo, p, d) {
  const medidor = document.createElement('canvas').getContext('2d');
  const alto = Math.ceil(trazar(medidor, p, d));
  lienzo.width = ANCHO * ESCALA;
  lienzo.height = alto * ESCALA;
  const ctx = lienzo.getContext('2d');
  ctx.scale(ESCALA, ESCALA);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, ANCHO, alto);
  trazar(ctx, p, d);
}

function leerDatos() {
  return {
    cliente: $('cliente').value.trim(),
    unidad: $('unidad').value.trim(),
    remito: $('remito').value.trim(),
    nota: $('nota').value.trim()
  };
}

function dibujar() {
  if (!pedido) return;
  const lienzo = document.createElement('canvas');
  dibujarRemito(lienzo, pedido, leerDatos());
  lienzoActual = lienzo;
  $('vista').src = lienzo.toDataURL('image/png');
}

// ---------- Acciones ----------
function aBlob() {
  return new Promise(ok => lienzoActual.toBlob(ok, 'image/png'));
}

async function descargarImagen() {
  if (!lienzoActual) return;
  const blob = await aBlob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'remito-' + pedido.codigo + '.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Imagen guardada en descargas');
}

async function compartirImagen() {
  if (!lienzoActual) return;
  const blob = await aBlob();
  const archivo = new File([blob], 'remito-' + pedido.codigo + '.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Remito ' + pedido.codigo }); } catch (e) {}
  } else {
    descargarImagen();
  }
}

async function iniciar() {
  const codigo = new URLSearchParams(location.search).get('codigo');
  if (!codigo) { toast('Falta el comprobante', true); return; }
  try {
    const r = await fetch('/api/staff/pedidos/' + encodeURIComponent(codigo), { credentials: 'same-origin' });
    if (r.status === 401) { location.href = '/login'; return; }
    if (!r.ok) throw new Error('No se encontró el pedido');
    pedido = await r.json();
  } catch (e) { toast(e.message, true); return; }

  $('codigo').textContent = pedido.codigo;
  ['cliente', 'unidad', 'remito', 'nota'].forEach(id => {
    $(id).addEventListener('input', () => {
      clearTimeout(tDibujo);
      tDibujo = setTimeout(dibujar, 150);
    });
  });
  dibujar();
}

window.addEventListener('load', iniciar);

// ---------- Impresora de tickets (térmica) ----------
const PAPELES = { '58': 384, '80': 576 }; // puntos de impresión según el ancho del papel
let papel = leerPapel();

function leerPapel() {
  try { return localStorage.getItem('elgringo_papel') || '80'; } catch (e) { return '80'; }
}

function aplicarPapel(p) {
  papel = p;
  try { localStorage.setItem('elgringo_papel', p); } catch (e) {}
  ANCHO = PAPELES[p] || 576;
  dibujar();
}

// Todo en blanco o negro puro, sin grises
function aBlancoYNegro(lienzo) {
  const ctx = lienzo.getContext('2d');
  const img = ctx.getImageData(0, 0, lienzo.width, lienzo.height);
  const px = img.data;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = l < 170 ? 0 : 255;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

// Imagen del tamaño exacto de la impresora (1 píxel = 1 punto)
function imagenTermica() {
  const escalaAntes = ESCALA;
  const termicoAntes = TERMICO;
  ESCALA = 1;
  TERMICO = true;
  const lienzo = document.createElement('canvas');
  dibujarRemito(lienzo, pedido, leerDatos());
  ESCALA = escalaAntes;
  TERMICO = termicoAntes;
  aBlancoYNegro(lienzo);
  return lienzo;
}

function blobTermico() {
  return new Promise(ok => imagenTermica().toBlob(ok, 'image/png'));
}

function guardarBlob(blob, nombre) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast('Imagen guardada en descargas');
}

async function descargarTermica() {
  if (!pedido) return;
  guardarBlob(await blobTermico(), 'ticket-' + pedido.codigo + '.png');
}

async function compartirTermica() {
  if (!pedido) return;
  const blob = await blobTermico();
  const archivo = new File([blob], 'ticket-' + pedido.codigo + '.png', { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Ticket ' + pedido.codigo }); } catch (e) {}
  } else {
    guardarBlob(blob, archivo.name);
  }
}

window.addEventListener('load', () => {
  ANCHO = PAPELES[papel] || 576;
  const botones = document.querySelector('.no-imprimir.grid');
  if (!botones) return;
  botones.insertAdjacentHTML('afterend', `
    <div class="no-imprimir mt-4 rounded-2xl bg-white border border-slate-100 p-3">
      <p class="text-xs font-bold text-slate-500 mb-2"><i class="fa-solid fa-receipt mr-1"></i>Impresora de tickets</p>
      <div class="flex items-center gap-2 mb-2">
        <label class="text-[11px] font-semibold text-slate-500" for="papel">Ancho del papel</label>
        <select id="papel" class="campo" style="width:auto;padding:.35rem .6rem;font-size:.8rem">
          <option value="58">58 mm</option>
          <option value="80">80 mm</option>
        </select>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <button onclick="compartirTermica()" class="bg-emerald-600 active:bg-emerald-700 text-white text-xs font-semibold py-3 rounded-2xl">
          <i class="fa-solid fa-print mr-1"></i>Enviar a impresora
        </button>
        <button onclick="descargarTermica()" class="bg-white border border-slate-200 text-slate-700 text-xs font-semibold py-3 rounded-2xl">
          <i class="fa-solid fa-image mr-1"></i>Guardar imagen
        </button>
      </div>
      <p class="text-[11px] text-slate-400 mt-2">Se abre el menú de compartir: elige la app de tu impresora.</p>
    </div>`);
  document.getElementById('papel').value = papel;
  document.getElementById('papel').addEventListener('change', e => aplicarPapel(e.target.value));
});
