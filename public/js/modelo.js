// Convierte la respuesta del conector en un modelo cómodo para las vistas.
// Las columnas se reconocen por el nombre de su cabecera, de modo que la hoja puede
// crecer (más inmuebles, préstamos, columnas nuevas…) sin tocar la app.
import { normalizar, valorNumerico, valorTexto, hoyIso } from './formato.js';

const CAMPOS_INMUEBLE = [
  ['tipologia', /^tipolog/], ['direccion', /^direcc/], ['metros', /^(metros|m2|superficie)/],
  ['refCatastral', /catastral/], ['banco', /^(banco|entidad)/], ['inicial', /^imp.*inicial/],
  ['pendiente', /^imp.*pend/], ['pctPagado', /^%.*pagado/], ['pctPendiente', /^%.*pend/],
  ['inicio', /^fecha inicio/], ['fin', /^fecha fin/], ['aniosPend', /^anos pend/], ['tipo', /^tipo$/],
  ['interes', /^interes/], ['cuota', /^cuota/], ['valorMercado', /^valor mercado/],
  ['valorNeto', /^valor neto/], ['alquiler', /alquiler/], ['cashflow', /^cashflow/], ['ratio', /^ratio/],
];
const CAMPOS_PRESTAMO = [
  ['entidad', /^(entidad|banco)/], ['inicial', /^imp.*inicial/], ['pendiente', /^imp.*pend/],
  ['pctPagado', /^%.*pagado/], ['pctPendiente', /^%.*pend/], ['inicio', /^fecha inicio/],
  ['fin', /^fecha fin/], ['aniosPend', /^anos pend/], ['tipo', /^tipo$/], ['interes', /^interes/],
  ['cuota', /^cuota mensual/], ['cuotasPend', /^cuotas/], ['finalidad', /^finalidad/],
];
const CAMPOS_INVERSION = [
  ['broker', /^broker/], ['activo', /^activo/], ['valor', /^valor/], ['pct', /^%/],
];
const CAMPOS_RESUMEN = [
  ['ingresos', /^total ingresos/], ['deudas', /^total deudas/], ['cashflow', /cashflow/],
  ['patrimonioInmo', /patrimonio neto.*inmob/], ['inversiones', /^total inversion/],
  ['patrimonioNeto', /^patrimonio total neto/], ['patrimonioBruto', /patrimonio bruto/],
  ['ratio', /^ratio endeudamiento/], ['ratioExtra', /^r\.?\s?e\.?\s+con/],
];

/** Asigna a cada cabecera el primer campo libre cuyo patrón encaje. */
function mapear(tabla, campos) {
  const vacio = { items: [], total: null, etiquetas: {}, cabeceras: [], filas: [], filaTotal: null };
  if (!tabla) return vacio;
  const indice = {};
  const etiquetas = {};
  const usados = new Set();
  tabla.cabeceras.forEach((cab, i) => {
    const n = normalizar(cab);
    const campo = campos.find(([nombre, re]) => !usados.has(nombre) && re.test(n));
    if (campo) { usados.add(campo[0]); indice[i] = campo[0]; etiquetas[campo[0]] = cab.trim(); }
  });
  const registro = (fila) => {
    if (!fila) return null;
    const r = { extras: [] };
    fila.forEach((c, i) => {
      if (indice[i]) r[indice[i]] = c;
      else if (c) r.extras.push({ etiqueta: tabla.cabeceras[i], celda: c });
    });
    return r;
  };
  return {
    items: tabla.filas.map(registro),
    total: registro(tabla.total),
    etiquetas,
    cabeceras: tabla.cabeceras.map((c) => c.trim()),
    filas: tabla.filas,
    filaTotal: tabla.total,
  };
}

const suma = (items, campo) => items.reduce((a, x) => a + (valorNumerico(x[campo]) ?? 0), 0);

export function construirModelo(payload) {
  const d = payload.datos || {};
  const inmuebles = mapear(d.inmuebles, CAMPOS_INMUEBLE);
  const prestamos = mapear(d.prestamos, CAMPOS_PRESTAMO);
  const inversiones = mapear(d.inversiones, CAMPOS_INVERSION);
  const trabajo = ((d.trabajo && d.trabajo.filas) || [])
    .filter((f) => f[0])
    .map((f) => ({ concepto: valorTexto(f[0]), celda: f[1] || null }));

  const kpi = {};
  const otros = [];
  const usados = new Set();
  const resumen = (d.resumen || []).map((fila) => {
    const n = normalizar(fila.etiqueta);
    const campo = CAMPOS_RESUMEN.find(([nombre, re]) => !usados.has(nombre) && re.test(n));
    const item = { ...fila, campo: campo ? campo[0] : null };
    if (campo) { usados.add(campo[0]); kpi[campo[0]] = item; } else otros.push(item);
    return item;
  });

  const total = (modelo, campo) => valorNumerico(modelo.total && modelo.total[campo]) ?? suma(modelo.items, campo);
  const deudaHipotecas = total(inmuebles, 'pendiente');
  const deudaPrestamos = total(prestamos, 'pendiente');
  const valorInmuebles = total(inmuebles, 'valorMercado');
  const valorInversiones = total(inversiones, 'valor');
  const titular = trabajo.find((t) => /^(titular|nombre)/.test(normalizar(t.concepto)));

  return {
    titulo: payload.titulo || 'Cuadro financiero',
    generado: payload.generado || null,
    actualizado: d.actualizado || null,
    inmuebles, prestamos, inversiones, trabajo,
    resumen, kpi, otrosResumen: otros,
    enlaces: (d.enlaces || []).map((e) => ({ etiqueta: e.etiqueta, url: urlSegura(e.url) })),
    titular: titular ? valorTexto(titular.celda) : '',
    derivados: {
      deudaHipotecas, deudaPrestamos, deudaTotal: deudaHipotecas + deudaPrestamos,
      cuotaHipotecas: total(inmuebles, 'cuota'), cuotaPrestamos: total(prestamos, 'cuota'),
      valorInmuebles, valorInversiones,
      alquileres: total(inmuebles, 'alquiler'),
      ltv: valorInmuebles > 0 ? deudaHipotecas / valorInmuebles : null,
    },
  };
}

export function urlSegura(url) {
  return typeof url === 'string' && /^https?:\/\/\S+$/i.test(url.trim()) ? url.trim() : null;
}

/* ------------------------------------------------------------------ */
/* Seguimiento mensual («Rellenar AAAA»)                               */
/* ------------------------------------------------------------------ */

export const claveCambio = (tablaId, fila, mes) => `${tablaId}|${fila}|${mes}`;

/**
 * La hoja usa valores marcador en celdas aún sin dato: un 1 en los meses pendientes de rellenar
 * (lo necesita la fórmula «Último valor») y un 2 en los meses anteriores a tener el activo.
 * La app los trata como «sin dato».
 */
export function esMarcador(tipo, v) {
  if (v === null || v === undefined) return true;
  return tipo === 'valor' ? (v === 1 || v === 2) : v === 1;
}
export const valorReal = (tipo, v) => (esMarcador(tipo, v) ? null : v);

/** Meses de gastos/ingresos que se consideran cerrados según la fecha «Datos actualizados». */
export function mesesCerrados(anio, actualizado) {
  const m = /^(\d{4})-(\d{2})/.exec(actualizado || hoyIso());
  const a = +m[1];
  if (a > anio) return 12;
  if (a < anio) return 0;
  return +m[2] - 1;
}

const CLASE_GASTO = [
  ['inversion', /invers|ahorr/],
  ['deuda', /prestam|hipotec|deuda/],
];
export function claseGasto(categoria) {
  const n = normalizar(categoria);
  const c = CLASE_GASTO.find(([, re]) => re.test(n));
  return c ? c[0] : 'consumo';
}

/**
 * Modelo mensual con los cambios pendientes ya aplicados.
 * `pendientes`: Map clave → { valor }
 */
export function construirMensual(rellenar, pendientes = new Map()) {
  if (!rellenar) return null;
  const cerrados = mesesCerrados(rellenar.anio, rellenar.actualizado);
  const tablas = rellenar.tablas.map((t) => {
    const filas = t.filas.map((f) => {
      const valores = [];
      const editado = [];
      for (let m = 0; m < 12; m++) {
        const p = pendientes.get(claveCambio(t.id, f.fila, m + 1));
        editado.push(Boolean(p));
        valores.push(valorReal(t.tipo, p ? p.valor : f.meses[m]));
      }
      let ultimo = null;
      let previo = null;
      let mesUltimo = -1;
      if (t.tipo === 'valor') {
        for (let m = 11; m >= 0; m--) {
          if (valores[m] === null) continue;
          if (ultimo === null) { ultimo = valores[m]; mesUltimo = m; } else { previo = valores[m]; break; }
        }
      }
      return { ...f, valores, editado, ultimo, previo, mesUltimo };
    });
    const totalMes = [];
    for (let m = 0; m < 12; m++) {
      const reales = filas.map((f) => f.valores[m]).filter((v) => v !== null);
      totalMes.push(reales.length ? reales.reduce((a, b) => a + b, 0) : null);
    }
    return { ...t, filas, totalMes };
  });
  const porId = Object.fromEntries(tablas.map((t) => [t.id, t]));
  const gastos = porId.gastos || tablas.find((t) => t.tipo === 'flujo' && /gasto/.test(normalizar(t.titulo)));
  const ingresos = porId.ingresos || tablas.find((t) => t.tipo === 'flujo' && t !== gastos);
  const cero = (x) => x ?? 0;

  const mensual = [];
  for (let m = 0; m < 12; m++) {
    const ing = ingresos ? cero(ingresos.totalMes[m]) : 0;
    const gas = gastos ? cero(gastos.totalMes[m]) : 0;
    mensual.push({ mes: m, ingresos: ing, gastos: gas, sobrante: ing - gas, cerrado: m < cerrados });
  }

  // Acumulado de los meses cerrados.
  const acum = { ingresos: 0, gastos: 0, consumo: 0, deuda: 0, inversion: 0 };
  const categorias = new Map();
  if (gastos) {
    for (const f of gastos.filas) {
      const clase = claseGasto(f.categoria);
      let t = 0;
      for (let m = 0; m < cerrados; m++) t += cero(f.valores[m]);
      acum[clase] += t;
      acum.gastos += t;
      const previo = categorias.get(f.categoria) || { nombre: f.categoria, clase, total: 0 };
      previo.total += t;
      categorias.set(f.categoria, previo);
    }
  }
  if (ingresos) for (let m = 0; m < cerrados; m++) acum.ingresos += cero(ingresos.totalMes[m]);
  acum.sobrante = acum.ingresos - acum.gastos;
  acum.capacidadAhorro = acum.ingresos - acum.consumo - acum.deuda;

  return {
    anio: rellenar.anio,
    hoja: rellenar.hoja,
    actualizado: rellenar.actualizado,
    cerrados,
    tablas,
    porId,
    gastos,
    ingresos,
    valores: tablas.filter((t) => t.tipo === 'valor'),
    mensual,
    acum,
    categorias: [...categorias.values()].sort((a, b) => b.total - a.total),
  };
}
