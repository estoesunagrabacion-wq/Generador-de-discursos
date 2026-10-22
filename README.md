# Generador de discursos

Generador paródico de discurso pedagógico-burocrático. Usted propone un tema; la institución lo problematiza.

La app recibe un tema («el uso del celular en el aula», «los recreos») y produce un documento con todos los rasgos del género: fundamentación, propósitos, marco normativo, notas al pie, firma y sello. Todo es gramaticalmente correcto y nada es concreto. El contador de «ideas concretas» siempre marca cero.

## Tipos de texto

Documentos escritos, con membrete, sellos y firma:

- Fundamentación de proyecto
- Informe de trayectoria
- Acta de reunión
- Circular a familias (con talón para devolver firmado)
- Convocatoria a jornada institucional
- Devolución de observación de clase

Discursos orales, presentados como versión taquigráfica, con acotaciones del tipo «(Aplausos.)»:

- Palabras del rector/a en un acto
- Exposición de especialista en una capacitación
- Declaraciones de funcionario/a ante la prensa
- Diapositivas de capacitación (viñetas sin verbos, nube de palabras, actividad en grupos)

Mensajes:

- Correo de la dirección, enviado un domingo a la noche
- Grupo de WhatsApp docente

Extras:

- Bingo de jornada institucional: un cartón distinto cada vez, con casilleros que se marcan tocándolos.
- Diccionario de la jerga pedagógica: una página de diccionario con entradas al azar (y una para el tema que se escriba).

Cualquier texto se puede descargar como imagen (o compartir directamente desde el celular) con el botón «Imagen».

## Cómo se usa

Se abre desde el navegador y se puede instalar en el celular. En Android, con el botón «Instalar» o desde el menú del navegador. En iPhone, desde Safari: Compartir y luego «Agregar a inicio». Una vez instalada funciona sin conexión.

## Cómo sumar o corregir frases

Todo el texto está en la carpeta `data/`, separado del código:

| Archivo | Qué contiene |
| --- | --- |
| `data/lexico.json` | Frases y piezas compartidas: marcos del tema, verbos vacíos, enfoques, conectores, afirmaciones, propuestas, cierres, notas al pie. |
| `data/documentos.json` | La estructura de cada tipo de texto y sus frases propias. Los discursos usan `"grupo": "oral"`. |
| `data/formatos.json` | Los tipos con formato propio: devolución, correo, WhatsApp, diapositivas, bingo (la lista `BINGO` tiene las expresiones del cartón) y diccionario (la lista `diccionario` tiene las entradas, cada una con `lema`, `cat`, `acepciones` y, si se quiere, `ejemplo` y `ver`). |
| `data/membrete.json` | Organismos, direcciones, lemas del año y pie de página. |
| `data/temas.json` | Temas que se usan al azar. |

Cada clave en MAYÚSCULAS es un **símbolo** con una lista de variantes. Dentro de una variante:

- `{SIMBOLO}` se reemplaza por una variante al azar de ese símbolo (se pueden anidar);
- `{tema}` es el tema que escribe el usuario;
- la mayúscula inicial de cada oración y las contracciones («de el» → «del») se resuelven solas.

Para agregar una frase basta con sumar una línea entre comillas a la lista correspondiente, sin olvidar la coma que separa cada línea de la siguiente. Se puede editar directamente en GitHub con el ícono del lápiz.

Tres cuidados para que las frases encajen:

- `TEMA_REF` se usa con participios en femenino («requiere ser pensada»), así que sus variantes tienen que ser femeninas.
- `SUJETOS` va siempre en plural.
- `ACCION` empieza siempre con un sustantivo en singular («la implementación de…»).

## Estructura técnica

Sitio estático (HTML, CSS y JavaScript; la única biblioteca externa es html2canvas, incluida en `js/vendor/`, para la exportación como imagen), publicado con GitHub Pages. El motor está en `js/motor.js` y la interfaz en `js/app.js`. El *service worker* (`sw.js`) guarda todo para uso sin conexión y busca cambios en segundo plano, así que una corrección en las frases aparece en la segunda visita.

Para probarlo localmente: `python3 -m http.server` en la carpeta del proyecto y abrir `http://localhost:8000`.

## Pendiente

- Lectura en voz alta de los discursos.
