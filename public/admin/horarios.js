const DIAS = [['sab', 'sábado'], ['dom', 'domingo'], ['lun', 'lunes'], ['mar', 'martes'], ['mie', 'miércoles'], ['jue', 'jueves'], ['vie', 'viernes']];
const $ = id => document.getElementById(id);

function esc(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
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
  if (r.status === 401) { location.href = '/login'; throw new Error('Sesión vencida'); }
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Error ' + r.status);
  return d;
}

function mostrar(d) {
  const c = d.config;
  const e = d.estado;
  $('modo').value = c.modo;
  ['abre', 'cierra', 'pago'].forEach(k => {
    $(k + '-dia').value = c[k].dia;
    $(k + '-hora').value = c[k].hora;
  });
  $('zona').value = c.zona;
  $('estado').innerHTML =
    'Ahora los pedidos están ' +
    (e.abierto ? '<b class="text-emerald-600">abiertos</b>' : '<b class="text-rose-600">cerrados</b>') +
    (e.modo === 'auto' ? ' (según el horario)' : ' (forzado por ti)') +
    '<br><span class="text-[11px] text-slate-400">Hora del servidor (' + esc(e.zona) + '): ' + esc(e.horaLocal) + '</span>';
}

async function cargar() {
  try { mostrar(await api('/api/admin/horarios')); }
  catch (e) { $('estado').textContent = e.message; }
}

async function guardar() {
  $('error').textContent = '';
  const cuerpo = {
    modo: $('modo').value,
    zona: $('zona').value.trim(),
    abre: { dia: $('abre-dia').value, hora: $('abre-hora').value },
    cierra: { dia: $('cierra-dia').value, hora: $('cierra-hora').value },
    pago: { dia: $('pago-dia').value, hora: $('pago-hora').value }
  };
  try {
    mostrar(await api('/api/admin/horarios', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    }));
    toast('Horarios guardados');
  } catch (e) { $('error').textContent = e.message; }
}

async function salir() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch (e) {}
  location.href = '/login';
}

window.addEventListener('load', () => {
  ['abre-dia', 'cierra-dia', 'pago-dia'].forEach(id => {
    $(id).innerHTML = DIAS.map(([v, t]) => '<option value="' + v + '">' + t + '</option>').join('');
  });
  cargar();
});
