const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const { authStaff } = require('./auth');
const ventana = require('./ventana');

const CSV_PATH = path.join(__dirname, 'data', 'productos.csv');
const PEDIDOS_PATH = path.join(__dirname, 'data', 'pedidos.json');
const LETRAS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

// Estados a los que se puede pasar desde cada uno (el vendedor; el admin puede todo)
const PERMITIDAS = {
  en_espera: ['en_proceso', 'pagado', 'cancelado'],
  en_proceso: ['en_espera', 'pagado', 'cancelado'],
  pagado: [],
  cancelado: []
};
const GRUPOS = {
  pendientes: ['en_espera', 'en_proceso'],
  pagados: ['pagado'],
  cancelados: ['cancelado']
};

// ---------- Utilidades ----------
function redondear(n) { return Math.round(n * 100) / 100; }
function hash(x) { return crypto.createHash('sha256').update(String(x)).digest('hex'); }
function normalizarCodigo(c) { return String(c || '').toUpperCase().replace(/\s+/g, ''); }

function leerProductos() {
  const texto = fs.readFileSync(CSV_PATH, 'utf8');
  return parse(texto, { columns: true, skip_empty_lines: true, bom: true, trim: true }).map(f => ({
    id: Number(f.id),
    nombre: f.nombre,
    precio: Number(f.precio),
    unidad: f.unidad,
    oferta: f.oferta === 'true',
    precio_oferta: f.precio_oferta ? Number(f.precio_oferta) : null,
    activo: f.activo !== 'false'
  }));
}
function precioActual(p) {
  return p.oferta && p.precio_oferta != null && p.precio_oferta < p.precio ? p.precio_oferta : p.precio;
}

function leerPedidos() {
  if (!fs.existsSync(PEDIDOS_PATH)) return { ultimo: 0, pedidos: [] };
  return JSON.parse(fs.readFileSync(PEDIDOS_PATH, 'utf8'));
}
function guardarPedidos(db) {
  const tmp = PEDIDOS_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, PEDIDOS_PATH); // escritura segura
}

// Cola: dos cambios simultáneos no se pisan
let cola = Promise.resolve();
function enSerie(fn) {
  const p = cola.then(fn);
  cola = p.catch(() => {});
  return p;
}

function codigoDe(id) {
  let s = '';
  for (const b of crypto.randomBytes(3)) s += LETRAS[b % LETRAS.length];
  return `GRN-${String(id).padStart(4, '0')}-${s}`;
}
function buscar(db, codigo) {
  const c = normalizarCodigo(codigo);
  return db.pedidos.find(p => normalizarCodigo(p.codigo) === c);
}
function claveOk(p, req) {
  const a = Buffer.from(hash(req.headers['x-clave'] || ''));
  const b = Buffer.from(p.claveHash);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Recalcula precios con los datos del servidor (nunca confía en el celular)
function construirItems(entrada) {
  if (!Array.isArray(entrada) || !entrada.length) return { error: 'El pedido está vacío' };
  if (entrada.length > 100) return { error: 'Demasiados productos' };
  const productos = leerProductos();
  const vistos = new Set();
  const items = [];
  for (const e of entrada) {
    const id = Number(e && e.id);
    const p = productos.find(x => x.id === id && x.activo);
    if (!p) return { error: 'Un producto ya no está disponible' };
    if (vistos.has(id)) return { error: 'Hay un producto repetido' };
    vistos.add(id);
    let cant = Number(e.cantidad);
    if (!Number.isFinite(cant)) return { error: 'Cantidad inválida' };
    cant = p.unidad === 'kg' ? redondear(cant) : Math.round(cant);
    if (cant < (p.unidad === 'kg' ? 0.1 : 1) || cant > 1000) return { error: 'Cantidad inválida' };
    const precio = precioActual(p);
    items.push({ id: p.id, nombre: p.nombre, unidad: p.unidad, precio, cantidad: cant, subtotal: redondear(precio * cant) });
  }
  return { items, total: redondear(items.reduce((s, i) => s + i.subtotal, 0)) };
}

function vistaCliente(p) {
  return { codigo: p.codigo, estado: p.estado, items: p.items, total: p.total, creado: p.creado, actualizado: p.actualizado };
}
function vistaStaff(p) {
  return Object.assign(vistaCliente(p), { cliente: p.cliente, historial: p.historial });
}
function resumen(p) {
  return { codigo: p.codigo, estado: p.estado, total: p.total, productos: p.items.length, creado: p.creado, actualizado: p.actualizado };
}
function responder(res, r, codigoOk) {
  if (r.status) return res.status(r.status).json({ error: r.error || 'No encontrado' });
  res.status(codigoOk || 200).json(r.salida);
}

// Límite: 10 pedidos nuevos por hora desde la misma conexión
const creaciones = new Map();
function limiteExcedido(ip) {
  const ahora = Date.now();
  const l = (creaciones.get(ip) || []).filter(t => ahora - t < 3600000);
  creaciones.set(ip, l);
  return l.length >= 10;
}
function anotarCreacion(ip) {
  const l = creaciones.get(ip) || [];
  l.push(Date.now());
  creaciones.set(ip, l);
}

module.exports = function (app) {
  ventana.instalar(app);

  // ===== Públicas (el cliente) =====

  // Crear pedido
  app.post('/api/pedidos', (req, res) => {
    const cerrado = ventana.bloqueo();
    if (cerrado) return res.status(403).json({ error: cerrado });
    if (limiteExcedido(req.ip)) return res.status(429).json({ error: 'Demasiados pedidos. Intenta más tarde.' });
    const body = req.body || {};
    const r = construirItems(body.items);
    if (r.error) return res.status(400).json({ error: r.error });
    anotarCreacion(req.ip);
    // Identificador anónimo del celular (sin datos personales)
    const cliente = String(body.cliente || '').replace(/[^a-zA-Z0-9-]/g, '').slice(0, 40);

    enSerie(() => {
      const db = leerPedidos();
      db.ultimo++;
      const clave = crypto.randomBytes(16).toString('hex');
      const ahora = new Date().toISOString();
      const pedido = {
        id: db.ultimo, codigo: codigoDe(db.ultimo), cliente,
        items: r.items, total: r.total, estado: 'en_espera',
        creado: ahora, actualizado: ahora, claveHash: hash(clave),
        historial: [{ evento: 'creado', por: 'cliente', fecha: ahora }]
      };
      db.pedidos.push(pedido);
      guardarPedidos(db);
      return { salida: Object.assign(vistaCliente(pedido), { clave }) };
    }).then(r2 => responder(res, r2, 201))
      .catch(() => res.status(500).json({ error: 'No se pudo crear el pedido' }));
  });

  // Ver el estado de mi pedido (requiere la clave guardada en el celular)
  app.get('/api/pedidos/:codigo', (req, res) => {
    try {
      const p = buscar(leerPedidos(), req.params.codigo);
      if (!p || !claveOk(p, req)) return res.status(404).json({ error: 'No encontrado' });
      res.json(vistaCliente(p));
    } catch (e) { res.status(500).json({ error: 'Error al leer el pedido' }); }
  });

  // Modificar mi pedido (solo en espera)
  app.put('/api/pedidos/:codigo', (req, res) => {
    const cerrado = ventana.bloqueo();
    if (cerrado) return res.status(403).json({ error: cerrado });
    const r = construirItems((req.body || {}).items);
    if (r.error) return res.status(400).json({ error: r.error });
    enSerie(() => {
      const db = leerPedidos();
      const p = buscar(db, req.params.codigo);
      if (!p || !claveOk(p, req)) return { status: 404 };
      if (p.estado !== 'en_espera') return { status: 409, error: 'El pedido ya no se puede modificar' };
      const ahora = new Date().toISOString();
      p.items = r.items;
      p.total = r.total;
      p.actualizado = ahora;
      p.historial.push({ evento: 'modificado', por: 'cliente', fecha: ahora });
      guardarPedidos(db);
      return { salida: vistaCliente(p) };
    }).then(r2 => responder(res, r2))
      .catch(() => res.status(500).json({ error: 'No se pudo modificar' }));
  });

  // Cancelar mi pedido (solo en espera)
  app.post('/api/pedidos/:codigo/cancelar', (req, res) => {
    enSerie(() => {
      const db = leerPedidos();
      const p = buscar(db, req.params.codigo);
      if (!p || !claveOk(p, req)) return { status: 404 };
      if (p.estado !== 'en_espera') return { status: 409, error: 'El pedido ya no se puede cancelar' };
      const ahora = new Date().toISOString();
      p.estado = 'cancelado';
      p.actualizado = ahora;
      p.historial.push({ evento: 'cancelado', por: 'cliente', fecha: ahora });
      guardarPedidos(db);
      return { salida: vistaCliente(p) };
    }).then(r2 => responder(res, r2))
      .catch(() => res.status(500).json({ error: 'No se pudo cancelar' }));
  });

  // ===== Vendedor y admin =====
  app.use('/vendedor', authStaff); // protege el futuro panel del vendedor

  // Lista: ?estado=pendientes|pagados|cancelados|todos &q=comprobante &orden=recientes|antiguos|mayor|menor
  app.get('/api/staff/pedidos', authStaff, (req, res) => {
    try {
      const db = leerPedidos();
      const grupo = String(req.query.estado || 'pendientes');
      const q = normalizarCodigo(req.query.q);
      const orden = String(req.query.orden || 'recientes');

      let lista = db.pedidos.filter(p =>
        grupo === 'todos' || (GRUPOS[grupo] || GRUPOS.pendientes).includes(p.estado));
      if (q) lista = lista.filter(p => normalizarCodigo(p.codigo).includes(q));

      const orden_fn = {
        recientes: (a, b) => b.id - a.id,
        antiguos: (a, b) => a.id - b.id,
        mayor: (a, b) => b.total - a.total,
        menor: (a, b) => a.total - b.total
      }[orden] || ((a, b) => b.id - a.id);
      lista.sort(orden_fn);

      const cuenta = e => db.pedidos.filter(p => p.estado === e).length;
      res.json({
        conteos: {
          en_espera: cuenta('en_espera'), en_proceso: cuenta('en_proceso'),
          pagado: cuenta('pagado'), cancelado: cuenta('cancelado')
        },
        pedidos: lista.map(resumen)
      });
    } catch (e) { res.status(500).json({ error: 'Error al leer pedidos' }); }
  });

  // Detalle de un pedido (por comprobante)
  app.get('/api/staff/pedidos/:codigo', authStaff, (req, res) => {
    try {
      const p = buscar(leerPedidos(), req.params.codigo);
      if (!p) return res.status(404).json({ error: 'No encontrado' });
      res.json(vistaStaff(p));
    } catch (e) { res.status(500).json({ error: 'Error al leer el pedido' }); }
  });

  // Resumen para el admin: ?desde=ISO&hasta=ISO&base=pagados|vigentes
  app.get('/api/admin/resumen', (req, res) => {
    try {
      const db = leerPedidos();
      const num = (x, vacio) => { const d = Date.parse(x); return Number.isFinite(d) ? d : vacio; };
      const desde = num(req.query.desde, -Infinity);
      const hasta = num(req.query.hasta, Infinity);
      const base = req.query.base === 'vigentes' ? 'vigentes' : 'pagados';

      const enRango = db.pedidos.filter(p => {
        const t = Date.parse(p.creado);
        return t >= desde && t < hasta;
      });
      const por = e => enRango.filter(p => p.estado === e);
      const suma = l => redondear(l.reduce((s, p) => s + p.total, 0));

      const pagados = por('pagado');
      const espera = por('en_espera');
      const proceso = por('en_proceso');
      const cancelados = por('cancelado');
      const pendientes = espera.concat(proceso);

      const clientes = new Set(enRango.filter(p => p.estado !== 'cancelado' && p.cliente).map(p => p.cliente));
      const clientesPagaron = new Set(pagados.filter(p => p.cliente).map(p => p.cliente));

      const fuente = base === 'vigentes' ? pagados.concat(pendientes) : pagados;
      const mapa = new Map();
      for (const p of fuente) {
        for (const i of p.items) {
          const k = i.id + '|' + i.unidad;
          const f = mapa.get(k) || { id: i.id, nombre: i.nombre, unidad: i.unidad, cantidad: 0, monto: 0 };
          f.cantidad = redondear(f.cantidad + i.cantidad);
          f.monto = redondear(f.monto + i.subtotal);
          mapa.set(k, f);
        }
      }

      res.json({
        pagados: { cantidad: pagados.length, total: suma(pagados), promedio: pagados.length ? redondear(suma(pagados) / pagados.length) : 0 },
        pendientes: { cantidad: pendientes.length, total: suma(pendientes), en_espera: espera.length, en_proceso: proceso.length },
        cancelados: { cantidad: cancelados.length },
        clientes: clientes.size,
        clientesPagaron: clientesPagaron.size,
        productos: Array.from(mapa.values()).sort((a, b) => b.monto - a.monto),
        comprobantes: pagados.map(p => ({ codigo: p.codigo, fecha: p.creado, total: p.total }))
      });
    } catch (e) { res.status(500).json({ error: 'Error al calcular el resumen' }); }
  });

  // Quién soy (para que el panel sepa qué botones mostrar)
  app.get('/api/staff/yo', authStaff, (req, res) => res.json({ rol: req.rol, usuario: req.usuario }));

  // Cerrar sesión
  app.post('/api/logout', (req, res) => {
    res.setHeader('Set-Cookie', 'gringo_admin=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    res.json({ ok: true });
  });

  // Cambiar estado
  app.put('/api/staff/pedidos/:codigo/estado', authStaff, (req, res) => {
    const nuevo = String((req.body || {}).estado || '');
    if (!Object.keys(PERMITIDAS).includes(nuevo)) return res.status(400).json({ error: 'Estado inválido' });
    enSerie(() => {
      const db = leerPedidos();
      const p = buscar(db, req.params.codigo);
      if (!p) return { status: 404 };
      if (p.estado === nuevo) return { salida: vistaStaff(p) };
      if (req.rol !== 'admin' && !PERMITIDAS[p.estado].includes(nuevo))
        return { status: 409, error: 'Este cambio de estado solo lo puede hacer el admin' };
      const ahora = new Date().toISOString();
      p.estado = nuevo;
      p.actualizado = ahora;
      p.historial.push({ evento: nuevo, por: req.usuario, fecha: ahora });
      guardarPedidos(db);
      return { salida: vistaStaff(p) };
    }).then(r2 => responder(res, r2))
      .catch(() => res.status(500).json({ error: 'No se pudo cambiar el estado' }));
  });
};
