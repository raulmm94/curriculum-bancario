# Currículum bancario

Visor y generador de **currículum bancario** (informe de situación financiera para presentar a un
banco) conectado a tu propio Google Sheet.

- **Resumen**: patrimonio neto, ingresos, cuotas de deuda, cashflow, ratio de endeudamiento y LTV.
- **Patrimonio**: inmuebles con su hipoteca, otros préstamos e inversiones.
- **Mes a mes**: gráficos del año, formulario para rellenar o corregir cualquier mes y tabla anual.
- **Informe**: el currículum maquetado en folios A4, exportable a **PDF** (imprimir → guardar como
  PDF) y a **Excel** con formato.

Funciona en móvil y en ordenador, con tema claro y oscuro.

## Privacidad: qué se guarda y dónde

| Dónde | Qué hay |
|---|---|
| Este repositorio y Cloudflare | Solo el código de la app (HTML, CSS y JS estáticos). **Ningún dato personal.** |
| Tu Google Sheet | Todos tus datos. Nunca salen de ahí salvo hacia tu navegador. |
| Tu navegador | Los datos viven en la memoria de la pestaña y se pierden al cerrarla. El código de conexión solo se guarda (en `localStorage`) si marcas «Recordar en este dispositivo». |

No hay servidor, base de datos, sesiones, cookies ni analítica. El navegador habla **directamente**
con un Apps Script que vive dentro de tu hoja; Cloudflare no ve los datos en ningún momento. Quien abra
la URL publicada sin tu código de conexión no puede ver nada. Una política CSP estricta
(`public/_headers`) impide además que la página cargue o contacte con nada que no sea ella misma y
`script.google.com`.

El modo demo (botón «Ver una demo con datos ficticios») usa datos inventados incluidos en el repo.

## Puesta en marcha

### 1. Instalar el conector en tu Google Sheet

1. Abre el Google Sheet → **Extensiones → Apps Script**.
2. Borra lo que haya en `Código.gs`, pega el contenido de [`apps-script/Code.gs`](apps-script/Code.gs)
   y guarda.
3. **Implementar → Nueva implementación → Aplicación web**
   - Ejecutar como: **Yo**
   - Quién tiene acceso: **Cualquier usuario**
   - Autoriza cuando lo pida (el script solo tiene permiso sobre esta hoja: `@OnlyCurrentDoc`).
4. Copia la **URL de la aplicación web** (termina en `/exec`).
5. Vuelve a la hoja y recárgala. Aparece el menú **Currículum bancario → Código de conexión…**.
   Pega la URL y copia el código que empieza por `CB1.`.

> «Cualquier usuario» es necesario para que el navegador pueda llamar al script, pero el script no
> devuelve nada sin la clave secreta de 256 bits que va dentro del código de conexión.

### 2. Conectar la app

Abre la app, pega el código y pulsa **Conectar**. Para revocar el acceso en todos los dispositivos:
menú **Currículum bancario → Regenerar clave**.

### Actualizar el conector

Si cambia `Code.gs`: pega la nueva versión y en **Implementar → Gestionar implementaciones** edita la
implementación existente eligiendo **Nueva versión** (así la URL y el código de conexión no cambian).

## Estructura que espera en la hoja

No hay posiciones fijas: cada tabla se localiza por sus cabeceras, así que puedes añadir filas
(inmuebles, préstamos, inversiones, conceptos) o columnas sin tocar la app.

**Hoja `DATOS`**

| Bloque | Cómo se reconoce |
|---|---|
| Fecha | Celda «DATOS ACTUALIZADOS» y la fecha a su derecha |
| Inmuebles | Cabeceras `Tipología`, `Dirección`, … (la fila sin dirección es el total) |
| Préstamos | Cabeceras `Entidad`, `Imp. inicial`, … (la fila `TOTAL` es el total) |
| Trabajo | Cabeceras `Concepto`, `Valor`. Una fila `Titular` o `Nombre` se usa como titular del informe |
| Inversiones | Cabeceras `Broker`, `Activo`, `Valor`, `% inversión` |
| Resumen | Celda `RESUMEN` y, debajo, etiqueta + valor (+ porcentaje opcional) |
| Enlaces | Cabecera `Link`; la etiqueta a su izquierda y la URL debajo de `Link` |

**Hojas `Rellenar AAAA`** (una por año; la app muestra un selector cuando hay varias)

Tablas con cabeceras `Tipologia`, `Categoria`, `Concepto`, una columna resumen (`Total Año` o
`Ultimo Valor`) y una columna por mes (`Enero` … `Diciembre`). La fila `Total` cierra cada tabla.
`Ultimo Valor` marca las tablas de valores (inversiones); el resto son flujos (gastos e ingresos).

Para empezar un año nuevo: duplica la hoja, renómbrala `Rellenar 2027` y vacía los meses.

Convenciones de la hoja que la app respeta:

- En las tablas de valores, un `1` (mes aún sin rellenar) o un `2` (mes anterior a tener el activo)
  se tratan como «sin dato». En los flujos, un `1` exacto también.
- Los meses de gastos e ingresos anteriores al mes de «Datos actualizados» se consideran cerrados; los
  demás se muestran atenuados como previsión.
- La app solo escribe en celdas de mes de `Rellenar AAAA` (y, si lo pides, en la fecha «Datos
  actualizados»). Nunca toca fórmulas de totales ni la hoja `DATOS`.

## Desarrollo

No hay paso de compilación: `public/` se sirve tal cual.

```bash
npm run dev
```

Arranca un servidor local con las mismas cabeceras que producción y un **conector simulado** sobre un
libro ficticio. Imprime en consola el código de conexión de desarrollo.

```bash
npm test
```

Ejecuta el `Code.gs` real dentro de un entorno simulado de Apps Script (`test/mock-gas.mjs`) y prueba
el modelo de datos. `node test/e2e.cjs` recorre la app en un navegador (necesita Playwright y el
servidor de desarrollo recién arrancado).

```bash
npm run demo
```

Regenera los datos del modo demo (`public/js/demo-datos.js`) a partir del libro ficticio.

| Ruta | Contenido |
|---|---|
| `apps-script/Code.gs` | Conector que se pega en el Google Sheet |
| `public/` | La app estática (lo único que se despliega) |
| `public/js/modelo.js` | Reconoce columnas por cabecera y calcula derivados |
| `public/js/vistas/` | Resumen, Patrimonio, Mes a mes, Informe y Conexión |
| `public/js/graficos.js` | Gráficos SVG propios, sin librerías |
| `public/js/excel.js` | Exportación a Excel (usa `public/vendor/exceljs.min.js`, MIT) |
| `test/` | Entorno simulado, libro ficticio y tests |

## Ramas y despliegue

- `main`: producción.
- `dev`: desarrollo. Los cambios se prueban aquí y se pasan a `main` con un pull request.

Hay **un único Worker de Cloudflare** (`curriculum-bancario`), sin base de datos ni almacenamiento.

### Estado actual: Worker provisional

Mientras no haya un despliegue automático configurado, el Worker publicado es
[`cloudflare/worker-provisional.js`](cloudflare/worker-provisional.js): sirve los archivos de
`public/` de un commit concreto de este repositorio (necesita que el repo sea público) con las mismas
cabeceras de seguridad. Para publicar otra versión hay que cambiar el commit fijado en el Worker.

### Despliegue definitivo (recomendado): Workers Builds

En el panel de Cloudflare → *Workers & Pages* → `curriculum-bancario` → *Settings* → *Builds* →
**Connect** y elige este repositorio. Cloudflare lee `wrangler.jsonc` y a partir de ahí:

- cada push a `main` publica en producción (`npx wrangler deploy`);
- con *non-production branch builds* activado, cada push a `dev` genera una versión de prueba con
  su propia URL, sin tocar producción (`npx wrangler versions upload`).

Así hay rama de desarrollo y de producción con una sola aplicación, y el repositorio puede pasar a
ser privado.

### Despliegue manual con Wrangler

```bash
npm run deploy
```

Publica en producción (`wrangler deploy`, necesita `wrangler login` o un token de API).

```bash
npm run deploy:preview
```

Sube una versión de prueba con su propia URL (`dev-curriculum-bancario.<subdominio>.workers.dev`)
sin tocar producción.
