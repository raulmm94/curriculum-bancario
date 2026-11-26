// Pantalla de conexión: sin código de conexión la app no puede ver ningún dato.
import { h, icono } from '../formato.js';

export function vistaConexion(app, { error = '', ocupado = false, codigo = '', recordado = false } = {}) {
  const campo = h('input', {
    id: 'codigo', name: 'password', type: 'password', autocomplete: 'current-password',
    placeholder: 'CB1.…', spellcheck: 'false', autocapitalize: 'off', required: true, value: codigo || null,
  });
  const recordar = h('input', { id: 'recordar', type: 'checkbox', checked: recordado });
  const ver = h('button.boton-icono', { type: 'button', title: 'Mostrar u ocultar el código', 'aria-label': 'Mostrar u ocultar el código',
    onclick: () => { campo.type = campo.type === 'password' ? 'text' : 'password'; } }, icono('ojo'));

  const formulario = h('form.conexion-form', {
    novalidate: true,
    onsubmit: (e) => { e.preventDefault(); app.conectar(campo.value, recordar.checked); },
  },
  // Campo de usuario oculto: permite que el gestor de contraseñas del navegador guarde el código.
  h('input', { type: 'text', name: 'username', autocomplete: 'username', value: 'Currículum bancario', hidden: true, readonly: true }),
  h('label', { for: 'codigo' }, 'Código de conexión'),
  h('div.campo-con-boton', campo, ver),
  error ? h('p.error', { role: 'alert' }, icono('alerta', 16), error) : null,
  h('label.casilla', recordar, h('span', 'Recordar en este dispositivo',
    h('small', 'Se guarda solo el código, en este navegador. Los datos nunca se almacenan.'))),
  h('button.boton.primario', { type: 'submit', disabled: ocupado }, ocupado ? 'Conectando…' : 'Conectar con mi Google Sheet'));

  return h('div.conexion',
    h('div.conexion-panel',
      h('div.marca-grande', h('span.marca-logo', icono('informe', 26)), h('span', 'Currículum bancario')),
      h('h1', 'Tu situación financiera, lista para presentar al banco'),
      h('p.entrada', 'Esta aplicación no contiene ningún dato. Se conecta a tu propio Google Sheet ' +
        'mediante un código que solo tú tienes, y lo muestra de forma clara en móvil y ordenador.'),
      formulario,
      h('button.boton.enlace', { type: 'button', onclick: () => app.abrirDemo(), disabled: ocupado }, 'Ver una demo con datos ficticios'),
      h('details.ayuda',
        h('summary', '¿De dónde saco el código de conexión?'),
        h('ol',
          h('li', 'Abre tu Google Sheet y entra en Extensiones → Apps Script.'),
          h('li', 'Pega el archivo Code.gs del repositorio, guarda e implementa como «Aplicación web» (ejecutar como tú; acceso: cualquier usuario).'),
          h('li', 'Vuelve a la hoja, recárgala y usa el menú «Currículum bancario → Código de conexión…».'),
          h('li', 'Copia el código que aparece y pégalo aquí.'))),
      h('ul.garantias',
        h('li', icono('candado', 18), h('span', h('strong', 'Sin servidor ni base de datos. '), 'La página es estática; habla directamente con tu hoja desde tu navegador.')),
        h('li', icono('candado', 18), h('span', h('strong', 'Nada se guarda. '), 'Los datos viven solo en la memoria de esta pestaña y desaparecen al cerrarla.')),
        h('li', icono('candado', 18), h('span', h('strong', 'Sin código, sin datos. '), 'Quien abra esta dirección sin tu código no puede ver nada.')))));
}
