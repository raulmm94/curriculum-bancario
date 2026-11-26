/**
 * Currículum bancario — conector de Google Apps Script
 * ----------------------------------------------------
 * Este script vive DENTRO de tu Google Sheet «Cuadro financiero»
 * (Extensiones → Apps Script) y es el único puente entre la hoja y la app.
 *
 * - La app (alojada en Cloudflare) no guarda ningún dato: solo llama a este
 *   script con una clave secreta y pinta lo que recibe.
 * - Sin la clave, este script no devuelve absolutamente nada.
 * - Solo tiene permiso sobre ESTA hoja de cálculo (ver @OnlyCurrentDoc).
 *
 * Instalación resumida (detalle en el README del repositorio):
 *   1. Pega este archivo en Extensiones → Apps Script y guarda.
 *   2. Implementar → Nueva implementación → Aplicación web
 *        Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 *   3. Vuelve a la hoja, recárgala y usa el menú
 *        «Currículum bancario → Código de conexión…»
 *
 * @OnlyCurrentDoc
 */

var CB_VERSION = 1;
var CB_HOJA_DATOS = 'DATOS';
var CB_PREFIJO_RELLENAR = 'Rellenar';
var CB_PROP_CLAVE = 'CB_CLAVE';
var CB_PROP_URL = 'CB_URL';
var CB_MAX_CAMBIOS = 500;
var CB_MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
  'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/* ------------------------------------------------------------------ */
/* Puntos de entrada de la aplicación web                              */
/* ------------------------------------------------------------------ */

function doGet() {
  // Nunca se devuelven datos por GET.
  return ContentService
    .createTextOutput('Currículum bancario: conector activo. Los datos solo se sirven a la app con su código de conexión.')
    .setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  var salida;
  try {
    var peticion = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!cbAutorizado_(peticion.k)) {
      salida = { ok: false, error: 'no_autorizado', mensaje: 'Código de conexión no válido.' };
    } else {
      salida = cbDespachar_(peticion);
    }
  } catch (err) {
    salida = { ok: false, error: 'error', mensaje: String((err && err.message) || err) };
  }
  return ContentService
    .createTextOutput(JSON.stringify(salida))
    .setMimeType(ContentService.MimeType.JSON);
}

function cbDespachar_(p) {
  switch (p.accion) {
    case 'ping':
      return { ok: true, version: CB_VERSION };
    case 'leer':
      return cbLeer_(p);
    case 'guardar':
      return cbGuardar_(p);
    default:
      return { ok: false, error: 'accion_desconocida', mensaje: 'Acción no reconocida.' };
  }
}

function cbAutorizado_(clave) {
  var guardada = PropertiesService.getScriptProperties().getProperty(CB_PROP_CLAVE);
  if (!guardada || typeof clave !== 'string' || clave.length !== guardada.length) return false;
  var dif = 0;
  for (var i = 0; i < guardada.length; i++) dif |= guardada.charCodeAt(i) ^ clave.charCodeAt(i);
  return dif === 0;
}

/* ------------------------------------------------------------------ */
/* Menú de la hoja y código de conexión                                */
/* ------------------------------------------------------------------ */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Currículum bancario')
    .addItem('Código de conexión…', 'cbMostrarCodigo')
    .addItem('Regenerar clave (revoca la anterior)', 'cbRegenerarClave')
    .addToUi();
}

function cbClave_(regenerar) {
  var props = PropertiesService.getScriptProperties();
  var clave = props.getProperty(CB_PROP_CLAVE);
  if (!clave || regenerar) {
    clave = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty(CB_PROP_CLAVE, clave);
  }
  return clave;
}

function cbUrlGuardada_() {
  return PropertiesService.getScriptProperties().getProperty(CB_PROP_URL) || '';
}

/** Llamada desde el diálogo para recordar la URL de la aplicación web. */
function cbGuardarUrl(url) {
  url = String(url || '').trim();
  if (!/^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+|macros)\/s\/[\w-]+\/exec$/.test(url)) {
    throw new Error('La URL debe ser la de la aplicación web y terminar en /exec');
  }
  PropertiesService.getScriptProperties().setProperty(CB_PROP_URL, url);
  return url;
}

function cbMostrarCodigo() {
  var datos = { clave: cbClave_(false), url: cbUrlGuardada_() };
  var json = JSON.stringify(datos).replace(/</g, '\\u003c');
  var html = '<!DOCTYPE html><html><head><base target="_top"><style>' +
    'body{font:14px/1.45 system-ui,Arial,sans-serif;color:#1b1f24;margin:0;padding:16px}' +
    'label{display:block;font-weight:600;margin:12px 0 4px}' +
    'input,textarea{width:100%;box-sizing:border-box;font:13px ui-monospace,Consolas,monospace;padding:8px;border:1px solid #c5cad1;border-radius:6px}' +
    'textarea{height:96px;resize:none}button{margin-top:10px;padding:8px 14px;border-radius:6px;border:0;background:#17365d;color:#fff;font-weight:600;cursor:pointer}' +
    'p{margin:6px 0;color:#4a5562}.ok{color:#0a7a2f;font-weight:600}.err{color:#b3261e;font-weight:600}' +
    '</style></head><body>' +
    '<p>1. Pega aquí la <b>URL de la aplicación web</b> (Implementar → Gestionar implementaciones). Termina en <code>/exec</code>.</p>' +
    '<label for="u">URL de la aplicación web</label><input id="u" placeholder="https://script.google.com/macros/s/…/exec">' +
    '<label for="c">2. Código de conexión (cópialo en la app)</label><textarea id="c" readonly></textarea>' +
    '<button id="b">Copiar código</button> <span id="m"></span>' +
    '<p>Guárdalo como una contraseña: quien lo tenga puede leer y editar esta hoja desde la app.</p>' +
    '<script>var D=' + json + ';var u=document.getElementById("u"),c=document.getElementById("c"),m=document.getElementById("m");u.value=D.url;' +
    'function b64(s){return btoa(unescape(encodeURIComponent(s))).replace(/\\+/g,"-").replace(/\\//g,"_").replace(/=+$/,"")}' +
    'function ok(v){return /^https:\\/\\/script\\.google\\.com\\/(a\\/macros\\/[^\\/]+|macros)\\/s\\/[\\w-]+\\/exec$/.test(v)}' +
    'function pinta(){var v=u.value.trim();if(!ok(v)){c.value="";m.className="err";m.textContent=v?"URL no válida":"";return}' +
    'c.value="CB1."+b64(JSON.stringify({u:v,k:D.clave}));m.textContent="";google.script.run.cbGuardarUrl(v)}' +
    'u.addEventListener("input",pinta);pinta();' +
    'document.getElementById("b").addEventListener("click",function(){if(!c.value)return;c.select();' +
    'try{document.execCommand("copy");m.className="ok";m.textContent="Copiado"}catch(e){m.className="err";m.textContent="Cópialo a mano"}});' +
    '</script></body></html>';
  SpreadsheetApp.getUi().showModalDialog(
    HtmlService.createHtmlOutput(html).setWidth(520).setHeight(400),
    'Código de conexión');
}

function cbRegenerarClave() {
  var ui = SpreadsheetApp.getUi();
  var r = ui.alert('Regenerar clave',
    'Los códigos de conexión anteriores dejarán de funcionar en todos los dispositivos. ¿Continuar?',
    ui.ButtonSet.OK_CANCEL);
  if (r !== ui.Button.OK) return;
  cbClave_(true);
  cbMostrarCodigo();
}

/* ------------------------------------------------------------------ */
/* Utilidades de lectura                                               */
/* ------------------------------------------------------------------ */

function cbNorm_(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return '';
  return String(v).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

function cbVacio_(v) {
  return v === '' || v === null || v === undefined;
}

/** Lee la hoja completa una sola vez (valores, fórmulas y formatos). */
function cbLeerHoja_(hoja, conFormatos) {
  var rango = hoja.getDataRange();
  var valores = rango.getValues();
  return {
    hoja: hoja,
    v: valores,
    f: rango.getFormulas(),
    nf: conFormatos ? rango.getNumberFormats() : null,
    filas: valores.length,
    cols: valores.length ? valores[0].length : 0
  };
}

/** Celda tipada compacta: null o [tipo, valor]. Tipos: s texto, n número, e euros, p porcentaje, f fecha. */
function cbCelda_(h, r, c, tz) {
  if (r >= h.filas || c >= h.cols || c < 0) return null;
  var v = h.v[r][c];
  if (cbVacio_(v)) return null;
  if (v instanceof Date) return ['f', Utilities.formatDate(v, tz, 'yyyy-MM-dd')];
  if (typeof v === 'number') {
    var fmt = h.nf ? String(h.nf[r][c] || '') : '';
    if (fmt.indexOf('%') >= 0) return ['p', v];
    if (fmt.indexOf('€') >= 0 || /\[\$[^\]]*\]/.test(fmt)) return ['e', v];
    return ['n', v];
  }
  if (typeof v === 'boolean') return ['s', v ? 'Sí' : 'No'];
  var s = String(v).trim();
  return s ? ['s', s] : null;
}

function cbBuscar_(h, prueba) {
  for (var r = 0; r < h.filas; r++) {
    for (var c = 0; c < h.cols; c++) {
      if (prueba(cbNorm_(h.v[r][c]), r, c)) return { r: r, c: c };
    }
  }
  return null;
}

/** Columnas contiguas con cabecera a partir de (r, c). */
function cbCabeceras_(h, r, c) {
  var cols = [];
  for (var j = c; j < h.cols; j++) {
    if (cbVacio_(h.v[r][j])) break;
    cols.push({ c: j, nombre: String(h.v[r][j]).trim() });
  }
  return cols;
}

function cbFilaVacia_(h, r, cols) {
  for (var j = 0; j < cols.length; j++) {
    if (!cbVacio_(h.v[r][cols[j].c])) return false;
  }
  return true;
}

/** Tabla genérica: cabeceras + filas hasta la primera fila vacía. `esTotal` separa la fila de totales. */
function cbTabla_(h, pos, tz, esTotal) {
  if (!pos) return null;
  var cols = cbCabeceras_(h, pos.r, pos.c);
  var filas = [];
  var total = null;
  for (var r = pos.r + 1; r < h.filas; r++) {
    if (cbFilaVacia_(h, r, cols)) break;
    var fila = [];
    for (var j = 0; j < cols.length; j++) fila.push(cbCelda_(h, r, cols[j].c, tz));
    if (esTotal && esTotal(fila)) { total = fila; break; }
    filas.push(fila);
  }
  return {
    cabeceras: cols.map(function (x) { return x.nombre; }),
    filas: filas,
    total: total
  };
}

function cbTextoCelda_(celda) {
  return celda ? cbNorm_(celda[1]) : '';
}

function cbFechaActualizado_(h, tz) {
  var pos = cbBuscar_(h, function (n) { return n.indexOf('datos actualizados') === 0; });
  if (!pos) return { pos: null, valor: null };
  for (var j = pos.c + 1; j < Math.min(h.cols, pos.c + 6); j++) {
    if (!cbVacio_(h.v[pos.r][j])) {
      var celda = cbCelda_(h, pos.r, j, tz);
      return { pos: { r: pos.r, c: j }, valor: celda && celda[0] === 'f' ? celda[1] : null };
    }
  }
  return { pos: { r: pos.r, c: pos.c + 1 }, valor: null };
}

function cbUrlSegura_(s) {
  s = String(s || '').trim();
  return /^https?:\/\/\S+$/i.test(s) ? s : null;
}

/** URL de una celda: texto, fórmula HYPERLINK o enlace insertado. */
function cbUrlCelda_(h, r, c) {
  if (r >= h.filas || c >= h.cols || c < 0) return null;
  var directa = cbUrlSegura_(h.v[r][c]);
  if (directa) return directa;
  var m = /HYPERLINK\(\s*"([^"]+)"/i.exec(h.f[r][c] || '');
  if (m && cbUrlSegura_(m[1])) return cbUrlSegura_(m[1]);
  if (cbVacio_(h.v[r][c])) return null;
  try {
    var rico = h.hoja.getRange(r + 1, c + 1).getRichTextValue();
    var enlace = rico && rico.getLinkUrl();
    if (!enlace && rico) {
      var tramos = rico.getRuns();
      for (var i = 0; i < tramos.length && !enlace; i++) enlace = tramos[i].getLinkUrl();
    }
    return cbUrlSegura_(enlace);
  } catch (err) {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Hoja DATOS (el currículum bancario)                                 */
/* ------------------------------------------------------------------ */

function cbLeerDatos_(ss, tz) {
  var hoja = ss.getSheetByName(CB_HOJA_DATOS);
  if (!hoja) throw new Error('No encuentro la hoja «' + CB_HOJA_DATOS + '».');
  var h = cbLeerHoja_(hoja, true);

  var posInmuebles = cbBuscar_(h, function (n, r, c) {
    return n === 'tipologia' && c + 1 < h.cols && cbNorm_(h.v[r][c + 1]).indexOf('direcc') === 0;
  });
  var posPrestamos = cbBuscar_(h, function (n, r, c) {
    return n === 'entidad' && c + 1 < h.cols && cbNorm_(h.v[r][c + 1]).indexOf('imp') === 0;
  });
  var posTrabajo = cbBuscar_(h, function (n, r, c) {
    return n === 'concepto' && c + 1 < h.cols && cbNorm_(h.v[r][c + 1]) === 'valor';
  });
  var posInversiones = cbBuscar_(h, function (n) { return n === 'broker'; });

  var inmuebles = cbTabla_(h, posInmuebles, tz, function (f) {
    return cbTextoCelda_(f[0]) === 'total' || !f[1];
  });
  var prestamos = cbTabla_(h, posPrestamos, tz, function (f) {
    return cbTextoCelda_(f[0]) === 'total';
  });
  var trabajo = cbTabla_(h, posTrabajo, tz, null);
  var inversiones = cbTabla_(h, posInversiones, tz, function (f) {
    return !f[0] || cbTextoCelda_(f[0]) === 'total';
  });

  // Enlaces: cabecera «Link»; la etiqueta está en la celda no vacía más cercana a su izquierda.
  var posLink = cbBuscar_(h, function (n) {
    return n === 'link' || n === 'links' || n === 'enlace' || n === 'enlaces';
  });
  var colEtiqueta = null;
  var enlaces = [];
  if (posLink) {
    for (var j = posLink.c - 1; j >= Math.max(0, posLink.c - 4); j--) {
      if (posLink.r + 1 < h.filas && !cbVacio_(h.v[posLink.r + 1][j])) { colEtiqueta = j; break; }
    }
    if (colEtiqueta !== null) {
      for (var r = posLink.r + 1; r < h.filas; r++) {
        if (cbVacio_(h.v[r][colEtiqueta])) break;
        enlaces.push({
          etiqueta: String(h.v[r][colEtiqueta]).trim(),
          url: cbUrlCelda_(h, r, posLink.c) || cbUrlCelda_(h, r, colEtiqueta)
        });
      }
    }
  }

  // Resumen: etiqueta + primer valor a la derecha (+ un segundo valor opcional, p. ej. el % del total).
  var posResumen = cbBuscar_(h, function (n) { return n === 'resumen'; });
  var resumen = [];
  if (posResumen) {
    var limite = (colEtiqueta !== null && colEtiqueta > posResumen.c) ? colEtiqueta : h.cols;
    for (var rr = posResumen.r + 1; rr < h.filas; rr++) {
      if (cbVacio_(h.v[rr][posResumen.c])) break;
      var celdas = [];
      for (var cc = posResumen.c + 1; cc < limite && celdas.length < 2; cc++) {
        var celda = cbCelda_(h, rr, cc, tz);
        if (celda) celdas.push(celda);
      }
      resumen.push({
        etiqueta: String(h.v[rr][posResumen.c]).trim(),
        valor: celdas[0] || null,
        extra: celdas[1] || null
      });
    }
  }

  return {
    interno: { h: h, fecha: cbFechaActualizado_(h, tz) },
    publico: {
      actualizado: cbFechaActualizado_(h, tz).valor,
      inmuebles: inmuebles,
      prestamos: prestamos,
      trabajo: trabajo,
      inversiones: inversiones,
      resumen: resumen,
      enlaces: enlaces
    }
  };
}

/* ------------------------------------------------------------------ */
/* Hojas «Rellenar AAAA» (seguimiento mensual)                         */
/* ------------------------------------------------------------------ */

function cbAnios_(ss) {
  var re = new RegExp('^' + CB_PREFIJO_RELLENAR + '\\s+(\\d{4})$', 'i');
  var anios = [];
  ss.getSheets().forEach(function (hoja) {
    var m = re.exec(hoja.getName().trim());
    if (m) anios.push({ anio: Number(m[1]), hoja: hoja });
  });
  anios.sort(function (a, b) { return a.anio - b.anio; });
  return anios;
}

function cbIdTabla_(tipologia, usados) {
  var n = cbNorm_(tipologia);
  var base = n.indexOf('gasto') === 0 ? 'gastos'
    : n.indexOf('ingreso') === 0 ? 'ingresos'
    : n.indexOf('financ') === 0 ? 'bolsa'
    : n.indexOf('inmobil') === 0 ? 'inmobiliario'
    : (n.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'tabla');
  var id = base;
  var i = 2;
  while (usados[id]) id = base + '-' + (i++);
  usados[id] = true;
  return id;
}

function cbNumero_(v) {
  return (typeof v === 'number' && isFinite(v)) ? v : null;
}

function cbLeerRellenar_(hoja, anio, tz) {
  var h = cbLeerHoja_(hoja, false);
  var tablas = [];
  var usados = {};
  for (var r = 0; r < h.filas; r++) {
    for (var c = 0; c + 2 < h.cols; c++) {
      if (cbNorm_(h.v[r][c]) !== 'tipologia' || cbNorm_(h.v[r][c + 1]) !== 'categoria' ||
          cbNorm_(h.v[r][c + 2]) !== 'concepto') continue;
      var cols = cbCabeceras_(h, r, c);
      var colMes = [];
      for (var m = 0; m < 12; m++) colMes.push(null);
      cols.forEach(function (col) {
        var idx = CB_MESES.indexOf(cbNorm_(col.nombre));
        if (idx >= 0 && colMes[idx] === null) colMes[idx] = col.c;
      });
      var colResumen = cols.length > 3 ? cols[3].c : null;
      var nombreResumen = cols.length > 3 ? cols[3].nombre : '';
      var filas = [];
      var total = null;
      for (var rr = r + 1; rr < h.filas; rr++) {
        if (cbFilaVacia_(h, rr, cols)) break;
        var meses = [];
        var formulas = [];
        for (var mm = 0; mm < 12; mm++) {
          var cm = colMes[mm];
          meses.push(cm === null ? null : cbNumero_(h.v[rr][cm]));
          formulas.push(cm === null ? '' : String(h.f[rr][cm] || ''));
        }
        var registro = {
          fila: rr + 1,
          tipologia: String(h.v[rr][c]).trim(),
          categoria: String(h.v[rr][c + 1]).trim(),
          concepto: String(h.v[rr][c + 2]).trim(),
          resumen: colResumen === null ? null : cbNumero_(h.v[rr][colResumen]),
          meses: meses,
          fx: formulas
        };
        if (cbNorm_(registro.tipologia) === 'total') { total = registro; break; }
        filas.push(registro);
      }
      if (filas.length) {
        tablas.push({
          id: cbIdTabla_(filas[0].tipologia, usados),
          titulo: filas[0].tipologia,
          tipo: cbNorm_(nombreResumen).indexOf('ultimo') === 0 ? 'valor' : 'flujo',
          cabeceraResumen: nombreResumen,
          filas: filas,
          total: total,
          _colMes: colMes
        });
      }
      break; // una tabla por fila de cabecera
    }
  }
  var fecha = cbFechaActualizado_(h, tz);
  return { h: h, hoja: hoja, fecha: fecha, anio: anio, tablas: tablas };
}

function cbRellenarPublico_(info) {
  return {
    anio: info.anio,
    hoja: info.hoja.getName(),
    actualizado: info.fecha.valor,
    tablas: info.tablas.map(function (t) {
      return {
        id: t.id, titulo: t.titulo, tipo: t.tipo, cabeceraResumen: t.cabeceraResumen,
        filas: t.filas, total: t.total
      };
    })
  };
}

/* ------------------------------------------------------------------ */
/* Acciones                                                            */
/* ------------------------------------------------------------------ */

function cbLeer_(p) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tz = ss.getSpreadsheetTimeZone();
  var anios = cbAnios_(ss);
  var elegido = null;
  if (anios.length) {
    var pedido = Number(p.anio);
    elegido = anios.filter(function (a) { return a.anio === pedido; })[0] || anios[anios.length - 1];
  }
  return {
    ok: true,
    version: CB_VERSION,
    titulo: ss.getName(),
    generado: Utilities.formatDate(new Date(), tz, "yyyy-MM-dd'T'HH:mm:ss"),
    datos: cbLeerDatos_(ss, tz).publico,
    anios: anios.map(function (a) { return a.anio; }),
    rellenar: elegido ? cbRellenarPublico_(cbLeerRellenar_(elegido.hoja, elegido.anio, tz)) : null
  };
}

function cbEscribirFecha_(h, fecha, iso, tz) {
  if (!fecha.pos) return;
  var destino = h.hoja.getRange(fecha.pos.r + 1, fecha.pos.c + 1);
  if (destino.getFormula()) return; // si es una fórmula (p. ej. =HOY()) no se toca
  destino.setValue(Utilities.parseDate(iso + ' 00:00:00', tz, 'yyyy-MM-dd HH:mm:ss'));
}

function cbGuardar_(p) {
  var cambios = p.cambios || [];
  if (!Array.isArray(cambios)) throw new Error('Formato de cambios no válido.');
  if (cambios.length > CB_MAX_CAMBIOS) throw new Error('Demasiados cambios en un solo guardado.');
  var fechaIso = p.fecha && /^\d{4}-\d{2}-\d{2}$/.test(p.fecha) ? p.fecha : null;

  var candado = LockService.getScriptLock();
  candado.waitLock(20000);
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var tz = ss.getSpreadsheetTimeZone();
    var anio = cbAnios_(ss).filter(function (a) { return a.anio === Number(p.anio); })[0];
    if (!anio) throw new Error('No encuentro la hoja «' + CB_PREFIJO_RELLENAR + ' ' + p.anio + '».');
    var info = cbLeerRellenar_(anio.hoja, anio.anio, tz);

    // 1) Validar todo antes de escribir nada.
    var escrituras = cambios.map(function (cambio) {
      var tabla = info.tablas.filter(function (t) { return t.id === cambio.tabla; })[0];
      if (!tabla) throw new Error('Tabla desconocida: ' + cambio.tabla);
      var mes = Number(cambio.mes);
      if (!(mes >= 1 && mes <= 12) || mes !== Math.floor(mes)) throw new Error('Mes no válido.');
      var col = tabla._colMes[mes - 1];
      if (col === null) throw new Error('La tabla «' + tabla.titulo + '» no tiene columna para ese mes.');
      var mismo = function (f) {
        return cbNorm_(f.concepto) === cbNorm_(cambio.concepto) && cbNorm_(f.categoria) === cbNorm_(cambio.categoria);
      };
      var fila = tabla.filas.filter(function (f) { return f.fila === Number(cambio.fila) && mismo(f); })[0];
      if (!fila) {
        // La hoja pudo cambiar desde que se cargó la app: se localiza por categoría + concepto.
        var candidatas = tabla.filas.filter(mismo);
        if (candidatas.length !== 1) {
          throw new Error('No encuentro «' + cambio.concepto + '» en «' + tabla.titulo + '». Recarga los datos e inténtalo de nuevo.');
        }
        fila = candidatas[0];
      }
      var valor;
      if (cambio.valor === null || cambio.valor === '') valor = '';
      else if (typeof cambio.valor === 'number' && isFinite(cambio.valor)) valor = Math.round(cambio.valor * 100) / 100;
      else throw new Error('Valor no válido para «' + cambio.concepto + '».');
      return { fila: fila.fila, col: col + 1, valor: valor };
    });

    // 2) Escribir.
    escrituras.forEach(function (e) {
      anio.hoja.getRange(e.fila, e.col).setValue(e.valor);
    });
    if (fechaIso && p.fechaRellenar) cbEscribirFecha_(info.h, info.fecha, fechaIso, tz);
    if (fechaIso && p.fechaDatos) {
      var datos = cbLeerDatos_(ss, tz).interno;
      cbEscribirFecha_(datos.h, datos.fecha, fechaIso, tz);
    }
    SpreadsheetApp.flush();
  } finally {
    candado.releaseLock();
  }
  var respuesta = cbLeer_({ anio: p.anio });
  respuesta.guardados = cambios.length;
  return respuesta;
}
