// Entorno simulado de Google Apps Script para ejecutar apps-script/Code.gs en Node.
// Solo implementa lo que usa el conector. Se usa en los tests, en el servidor de
// desarrollo y para generar los datos del modo demo.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const RUTA_CODIGO = fileURLToPath(new URL('../apps-script/Code.gs', import.meta.url));

function partes(fecha, tz) {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const o = {};
  for (const p of f.formatToParts(fecha)) o[p.type] = p.value;
  return o;
}

/** Instante que corresponde a `aaaa-mm-dd hh:mm:ss` en la zona horaria dada. */
export function instanteEnZona(texto, tz) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}):(\d{2}))?$/.exec(texto);
  if (!m) throw new Error('Fecha no válida: ' + texto);
  const objetivo = Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  let t = objetivo;
  for (let i = 0; i < 3; i++) {
    const p = partes(new Date(t), tz);
    const visto = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    t += objetivo - visto;
  }
  return new Date(t);
}

export function fechaHoja(iso, tz) {
  return instanteEnZona(iso + ' 00:00:00', tz);
}

class Rango {
  constructor(hoja, r, c, nf, nc) { Object.assign(this, { hoja, r, c, nf, nc }); }
  _mapa(fn) {
    const out = [];
    for (let i = 0; i < this.nf; i++) {
      const fila = [];
      for (let j = 0; j < this.nc; j++) fila.push(fn(this.hoja._celda(this.r + i, this.c + j)));
      out.push(fila);
    }
    return out;
  }
  getValues() { return this._mapa((x) => (x.v === undefined || x.v === null ? '' : x.v)); }
  getFormulas() { return this._mapa((x) => x.f || ''); }
  getNumberFormats() { return this._mapa((x) => x.nf || '0.###############'); }
  getFormula() { return this.hoja._celda(this.r, this.c).f || ''; }
  getValue() { const v = this.hoja._celda(this.r, this.c).v; return v === undefined || v === null ? '' : v; }
  setValue(v) {
    const celda = this.hoja._celda(this.r, this.c, true);
    celda.v = v;
    delete celda.f;
    this.hoja.escrituras.push({ fila: this.r + 1, col: this.c + 1, valor: v });
    return this;
  }
  getRichTextValue() {
    const enlace = this.hoja._celda(this.r, this.c).enlace || null;
    return { getLinkUrl: () => enlace, getRuns: () => [] };
  }
}

export class Hoja {
  constructor(nombre) { this.nombre = nombre; this.celdas = []; this.escrituras = []; }
  _celda(r, c, crear) {
    if (!this.celdas[r]) { if (!crear) return {}; this.celdas[r] = []; }
    if (!this.celdas[r][c]) { if (!crear) return {}; this.celdas[r][c] = {}; }
    return this.celdas[r][c];
  }
  /** Fija una celda con notación A1. opciones: { nf, f, enlace } */
  pon(a1, v, opciones = {}) {
    const m = /^([A-Z]+)(\d+)$/.exec(a1);
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    Object.assign(this._celda(+m[2] - 1, c - 1, true), { v }, opciones);
    return this;
  }
  lee(a1) {
    const m = /^([A-Z]+)(\d+)$/.exec(a1);
    let c = 0;
    for (const ch of m[1]) c = c * 26 + (ch.charCodeAt(0) - 64);
    return this._celda(+m[2] - 1, c - 1).v;
  }
  _dimensiones() {
    let filas = 0;
    let cols = 0;
    this.celdas.forEach((fila, i) => {
      if (!fila) return;
      fila.forEach((celda, j) => {
        if (celda && celda.v !== undefined && celda.v !== null && celda.v !== '') {
          filas = Math.max(filas, i + 1);
          cols = Math.max(cols, j + 1);
        }
      });
    });
    return { filas: Math.max(filas, 1), cols: Math.max(cols, 1) };
  }
  getName() { return this.nombre; }
  getDataRange() { const d = this._dimensiones(); return new Rango(this, 0, 0, d.filas, d.cols); }
  getRange(fila, col, nf = 1, nc = 1) { return new Rango(this, fila - 1, col - 1, nf, nc); }
}

export class Libro {
  constructor(nombre, tz) { this.nombre = nombre; this.tz = tz; this.hojas = []; }
  nueva(nombre) { const h = new Hoja(nombre); this.hojas.push(h); return h; }
  getName() { return this.nombre; }
  getSpreadsheetTimeZone() { return this.tz; }
  getSheets() { return this.hojas; }
  getSheetByName(n) { return this.hojas.find((h) => h.nombre === n) || null; }
}

/** Carga Code.gs en un contexto con los servicios simulados y devuelve sus funciones. */
export function cargarConector(libro, propiedades = {}) {
  const props = { ...propiedades };
  // Interfaz mínima: guarda el último diálogo mostrado para poder inspeccionarlo en los tests.
  const ui = {
    dialogos: [],
    ButtonSet: { OK_CANCEL: 'OK_CANCEL' },
    Button: { OK: 'OK' },
    alert: () => 'OK',
    showModalDialog(salida, titulo) { this.dialogos.push({ titulo, html: salida.html }); },
    createMenu() { const m = { addItem: () => m, addToUi: () => {} }; return m; },
  };
  const contexto = {
    console,
    JSON, Math, Date, RegExp, String, Number, Array, Object, Error, isFinite, parseFloat, parseInt,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => libro,
      flush: () => {},
      getUi: () => ui,
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    HtmlService: {
      createHtmlOutput: (html) => ({ html, setWidth() { return this; }, setHeight() { return this; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'application/json', TEXT: 'text/plain' },
      createTextOutput: (texto) => ({
        texto, mime: null,
        setMimeType(m) { this.mime = m; return this; },
        getContent() { return this.texto; },
      }),
    },
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      formatDate(fecha, tz, patron) {
        const p = partes(fecha, tz);
        if (patron === 'yyyy-MM-dd') return `${p.year}-${p.month}-${p.day}`;
        if (patron === "yyyy-MM-dd'T'HH:mm:ss") return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
        throw new Error('Patrón no simulado: ' + patron);
      },
      parseDate: (texto, tz) => instanteEnZona(texto, tz),
    },
  };
  vm.createContext(contexto);
  vm.runInContext(readFileSync(RUTA_CODIGO, 'utf8'), contexto, { filename: 'Code.gs' });
  return {
    contexto,
    props,
    ui,
    /** Simula una petición POST de la app y devuelve el JSON de respuesta. */
    post(cuerpo) {
      const salida = contexto.doPost({ postData: { contents: JSON.stringify(cuerpo) } });
      return JSON.parse(salida.getContent());
    },
  };
}
