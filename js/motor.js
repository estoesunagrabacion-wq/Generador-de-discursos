/*
 * Motor combinatorio del Generador de discursos.
 * Toma los bancos de frases (data/*.json) y arma documentos expandiendo
 * símbolos {ASI} de manera recursiva, sin repetir variantes dentro de un
 * mismo documento mientras haya alternativas disponibles.
 */
(function (global) {
  'use strict';

  var MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  var SUPER = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'];
  var ARTICULOS = ['el', 'la', 'los', 'las', 'lo', 'un', 'una', 'unos', 'unas',
    'nuestro', 'nuestra', 'nuestros', 'nuestras', 'este', 'esta', 'estos', 'estas'];

  function azar(n) { return Math.floor(Math.random() * n); }
  function entre(a, b) { return a + azar(b - a + 1); }
  function superindice(n) {
    return String(n).split('').map(function (d) { return SUPER[+d]; }).join('');
  }

  function sinMetadatos(obj) {
    var out = {};
    Object.keys(obj || {}).forEach(function (k) {
      if (k.charAt(0) !== '_') out[k] = obj[k];
    });
    return out;
  }

  /* Normaliza lo que escribe el usuario para que encaje en la frase. */
  function normalizarTema(tema) {
    var t = String(tema || '').replace(/\s+/g, ' ').trim().replace(/[.;:,]+$/, '');
    if (!t) return '';
    var primera = t.split(' ')[0];
    if (ARTICULOS.indexOf(primera.toLowerCase()) !== -1) {
      t = t.charAt(0).toLowerCase() + t.slice(1);
    }
    return t;
  }

  function mayusculaInicial(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  /* Contracciones, espacios y mayúsculas de comienzo de oración. */
  function pulir(texto) {
    var s = texto
      .replace(/\s+/g, ' ')
      .replace(/\s+([,.;:?!])/g, '$1')
      .replace(/([?!])\./g, '$1')
      .replace(/(?<![\p{L}])([Dd])e el(?![\p{L}])/gu, function (m, d) { return d + 'el'; })
      .replace(/(?<![\p{L}])([Aa]) el(?![\p{L}])/gu, function (m, a) { return a + 'l'; })
      .trim();
    s = s.replace(/(^|[.?!][⁰¹²³⁴⁵⁶⁷⁸⁹]*\)?\s+)([¿(]?)([a-záéíóúñü])/g, function (m, pre, abre, letra) {
      return pre + abre + letra.toUpperCase();
    });
    return s;
  }

  function Motor(datos) {
    var lexico = sinMetadatos(datos.lexico);
    var propios = sinMetadatos(datos.documentos.simbolos);
    var membrete = sinMetadatos(datos.membrete);
    var formatos = datos.formatos || { tipos: {}, simbolos: {} };
    this.reglas = Object.assign({}, lexico, propios, sinMetadatos(formatos.simbolos), membrete);
    this.tipos = Object.assign({}, datos.documentos.tipos, formatos.tipos);
    this.reglas.DICC_ENTRADA = formatos.diccionario || [];
    this.temasEjemplo = datos.temas || [];
  }

  Motor.prototype._elegir = function (simbolo) {
    var lista = this.reglas[simbolo];
    if (!lista || !lista.length) return '[' + simbolo + ']';
    var usados = this._usados[simbolo] || (this._usados[simbolo] = []);
    if (usados.length >= lista.length) usados.length = 0;
    var libres = [];
    for (var i = 0; i < lista.length; i++) if (usados.indexOf(i) === -1) libres.push(i);
    var idx = libres[azar(libres.length)];
    usados.push(idx);
    return lista[idx];
  };

  Motor.prototype._expandir = function (texto, prof) {
    var self = this;
    prof = prof || 0;
    if (prof > 12) return texto;
    return texto.replace(/\{([A-Za-z0-9_]+)\}/g, function (m, clave) {
      if (Object.prototype.hasOwnProperty.call(self._ctx, clave)) {
        var v = self._ctx[clave];
        return typeof v === 'function' ? v() : v;
      }
      return self._expandir(self._elegir(clave), prof + 1);
    });
  };

  Motor.prototype._frase = function (simbolo) {
    var opcional = simbolo.slice(-1) === '?';
    if (opcional) {
      if (Math.random() < 0.45) return '';
      simbolo = simbolo.slice(0, -1);
    }
    return this._expandir('{' + simbolo + '}');
  };

  Motor.prototype._parrafo = function (espec) {
    var self = this;
    var partes = espec.map(function (s) { return self._frase(s); }).filter(Boolean);
    return pulir(partes.join(' '));
  };

  Motor.prototype._contexto = function (doc) {
    var self = this;
    var hoy = new Date();
    var h = entre(8, 17);
    var min = ['00', '15', '30', '45'][azar(4)];
    var hFin = h + entre(1, 2);
    return {
      tema: doc.tema,
      tema_titulo: mayusculaInicial(doc.tema),
      tema_archivo: doc.tema.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      anio: String(hoy.getFullYear()),
      fecha: hoy.getDate() + ' de ' + MESES[hoy.getMonth()] + ' de ' + hoy.getFullYear(),
      dia: String(hoy.getDate()),
      mes: MESES[hoy.getMonth()],
      hora: h + ':' + min,
      hora_fin: hFin + ':' + min,
      numero: doc.numero,
      numero_escuela: doc.numeroEscuela,
      nota: function () {
        if (doc.notas.length >= 4 || Math.random() < 0.4) return '';
        doc.notas.push(pulir(self._elegir('NOTAS')));
        return superindice(doc.notas.length);
      }
    };
  };

  Motor.prototype.documento = function (tipoId, tema) {
    var tipo = this.tipos[tipoId];
    if (!tipo) throw new Error('Tipo de documento desconocido: ' + tipoId);
    var t = normalizarTema(tema) || this.temaAlAzar();
    var hoy = new Date();
    var doc = {
      tipoId: tipoId,
      tipoNombre: tipo.nombre,
      tema: t,
      numero: entre(12, 987) + '/' + String(hoy.getFullYear()).slice(2),
      numeroEscuela: String(entre(2, 48)),
      notas: [],
      secciones: [],
      extensiones: 0
    };
    // La memoria de variantes usadas se conserva entre documentos: el motor
    // recorre todas las variantes de un símbolo antes de repetir alguna.
    this._usados = this._usados || {};
    this._ctx = this._contexto(doc);
    var self = this;

    doc.membrete = {
      organismo: this._expandir('{ORGANISMO}'),
      direccion: this._expandir('{DIRECCION}'),
      escuela: this._expandir('{ESCUELA}'),
      lema: hoy.getFullYear() + ' – ' + this._expandir('{LEMA}'),
      lugarFecha: 'Buenos Aires, ' + this._ctx.fecha,
      pie: this._expandir('{PIE}')
    };
    doc.formato = tipo.formato || (tipo.grupo === 'oral' ? 'oral' : 'documento');
    doc.oral = doc.formato === 'oral';
    if (doc.oral) {
      doc.evento = this._expandir(tipo.evento);
      doc.orador = this._expandir(tipo.orador);
      doc.titulo = doc.evento;
      doc.membrete.pie = tipo.pie || '';
    } else {
      doc.titulo = pulir(this._expandir(tipo.titulo));
    }
    doc.encabezado = (tipo.encabezado || []).map(function (l) {
      var partes = l.split(': ');
      return { etiqueta: partes[0], valor: self._expandir(partes.slice(1).join(': ')) };
    });
    doc.saludo = tipo.saludo ? pulir(this._expandir(tipo.saludo)) : '';

    (tipo.secciones || []).forEach(function (sec) {
      var s = { titulo: sec.titulo || '', extensible: !!sec.extensible };
      if (sec.parrafos) s.parrafos = sec.parrafos.map(function (p) { return self._parrafo(p); });
      if (sec.lista) {
        s.lista = [];
        for (var i = 0; i < sec.lista.cantidad; i++) s.lista.push(pulir(self._frase(sec.lista.simbolo)));
      }
      if (sec.agenda) s.agenda = self._agenda();
      doc.secciones.push(s);
    });

    doc.firma = !tipo.firma ? '' : (this.reglas[tipo.firma] ? this._expandir('{' + tipo.firma + '}') : tipo.firma);
    doc.talon = !!tipo.talon;
    if (doc.formato !== 'documento' && doc.formato !== 'oral') doc.membrete.pie = tipo.pie || '';
    if (doc.formato === 'correo') {
      doc.correo = {
        de: 'Dirección – ' + doc.membrete.escuela,
        para: 'Docentes (lista completa)',
        cc: 'Supervisión; Secretaría; Coordinaciones; Preceptoría',
        fecha: this._expandir('{CORREO_FECHA}'),
        adjunto: Math.random() < 0.7 ? this._expandir('{CORREO_ADJUNTO}') : '',
        pd: Math.random() < 0.75 ? pulir(this._expandir('{CORREO_PD}')) : ''
      };
    }
    if (doc.formato === 'whatsapp') this._whatsapp(tipo, doc);
    if (doc.formato === 'diapositivas') {
      doc.subtitulo = this._expandir(tipo.subtitulo);
      doc.diapositivas = this._diapositivas(doc);
    }
    if (doc.formato === 'diccionario') {
      doc.subtitulo = this._expandir(tipo.subtitulo);
      doc.entradas = [];
      this._sumarEntradas(doc, 8);
      var lema = doc.tema.replace(/^(el|la|los|las|lo|un|una) /i, '');
      doc.entradas.push({
        lema: lema, cat: 'sust.', propia: true,
        acepciones: [this._elegir('DIC_TEMA'), this._elegir('DIC_TEMA')],
        ver: [doc.entradas[azar(doc.entradas.length)].lema]
      });
      this._ordenarEntradas(doc);
    }
    if (doc.formato === 'bingo') {
      var casillas = [];
      for (var b = 0; b < 24; b++) casillas.push(this._elegir('BINGO'));
      casillas.splice(12, 0, 'LIBRE ☕');
      doc.bingo = casillas;
    }
    this._estado = { usados: this._usados, ctx: this._ctx };
    doc._estado = this._estado;
    return doc;
  };

  Motor.prototype._agenda = function () {
    var horas = ['8:00', '8:30', '9:15', '10:00', '10:45', '11:30', '12:00'];
    var acts = [this._elegir('AGENDA_INICIO'), this._elegir('AGENDA_INICIO'),
      this._elegir('AGENDA_MEDIO'), this._elegir('AGENDA_MEDIO'), this._elegir('AGENDA_MEDIO'),
      this._elegir('AGENDA_FIN'), this._elegir('AGENDA_FIN')];
    var filas = [];
    for (var i = 0; i < horas.length; i++) filas.push([horas[i], acts[i]]);
    filas.splice(3, 0, ['', 'Pausa']);
    return filas;
  };

  /* ---------- grupo de WhatsApp: conversación armada por escenas ---------- */
  function pulirChat(s) {
    return s
      .replace(/(?<![\p{L}])([Dd])e el(?![\p{L}])/gu, function (m, d) { return d + 'el'; })
      .replace(/(?<![\p{L}])([Aa]) el(?![\p{L}])/gu, function (m, a) { return a + 'l'; })
      .replace(/[ \t]+/g, ' ').trim();
  }
  var DIAS = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
  var HORAS_CHAT = [8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];

  Motor.prototype._persona = function (simbolo) {
    var v = this._elegir(simbolo).split('|');
    return { nombre: v[0], apodo: v[1] || v[0] };
  };

  Motor.prototype._escena = function (nombre, tipo, doc) {
    var self = this;
    var gente = {};
    function persona(clave) {
      if (clave === 'COORD') return doc.coord;
      if (clave === 'WA_AUTOR') {
        var p = self._persona('WA_AUTOR');
        if (gente.A && p.nombre === gente.A.nombre) p = self._persona('WA_AUTOR');
        return p;
      }
      if (!gente[clave]) gente[clave] = self._persona('WA_AUTOR');
      return gente[clave];
    }
    persona('A');
    persona('B');
    this._ctx.cumple = gente.A.apodo;
    this._ctx.coord = doc.coord.apodo;
    var lista = [gente.B.apodo];
    this._ctx.lista_regalo = function () {
      lista.push(self._ctx._autor.apodo);
      return 'Lista regalo ' + gente.A.apodo + ' 🎁\n' +
        lista.map(function (n, i) { return (i + 1) + '. ' + n; }).join('\n');
    };
    // ¿mismo día o día siguiente?
    if (doc._dia === undefined || Math.random() < 0.55) {
      doc._dia = doc._dia === undefined ? 0 : doc._dia + entre(1, 2);
      doc._reloj = doc._dia * 1440 + HORAS_CHAT[azar(HORAS_CHAT.length)] * 60 + azar(50);
    } else {
      doc._reloj += entre(25, 180);
    }
    var out = [];
    tipo.escenas[nombre].forEach(function (e) {
      var reps = 1;
      if (e[2]) { var r = e[2].split('-'); reps = entre(+r[0], +(r[1] || r[0])); }
      for (var i = 0; i < reps; i++) {
        var p = persona(e[0]);
        self._ctx._autor = p;
        var texto = e[1].charAt(0) === '{' ? self._expandir(e[1]) : self._frase(e[1]);
        if (!texto) continue;
        doc._reloj += i === 0 && !out.length ? 0 : entre(0, 7);
        out.push({ autor: p.nombre, direccion: p === doc.coord, minuto: doc._reloj, texto: pulirChat(texto) });
      }
    });
    return out;
  };

  Motor.prototype._etiquetarDias = function (doc) {
    var ultimo = Math.floor(doc.mensajes[doc.mensajes.length - 1].minuto / 1440);
    var hoy = new Date().getDay();
    doc.mensajes.forEach(function (m) {
      var d = Math.floor(m.minuto / 1440);
      var atras = ultimo - d;
      m.dia = atras === 0 ? 'HOY' : atras === 1 ? 'AYER' : DIAS[(hoy - atras + 70) % 7];
      var min = m.minuto % 1440;
      m.hora = Math.floor(min / 60) + ':' + ('0' + (min % 60)).slice(-2);
    });
  };

  Motor.prototype._whatsapp = function (tipo, doc) {
    doc.participantes = entre(34, 58);
    doc.coord = this._persona('WA_COORD');
    var otras = Object.keys(tipo.escenas).filter(function (k) { return k !== tipo.escena_fija; });
    var elegidas = [];
    while (elegidas.length < 3) {
      var k = otras[azar(otras.length)];
      if (elegidas.indexOf(k) === -1 && !(k.indexOf('cumple') === 0 && elegidas.some(function (x) { return x.indexOf('cumple') === 0; }))) elegidas.push(k);
    }
    elegidas.splice(azar(3), 0, tipo.escena_fija);
    var self = this;
    doc.mensajes = [];
    elegidas.forEach(function (n) { Array.prototype.push.apply(doc.mensajes, self._escena(n, tipo, doc)); });
    this._etiquetarDias(doc);
  };

  Motor.prototype._mensajes = function (espec, doc) {
    var self = this;
    var out = [];
    espec.forEach(function (par) {
      var texto = self._frase(par[1]);
      if (!texto) return;
      doc._reloj += entre(0, 6);
      var m = doc._reloj % (24 * 60);
      var esDir = par[0] === 'DIRECCION';
      out.push({
        autor: esDir ? 'Dirección 🏫' : self._elegir(par[0]),
        direccion: esDir,
        hora: Math.floor(m / 60) + ':' + ('0' + (m % 60)).slice(-2),
        texto: pulir(texto)
      });
    });
    return out;
  };

  function sinArticulo(s) {
    return mayusculaInicial(s.replace(/^(la|el|lo|los|las) /, ''));
  }

  Motor.prototype._diapositiva = function () {
    var v = [];
    for (var i = 0; i < 3 + azar(2); i++) v.push(pulir(this._expandir('{DIAPO_VINETA}')));
    return { titulo: this._expandir('{DIAPO_TITULO}'), vinetas: v };
  };

  Motor.prototype._diapositivas = function (doc) {
    var self = this;
    var nube = [];
    for (var i = 0; i < 8; i++) nube.push(sinArticulo(this._elegir('CONCEPTO')));
    var preguntas = [];
    for (var j = 0; j < 3; j++) preguntas.push(pulir(this._expandir('{ESP_PREGUNTA}')));
    return [
      { tipo: 'portada', titulo: doc.titulo, subtitulo: doc.subtitulo },
      this._diapositiva(),
      { titulo: pulir('¿De qué hablamos cuando hablamos de ' + doc.tema + '?'), nube: nube },
      this._diapositiva(),
      { titulo: 'Ejes de trabajo', vinetas: this.reglas.DIAPO_EJE.map(function (e) { return pulir(self._expandir(e)); }) },
      { titulo: 'Actividad', destacado: pulir(this._expandir('{DIAPO_ACTIVIDAD}')) },
      { titulo: 'Para seguir pensando', vinetas: preguntas },
      { tipo: 'portada', titulo: '¡Gracias!', subtitulo: 'Preguntas · Intercambio · Bibliografía (próximamente)' }
    ];
  };

  Motor.prototype._sumarEntradas = function (doc, n) {
    var nuevas = [];
    for (var i = 0; i < n; i++) {
      var e = this._elegir('DICC_ENTRADA');
      if (doc.entradas.some(function (x) { return x.lema === e.lema; })) continue;
      var copia = JSON.parse(JSON.stringify(e));
      doc.entradas.push(copia);
      nuevas.push(copia);
    }
    return nuevas;
  };

  Motor.prototype._ordenarEntradas = function (doc) {
    doc.entradas.sort(function (a, b) { return a.lema.localeCompare(b.lema, 'es', { sensitivity: 'base' }); });
  };

  /* Agrega un párrafo más a la sección extensible, antes del cierre. */
  Motor.prototype.extender = function (doc) {
    var tipo = this.tipos[doc.tipoId];
    this._usados = doc._estado.usados;
    this._ctx = doc._estado.ctx;
    if (doc.formato === 'bingo') return doc;
    if (doc.formato === 'diccionario') {
      var nuevas = this._sumarEntradas(doc, 4);
      this._ordenarEntradas(doc);
      doc.ultimoNuevo = nuevas.map(function (e) { return e.lema; });
      doc.extensiones++;
      return doc;
    }
    if (doc.formato === 'whatsapp') {
      var otras = Object.keys(tipo.escenas).filter(function (k) { return k !== tipo.escena_fija; });
      var nuevos = this._escena(otras[azar(otras.length)], tipo, doc);
      Array.prototype.push.apply(doc.mensajes, nuevos);
      this._etiquetarDias(doc);
      doc.ultimoNuevo = nuevos[0] && nuevos[0].texto;
      doc.extensiones++;
      return doc;
    }
    if (doc.formato === 'diapositivas') {
      var d = this._diapositiva();
      doc.diapositivas.splice(doc.diapositivas.length - 3, 0, d);
      doc.ultimoNuevo = d.titulo;
      doc.extensiones++;
      return doc;
    }
    var sec = doc.secciones.filter(function (s) { return s.extensible; })[0];
    if (!sec) return doc;
    var nuevo = this._parrafo(tipo.extension);
    var pos = Math.max(1, sec.parrafos.length - 1);
    sec.parrafos.splice(pos, 0, nuevo);
    doc.ultimoNuevo = nuevo;
    doc.extensiones++;
    return doc;
  };

  Motor.prototype.temaAlAzar = function () {
    var l = this.temasEjemplo;
    return l.length ? l[azar(l.length)] : 'la escuela';
  };

  /* Versión en texto plano, para copiar o compartir. */
  Motor.prototype.texto = function (doc) {
    var out = [];
    var m = doc.membrete;
    if (doc.formato === 'whatsapp') {
      out.push('💬 ' + doc.titulo);
      var diaPrevio = null;
      doc.mensajes.forEach(function (x) {
        if (x.dia !== diaPrevio) { out.push('', '— ' + x.dia + ' —'); diaPrevio = x.dia; }
        out.push('[' + x.hora + '] ' + x.autor + ': ' + Motor.textoPlanoChat(x.texto));
      });
      return out.join('\n');
    }
    if (doc.formato === 'diapositivas') {
      doc.diapositivas.forEach(function (d, i) {
        out.push('— Diapositiva ' + (i + 1) + ' —', d.titulo.toUpperCase());
        if (d.subtitulo) out.push(d.subtitulo);
        (d.vinetas || []).forEach(function (v) { out.push('• ' + v); });
        if (d.nube) out.push(d.nube.join(' · '));
        if (d.destacado) out.push(d.destacado);
        out.push('');
      });
      return out.join('\n').trim();
    }
    if (doc.formato === 'diccionario') {
      out.push(doc.titulo.toUpperCase(), doc.subtitulo, '');
      doc.entradas.forEach(function (e) {
        var l = e.lema + ', ' + e.cat + ' ' + e.acepciones.map(function (a, i) {
          return (e.acepciones.length > 1 ? (i + 1) + '. ' : '') + a;
        }).join(' ');
        if (e.ejemplo) l += ' Ej.: «' + e.ejemplo.replace(/\.$/, '') + '».';
        if (e.ver) l += ' V. ' + e.ver.join(', ') + '.';
        out.push(l, '');
      });
      return out.join('\n').trim();
    }
    if (doc.formato === 'bingo') {
      out.push(doc.titulo.toUpperCase(), 'Eje: ' + doc.tema, '');
      for (var f = 0; f < 5; f++) out.push(doc.bingo.slice(f * 5, f * 5 + 5).join(' | '));
      return out.join('\n');
    }
    if (doc.formato === 'correo') {
      var c = doc.correo;
      out.push('De: ' + c.de, 'Para: ' + c.para, 'CC: ' + c.cc, 'Fecha: ' + c.fecha, 'Asunto: ' + doc.titulo, '');
      if (doc.saludo) out.push(doc.saludo, '');
      doc.secciones.forEach(function (s) { (s.parrafos || []).forEach(function (p) { out.push(p, ''); }); });
      out.push(doc.firma);
      if (c.pd) out.push('', c.pd);
      if (c.adjunto) out.push('', '📎 ' + c.adjunto);
      return out.join('\n').trim();
    }
    if (doc.oral) {
      out.push('VERSIÓN TAQUIGRÁFICA', doc.evento, 'Hace uso de la palabra: ' + doc.orador, m.lugarFecha, '');
      if (doc.saludo) out.push(doc.saludo, '');
      doc.secciones.forEach(function (s) { (s.parrafos || []).forEach(function (p) { out.push(p, ''); }); });
      out.push(m.pie);
      return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }
    out.push(m.organismo, m.direccion, m.escuela, '«' + m.lema + '»', '', m.lugarFecha, '');
    out.push(doc.titulo.toUpperCase(), '');
    doc.encabezado.forEach(function (e) { out.push(e.etiqueta + ': ' + e.valor); });
    if (doc.encabezado.length) out.push('');
    if (doc.saludo) out.push(doc.saludo, '');
    doc.secciones.forEach(function (s, i) {
      if (s.titulo) out.push(s.titulo.toUpperCase(), '');
      (s.parrafos || []).forEach(function (p) { out.push(p, ''); });
      (s.lista || []).forEach(function (p) { out.push('• ' + p); });
      if (s.lista) out.push('');
      (s.agenda || []).forEach(function (f) { out.push((f[0] ? f[0] + ' — ' : '— ') + f[1]); });
      if (s.agenda) out.push('');
    });
    out.push('', doc.firma);
    if (doc.notas.length) {
      out.push('', '———');
      doc.notas.forEach(function (n, i) { out.push(superindice(i + 1) + ' ' + n); });
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  Motor.prototype.estadisticas = function (doc) {
    var palabras = this.texto(doc).split(/\s+/).filter(Boolean).length;
    return {
      palabras: palabras,
      carillas: Math.max(1, Math.ceil(palabras / 380)),
      minutos: Math.max(1, Math.round(palabras / 130)),
      mensajes: doc.mensajes ? doc.mensajes.length : 0,
      diapositivas: doc.diapositivas ? doc.diapositivas.length : 0,
      entradas: doc.entradas ? doc.entradas.length : 0,
      ideas: 0
    };
  };

  /* Convierte las marcas de multimedia del chat en texto plano. */
  Motor.textoPlanoChat = function (t) {
    return t
      .replace(/\[sticker:[^\]]*\]/g, '<Sticker omitido>')
      .replace(/\[foto\]/g, '<Multimedia omitido>')
      .replace(/\[audio:([^\]]*)\]/g, '<Audio omitido>')
      .replace(/\[eliminado\]/g, 'Se eliminó este mensaje.')
      .replace(/\[documento:([^\]]*)\]/g, '$1 (archivo adjunto)')
      .replace(/\[link:([^\]]*)\]/g, 'https://$1');
  };

  Motor.normalizarTema = normalizarTema;
  Motor.pulir = pulir;
  Motor.superindice = superindice;

  global.Motor = Motor;
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
