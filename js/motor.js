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
    this.reglas = Object.assign({}, lexico, propios, membrete);
    this.tipos = datos.documentos.tipos;
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
    return texto.replace(/\{([A-Za-z_]+)\}/g, function (m, clave) {
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
    doc.oral = tipo.grupo === 'oral';
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

    tipo.secciones.forEach(function (sec) {
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

  /* Agrega un párrafo más a la sección extensible, antes del cierre. */
  Motor.prototype.extender = function (doc) {
    var tipo = this.tipos[doc.tipoId];
    this._usados = doc._estado.usados;
    this._ctx = doc._estado.ctx;
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
      ideas: 0
    };
  };

  Motor.normalizarTema = normalizarTema;
  Motor.pulir = pulir;
  Motor.superindice = superindice;

  global.Motor = Motor;
  if (typeof module !== 'undefined' && module.exports) module.exports = Motor;
})(typeof window !== 'undefined' ? window : globalThis);
