(function () {
  'use strict';

  var SVGNS = 'http://www.w3.org/2000/svg';
  var motor = null;
  var doc = null;
  var tipoActual = 'planificacion';
  var eventoInstalar = null;

  var $ = function (id) { return document.getElementById(id); };

  function guardar(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sin almacenamiento */ } }
  function leer(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }

  function el(tag, cls, texto) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (texto != null) n.textContent = texto;
    return n;
  }
  function svg(tag, attrs) {
    var n = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    return n;
  }
  function azar(a, b) { return a + Math.random() * (b - a); }

  function aviso(msg) {
    var a = $('aviso');
    a.textContent = msg;
    a.hidden = false;
    clearTimeout(aviso._t);
    aviso._t = setTimeout(function () { a.hidden = true; }, 2200);
  }

  /* ---------- carga de datos ---------- */
  function cargar(nombre) {
    return fetch('data/' + nombre + '.json').then(function (r) {
      if (!r.ok) throw new Error(nombre);
      return r.json();
    });
  }

  Promise.all(['lexico', 'documentos', 'membrete', 'temas'].map(cargar))
    .then(function (d) {
      motor = new window.Motor({ lexico: d[0], documentos: d[1], membrete: d[2], temas: d[3].temas });
      iniciar();
    })
    .catch(function () {
      $('documento').textContent = 'No se pudieron cargar los bancos de frases. Si abriste el archivo directamente, publicalo o servilo desde un servidor web.';
    });

  /* ---------- interfaz ---------- */
  function iniciar() {
    var guardado = leer('tipo');
    if (guardado && motor.tipos[guardado]) tipoActual = guardado;
    pintarTipos();
    insertarFiltroTinta();

    $('btn-generar').addEventListener('click', generar);
    $('tema').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); $('tema').blur(); generar(); }
    });
    $('btn-azar').addEventListener('click', function () {
      $('tema').value = motor.temaAlAzar();
      generar();
    });
    $('btn-otra').addEventListener('click', function () { generar(true); });
    $('btn-extender').addEventListener('click', extender);
    $('btn-copiar').addEventListener('click', copiar);
    $('btn-compartir').addEventListener('click', compartir);

    generar(false, true);
  }

  function pintarTipos() {
    var cont = $('tipos');
    cont.textContent = '';
    Object.keys(motor.tipos).forEach(function (id) {
      var b = el('button', 'tipo', motor.tipos[id].nombre);
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(id === tipoActual));
      b.addEventListener('click', function () {
        tipoActual = id;
        guardar('tipo', id);
        pintarTipos();
        generar();
      });
      cont.appendChild(b);
    });
  }

  function generar(soloOtra, inicial) {
    var tema = $('tema').value;
    if (!tema.trim()) {
      tema = (soloOtra && doc) ? doc.tema : motor.temaAlAzar();
      if (!inicial) $('tema').value = tema;
    }
    doc = motor.documento(tipoActual, tema);
    pintar();
    $('acciones').hidden = false;
    if (!inicial) {
      var y = $('salida').getBoundingClientRect().top + window.scrollY - 70;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  }

  function extender() {
    if (!doc) return;
    motor.extender(doc);
    pintar(true);
    var e = doc.extensiones;
    aviso(e === 1 ? 'Se agregó un párrafo. La idea sigue siendo la misma.' :
      'Párrafo n.º ' + (e) + ' agregado. Faltan ' + Math.max(0, 2 - motor.estadisticas(doc).carillas) + ' carillas.');
  }

  /* ---------- dibujo del documento ---------- */
  function pintar(esExtension) {
    var hoja = $('documento');
    hoja.textContent = '';
    hoja.classList.remove('entra');
    void hoja.offsetWidth;
    if (!esExtension) hoja.classList.add('entra');

    var m = doc.membrete;
    var mem = el('div', 'membrete');
    mem.appendChild(escudo());
    var lin = el('div', 'lineas');
    lin.appendChild(el('div', 'organismo', m.organismo));
    lin.appendChild(el('div', null, m.direccion));
    lin.appendChild(el('div', 'escuela', m.escuela));
    mem.appendChild(lin);
    hoja.appendChild(mem);
    hoja.appendChild(el('p', 'lema', '«' + m.lema + '»'));
    hoja.appendChild(el('p', 'lugar-fecha', m.lugarFecha));
    hoja.appendChild(selloRecibido());

    hoja.appendChild(el('h2', null, doc.titulo));

    if (doc.encabezado.length) {
      var enc = el('div', 'encabezado');
      doc.encabezado.forEach(function (e) {
        var d = el('div');
        d.appendChild(el('b', null, e.etiqueta + ': '));
        d.appendChild(document.createTextNode(e.valor));
        enc.appendChild(d);
      });
      hoja.appendChild(enc);
    }
    if (doc.saludo) hoja.appendChild(el('p', 'saludo', doc.saludo));

    var numSeccion = 0;
    doc.secciones.forEach(function (s) {
      if (s.titulo) {
        numSeccion++;
        hoja.appendChild(el('h3', null, numSeccion + '. ' + s.titulo));
      }
      (s.parrafos || []).forEach(function (p) {
        var nodo = el('p', 'cuerpo', p);
        hoja.appendChild(nodo);
        if (esExtension && p === doc.ultimoNuevo) nodo.classList.add('nuevo');
      });
      if (s.lista) {
        var ul = el('ul');
        s.lista.forEach(function (i) { ul.appendChild(el('li', null, i)); });
        hoja.appendChild(ul);
      }
      if (s.agenda) {
        var t = el('table', 'agenda');
        s.agenda.forEach(function (f) {
          var tr = el('tr', f[0] ? null : 'pausa');
          tr.appendChild(el('td', null, f[0] || '—'));
          tr.appendChild(el('td', null, f[1]));
          t.appendChild(tr);
        });
        hoja.appendChild(t);
      }
    });

    if (doc.tipoId === 'acta') {
      var fa = el('div', 'firmas-acta');
      for (var i = 0; i < 4; i++) {
        var c = el('div', null, 'Docente');
        c.appendChild(garabato(120, 40));
        fa.appendChild(c);
      }
      fa.appendChild(selloRedondo('Escuela N.º ' + doc.numeroEscuela));
      hoja.appendChild(fa);
    } else {
      var firma = el('div', 'firma');
      firma.appendChild(garabato(200, 60));
      firma.appendChild(el('div', 'raya', doc.firma));
      firma.appendChild(selloRedondo('Escuela N.º ' + doc.numeroEscuela));
      hoja.appendChild(firma);
    }

    if (doc.notas.length) {
      var notas = el('div', 'notas');
      notas.appendChild(el('hr'));
      doc.notas.forEach(function (n, i) {
        notas.appendChild(el('p', null, window.Motor.superindice(i + 1) + ' ' + n));
      });
      hoja.appendChild(notas);
    }

    if (doc.talon) {
      var talon = el('div', 'talon');
      talon.appendChild(el('p', null, 'Tomé conocimiento de la ' + doc.titulo + ' (' + doc.tema + ').'));
      talon.appendChild(el('p', null, 'Firma del adulto responsable: ______________________'));
      talon.appendChild(el('p', null, 'Aclaración: ____________________  Curso: ______'));
      hoja.appendChild(talon);
    }

    hoja.appendChild(el('p', 'pie-doc', m.pie));

    var est = motor.estadisticas(doc);
    var e = $('estadisticas');
    e.textContent = '';
    e.appendChild(document.createTextNode(est.palabras + ' palabras · ' + est.carillas +
      (est.carillas === 1 ? ' carilla' : ' carillas') + ' · Ideas concretas: '));
    e.appendChild(el('b', null, '0'));
  }

  /* ---------- adornos ---------- */
  function escudo() {
    var s = svg('svg', { viewBox: '0 0 48 48', width: 44, height: 44, 'aria-hidden': 'true' });
    s.appendChild(svg('circle', { cx: 24, cy: 24, r: 21, fill: 'none', stroke: '#1d2433', 'stroke-width': 1.6 }));
    s.appendChild(svg('circle', { cx: 24, cy: 24, r: 17.5, fill: 'none', stroke: '#1d2433', 'stroke-width': .7 }));
    // laureles
    for (var i = 0; i < 7; i++) {
      var ang = 200 + i * 20;
      [1, -1].forEach(function (lado) {
        var a = (lado === 1 ? ang : 540 - ang) * Math.PI / 180;
        var x = 24 + Math.cos(a) * 13.5, y = 24 + Math.sin(a) * 13.5;
        s.appendChild(svg('ellipse', {
          cx: x.toFixed(2), cy: y.toFixed(2), rx: 2.6, ry: 1.1, fill: '#1d2433',
          transform: 'rotate(' + ((lado === 1 ? ang : 540 - ang) + 90) + ' ' + x.toFixed(2) + ' ' + y.toFixed(2) + ')'
        }));
      });
    }
    // libro abierto
    s.appendChild(svg('path', { d: 'M15 22c3-1.6 6-1.6 9 0v9c-3-1.6-6-1.6-9 0zM33 22c-3-1.6-6-1.6-9 0v9c3-1.6 6-1.6 9 0z', fill: 'none', stroke: '#1d2433', 'stroke-width': 1.2, 'stroke-linejoin': 'round' }));
    s.appendChild(svg('path', { d: 'M24 13.5l1.2 2.5 2.7.3-2 1.8.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.8 2.7-.3z', fill: '#1d2433' }));
    return s;
  }

  function garabato(w, h) {
    var s = svg('svg', { viewBox: '0 0 ' + w + ' ' + h, width: w, height: h, 'class': 'garabato', 'aria-hidden': 'true' });
    var x = w * .12, y = h * .62;
    var d = 'M' + x.toFixed(1) + ' ' + y.toFixed(1);
    var pasos = 5 + Math.floor(Math.random() * 3);
    for (var i = 0; i < pasos; i++) {
      var nx = x + (w * .76) / pasos;
      var c1y = h * azar(.05, .45), c2y = h * azar(.55, .95);
      d += ' C' + (x + azar(4, 14)).toFixed(1) + ' ' + c1y.toFixed(1) + ' ' +
        (nx - azar(-6, 10)).toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + nx.toFixed(1) + ' ' + (h * azar(.4, .75)).toFixed(1);
      x = nx;
    }
    d += ' M' + (w * .2).toFixed(1) + ' ' + (h * .8).toFixed(1) + ' Q' + (w * .55) + ' ' + (h * azar(.7, .95)).toFixed(1) + ' ' + (w * .9) + ' ' + (h * .72).toFixed(1);
    s.appendChild(svg('path', { d: d, fill: 'none', stroke: '#22306b', 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return s;
  }

  function selloRedondo(texto) {
    var s = svg('svg', { viewBox: '0 0 120 120', width: 104, height: 104, 'class': 'sello sello-redondo', 'aria-hidden': 'true' });
    var col = '#5b3a8c';
    var defs = svg('defs');
    var id = 'arco' + Math.floor(Math.random() * 1e6);
    defs.appendChild(svg('path', { id: id, d: 'M60 60 m-44 0 a44 44 0 1 1 88 0 a44 44 0 1 1 -88 0' }));
    s.appendChild(defs);
    s.appendChild(svg('circle', { cx: 60, cy: 60, r: 56, fill: 'none', stroke: col, 'stroke-width': 3 }));
    s.appendChild(svg('circle', { cx: 60, cy: 60, r: 36, fill: 'none', stroke: col, 'stroke-width': 1.5 }));
    var t = svg('text', { fill: col, 'font-family': 'Times New Roman, serif', 'font-size': 10.5, 'font-weight': 700, 'letter-spacing': 1.2 });
    var tp = svg('textPath', { href: '#' + id });
    tp.setAttribute('textLength', '268');
    tp.textContent = (texto + ' · Ciudad de Buenos Aires · ').toUpperCase();
    t.appendChild(tp);
    s.appendChild(t);
    var c = svg('text', { x: 60, y: 57, 'text-anchor': 'middle', fill: col, 'font-family': 'Times New Roman, serif', 'font-size': 9, 'font-weight': 700 });
    c.textContent = 'DIRECCIÓN';
    s.appendChild(c);
    var c2 = svg('text', { x: 60, y: 70, 'text-anchor': 'middle', fill: col, 'font-family': 'Times New Roman, serif', 'font-size': 8 });
    c2.textContent = '★ ★ ★';
    s.appendChild(c2);
    s.setAttribute('filter', 'url(#tinta)');
    return s;
  }

  function selloRecibido() {
    var meses = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];
    var h = new Date();
    var d = el('div', 'sello sello-recibido');
    d.setAttribute('aria-hidden', 'true');
    d.appendChild(el('b', null, 'Recibido'));
    d.appendChild(el('span', null, h.getDate() + ' ' + meses[h.getMonth()] + ' ' + h.getFullYear()));
    d.appendChild(el('br'));
    d.appendChild(el('span', null, 'Mesa de entradas'));
    return d;
  }

  function insertarFiltroTinta() {
    var s = svg('svg', { width: 0, height: 0, style: 'position:absolute', 'aria-hidden': 'true' });
    var f = svg('filter', { id: 'tinta' });
    f.appendChild(svg('feTurbulence', { type: 'fractalNoise', baseFrequency: '0.9', numOctaves: 2, result: 'ruido' }));
    f.appendChild(svg('feDisplacementMap', { 'in': 'SourceGraphic', in2: 'ruido', scale: 1.6 }));
    s.appendChild(f);
    document.body.appendChild(s);
  }

  /* ---------- copiar y compartir ---------- */
  function texto() { return motor.texto(doc); }

  function copiar() {
    var t = texto();
    var ok = function () { aviso('Copiado. Puede pegarlo en el grupo de la sala de profesores.'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(ok, function () { copiarViejo(t) ? ok() : aviso('No se pudo copiar.'); });
    } else {
      copiarViejo(t) ? ok() : aviso('No se pudo copiar.');
    }
  }
  function copiarViejo(t) {
    var ta = document.createElement('textarea');
    ta.value = t;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  function compartir() {
    var t = texto();
    if (navigator.share) {
      navigator.share({ title: doc.titulo, text: t }).catch(function () { /* cancelado */ });
    } else {
      copiar();
    }
  }

  /* ---------- instalación como app ---------- */
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    eventoInstalar = e;
    $('btn-instalar').hidden = false;
  });
  $('btn-instalar').addEventListener('click', function () {
    if (eventoInstalar) {
      eventoInstalar.prompt();
      eventoInstalar.userChoice.finally(function () {
        eventoInstalar = null;
        $('btn-instalar').hidden = true;
      });
    }
  });
  window.addEventListener('appinstalled', function () { $('btn-instalar').hidden = true; });

  var esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var instalada = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (esIOS && !instalada) {
    var b = $('btn-instalar');
    b.hidden = false;
    b.addEventListener('click', function () {
      aviso('En Safari: botón Compartir y luego «Agregar a inicio».');
    });
  }

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* sin modo offline */ });
    });
  }
})();
