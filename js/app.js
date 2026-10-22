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

  Promise.all(['lexico', 'documentos', 'formatos', 'membrete', 'temas'].map(cargar))
    .then(function (d) {
      motor = new window.Motor({ lexico: d[0], documentos: d[1], formatos: d[2], membrete: d[3], temas: d[4].temas });
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
    $('btn-imagen').addEventListener('click', imagen);

    generar(false, true);
  }

  var grupoVisible = null;
  var GRUPOS = [['escrito', 'Documentos'], ['oral', 'Discursos'], ['mensaje', 'Mensajes'], ['juego', 'Extras']];

  function grupoDe(id) { return motor.tipos[id].grupo || 'escrito'; }

  // Pestañas por grupo; debajo, los tipos del grupo elegido en varias líneas.
  function pintarTipos() {
    var cont = $('tipos');
    cont.textContent = '';
    if (!grupoVisible) grupoVisible = grupoDe(tipoActual);
    var pestanas = el('div', 'pestanas');
    pestanas.setAttribute('role', 'tablist');
    GRUPOS.forEach(function (g) {
      var t = el('button', 'pestana', g[1]);
      t.type = 'button';
      t.setAttribute('role', 'tab');
      t.setAttribute('aria-selected', String(g[0] === grupoVisible));
      if (g[0] === grupoDe(tipoActual)) t.classList.add('contiene-actual');
      t.addEventListener('click', function () {
        grupoVisible = g[0];
        pintarTipos();
      });
      pestanas.appendChild(t);
    });
    cont.appendChild(pestanas);
    var fila = el('div', 'tipos-fila');
    fila.setAttribute('role', 'radiogroup');
    Object.keys(motor.tipos).forEach(function (id) {
      if (grupoDe(id) !== grupoVisible) return;
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
      fila.appendChild(b);
    });
    cont.appendChild(fila);
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
    $('btn-extender').disabled = doc.formato === 'bingo';
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
    if (doc.formato === 'whatsapp') {
      aviso('Nuevos mensajes en el grupo.');
    } else if (doc.formato === 'diccionario') {
      aviso('Se agregaron entradas. Ninguna define nada.');
    } else if (doc.formato === 'diapositivas') {
      aviso('Se agregó una diapositiva. Sigue sin haber verbos.');
    } else if (doc.oral) {
      aviso(e === 1 ? 'El orador pidió un minuto más.' : 'El orador sigue. Ya van ' + motor.estadisticas(doc).minutos + ' minutos.');
    } else {
      aviso(e === 1 ? 'Se agregó un párrafo. La idea sigue siendo la misma.' : 'Párrafo n.º ' + e + ' agregado. La idea sigue siendo la misma.');
    }
  }

  /* ---------- dibujo del documento ---------- */
  function pintar(esExtension) {
    var hoja = $('documento');
    hoja.textContent = '';
    hoja.classList.remove('entra');
    void hoja.offsetWidth;
    if (!esExtension) hoja.classList.add('entra');

    var m = doc.membrete;
    hoja.className = 'hoja formato-' + doc.formato + (esExtension ? '' : ' entra');
    hoja.classList.toggle('oral', !!doc.oral);
    var especial = { oral: pintarOral, correo: pintarCorreo, whatsapp: pintarWhatsapp,
      diapositivas: pintarDiapositivas, bingo: pintarBingo, diccionario: pintarDiccionario }[doc.formato];
    if (especial) { especial(hoja); pintarEstadisticas(); return; }
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

    pintarEstadisticas();
  }

  function pintarEstadisticas() {
    var est = motor.estadisticas(doc);
    var e = $('estadisticas');
    e.textContent = '';
    if (doc.formato === 'bingo') {
      e.appendChild(document.createTextNode('25 casilleros · Probabilidad de completarlo en una jornada: '));
      e.appendChild(el('b', null, 'muy alta'));
      return;
    }
    var medida;
    if (doc.formato === 'whatsapp') medida = est.mensajes + ' mensajes';
    else if (doc.formato === 'diapositivas') medida = est.diapositivas + ' diapositivas';
    else if (doc.formato === 'diccionario') medida = est.entradas + ' entradas';
    else if (doc.oral) medida = est.palabras + ' palabras · duración estimada: ' + est.minutos + (est.minutos === 1 ? ' minuto' : ' minutos');
    else medida = est.palabras + ' palabras · ' + est.carillas + (est.carillas === 1 ? ' carilla' : ' carillas');
    e.appendChild(document.createTextNode(medida + ' · Ideas concretas: '));
    e.appendChild(el('b', null, '0'));
  }

  // Versión taquigráfica: sin membrete ni sellos; acotaciones en cursiva.
  function pintarOral(hoja) {
    var cab = el('div', 'cabecera-oral');
    cab.appendChild(el('span', 'rotulo', 'Versión taquigráfica'));
    cab.appendChild(el('h2', null, doc.evento));
    var orador = el('p', 'orador');
    orador.appendChild(el('span', null, 'Hace uso de la palabra: '));
    orador.appendChild(el('b', null, doc.orador));
    cab.appendChild(orador);
    cab.appendChild(el('p', 'lugar-fecha-oral', doc.membrete.lugarFecha));
    hoja.appendChild(cab);
    if (doc.saludo) hoja.appendChild(conAcotaciones(el('p', 'saludo-oral'), doc.saludo));
    doc.secciones.forEach(function (s) {
      (s.parrafos || []).forEach(function (p) {
        var nodo = conAcotaciones(el('p', 'cuerpo'), p);
        if (p === doc.ultimoNuevo) nodo.classList.add('nuevo');
        hoja.appendChild(nodo);
      });
    });
    hoja.appendChild(el('p', 'pie-doc', doc.membrete.pie));
  }

  function conAcotaciones(nodo, texto) {
    texto.split(/(\([^)]*\))/).forEach(function (trozo) {
      if (!trozo) return;
      if (/^\(.*\)$/.test(trozo)) nodo.appendChild(el('em', 'acotacion', trozo));
      else nodo.appendChild(document.createTextNode(trozo));
    });
    return nodo;
  }


  /* ---------- correo ---------- */
  function pintarCorreo(hoja) {
    var c = doc.correo;
    var barra = el('div', 'correo-barra');
    barra.appendChild(el('span', null, '← Bandeja de entrada'));
    barra.appendChild(el('span', 'correo-iconos', '🗑  ⋮'));
    hoja.appendChild(barra);
    var asunto = el('h2', 'correo-asunto', doc.titulo);
    asunto.appendChild(el('span', 'etiqueta-correo', 'Importante'));
    hoja.appendChild(asunto);
    var cab = el('div', 'correo-cabecera');
    cab.appendChild(el('div', 'avatar', 'D'));
    var datos = el('div', 'correo-datos');
    var linea = el('div');
    linea.appendChild(el('b', null, c.de));
    linea.appendChild(el('span', 'correo-fecha', c.fecha));
    datos.appendChild(linea);
    datos.appendChild(el('div', 'correo-para', 'para ' + c.para + ', CC: ' + c.cc));
    cab.appendChild(datos);
    hoja.appendChild(cab);
    var cuerpo = el('div', 'correo-cuerpo');
    if (doc.saludo) cuerpo.appendChild(el('p', null, doc.saludo));
    doc.secciones.forEach(function (s) {
      (s.parrafos || []).forEach(function (p) {
        var n = el('p', null, p);
        if (p === doc.ultimoNuevo) n.classList.add('nuevo');
        cuerpo.appendChild(n);
      });
    });
    var firma = el('div', 'correo-firma');
    firma.appendChild(el('div', null, '--'));
    firma.appendChild(el('div', null, doc.firma));
    firma.appendChild(el('div', null, doc.membrete.escuela));
    firma.appendChild(el('div', 'lema-firma', '«' + doc.membrete.lema + '»'));
    firma.appendChild(el('div', 'enviado', 'Enviado desde mi celular. Disculpe la brevedad.'));
    cuerpo.appendChild(firma);
    if (c.pd) cuerpo.appendChild(el('p', 'correo-pd', c.pd));
    hoja.appendChild(cuerpo);
    if (c.adjunto) {
      var adj = el('div', 'adjunto');
      adj.appendChild(el('span', 'clip', '📎'));
      var nom = el('div');
      nom.appendChild(el('b', null, c.adjunto));
      nom.appendChild(el('span', null, ['18 KB', '2,4 MB', '0 KB', '48 MB'][Math.floor(Math.random() * 4)]));
      adj.appendChild(nom);
      hoja.appendChild(adj);
    }
    hoja.appendChild(el('p', 'pie-doc', doc.membrete.pie));
  }

  /* ---------- grupo de WhatsApp ---------- */
  var COLORES_WA = ['#c2185b', '#1565c0', '#2e7d32', '#ef6c00', '#6a1b9a', '#00838f', '#ad1457', '#5d4037', '#283593', '#9e9d24'];
  function colorDe(nombre) {
    var h = 0;
    for (var i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
    return COLORES_WA[h % COLORES_WA.length];
  }

  function pintarWhatsapp(hoja) {
    var cab = el('div', 'wa-cabecera');
    cab.appendChild(el('span', 'wa-volver', '←'));
    cab.appendChild(el('div', 'wa-avatar', '🍎'));
    var info = el('div', 'wa-info');
    info.appendChild(el('b', null, doc.titulo));
    info.appendChild(el('span', null, doc.participantes + ' participantes · Solo los administradores pueden cambiar la descripción'));
    cab.appendChild(info);
    hoja.appendChild(cab);
    var chat = el('div', 'wa-chat');
    chat.appendChild(el('div', 'wa-aviso', '🔒 Los mensajes están cifrados de extremo a extremo. Lamentablemente, los de la coordinación también llegan.'));
    var anterior = null, diaPrevio = null;
    doc.mensajes.forEach(function (m) {
      if (m.dia !== diaPrevio) {
        chat.appendChild(el('div', 'wa-fecha', m.dia));
        diaPrevio = m.dia;
        anterior = null;
      }
      var sticker = /^\[sticker:(.+)\]$/.exec(m.texto);
      var b = el('div', 'wa-msj' + (m.direccion ? ' wa-dir' : '') + (anterior === m.autor ? ' seguido' : '') + (sticker ? ' wa-sticker' : ''));
      if (anterior !== m.autor && !sticker) {
        var a = el('div', 'wa-autor', m.autor);
        a.style.color = m.direccion ? '#075e54' : colorDe(m.autor);
        b.appendChild(a);
      }
      if (sticker) b.appendChild(el('div', 'sticker', sticker[1]));
      else b.appendChild(textoChat(m.texto));
      b.appendChild(el('span', 'wa-hora', m.hora));
      if (m.texto === doc.ultimoNuevo) b.classList.add('nuevo');
      chat.appendChild(b);
      anterior = m.autor;
    });
    hoja.appendChild(chat);
    var pie = el('div', 'wa-pie');
    pie.appendChild(el('span', 'wa-entrada', 'Solo los administradores pueden enviar mensajes'));
    hoja.appendChild(pie);
  }


  // Formato de WhatsApp: *negrita*, _cursiva_ y marcas de multimedia.
  function textoChat(texto) {
    var cont = el('div', 'wa-texto');
    var partes = texto.split(/(\[(?:foto|eliminado|audio:[^\]]*|documento:[^\]]*|link:[^\]]*)\])/);
    partes.forEach(function (p) {
      if (!p) return;
      var m;
      if (p === '[foto]') { cont.appendChild(el('div', 'wa-foto', '📷 Foto')); return; }
      if (p === '[eliminado]') { cont.appendChild(el('span', 'eliminado', '🚫 Se eliminó este mensaje.')); return; }
      if ((m = /^\[audio:(.*)\]$/.exec(p))) {
        var au = el('div', 'wa-audio');
        au.appendChild(el('span', null, '▶'));
        au.appendChild(el('span', 'onda', '▁▃▅▂▆▃▁▄▆▂▅▃▁▂▄▃▅▁'));
        au.appendChild(el('span', null, m[1]));
        cont.appendChild(au);
        return;
      }
      if ((m = /^\[documento:(.*)\]$/.exec(p))) {
        var dd = el('div', 'wa-doc');
        dd.appendChild(el('span', 'icono-doc', 'PDF'));
        var nn = el('div');
        nn.appendChild(el('b', null, m[1]));
        nn.appendChild(el('span', null, (1 + Math.floor(Math.random() * 40)) + ' páginas · PDF'));
        dd.appendChild(nn);
        cont.appendChild(dd);
        return;
      }
      if ((m = /^\[link:(.*)\]$/.exec(p))) {
        cont.appendChild(el('span', 'wa-link', 'https://' + m[1]));
        return;
      }
      p.split(/(\*[^*\n]+\*|_[^_\n]+_)/).forEach(function (q) {
        if (!q) return;
        if (/^\*.*\*$/.test(q)) cont.appendChild(el('b', null, q.slice(1, -1)));
        else if (/^_.*_$/.test(q)) cont.appendChild(el('i', null, q.slice(1, -1)));
        else cont.appendChild(document.createTextNode(q));
      });
    });
    return cont;
  }

  /* ---------- diapositivas ---------- */
  function pintarDiapositivas(hoja) {
    var total = doc.diapositivas.length;
    doc.diapositivas.forEach(function (d, i) {
      var sl = el('section', 'diapo' + (d.tipo === 'portada' ? ' portada' : ''));
      if (d.titulo === doc.ultimoNuevo && i > 0 && d.tipo !== 'portada') sl.classList.add('nuevo');
      sl.appendChild(el('h3', 'diapo-titulo', d.titulo));
      if (d.subtitulo) sl.appendChild(el('p', 'diapo-sub', d.subtitulo));
      if (d.vinetas) {
        var ul = el('ul');
        d.vinetas.forEach(function (v) { ul.appendChild(el('li', null, v)); });
        sl.appendChild(ul);
      }
      if (d.nube) {
        var nube = el('div', 'nube');
        d.nube.forEach(function (w, j) {
          var s = el('span', null, w);
          s.style.fontSize = (0.8 + ((j * 7) % 5) * 0.22) + 'em';
          s.style.opacity = (0.6 + ((j * 3) % 4) * 0.12).toFixed(2);
          nube.appendChild(s);
        });
        sl.appendChild(nube);
      }
      if (d.destacado) sl.appendChild(el('p', 'diapo-destacado', d.destacado));
      var pie = el('div', 'diapo-pie');
      pie.appendChild(el('span', null, 'Trayecto de formación situada'));
      pie.appendChild(el('span', null, (i + 1) + ' / ' + total));
      sl.appendChild(pie);
      hoja.appendChild(sl);
    });
  }


  /* ---------- diccionario ---------- */
  function pintarDiccionario(hoja) {
    var ents = doc.entradas;
    var guia = el('div', 'dic-guia');
    guia.appendChild(el('span', null, ents[0].lema.split(/[ ,(]/)[0]));
    guia.appendChild(el('span', 'dic-pag', String(100 + Math.floor(Math.random() * 800))));
    guia.appendChild(el('span', null, ents[ents.length - 1].lema.split(/[ ,(]/)[0]));
    hoja.appendChild(guia);
    var cab = el('div', 'dic-cabecera');
    cab.appendChild(el('h2', null, doc.titulo));
    cab.appendChild(el('p', null, doc.subtitulo));
    hoja.appendChild(cab);
    var cuerpo = el('div', 'dic-cuerpo');
    var nuevos = doc.ultimoNuevo || [];
    ents.forEach(function (e) {
      var p = el('p', 'dic-entrada' + (e.propia ? ' propia' : '') + (nuevos.indexOf && nuevos.indexOf(e.lema) !== -1 ? ' nuevo' : ''));
      p.appendChild(el('b', 'lema', e.lema));
      p.appendChild(document.createTextNode(', '));
      p.appendChild(el('i', 'cat', e.cat));
      e.acepciones.forEach(function (a, i) {
        p.appendChild(document.createTextNode(' '));
        if (e.acepciones.length > 1) p.appendChild(el('b', 'num', (i + 1) + '.'));
        var m = /^([A-Z][a-zá-ú]{1,5}\.) (.*)$/.exec(a);
        if (m) {
          p.appendChild(document.createTextNode(' '));
          p.appendChild(el('i', 'marca', m[1]));
          p.appendChild(document.createTextNode(' ' + m[2]));
        } else {
          p.appendChild(document.createTextNode(' ' + a));
        }
      });
      if (e.ejemplo) {
        p.appendChild(document.createTextNode(' '));
        p.appendChild(el('i', 'ejemplo', 'Ej.: «' + e.ejemplo.replace(/\.$/, '') + '».'));
      }
      if (e.ver) {
        p.appendChild(document.createTextNode(' '));
        p.appendChild(el('span', 'ver', 'V. '));
        e.ver.forEach(function (v, i) {
          p.appendChild(el('span', 'remision', v));
          if (i < e.ver.length - 1) p.appendChild(document.createTextNode(', '));
        });
        p.appendChild(document.createTextNode('.'));
      }
      cuerpo.appendChild(p);
    });
    hoja.appendChild(cuerpo);
    hoja.appendChild(el('p', 'pie-doc', 'Las definiciones de este diccionario se encuentran en revisión permanente.'));
  }

  /* ---------- bingo ---------- */
  function pintarBingo(hoja) {
    var cab = el('div', 'bingo-cabecera');
    cab.appendChild(el('h2', null, doc.titulo));
    cab.appendChild(el('p', null, 'Eje de la jornada: ' + doc.tema));
    cab.appendChild(el('p', 'bingo-num', 'Cartón n.º ' + doc.numero));
    hoja.appendChild(cab);
    var letras = el('div', 'bingo-letras');
    'BINGO'.split('').forEach(function (l) { letras.appendChild(el('span', null, l)); });
    hoja.appendChild(letras);
    var grilla = el('div', 'bingo-grilla');
    var marcadas = doc.bingo.map(function (c, i) { return i === 12; });
    var cantado = false;
    doc.bingo.forEach(function (texto, i) {
      var c = el('button', 'bingo-celda' + (i === 12 ? ' libre marcada' : ''), texto);
      c.type = 'button';
      c.setAttribute('aria-pressed', String(i === 12));
      if (i !== 12) {
        c.addEventListener('click', function () {
          marcadas[i] = !marcadas[i];
          c.classList.toggle('marcada', marcadas[i]);
          c.setAttribute('aria-pressed', String(marcadas[i]));
          if (!cantado && hayLinea(marcadas)) {
            cantado = true;
            aviso('¡Bingo! Cántelo con discreción: estamos en jornada.');
          }
        });
      }
      grilla.appendChild(c);
    });
    hoja.appendChild(grilla);
    hoja.appendChild(el('p', 'bingo-reglas', 'Toque cada casillero cuando lo escuche o lo vea. Al completar una línea (horizontal, vertical o diagonal), cante «¡Bingo!» en voz baja. El premio se definirá oportunamente.'));
    hoja.appendChild(el('p', 'pie-doc', 'Cada cartón es único. Ningún documento oficial avala este juego.'));
  }

  function hayLinea(m) {
    var lineas = [];
    for (var i = 0; i < 5; i++) {
      lineas.push([0, 1, 2, 3, 4].map(function (j) { return i * 5 + j; }));
      lineas.push([0, 1, 2, 3, 4].map(function (j) { return j * 5 + i; }));
    }
    lineas.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
    return lineas.some(function (l) { return l.every(function (k) { return m[k]; }); });
  }

  /* ---------- imagen ---------- */
  function cargarHtml2canvas() {
    if (window.html2canvas) return Promise.resolve(window.html2canvas);
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = 'js/vendor/html2canvas.min.js';
      s.onload = function () { ok(window.html2canvas); };
      s.onerror = mal;
      document.head.appendChild(s);
    });
  }

  function imagen() {
    if (!doc) return;
    aviso('Preparando la imagen…');
    var hoja = $('documento');
    cargarHtml2canvas().then(function (h2c) {
      hoja.classList.add('capturando');
      return h2c(hoja, { scale: 2, backgroundColor: null, logging: false });
    }).then(function (canvas) {
      hoja.classList.remove('capturando');
      canvas.toBlob(function (blob) {
        var nombre = (doc.tipoNombre + ' ' + doc.tema).toLowerCase().normalize('NFD')
          .replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') + '.png';
        var archivo = null;
        try { archivo = new File([blob], nombre, { type: 'image/png' }); } catch (e) { archivo = null; }
        if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
          navigator.share({ files: [archivo], title: doc.titulo }).catch(function () { /* cancelado */ });
        } else {
          var a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = nombre;
          document.body.appendChild(a);
          a.click();
          setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
          aviso('Imagen descargada.');
        }
      }, 'image/png');
    }).catch(function () {
      hoja.classList.remove('capturando');
      aviso('No se pudo generar la imagen.');
    });
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
