require('dotenv').config();
const { auth, login } = require('./auth');
const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER;
const ADMIN_PASS = process.env.ADMIN_PASS;
const CSV_PATH = path.join(__dirname, 'data', 'productos.csv');
const COLUMNAS = ['id','nombre','precio','imagen','categoria','unidad','oferta','precio_oferta','activo'];
const UNIDADES = ['unidad', 'bulto', 'caja', 'kg'];

if (!ADMIN_USER || !ADMIN_PASS) {
  console.error('Falta ADMIN_USER o ADMIN_PASS en el archivo .env');
  process.exit(1);
}

// ---------- CSV ----------
function leer() {
  const texto = fs.readFileSync(CSV_PATH, 'utf8');
  const filas = parse(texto, { columns: true, skip_empty_lines: true, bom: true, trim: true });
  return filas.map(f => ({
    id: Number(f.id),
    nombre: f.nombre,
    precio: Number(f.precio),
    imagen: f.imagen || 'null.jpg',
    categoria: f.categoria,
    unidad: f.unidad,
    oferta: f.oferta === 'true',
    precio_oferta: f.precio_oferta ? Number(f.precio_oferta) : null,
    activo: f.activo !== 'false'
  }));
}

function guardar(lista) {
  const filas = lista.map(p => ({
    ...p,
    oferta: String(p.oferta),
    precio_oferta: p.precio_oferta ?? '',
    activo: String(p.activo)
  }));
  const csv = stringify(filas, { header: true, columns: COLUMNAS });
  const tmp = CSV_PATH + '.tmp';
  fs.writeFileSync(tmp, csv);
  fs.renameSync(tmp, CSV_PATH); // escritura segura
}

// Cola para que dos cambios simultáneos no se pisen
let cola = Promise.resolve();
function enSerie(fn) {
  const p = cola.then(fn);
  cola = p.catch(() => {});
  return p;
}

// ---------- Validación ----------
function limpiar(b) {
  const nombre = String(b.nombre || '').trim();
  const categoria = String(b.categoria || '').trim();
  const precio = Number(b.precio);
  const oferta = b.oferta === true || b.oferta === 'true';
  const precio_oferta = oferta ? Number(b.precio_oferta) : null;
  const unidad = String(b.unidad || '').trim();
  const imagen = path.basename(String(b.imagen || 'null.jpg').trim()) || 'null.jpg';

  if (!nombre) return { error: 'El nombre es obligatorio' };
  if (!categoria) return { error: 'La categoría es obligatoria' };
  if (!Number.isFinite(precio) || precio < 0) return { error: 'Precio inválido' };
  if (!UNIDADES.includes(unidad)) return { error: 'Unidad inválida' };
  if (oferta && (!Number.isFinite(precio_oferta) || precio_oferta < 0 || precio_oferta >= precio))
    return { error: 'El precio de oferta debe ser menor al precio normal' };

  return {
    producto: {
      nombre, precio, imagen, categoria, unidad, oferta, precio_oferta,
      activo: !(b.activo === false || b.activo === 'false')
    }
  };
}

// ---------- Autenticación (Basic) ----------
function igual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function authVieja(req, res, next) {
  const [tipo, cred] = (req.headers.authorization || '').split(' ');
  if (tipo === 'Basic' && cred) {
    const [u, ...resto] = Buffer.from(cred, 'base64').toString().split(':');
    if (igual(u, ADMIN_USER) && igual(resto.join(':'), ADMIN_PASS)) return next();
  }
  res.set('WWW-Authenticate', 'Basic realm="Admin"');
  res.status(401).send('Acceso restringido');
}

// ---------- Rutas ----------
app.use(express.json());
app.post('/api/login', login);
app.use('/admin', auth);       // protege la página del panel
app.use('/api/admin', auth);   // protege la API de administración

// Pública: solo productos activos
app.get('/api/productos', (req, res) => {
  res.json(leer().filter(p => p.activo));
});

// Admin: todos los productos
app.get('/api/admin/productos', (req, res) => {
  res.json(leer());
});

app.post('/api/admin/productos', (req, res) => {
  const { error, producto } = limpiar(req.body);
  if (error) return res.status(400).json({ error });
  enSerie(() => {
    const lista = leer();
    producto.id = lista.reduce((m, p) => Math.max(m, p.id), 0) + 1;
    lista.push(producto);
    guardar(lista);
    return producto;
  }).then(p => res.status(201).json(p))
    .catch(() => res.status(500).json({ error: 'No se pudo guardar' }));
});

app.put('/api/admin/productos/:id', (req, res) => {
  const id = Number(req.params.id);
  const { error, producto } = limpiar(req.body);
  if (error) return res.status(400).json({ error });
  enSerie(() => {
    const lista = leer();
    const i = lista.findIndex(p => p.id === id);
    if (i === -1) return null;
    lista[i] = { ...producto, id };
    guardar(lista);
    return lista[i];
  }).then(p => p ? res.json(p) : res.status(404).json({ error: 'No existe' }))
    .catch(() => res.status(500).json({ error: 'No se pudo guardar' }));
});

app.delete('/api/admin/productos/:id', (req, res) => {
  const id = Number(req.params.id);
  enSerie(() => {
    const lista = leer();
    const nueva = lista.filter(p => p.id !== id);
    if (nueva.length === lista.length) return false;
    guardar(nueva);
    return true;
  }).then(ok => ok ? res.json({ ok: true }) : res.status(404).json({ error: 'No existe' }))
    .catch(() => res.status(500).json({ error: 'No se pudo guardar' }));
});

require('./rutas-pedidos')(app);
require('./rutas-imagenes')(app);
// Archivos de la web (después de la auth, así /admin queda protegido)
// Las fotos se guardan en el celular del cliente por 7 días
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '7d' }));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Tienda corriendo en http://localhost:${PORT}`);
});
