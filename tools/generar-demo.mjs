// Genera public/js/demo-datos.js ejecutando el conector real (apps-script/Code.gs)
// contra el libro ficticio. Así el modo demo tiene exactamente la forma de la API.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { cargarConector } from '../test/mock-gas.mjs';
import { crearLibroFicticio } from '../test/hoja-ficticia.mjs';

const gas = cargarConector(crearLibroFicticio(), { CB_CLAVE: 'demo' });
const datos = gas.post({ k: 'demo', accion: 'leer' });
if (!datos.ok) throw new Error(datos.mensaje);
datos.generado = '2026-11-02T09:00:00';
const destino = fileURLToPath(new URL('../public/js/demo-datos.js', import.meta.url));
writeFileSync(destino,
  '// Datos FICTICIOS para el modo demo. Generado con `npm run demo`; no editar a mano.\n' +
  'export default ' + JSON.stringify(datos) + ';\n');
console.log('Demo generada:', destino);
