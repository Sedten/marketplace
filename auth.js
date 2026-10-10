const crypto = require('crypto');

const ADMIN_USER = process.env.ADMIN_USER || '';
const ADMIN_PASS = process.env.ADMIN_PASS || '';
const VEND_USER = process.env.VENDEDOR_USER || '';
const VEND_PASS = process.env.VENDEDOR_PASS || '';
const COOKIE = 'gringo_admin';
const DURACION = 30 * 24 * 3600 * 1000; // 30 días
const CLAVE = crypto.createHash('sha256')
  .update(`${ADMIN_USER}:${ADMIN_PASS}:${VEND_USER}:${VEND_PASS}:elgringo`).digest();

function hash(x) { return crypto.createHash('sha256').update(String(x)).digest(); }
function igual(a, b) { return crypto.timingSafeEqual(hash(a), hash(b)); }
function firmar(rol, exp) {
  return crypto.createHmac('sha256', CLAVE).update(`${rol}.${exp}`).digest('hex');
}
function crearToken(rol) {
  const exp = Date.now() + DURACION;
  return `${rol}.${exp}.${firmar(rol, exp)}`;
}

function leerCookie(req, nombre) {
  for (const par of (req.headers.cookie || '').split(';')) {
    const i = par.indexOf('=');
    if (i > -1 && par.slice(0, i).trim() === nombre) {
      try { return decodeURIComponent(par.slice(i + 1).trim()); } catch (e) { return null; }
    }
  }
  return null;
}

function rolDeSesion(req) {
  const [rol, exp, firma] = String(leerCookie(req, COOKIE) || '').split('.');
  if (!rol || !exp || !firma || Number(exp) < Date.now()) return null;
  if (rol !== 'admin' && rol !== 'vendedor') return null;
  const esperado = firmar(rol, exp);
  if (firma.length !== esperado.length) return null;
  return crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperado)) ? rol : null;
}

// Bloqueo simple por IP: 5 fallos = 15 minutos
const intentos = new Map();
function bloqueado(ip) {
  const r = intentos.get(ip);
  return !!r && r.hasta > Date.now();
}
function registrarFallo(ip) {
  const r = intentos.get(ip) || { n: 0, hasta: 0 };
  r.n++;
  if (r.n >= 5) { r.hasta = Date.now() + 15 * 60 * 1000; r.n = 0; }
  intentos.set(ip, r);
}

function login(req, res) {
  const ip = req.ip;
  if (!ADMIN_USER || !ADMIN_PASS) return res.status(500).json({ error: 'Servidor sin credenciales configuradas' });
  if (bloqueado(ip)) return res.status(429).json({ error: 'Demasiados intentos. Espera 15 minutos.' });

  const { usuario = '', clave = '' } = req.body || {};
  let rol = null;
  if (igual(usuario, ADMIN_USER) && igual(clave, ADMIN_PASS)) rol = 'admin';
  else if (VEND_USER && VEND_PASS && igual(usuario, VEND_USER) && igual(clave, VEND_PASS)) rol = 'vendedor';

  if (rol) {
    intentos.delete(ip);
    const seguro = req.secure || req.headers['x-forwarded-proto'] === 'https';
    res.setHeader('Set-Cookie',
      `${COOKIE}=${encodeURIComponent(crearToken(rol))}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${DURACION / 1000}${seguro ? '; Secure' : ''}`);
    return res.json({ ok: true, rol });
  }
  registrarFallo(ip);
  res.status(401).json({ error: 'Usuario o contraseña incorrectos' });
}

// Middleware: deja pasar solo a los roles indicados
function exigir(permitidos) {
  return function (req, res, next) {
    const rol = rolDeSesion(req);
    if (rol && permitidos.includes(rol)) {
      req.rol = rol;
      req.usuario = rol === 'admin' ? ADMIN_USER : VEND_USER;
      return next();
    }
    // Acceso alternativo con Basic para el admin (pruebas con curl)
    if (permitidos.includes('admin')) {
      const [tipo, cred] = (req.headers.authorization || '').split(' ');
      if (tipo === 'Basic' && cred) {
        const [u, ...resto] = Buffer.from(cred, 'base64').toString().split(':');
        if (igual(u, ADMIN_USER) && igual(resto.join(':'), ADMIN_PASS)) {
          req.rol = 'admin';
          req.usuario = ADMIN_USER;
          return next();
        }
      }
    }
    if (req.originalUrl.startsWith('/api/')) return res.status(401).json({ error: 'No autorizado' });
    res.redirect('/login');
  };
}

module.exports = {
  login,
  auth: exigir(['admin']),                 // solo admin
  authStaff: exigir(['admin', 'vendedor']) // admin o vendedor
};
