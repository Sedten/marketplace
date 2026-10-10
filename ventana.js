const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, 'data', 'config.json');
const DIAS = ['dom', 'lun', 'mar', 'mie', 'jue', 'vie', 'sab'];
const INGLES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const NOMBRES = { dom: 'domingo', lun: 'lunes', mar: 'martes', mie: 'miércoles', jue: 'jueves', vie: 'viernes', sab: 'sábado' };
const SEMANA = 7 * 1440; // minutos en una semana

function porDefecto() {
  return {
    // Si no la cambias, usa la zona horaria del equipo donde corre el servidor
    zona: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    modo: 'auto', // auto | abierto | cerrado
    abre: { dia: 'sab', hora: '08:00' },
    cierra: { dia: 'lun', hora: '17:30' },
    pago: { dia: 'mar', hora: '18:30' }
  };
}

function leerConfig() {
  const base = porDefecto();
  try {
    const c = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
    return {
      zona: c.zona || base.zona,
      modo: ['auto', 'abierto', 'cerrado'].includes(c.modo) ? c.modo : 'auto',
      abre: Object.assign({}, base.abre, c.abre),
      cierra: Object.assign({}, base.cierra, c.cierra),
      pago: Object.assign({}, base.pago, c.pago)
    };
  } catch (e) { return base; }
}

function guardarConfig(c) {
  fs.mkdirSync(path.dirname(RUTA), { recursive: true });
  const tmp = RUTA + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(c, null, 2));
  fs.renameSync(tmp, RUTA); // escritura segura
}

// Minutos desde el domingo 00:00 hasta el día y hora indicados
function posicion(h) {
  const [hh, mm] = h.hora.split(':').map(Number);
  return DIAS.indexOf(h.dia) * 1440 + hh * 60 + mm;
}

// Día y hora actuales en la zona horaria elegida, medidos en minutos de la semana
function minutosSemana(fecha, zona) {
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: zona, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  }).formatToParts(fecha);
  const val = t => partes.find(p => p.type === t).value;
  return INGLES.indexOf(val('weekday')) * 1440 + (Number(val('hour')) % 24) * 60 + Number(val('minute'));
}

function estado(ahora) {
  const fecha = ahora || new Date();
  const cfg = leerConfig();
  let ahoraMin;
  try { ahoraMin = minutosSemana(fecha, cfg.zona); }
  catch (e) { cfg.zona = 'UTC'; ahoraMin = minutosSemana(fecha, 'UTC'); }

  const abre = posicion(cfg.abre);
  const cierra = posicion(cfg.cierra);
  const desdeApertura = (ahoraMin - abre + SEMANA) % SEMANA;
  const duracion = (cierra - abre + SEMANA) % SEMANA;
  const auto = desdeApertura < duracion;
  const abierto = cfg.modo === 'abierto' ? true : cfg.modo === 'cerrado' ? false : auto;

  let horaLocal = '';
  try {
    horaLocal = new Intl.DateTimeFormat('es-AR', {
      timeZone: cfg.zona, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).format(fecha);
  } catch (e) {}

  return {
    abierto,
    modo: cfg.modo,
    automatico: auto,
    zona: cfg.zona,
    horaLocal,
    horarios: { abre: cfg.abre, cierra: cfg.cierra, pago: cfg.pago },
    nombres: NOMBRES,
    minutosParaCerrar: auto ? duracion - desdeApertura : null,
    minutosParaAbrir: auto ? null : SEMANA - desdeApertura
  };
}

// Devuelve el mensaje de bloqueo si los pedidos están cerrados, o null si están abiertos
function bloqueo() {
  const e = estado();
  if (e.abierto) return null;
  if (e.modo === 'cerrado') return 'Los pedidos están cerrados por ahora.';
  return 'Los pedidos están cerrados. Se abren el ' + NOMBRES[e.horarios.abre.dia] + ' a las ' + e.horarios.abre.hora + '.';
}

function validar(b) {
  const horaOk = h => h && DIAS.includes(h.dia) && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(h.hora));
  if (!['auto', 'abierto', 'cerrado'].includes(b.modo)) return { error: 'Modo inválido' };
  for (const k of ['abre', 'cierra', 'pago']) {
    if (!horaOk(b[k])) return { error: 'Revisa el día y la hora de "' + k + '"' };
  }
  if (b.abre.dia === b.cierra.dia && b.abre.hora === b.cierra.hora)
    return { error: 'La apertura y el cierre no pueden ser iguales' };
  try { new Intl.DateTimeFormat('en-US', { timeZone: String(b.zona) }); }
  catch (e) { return { error: 'Zona horaria inválida' }; }
  const copia = h => ({ dia: h.dia, hora: h.hora });
  return { config: { zona: String(b.zona), modo: b.modo, abre: copia(b.abre), cierra: copia(b.cierra), pago: copia(b.pago) } };
}

function instalar(app) {
  // Público: la tienda lo consulta para mostrar los avisos
  app.get('/api/estado', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json(estado());
  });

  // Solo admin (ya protegido por /api/admin)
  app.get('/api/admin/horarios', (req, res) => res.json({ config: leerConfig(), estado: estado() }));
  app.put('/api/admin/horarios', (req, res) => {
    const r = validar(req.body || {});
    if (r.error) return res.status(400).json({ error: r.error });
    try {
      guardarConfig(r.config);
      res.json({ config: r.config, estado: estado() });
    } catch (e) { res.status(500).json({ error: 'No se pudo guardar' }); }
  });
}

module.exports = { estado, bloqueo, instalar };
