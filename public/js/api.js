// Conexión con el Apps Script del usuario. La app no tiene servidor propio:
// el navegador habla directamente con Google y los datos solo viven en memoria.
import { hoyIso } from './formato.js';

const CLAVE_ALMACEN = 'cb.conexion';
const RE_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/[\w-]+\/exec$/;
const ES_LOCAL = ['localhost', '127.0.0.1'].includes(location.hostname);

export class ErrorConexion extends Error {
  constructor(mensaje, tipo = 'error') { super(mensaje); this.tipo = tipo; }
}

function urlValida(u) {
  if (typeof u !== 'string') return false;
  if (RE_URL.test(u)) return true;
  // Solo en desarrollo local se admite el conector simulado.
  return ES_LOCAL && /^http:\/\/(localhost|127\.0\.0\.1):\d+\/macros\/s\/[\w-]+\/exec$/.test(u);
}

/** «CB1.<base64url de {u, k}>» → { u, k } */
export function interpretarCodigo(texto) {
  const limpio = String(texto || '').replace(/\s+/g, '');
  if (!limpio) throw new ErrorConexion('Pega el código de conexión.', 'codigo');
  const m = /^CB1\.([A-Za-z0-9_-]+)$/.exec(limpio);
  if (!m) throw new ErrorConexion('El código no tiene el formato esperado (empieza por «CB1.»).', 'codigo');
  let datos;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    datos = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new ErrorConexion('El código está incompleto o dañado. Cópialo de nuevo desde la hoja.', 'codigo');
  }
  if (!datos || !urlValida(datos.u) || typeof datos.k !== 'string' || datos.k.length < 16) {
    throw new ErrorConexion('El código no apunta a una aplicación web de Apps Script válida.', 'codigo');
  }
  return { u: datos.u, k: datos.k };
}

async function llamar(conexion, cuerpo) {
  let respuesta;
  try {
    respuesta = await fetch(conexion.u, {
      method: 'POST',
      // text/plain evita la petición previa CORS, que Apps Script no admite.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ k: conexion.k, ...cuerpo }),
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
    });
  } catch {
    throw new ErrorConexion(
      'No se pudo contactar con tu Apps Script. Comprueba tu conexión y que la implementación ' +
      'esté publicada como aplicación web con acceso «Cualquier usuario».', 'red');
  }
  let json;
  try {
    json = JSON.parse(await respuesta.text());
  } catch {
    throw new ErrorConexion(
      'La respuesta no es la esperada. Revisa que la URL sea la de la aplicación web (termina en /exec) ' +
      'y que la última versión del script esté implementada.', 'formato');
  }
  if (!json.ok) {
    if (json.error === 'no_autorizado') {
      throw new ErrorConexion('El código de conexión ya no es válido. Genera uno nuevo desde la hoja.', 'no_autorizado');
    }
    throw new ErrorConexion(json.mensaje || 'El conector devolvió un error.', json.error || 'error');
  }
  return json;
}

export function fuenteRemota(conexion) {
  return {
    tipo: 'remota',
    leer: (anio) => llamar(conexion, { accion: 'leer', anio }),
    guardar: (p) => llamar(conexion, { accion: 'guardar', ...p }),
  };
}

/** Modo demo: datos ficticios en memoria; los «guardados» no salen del navegador. */
export async function fuenteDemo() {
  const { default: base } = await import('./demo-datos.js');
  const datos = structuredClone(base);
  return {
    tipo: 'demo',
    leer: async () => structuredClone(datos),
    guardar: async ({ cambios, fecha, fechaRellenar, fechaDatos }) => {
      for (const c of cambios) {
        const tabla = datos.rellenar.tablas.find((t) => t.id === c.tabla);
        const fila = tabla && tabla.filas.find((f) => f.fila === c.fila);
        if (!fila) throw new ErrorConexion('Fila no encontrada en la demo.');
        fila.meses[c.mes - 1] = c.valor;
        fila.fx[c.mes - 1] = '';
      }
      if (fecha && fechaRellenar) datos.rellenar.actualizado = fecha;
      if (fecha && fechaDatos) datos.datos.actualizado = fecha;
      datos.generado = hoyIso() + 'T00:00:00';
      return { ...structuredClone(datos), guardados: cambios.length };
    },
  };
}

/** El código solo se guarda en este navegador si el usuario lo pide expresamente. */
export const almacen = {
  leer() { try { return localStorage.getItem(CLAVE_ALMACEN); } catch { return null; } },
  guardar(codigo) { try { localStorage.setItem(CLAVE_ALMACEN, codigo); } catch { /* modo privado */ } },
  borrar() { try { localStorage.removeItem(CLAVE_ALMACEN); } catch { /* nada */ } },
};
