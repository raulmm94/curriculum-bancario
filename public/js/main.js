// Arranque, estado en memoria y navegación.
// Ningún dato financiero se escribe en disco: todo vive en `estado` mientras la pestaña está abierta.
import { h, icono, fecha } from './formato.js';
import { interpretarCodigo, fuenteRemota, fuenteDemo, almacen, ErrorConexion } from './api.js';
import { construirModelo, construirMensual } from './modelo.js';
import { ocultarTip } from './graficos.js';
import { vistaConexion } from './vistas/conexion.js';
import { vistaResumen } from './vistas/resumen.js';
import { vistaPatrimonio } from './vistas/patrimonio.js';
import { vistaMensual, dialogoGuardar, refrescarTotales } from './vistas/mensual.js';
import { vistaInforme } from './vistas/informe.js';

const VISTAS = [
  { id: 'resumen', nombre: 'Resumen', fn: vistaResumen },
  { id: 'patrimonio', nombre: 'Patrimonio', fn: vistaPatrimonio },
  { id: 'mensual', nombre: 'Mes a mes', fn: vistaMensual },
  { id: 'informe', nombre: 'Informe', fn: vistaInforme },
];
const SUBS = ['vision', 'rellenar', 'tabla'];
const CLAVE_TEMA = 'cb.tema';

const estado = {
  fuente: null, payload: null, modelo: null, mensual: null,
  pendientes: new Map(),
  vista: 'resumen', sub: 'vision',
  mesCierre: 0, mesValor: {},
  informe: null,
  cargando: false,
};
const raiz = document.getElementById('app');
let shell = null;
let vistaPintada = null;

const app = {
  estado, navegar, render, conectar, abrirDemo, desconectar, recargar, cambiarAnio, guardar, aviso, pendientesCambiados,
};

/* ---------- Tema ---------- */

function temaGuardado() { try { return localStorage.getItem(CLAVE_TEMA); } catch { return null; } }
function aplicarTema(tema) {
  if (tema === 'claro' || tema === 'oscuro') document.documentElement.dataset.tema = tema;
  else delete document.documentElement.dataset.tema;
}
function alternarTema() {
  const oscuroAhora = document.documentElement.dataset.tema
    ? document.documentElement.dataset.tema === 'oscuro'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  const nuevo = oscuroAhora ? 'claro' : 'oscuro';
  try { localStorage.setItem(CLAVE_TEMA, nuevo); } catch { /* modo privado */ }
  aplicarTema(nuevo);
}

/* ---------- Avisos ---------- */

let capaAvisos;
function aviso(texto, tipo = 'ok') {
  if (!capaAvisos) { capaAvisos = h('div.toasts', { 'aria-live': 'polite' }); document.body.append(capaAvisos); }
  const nodo = h('div.toast.es-' + tipo, icono(tipo === 'error' ? 'alerta' : 'ok', 18), h('span', texto));
  capaAvisos.append(nodo);
  setTimeout(() => nodo.remove(), tipo === 'error' ? 7000 : 3500);
}

/* ---------- Datos ---------- */

/** Primer mes sin cerrar, sin pasar del último mes natural ya terminado. */
function mesPorDefecto(mensual) {
  const hoy = new Date();
  const terminado = mensual.anio < hoy.getFullYear() ? 11 : mensual.anio > hoy.getFullYear() ? 0 : Math.max(0, hoy.getMonth() - 1);
  return Math.max(0, Math.min(11, mensual.cerrados, terminado));
}

function aplicarPayload(payload) {
  const anioPrevio = estado.mensual && estado.mensual.anio;
  estado.payload = payload;
  estado.modelo = construirModelo(payload);
  estado.mensual = construirMensual(payload.rellenar, estado.pendientes);
  if (estado.mensual && estado.mensual.anio !== anioPrevio) {
    estado.mesCierre = mesPorDefecto(estado.mensual);
    estado.mesValor = {};
  }
}

function reiniciar() {
  Object.assign(estado, {
    fuente: null, payload: null, modelo: null, mensual: null, informe: null,
    mesValor: {}, cargando: false,
  });
  estado.pendientes.clear();
  shell = null;
  vistaPintada = null;
}

async function conectar(texto, recordar, { silencioso = false } = {}) {
  let conexion;
  try {
    conexion = interpretarCodigo(texto);
  } catch (err) {
    if (silencioso) almacen.borrar();
    pintarConexion({ error: silencioso ? '' : err.message });
    return;
  }
  pintarConexion({ ocupado: true });
  try {
    const fuente = fuenteRemota(conexion);
    const payload = await fuente.leer();
    if (recordar) almacen.guardar(String(texto).replace(/\s+/g, '')); else almacen.borrar();
    estado.fuente = fuente;
    aplicarPayload(payload);
    render();
  } catch (err) {
    const caducado = err instanceof ErrorConexion && err.tipo === 'no_autorizado';
    if (caducado) almacen.borrar();
    reiniciar();
    // Si el fallo es de red, se conserva el código para poder reintentar con un clic.
    pintarConexion({ error: err.message || 'No se pudo conectar.', codigo: caducado ? '' : String(texto), recordado: recordar && !caducado });
  }
}

async function abrirDemo() {
  pintarConexion({ ocupado: true });
  try {
    estado.fuente = await fuenteDemo();
    aplicarPayload(await estado.fuente.leer());
    render();
  } catch (err) {
    reiniciar();
    pintarConexion({ error: 'No se pudo cargar la demo: ' + err.message });
  }
}

function desconectar() {
  if (estado.pendientes.size && !confirm('Hay cambios sin guardar que se perderán. ¿Desconectar igualmente?')) return;
  const eraDemo = estado.fuente && estado.fuente.tipo === 'demo';
  if (!eraDemo) almacen.borrar();
  reiniciar();
  history.replaceState(null, '', location.pathname);
  estado.vista = 'resumen';
  pintarConexion({});
}

async function pedir(fn, mensajeOk) {
  if (estado.cargando) return;
  estado.cargando = true;
  actualizarShell();
  try {
    aplicarPayload(await fn());
    if (mensajeOk) aviso(mensajeOk);
  } catch (err) {
    if (err instanceof ErrorConexion && err.tipo === 'no_autorizado') {
      almacen.borrar();
      reiniciar();
      pintarConexion({ error: err.message });
      return;
    }
    aviso(err.message || 'No se pudieron cargar los datos.', 'error');
  } finally {
    estado.cargando = false;
  }
  render();
}

function recargar() {
  return pedir(() => estado.fuente.leer(estado.mensual ? estado.mensual.anio : undefined), 'Datos actualizados desde tu hoja.');
}

function cambiarAnio(anio) {
  if (estado.pendientes.size) {
    if (!confirm('Al cambiar de año se descartan los cambios sin guardar. ¿Continuar?')) { render(); return; }
    estado.pendientes.clear();
  }
  return pedir(() => estado.fuente.leer(anio));
}

/** Envía los cambios pendientes a la hoja. Lanza el error para que el diálogo lo muestre. */
async function guardar({ fecha: fechaIso, fechaRellenar, fechaDatos }) {
  const cambios = [...estado.pendientes.values()].map((c) => ({
    tabla: c.tabla, fila: c.fila, categoria: c.categoria, concepto: c.concepto, mes: c.mes, valor: c.valor,
  }));
  const payload = await estado.fuente.guardar({
    anio: estado.mensual.anio, cambios, fecha: fechaIso, fechaRellenar, fechaDatos,
  });
  estado.pendientes.clear();
  aplicarPayload(payload);
  render();
  aviso(estado.fuente.tipo === 'demo'
    ? 'Guardado en la demo (no sale de tu navegador).'
    : `${cambios.length} ${cambios.length === 1 ? 'celda guardada' : 'celdas guardadas'} en tu Google Sheet.`);
}

function pendientesCambiados() {
  estado.mensual = construirMensual(estado.payload.rellenar, estado.pendientes);
  refrescarTotales(app);
  actualizarBarraGuardar();
}

/* ---------- Navegación ---------- */

function leerRuta() {
  const [, vista, sub] = location.hash.split('/');
  estado.vista = VISTAS.some((v) => v.id === vista) ? vista : 'resumen';
  if (estado.vista === 'mensual') estado.sub = SUBS.includes(sub) ? sub : 'vision';
}
function navegar(vista, sub) {
  const ruta = '#/' + vista + (vista === 'mensual' && sub && sub !== 'vision' ? '/' + sub : '');
  if (location.hash === ruta) render(); else location.hash = ruta;
}

/* ---------- Pintado ---------- */

function pintarConexion(opciones) {
  shell = null;
  vistaPintada = null;
  delete document.body.dataset.vista;
  raiz.replaceChildren(vistaConexion(app, opciones));
  if (!opciones.ocupado) raiz.querySelector('#codigo')?.focus({ preventScroll: true });
}

function montarShell() {
  const enlaces = (clase) => VISTAS.map((v) => h('a.' + clase, { href: '#/' + v.id, dataset: { vista: v.id } }, icono(v.id, 22), h('span', v.nombre)));
  const acciones = () => [
    h('button.boton-icono', { type: 'button', title: 'Recargar datos de la hoja', 'aria-label': 'Recargar datos de la hoja', dataset: { accion: 'recargar' }, onclick: recargar }, icono('refrescar')),
    h('button.boton-icono', { type: 'button', title: 'Cambiar entre tema claro y oscuro', 'aria-label': 'Cambiar entre tema claro y oscuro', onclick: alternarTema }, icono('tema')),
    h('button.boton-icono', { type: 'button', title: 'Desconectar', 'aria-label': 'Desconectar', onclick: desconectar }, icono('salir')),
  ];
  const titulo = h('h1');
  const subtitulo = h('p');
  const main = h('main.contenido', { id: 'vista' });
  const demo = h('div.banda-demo', icono('info', 16), h('span', 'Modo demo: datos ficticios. Nada sale de tu navegador.'),
    h('button.boton.mini', { type: 'button', onclick: desconectar }, 'Salir de la demo'));
  const barraTexto = h('span');
  const barraGuardar = h('div.barra-guardar', { role: 'region', 'aria-label': 'Cambios sin guardar' },
    barraTexto,
    h('div',
      h('button.boton', { type: 'button', onclick: () => { estado.pendientes.clear(); pendientesCambiados(); render(); } }, 'Descartar'),
      h('button.boton.primario', { type: 'button', onclick: () => dialogoGuardar(app) }, 'Revisar y guardar')));

  const nodo = h('div.app',
    h('aside.lateral',
      h('div.marca', h('span.marca-logo', icono('informe', 20)), h('span', 'Currículum bancario')),
      h('nav', { 'aria-label': 'Secciones' }, enlaces('lateral-enlace')),
      h('div.lateral-pie', h('p.lateral-estado'), h('div.lateral-acciones', acciones()))),
    h('div.principal',
      h('header.barra', h('div.barra-titulo', titulo, subtitulo), h('div.barra-acciones', acciones())),
      demo, main),
    h('nav.pestanas', { 'aria-label': 'Secciones' }, enlaces('pestana')),
    barraGuardar);
  shell = { nodo, main, titulo, subtitulo, demo, barraGuardar, barraTexto, estadoLateral: nodo.querySelector('.lateral-estado') };
  raiz.replaceChildren(nodo);
}

function actualizarBarraGuardar() {
  if (!shell) return;
  const n = estado.pendientes.size;
  shell.barraGuardar.hidden = n === 0;
  shell.barraTexto.textContent = n === 1 ? '1 cambio sin guardar' : `${n} cambios sin guardar`;
  shell.nodo.classList.toggle('con-barra-guardar', n > 0);
}

function actualizarShell() {
  if (!shell) return;
  const vista = VISTAS.find((v) => v.id === estado.vista);
  shell.titulo.textContent = vista.nombre;
  const m = estado.modelo;
  shell.subtitulo.textContent = m.actualizado ? `Datos actualizados el ${fecha(m.actualizado)}` : m.titulo;
  shell.estadoLateral.textContent = estado.fuente.tipo === 'demo' ? 'Modo demo' : `Conectado a «${m.titulo}»`;
  shell.demo.hidden = estado.fuente.tipo !== 'demo';
  shell.nodo.querySelectorAll('[data-vista]').forEach((a) => {
    const activa = a.dataset.vista === estado.vista;
    a.classList.toggle('activa', activa);
    if (activa) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  shell.nodo.classList.toggle('cargando', estado.cargando);
  shell.nodo.querySelectorAll('[data-accion="recargar"]').forEach((b) => { b.disabled = estado.cargando; });
  document.body.dataset.vista = estado.vista;
  document.title = `${vista.nombre} · Currículum bancario`;
  actualizarBarraGuardar();
}

function render() {
  if (!estado.modelo) return;
  if (!shell) montarShell();
  ocultarTip();
  actualizarShell();
  const vista = VISTAS.find((v) => v.id === estado.vista);
  const nodo = vista.fn(app);
  const clave = estado.vista + '/' + (estado.vista === 'mensual' ? estado.sub : '');
  shell.main.replaceChildren(nodo);
  if (typeof nodo._montado === 'function') nodo._montado();
  if (clave !== vistaPintada) window.scrollTo(0, 0);
  vistaPintada = clave;
}

/* ---------- Inicio ---------- */

// Refuerzo para iOS: anula el gesto de pellizco aunque el navegador ignore «user-scalable=no».
for (const gesto of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(gesto, (e) => e.preventDefault(), { passive: false });
}
window.addEventListener('hashchange', () => { leerRuta(); render(); });
window.addEventListener('beforeunload', (e) => {
  if (estado.pendientes.size) { e.preventDefault(); e.returnValue = ''; }
});

aplicarTema(temaGuardado());
leerRuta();
const guardado = almacen.leer();
if (guardado) conectar(guardado, true, { silencioso: true });
else pintarConexion({});
