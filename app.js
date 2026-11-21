/**
 * CORE · shell do painel: login por código, sessão, navegação entre módulos,
 * abas de período, tema e atualização automática a cada 2 min.
 *
 * Contrato de módulo (web):
 *   Painel.registrarModulo({
 *     id: 'vendas', nome: 'Vendas', icone: '📈',
 *     simbolo: 'grafico',                         // opcional: ícone de linha (util.icone); sem ele usa o emoji
 *     descricao: 'Frase curta sob o título',      // opcional
 *     periodos: [['hoje','Hoje'], ...] | null,   // null = módulo sem abas de período
 *     periodoPadrao: 'mes',
 *     render: function (container, dados, ctx) { ... }   // ctx = { util, tip, periodo }
 *   });
 * O módulo só desenha; quem busca dados, controla período/tema/login é o shell.
 */
(function () {
  'use strict';
  var CFG = window.PAINEL_CONFIG || {};
  var ATUALIZA_MS = 120000;
  var LS = { token: 'painel_token', mod: 'painel_modulo', tema: 'painel_tema', email: 'painel_email' };
  var PERIODOS_PADRAO = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['mes', 'Mês'], ['mes_anterior', 'Mês anterior'], ['ano', 'Ano']];

  function ls(k, v) {
    try {
      if (v === undefined) return localStorage.getItem(k);
      if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v);
    } catch (e) { /* storage bloqueado: segue sem persistir */ }
    return null;
  }
  var $ = function (id) { return document.getElementById(id); };

  // ícones de linha (24×24, traço = currentColor). Módulos usam util.icone(nome) e definem `simbolo` no registro.
  var ICONES = {
    grafico: '<path d="M4 20v-5M9 20v-9M14 20V7M19 20V3"/>',
    carrinho: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h3l2.6 12.2a2 2 0 0 0 2 1.6h7.9a2 2 0 0 0 1.9-1.5L21 8H6"/>',
    loja: '<path d="M3.5 9 5 4h14l1.5 5M3.5 9h17M3.5 9a2.8 2.8 0 0 0 5.6 0 2.9 2.9 0 0 0 5.8 0 2.8 2.8 0 0 0 5.6 0M5 12v8h14v-8M10 20v-5h4v5"/>',
    caixa: '<path d="M21 7.5 12 3 3 7.5v9L12 21l9-4.5zM3 7.5l9 4.5 9-4.5M12 12v9"/>',
    pessoas: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M17.5 14a6 6 0 0 1 4 6"/>',
    cadeado: '<rect x="4.5" y="10.5" width="15" height="10" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    lua: '<path d="M20.5 13.2A8.5 8.5 0 1 1 10.8 3.5a6.6 6.6 0 0 0 9.7 9.7z"/>',
    sol: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    sair: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3"/>',
    moedas: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
    etiqueta: '<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z"/><circle cx="8" cy="8" r="1.5"/>',
    monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
    aperto: '<path d="M11 17l2 2a1.4 1.4 0 0 0 2-2M13 15l2.5 2.5a1.4 1.4 0 0 0 2-2L14 12M3 11l4-4 5 1 3-2 6 5-2.5 2.5M3 11l6 6a1.4 1.4 0 0 0 2-2M7 13l2.5 2.5"/>',
    alvo: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
    camadas: '<path d="M12 3 2 8l10 5 10-5zM2 13l10 5 10-5M2 17.5l10 5 10-5"/>',
    tendencia: '<path d="M3 17l6-6 4 4 8-8M15 7h6v6"/>',
    conversa: '<path d="M21 12a8 8 0 0 1-11.8 7L4 20l1.1-4.6A8 8 0 1 1 21 12z"/>',
    mapa: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.4"/>',
  };

  // ---------- utilidades expostas aos módulos ----------
  var util = {
    icone: function (nome, cls) {
      var p = ICONES[nome];
      return p ? '<svg class="ico-svg' + (cls ? ' ' + cls : '') + '" viewBox="0 0 24 24" aria-hidden="true">' + p + '</svg>' : '';
    },
    /** Ícone do módulo: o símbolo de linha, se houver, senão o emoji do module.json. */
    iconeModulo: function (simbolo, emoji) {
      return util.icone(simbolo) || (emoji ? '<span class="emo" aria-hidden="true">' + util.esc(emoji) + '</span>' : '');
    },
    brl: function (v) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: Math.abs(v) >= 10000 ? 0 : 2 }); },
    num: function (v) { return (v || 0).toLocaleString('pt-BR'); },
    esc: function (s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); },
    pct: function (v, casas) { return v == null ? '—' : (v * 100).toFixed(casas == null ? 0 : casas).replace('.', ',') + '%'; },

    /**
     * Gráfico de barras empilhadas (visual aprovado). serie = [{ dia: 'rótulo', <nome>: valor, ... }],
     * nomes = séries na ordem de empilhamento, cor(nome) → cor CSS. Ligar o tooltip com util.ligarGrafico.
     */
    grafico: function (serie, nomes, cor, opts) {
      opts = opts || {};
      var esc = util.esc;
      var max = Math.max.apply(null, serie.map(function (s) { return nomes.reduce(function (a, n) { return a + (s[n] || 0); }, 0); })) || 1;
      var h = '<div class="legend">' + nomes.map(function (n) { return '<span><i class="sw" style="background:' + cor(n) + '"></i>' + esc(n) + '</span>'; }).join('') + '</div>';
      h += '<div class="g-chart' + (opts.baixo ? ' baixo' : '') + '">';
      serie.forEach(function (s, i) {
        var seg = '';
        nomes.forEach(function (n) { var v = s[n] || 0; if (v > 0) seg += '<i style="height:calc(' + (v / max * 100) + '% - 2px);background:' + cor(n) + '"></i>'; });
        h += '<div class="g-col" data-tip="1" data-i="' + i + '">' + seg + '</div>';
      });
      h += '</div>';
      if (opts.todosRotulos) h += '<div class="g-xax todos">' + serie.map(function (s) { return '<span>' + esc(s.dia) + '</span>'; }).join('') + '</div>';
      else h += '<div class="g-xax"><span>' + esc(serie[0].dia) + '</span><span>' + esc(serie[Math.floor(serie.length / 2)].dia) + '</span><span>' + esc(serie[serie.length - 1].dia) + '</span></div>';
      return h;
    },

    ligarGrafico: function (el, serie, nomes, fmtValor) {
      var tip = $('tip'), f = fmtValor || util.brl, esc = util.esc;
      el.querySelectorAll('.g-col').forEach(function (col) {
        var mostrar = function (e) {
          var s = serie[+col.dataset.i], tot = 0;
          var linhas = nomes.map(function (n) { tot += s[n] || 0; return '<div><span>' + esc(n) + '</span><span>' + f(s[n] || 0) + '</span></div>'; }).join('');
          tip.innerHTML = '<div><b>' + esc(s.dia) + '</b><b>' + f(tot) + '</b></div>' + linhas;
          tip.style.opacity = 1;
          var x = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8);
          tip.style.left = Math.max(8, x) + 'px';
          tip.style.top = Math.max(8, e.clientY - tip.offsetHeight - 12) + 'px';
        };
        col.addEventListener('pointermove', mostrar);
        col.addEventListener('pointerdown', mostrar);
        col.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') tip.style.opacity = 0; });
      });
    },

    varHtml: function (p, comp) {
      if (p === null || p === undefined) return '<div class="var">sem base de comparação</div>';
      var cls = p >= 0 ? 'up' : 'dn', s = (p >= 0 ? '▲ +' : '▼ ') + (p * 100).toFixed(1).replace('.', ',') + '%';
      return '<div class="var"><b class="' + cls + '">' + s + '</b> vs ' + util.esc(comp) + '</div>';
    },
  };

  var Painel = window.Painel = {
    modulos: {},
    ordem: [],
    util: util,
    registrarModulo: function (def) {
      if (!def || !def.id || typeof def.render !== 'function') throw new Error('módulo inválido');
      if (!Painel.modulos[def.id]) Painel.ordem.push(def.id);
      Painel.modulos[def.id] = def;
    },
  };

  // ---------- API ----------
  function api(acao, dados) {
    var corpo = Object.assign({ acao: acao, token: ls(LS.token) || undefined }, dados || {});
    var p = window.PAINEL_MOCK_API
      ? Promise.resolve(window.PAINEL_MOCK_API(corpo))
      : fetch(CFG.apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // requisição "simples": sem preflight CORS
        body: JSON.stringify(corpo),
        redirect: 'follow',
        credentials: 'omit',
      }).then(function (r) { if (!r.ok) throw new Error('http ' + r.status); return r.json(); });
    return p.then(function (res) {
      if (!res.ok && res.erro === 'nao_autenticado') { sessaoExpirada(); throw new Error('nao_autenticado'); }
      return res;
    });
  }

  // ---------- estado ----------
  var st = { modulos: [], mod: null, periodo: null, timer: null, seq: 0, ultimaCarga: 0, admin: false };

  // ---------- login ----------
  var MSGS = {
    codigo_invalido: 'Código incorreto. Confira e tente de novo.',
    codigo_expirado: 'Código expirado ou tentativas esgotadas. Peça um novo código.',
    ocupado: 'Servidor ocupado. Tente de novo em instantes.',
  };
  function msg(t, erro) { var m = $('msg'); m.textContent = t || ''; m.className = 'msg' + (erro ? ' erro' : ''); }

  function mostrarLogin() {
    pararTimer();
    $('app').hidden = true;
    $('login').hidden = false;
    $('f-codigo').hidden = true;
    $('f-email').hidden = false;
    var e = ls(LS.email);
    if (e) $('email').value = e;
    $('email').focus();
  }

  function ocupado(form, sim) { form.querySelector('.btn').disabled = sim; }

  $('f-email').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (this.querySelector('.btn').disabled) return;
    var email = $('email').value.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msg('Digite um e-mail válido.', true); return; }
    ocupado(this, true); msg('Enviando…');
    var f = this;
    api('login.solicitar', { email: email }).then(function () {
      ls(LS.email, email);
      msg('');
      $('f-email').hidden = true; $('f-codigo').hidden = false;
      $('codigo').value = ''; $('codigo').focus();
    }).catch(function () { msg('Não foi possível enviar agora. Verifique a conexão e tente de novo.', true); })
      .then(function () { ocupado(f, false); });
  });

  $('f-codigo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (this.querySelector('.btn').disabled) return; // já enviando (auto-envio + Enter)
    var codigo = $('codigo').value.replace(/\D/g, '');
    if (codigo.length !== 6) { msg('O código tem 6 dígitos.', true); return; }
    ocupado(this, true); msg('Conferindo…');
    var f = this;
    api('login.verificar', { email: ls(LS.email) || $('email').value.trim().toLowerCase(), codigo: codigo }).then(function (r) {
      if (!r.ok) { msg(MSGS[r.erro] || 'Não foi possível entrar agora.', true); return; }
      ls(LS.token, r.token);
      msg('');
      iniciar();
    }).catch(function () { msg('Não foi possível entrar agora. Tente de novo.', true); })
      .then(function () { ocupado(f, false); });
  });

  $('codigo').addEventListener('input', function () {
    this.value = this.value.replace(/\D/g, '').slice(0, 6);
    if (this.value.length === 6) $('f-codigo').requestSubmit ? $('f-codigo').requestSubmit() : null;
  });
  $('voltar').addEventListener('click', function () { msg(''); $('f-codigo').hidden = true; $('f-email').hidden = false; $('email').focus(); });

  function sessaoExpirada() { ls(LS.token, null); mostrarLogin(); msg('Sua sessão expirou. Entre de novo.'); }

  $('btn-sair').addEventListener('click', function () {
    var fim = function () { ls(LS.token, null); mostrarLogin(); };
    api('sair').then(fim, fim);
  });

  // ---------- tema: escuro (padrão) ↔ claro ----------
  function aplicarTema(t) {
    document.documentElement.setAttribute('data-theme', t);
    $('btn-tema').title = t === 'light' ? 'Tema claro (clique para o escuro)' : 'Tema escuro (clique para o claro)';
    $('btn-tema').innerHTML = util.icone(t === 'light' ? 'lua' : 'sol');
  }
  $('btn-tema').addEventListener('click', function () {
    var prox = ls(LS.tema) === 'light' ? 'dark' : 'light';
    ls(LS.tema, prox === 'dark' ? null : prox);
    aplicarTema(prox);
  });
  aplicarTema(ls(LS.tema) === 'light' ? 'light' : 'dark');

  // ícones fixos do shell
  $('btn-menu').innerHTML = util.icone('menu');
  $('btn-sair').innerHTML = util.icone('sair');
  $('side-cli-ic').innerHTML = util.icone('loja');
  $('btn-acesso').innerHTML = util.icone('cadeado') + '<span>Acesso</span>';
  $('btn-conexoes').innerHTML = util.icone('link') + '<span>Conexões</span>';

  // menu lateral (no celular vira gaveta)
  function menu(abrir) { $('app').classList.toggle('menu-aberto', !!abrir); }
  $('btn-menu').addEventListener('click', function () { menu(true); });
  $('side-fundo').addEventListener('click', function () { menu(false); });

  /** Cabeçalho: ícone, título e frase do painel/tela aberta; marca o item no menu. */
  function cabecalho(titulo, desc, icone, idMenu) {
    $('titulo-mod').textContent = titulo;
    $('desc-mod').textContent = desc || '';
    $('tit-ic').innerHTML = icone || '';
    document.title = (CFG.nome || '') + ' · ' + titulo;
    document.querySelectorAll('.side button').forEach(function (b) { b.classList.toggle('on', (b.dataset.m || b.id) === idMenu); });
    menu(false);
  }

  function mostrarUsuario(email, admin) {
    email = String(email || ls(LS.email) || '');
    var nome = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\d+/g, ' ').trim() || email;
    nome = nome.split(/\s+/).map(function (p) { return p.charAt(0).toUpperCase() + p.slice(1); }).join(' ');
    var ini = nome.split(/\s+/).map(function (p) { return p.charAt(0); }).join('').slice(0, 2).toUpperCase();
    $('av').textContent = ini || '?';
    $('u-nome').textContent = nome;
    $('u-nome').title = email;
    $('u-papel').textContent = admin ? 'Administrador' : 'Acesso ao painel';
  }

  // ---------- app ----------
  function iniciar() {
    if (!ls(LS.token)) { mostrarLogin(); return; }
    api('sessao').then(function (r) {
      if (!r.ok) { mostrarLogin(); return; }
      st.modulos = (r.modulos || []).filter(function (m) { return Painel.modulos[m.id]; });
      st.admin = !!r.admin;
      $('btn-acesso').hidden = !st.admin;
      $('btn-conexoes').hidden = !st.admin;
      $('side-adm').hidden = !st.admin;
      mostrarUsuario(r.email, st.admin);
      $('login').hidden = true; $('app').hidden = false;
      if (!st.modulos.length) { mostrarErro(st.admin ? 'Nenhum painel ativo.' : 'Seu acesso ainda não tem nenhum painel liberado. Fale com o administrador.'); return; }
      var salvo = ls(LS.mod);
      var mod = st.modulos.some(function (m) { return m.id === salvo; }) ? salvo : st.modulos[0].id;
      desenharModulos();
      trocarModulo(mod);
    }).catch(function (e) {
      if (e.message === 'nao_autenticado') return;
      $('login').hidden = true; $('app').hidden = false;
      mostrarErro('Não foi possível conectar. Tentando de novo…');
      setTimeout(iniciar, 15000);
    });
  }

  function desenharModulos() {
    $('mods').innerHTML = st.modulos.map(function (m) {
      var def = Painel.modulos[m.id] || {};
      return '<button type="button" data-m="' + util.esc(m.id) + '">' + util.iconeModulo(def.simbolo, m.icone || def.icone) +
        '<span>' + util.esc(m.nome) + '</span></button>';
    }).join('');
  }
  $('mods').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (b) trocarModulo(b.dataset.m);
  });

  function trocarModulo(id) {
    var def = Painel.modulos[id];
    st.mod = id;
    ls(LS.mod, id);
    var info = st.modulos.filter(function (m) { return m.id === id; })[0] || {};
    cabecalho(info.nome || def.nome, def.descricao, util.iconeModulo(def.simbolo, info.icone || def.icone), id);
    var per = def.periodos === undefined ? PERIODOS_PADRAO : def.periodos;
    var tabs = $('tabs');
    tabs.hidden = !per;
    st.periodo = per ? (def.periodoPadrao || 'mes') : null;
    tabs.innerHTML = (per || []).map(function (p) {
      return '<button type="button" data-p="' + p[0] + '"' + (p[0] === st.periodo ? ' class="on"' : '') + '>' + util.esc(p[1]) + '</button>';
    }).join('');
    $('body').innerHTML = '';
    carregar();
  }

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('button'); if (!b) return;
    document.querySelectorAll('#tabs button').forEach(function (x) { x.classList.toggle('on', x === b); });
    st.periodo = b.dataset.p;
    carregar();
  });

  function carregar() {
    var id = st.mod, def = Painel.modulos[id], seq = ++st.seq;
    var body = $('body');
    body.classList.add('loading');
    reiniciarTimer();
    api('dados', { modulo: id, params: st.periodo ? { periodo: st.periodo } : {} }).then(function (r) {
      if (seq !== st.seq) return; // resposta antiga (usuário trocou de aba)
      if (!r.ok) throw new Error(r.erro);
      st.ultimaCarga = Date.now();
      var d = r.dados || {};
      $('dot').classList.remove('off'); $('dot2').classList.remove('off');
      $('upd').textContent = 'Atualizado ' + (d.atualizadoEm || '—') + (d.de ? ' · ' + d.de + (d.ate && d.de !== d.ate ? ' a ' + d.ate : '') : '') +
        (d.recorte && d.recorte.length ? ' · só ' + d.recorte.join(', ') : ''); // pessoa restrita a lojas/canais
      $('tip').style.opacity = 0;
      def.render(body, d, ctxModulo(id, d._ocultas));
      body.classList.remove('loading');
    }).catch(function (e) {
      if (seq !== st.seq || e.message === 'nao_autenticado') return;
      if (e.message === 'sem_permissao') { mostrarErro('Você não tem acesso a este painel.'); return; }
      $('dot').classList.add('off'); $('dot2').classList.add('off');
      if (!body.innerHTML) mostrarErro('Não foi possível carregar os dados. Tentando de novo em instantes.');
      else { $('upd').textContent = 'Sem conexão · mostrando a última atualização'; body.classList.remove('loading'); }
    });
  }

  /**
   * O que o módulo recebe no render: utilidades, tooltip, período, se é admin, como chamar ações e
   * visivel(idSeção) — false para os blocos ocultos dessa pessoa (o servidor já tirou os dados deles).
   */
  function ctxModulo(id, ocultas) {
    ocultas = ocultas || [];
    return {
      util: util, tip: $('tip'), periodo: st.periodo, admin: st.admin,
      visivel: function (secao) { return ocultas.indexOf(secao) < 0; },
      acao: function (nome, params) {
        return api('modulo.acao', { modulo: id, nome: nome, params: params || {} }).then(function (r) {
          if (!r.ok) throw new Error(r.erro || 'erro');
          return r.resultado;
        });
      },
      recarregar: function () { carregar(); },
      // o módulo pode esconder as abas de período (ex.: sub-telas que não dependem do período)
      mostrarPeriodos: function (sim) { if (Painel.modulos[id] && Painel.modulos[id].periodos !== null) $('tabs').hidden = !sim; },
    };
  }

  // ---------- tela de acesso (só admins) ----------
  var ERROS_ACESSO = { email_invalido: 'E-mail inválido.', admin_fixo: 'Administrador fixo: altere no client.json.', ocupado: 'Servidor ocupado, tente de novo.' };

  function abrirAcesso() {
    pararTimer();
    st.seq++; // ignora respostas de dados em andamento
    st.mod = null;
    $('tabs').hidden = true;
    cabecalho('Acesso', 'Quem pode entrar e o que cada um vê.', util.icone('cadeado'), 'btn-acesso');
    $('upd').textContent = 'Quem pode entrar e o que cada um vê';
    $('body').innerHTML = '<div class="card empty">Carregando…</div>';
    api('admin.usuarios').then(function (r) {
      if (!r.ok) throw new Error(r.erro);
      desenharAcesso(r.usuarios, r.modulos, { recortes: r.recortes || [], modulosComRecorte: r.modulosComRecorte || [] });
    }).catch(function () { mostrarErro('Não foi possível carregar os usuários.'); });
  }

  var blocosAbertos = {}; // e-mails com o detalhe de blocos aberto (sobrevive ao redesenho)

  function desenharAcesso(usuarios, modulos, extra) {
    var esc = util.esc;
    extra = extra || { recortes: [], modulosComRecorte: [] };
    var nCols = modulos.length + 3;
    var ocultasPor = {}, recortesPor = {};
    usuarios.forEach(function (u) { ocultasPor[u.email] = u.ocultas || {}; recortesPor[u.email] = u.recortes || []; });
    var nomesComRecorte = modulos.filter(function (m) { return extra.modulosComRecorte.indexOf(m.id) >= 0; }).map(function (m) { return m.nome; });
    var ck = function (attrs, on, dis) { return '<input type="checkbox" ' + attrs + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '>'; };
    var temSecoes = modulos.some(function (m) { return (m.secoes || []).length; });
    var cab = '<tr><th>E-mail</th>' + modulos.map(function (m) { return '<th class="c">' + esc(m.nome) + '</th>'; }).join('') + '<th class="c">Admin</th><th></th></tr>';
    var linhas = usuarios.map(function (u) {
      var tudo = u.modulos === '*';
      var restrito = function (id) { return modulos.some(function (m) { return m.id === id && m.restrito; }); };
      var ve = function (id) { return (tudo && !restrito(id)) || (u.modulos || []).indexOf(id) >= 0; };
      var nOcultos = Object.keys(u.ocultas || {}).reduce(function (s, k) { return s + (ve(k) ? u.ocultas[k].length : 0); }, 0);
      var podeBlocos = temSecoes && !u.adminFixo && !u.admin;
      var linha = '<tr data-email="' + esc(u.email) + '"><td class="em">' + esc(u.email) + (u.adminFixo ? ' <span class="tag-fixo">fixo</span>' : '') +
        (nOcultos ? ' <span class="tag-fixo">' + nOcultos + ' bloco(s) oculto(s)</span>' : '') +
        ((u.recortes || []).length && !u.admin ? ' <span class="tag-fixo tag-rc">só: ' + esc(u.recortes.join(', ')) + '</span>' : '') + '</td>' +
        modulos.map(function (m) { return '<td class="c">' + ck('data-m="' + esc(m.id) + '"', ve(m.id), u.adminFixo) + '</td>'; }).join('') +
        '<td class="c">' + ck('data-admin="1"', u.admin, u.adminFixo) + '</td>' +
        '<td class="c acoes">' + (podeBlocos ? '<button class="btn-s" data-blocos="1" type="button">Blocos</button> ' : '') +
        (u.adminFixo ? '' : '<button class="lnk" data-rm="1" type="button">remover</button>') + '</td></tr>';
      if (!podeBlocos) return linha;
      // detalhe: um grupo por painel que a pessoa vê; marcado = bloco visível
      var grupos = modulos.filter(function (m) { return ve(m.id) && (m.secoes || []).length; }).map(function (m) {
        var ocultas = (u.ocultas || {})[m.id] || [];
        return '<div class="blk"><b>' + esc(m.nome) + '</b>' + m.secoes.map(function (sec) {
          return '<label>' + ck('data-sec="' + esc(m.id) + '|' + esc(sec.id) + '"', ocultas.indexOf(sec.id) < 0) + ' ' + esc(sec.nome) + '</label>';
        }).join('') + '</div>';
      }).join('');
      // lojas e canais: restringe os DADOS (vendas, pedidos parados, CRM); nenhum marcado = vê tudo
      var rcs = u.recortes || [];
      var lojasCanais = extra.recortes.length ? '<div class="blk blk-rc"><b>Lojas e canais</b>' +
        '<div class="var">Marque para a pessoa ver SÓ esses dados em ' + esc(nomesComRecorte.join(', ')) + '. Nenhum marcado = vê tudo. Loja = só as vendas físicas dela.</div>' +
        extra.recortes.map(function (o) { return '<label>' + ck('data-rc="' + esc(o.id) + '"', rcs.indexOf(o.id) >= 0) + ' ' + esc(o.nome) + '</label>'; }).join('') + '</div>' : '';
      return linha + '<tr class="det" data-det="' + esc(u.email) + '"' + (blocosAbertos[u.email] ? '' : ' hidden') + '><td colspan="' + nCols + '">' +
        lojasCanais +
        '<div class="blk-tit">Blocos que <b>' + esc(u.email) + '</b> vê (desmarque para esconder)</div>' +
        (grupos || '<div class="var">Libere algum painel para escolher os blocos.</div>') + '</td></tr>';
    }).join('');
    var novo = '<tr class="novo"><td><input id="ac-email" type="email" placeholder="novo@email.com" autocomplete="off"></td>' +
      modulos.map(function (m) { return '<td class="c"><input type="checkbox" data-novo-m="' + esc(m.id) + '"' + (m.restrito ? '' : ' checked') + '></td>'; }).join('') +
      '<td class="c"><input type="checkbox" id="ac-admin"></td><td class="c"><button class="btn-p" id="ac-add" type="button">Adicionar</button></td></tr>';
    $('body').innerHTML = '<section class="card acesso"><h2>Acesso ao painel</h2>' +
      '<p class="aviso">Marque quais painéis cada pessoa vê e, em <b>Blocos</b>, quais partes de cada painel e se ela vê só algumas lojas/canais. As mudanças valem na hora. Administradores veem tudo. O código de login chega no e-mail da pessoa.</p>' +
      '<div class="tab-wrap"><table class="tab-acesso"><thead>' + cab + '</thead><tbody>' + linhas + novo + '</tbody></table></div>' +
      '<div class="msg" id="ac-msg"></div></section>';
    var msgA = function (t, erro) { var m = $('ac-msg'); m.textContent = t; m.className = 'msg' + (erro ? ' erro' : ''); };
    var tabela = $('body').querySelector('.tab-acesso');
    var sel = function (attr, email) { return tabela.querySelector('tr[' + attr + '="' + String(email).replace(/"/g, '') + '"]'); };
    var salvar = function (email) {
      var tr = sel('data-email', email);
      var mods = Array.prototype.filter.call(tr.querySelectorAll('[data-m]'), function (c) { return c.checked; }).map(function (c) { return c.dataset.m; });
      var det = sel('data-det', email);
      var ocultas = JSON.parse(JSON.stringify(ocultasPor[email] || {}));
      if (det) {
        // recalcula os painéis que aparecem no detalhe; os demais mantêm o que já estava salvo
        var porMod = {};
        det.querySelectorAll('[data-sec]').forEach(function (c) {
          var p = c.dataset.sec.split('|');
          porMod[p[0]] = porMod[p[0]] || [];
          if (!c.checked) porMod[p[0]].push(p[1]);
        });
        Object.keys(porMod).forEach(function (m) { ocultas[m] = porMod[m]; });
      }
      var recortes = det && det.querySelector('[data-rc]')
        ? Array.prototype.filter.call(det.querySelectorAll('[data-rc]'), function (c) { return c.checked; }).map(function (c) { return c.dataset.rc; })
        : recortesPor[email];
      return api('admin.salvarUsuario', { email: email, modulos: mods, admin: tr.querySelector('[data-admin]').checked, ocultas: ocultas, recortes: recortes });
    };
    var tratar = function (p, okMsg) {
      return p.then(function (r) {
        if (!r.ok) { msgA(ERROS_ACESSO[r.erro] || 'Não foi possível salvar.', true); return; }
        desenharAcesso(r.usuarios, modulos, extra);
        msgA(okMsg);
      }).catch(function () { msgA('Não foi possível salvar agora.', true); });
    };
    tabela.addEventListener('change', function (e) {
      var tr = e.target.closest('tr[data-email]') || e.target.closest('tr[data-det]');
      if (tr) tratar(salvar(tr.dataset.email || tr.dataset.det), 'Salvo.');
    });
    tabela.addEventListener('click', function (e) {
      var tr = e.target.closest('tr[data-email]');
      if (!tr) return;
      if (e.target.dataset.blocos) {
        var det = sel('data-det', tr.dataset.email);
        det.hidden = !det.hidden;
        blocosAbertos[tr.dataset.email] = !det.hidden;
      } else if (e.target.dataset.rm && confirm('Remover o acesso de ' + tr.dataset.email + '?')) {
        tratar(api('admin.removerUsuario', { email: tr.dataset.email }), 'Acesso removido.');
      }
    });
    $('ac-add').addEventListener('click', function () {
      var email = $('ac-email').value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { msgA('Digite um e-mail válido.', true); return; }
      var mods = Array.prototype.filter.call(document.querySelectorAll('[data-novo-m]'), function (c) { return c.checked; }).map(function (c) { return c.dataset.novoM; });
      tratar(api('admin.salvarUsuario', { email: email, modulos: mods, admin: $('ac-admin').checked, ocultas: {}, recortes: [] }), email + ' adicionado.');
    });
  }

  $('btn-acesso').addEventListener('click', abrirAcesso);

  // ---------- tela de conexões (só admins): status das APIs, gatilhos e integrações ----------
  var ST_CON = { ok: ['🟢', 'OK'], alerta: ['🟡', 'Atenção'], erro: ['🔴', 'Falha'], desligado: ['⚪', 'Desligado'] };

  function relativo(iso) {
    if (!iso) return '';
    var m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
    if (isNaN(m)) return '';
    if (m < 1) return 'agora';
    if (m < 60) return 'há ' + m + ' min';
    if (m < 48 * 60) return 'há ' + Math.round(m / 60) + ' h';
    return 'há ' + Math.round(m / 1440) + ' dias';
  }

  function abrirConexoes() {
    pararTimer();
    st.seq++;
    st.mod = null;
    $('tabs').hidden = true;
    cabecalho('Conexões', 'Status das APIs, gatilhos e integrações.', util.icone('link'), 'btn-conexoes');
    $('upd').textContent = 'APIs, gatilhos e integrações';
    $('body').innerHTML = '<div class="card empty">Verificando conexões…</div>';
    api('admin.conexoes').then(function (r) {
      if (!r.ok) throw new Error(r.erro);
      desenharConexoes(r);
    }).catch(function () { mostrarErro('Não foi possível verificar as conexões.'); });
  }

  function desenharConexoes(r) {
    var esc = util.esc;
    var grupos = [], porGrupo = {};
    (r.itens || []).forEach(function (x) {
      if (!porGrupo[x.grupo]) { porGrupo[x.grupo] = []; grupos.push(x.grupo); }
      porGrupo[x.grupo].push(x);
    });
    var pior = function (arr) { return ['erro', 'alerta', 'ok', 'desligado'].filter(function (s) { return arr.some(function (x) { return x.status === s; }); })[0] || 'ok'; };
    var res = r.resumo || {};
    var topo = '<div class="con-resumo">' + ['ok', 'alerta', 'erro', 'desligado'].map(function (s) {
      return '<span class="con-pill">' + ST_CON[s][0] + ' ' + (res[s] || 0) + ' ' + ST_CON[s][1].toLowerCase() + '</span>';
    }).join('') + '<button class="btn-s" id="con-atualizar" type="button">Verificar de novo</button></div>';
    var cards = grupos.map(function (g) {
      var linhas = porGrupo[g].map(function (x) {
        var s = ST_CON[x.status] || ST_CON.alerta;
        return '<li class="con-item con-' + esc(x.status) + '"><span class="con-ic" title="' + s[1] + '">' + s[0] + '</span>' +
          '<div><b>' + esc(x.nome) + '</b><small>' + esc(x.detalhe || '') + (x.ultima ? ' · ' + esc(relativo(x.ultima)) : '') + '</small></div></li>';
      }).join('');
      return '<section class="card con-grupo"><h2>' + ST_CON[pior(porGrupo[g])][0] + ' ' + esc(g) + '</h2><ul class="con-lista">' + linhas + '</ul></section>';
    }).join('');
    $('body').innerHTML = topo + cards + '<p class="con-rodape">Verificado ' + esc(relativo(r.verificadoEm)) +
      '. Detalhes técnicos de cada falha ficam no log do Apps Script (Execuções).</p>';
    $('con-atualizar').addEventListener('click', abrirConexoes);
  }

  $('btn-conexoes').addEventListener('click', abrirConexoes);

  function mostrarErro(t) {
    $('body').innerHTML = '<div class="card empty">' + util.esc(t) + '</div>';
    $('body').classList.remove('loading');
  }

  function pararTimer() { clearInterval(st.timer); st.timer = null; }
  function reiniciarTimer() { pararTimer(); st.timer = setInterval(function () { if (!document.hidden) carregar(); }, ATUALIZA_MS); }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && st.mod && !$('app').hidden && Date.now() - st.ultimaCarga > ATUALIZA_MS) carregar();
  });

  // fecha o tooltip ao tocar fora de um elemento com tooltip
  document.addEventListener('pointerdown', function (e) { if (!e.target.closest('[data-tip]')) $('tip').style.opacity = 0; });

  Painel.iniciar = iniciar;
})();

/* ---- vendas ---- */
/* VENDAS · render: destaque + projeção, canais, metas (3 níveis, mês/semana), gráfico, online × físico, vendedores por loja. */
(function () {
  var CORES = { 'Lojas físicas': 'var(--s1)', 'Site': 'var(--s2)', 'Mercado Livre': 'var(--s3)', 'Outros': 'var(--s4)', 'Online': 'var(--s2)' };
  var cor = function (n) { return CORES[n] || 'var(--s4)'; };
  var ICONE_CANAL = { 'Lojas físicas': 'loja', 'Site': 'monitor', 'Mercado Livre': 'aperto' };
  var CORES_LOJA = ['var(--s3)', 'var(--s1)', 'var(--s5)', 'var(--s2)'];

  /** Círculo com ícone na cor --k (util.icone; sem util.icone, nada). */
  function ico(u, nome, k) { return u.icone ? '<span class="v-ico" style="--k:' + k + '">' + u.icone(nome) + '</span>' : ''; }
  function titulo(u, nome, txt) { return '<h2 class="v-tt">' + (u.icone ? u.icone(nome) : '') + '<span>' + txt + '</span></h2>'; }

  /** Minigráfico de linha do total por dia/mês (só quando o período tem série). */
  function spark(serie, nomes) {
    if (!serie || serie.length < 2) return '';
    var v = serie.map(function (s) { return nomes.reduce(function (a, n) { return a + (s[n] || 0); }, 0); });
    var max = Math.max.apply(null, v), min = Math.min.apply(null, v), amp = max - min || 1;
    var pts = v.map(function (x, i) { return (i / (v.length - 1) * 100).toFixed(1) + ',' + (28 - (x - min) / amp * 24).toFixed(1); }).join(' ');
    return '<svg class="v-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true"><polyline points="' + pts + '"/></svg>';
  }
  var PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['semana', 'Semana'], ['7d', '7 dias'], ['mes', 'Mês'], ['mes_anterior', 'Mês anterior'], ['ano', 'Ano']];

  function render(el, d, ctx) {
    var u = ctx.util, brl = u.brl, num = u.num, esc = u.esc;
    var ve = function (s) { return ctx.visivel ? ctx.visivel(s) : true; }; // blocos liberados para essa pessoa
    var t = d.total || {}, h = '';

    if (d.pendentes) h += '<div class="aviso">' + num(d.pendentes) + ' pedido(s) ainda em verificação de canal (online × loja). Os números se ajustam nas próximas sincronizações.</div>';

    // destaque + projeção (mês ou semana em andamento)
    var proj = d.projecao && d.projecao.ativa ? d.projecao : null;
    var nomeCiclo = proj && proj.tipo === 'semana' ? 'semana' : 'mês';
    var hero = [];
    var nomesSerie = d.canais ? d.canais.map(function (c) { return c.nome; })
      : (d.serie && d.serie[0] ? Object.keys(d.serie[0]).filter(function (k) { return k !== 'dia'; }) : []);
    if (ve('faturamento') && t.valor !== undefined) {
      hero.push('<div class="card v-k" style="--k:var(--s2)"><div class="v-k-top">' + ico(u, 'moedas', 'var(--s2)') +
        '<div class="v-k-txt"><div class="lbl">Faturamento · ' + esc(d.rotulo) + '</div><div class="big">' + brl(t.valor) + '</div>' + u.varHtml(t.varPct, d.rotuloComp) + '</div>' +
        spark(d.serie, nomesSerie) + '</div>' +
        (proj ? '<div class="v-proj"><span>Projeção ' + (nomeCiclo === 'mês' ? 'do mês' : 'da semana') + '</span><b>' + brl(proj.total) + '</b>' +
          (proj.varPct === null ? '' : '<em class="' + (proj.varPct >= 0 ? 'up' : 'dn') + '">' + (proj.varPct >= 0 ? '+' : '') + u.pct(proj.varPct, 1) + ' vs ' + (nomeCiclo === 'mês' ? 'mês passado' : 'semana passada') + ' (' + brl(proj.anteriorInteiro) + ')</em>') +
          '<small>ritmo de ' + proj.diasDecorridos + ' de ' + proj.diasTotal + ' dias</small></div>' : '') + '</div>');
    }
    if (ve('pedidos') && t.pedidos !== undefined) hero.push('<div class="card v-k" style="--k:var(--s5)"><div class="v-k-top">' + ico(u, 'carrinho', 'var(--s5)') +
      '<div class="v-k-txt"><div class="lbl">Pedidos</div><div class="big">' + num(t.pedidos) + '</div><div class="var">antes: ' + num(t.pedidosAnt) + '</div></div></div></div>');
    if (ve('ticket') && t.ticket !== undefined) hero.push('<div class="card v-k" style="--k:var(--s3)"><div class="v-k-top">' + ico(u, 'etiqueta', 'var(--s3)') +
      '<div class="v-k-txt"><div class="lbl">Ticket médio</div><div class="big">' + brl(t.ticket) + '</div></div></div></div>');
    if (hero.length) h += '<section class="v-hero"' + (hero.length < 3 ? ' style="grid-template-columns:repeat(' + hero.length + ',1fr)"' : '') + '>' + hero.join('') + '</section>';

    // canais (a % usa a soma dos canais, que funciona mesmo com o faturamento oculto)
    if (ve('canais') && d.canais) {
      var totCanais = d.canais.reduce(function (s, c) { return s + c.valor; }, 0);
      h += '<section class="v-grid3">';
      d.canais.forEach(function (c) {
        var pct = totCanais ? c.valor / totCanais : 0;
        h += '<div class="card v-ch" style="--k:' + cor(c.nome) + '"><div class="v-ch-head">' + ico(u, ICONE_CANAL[c.nome] || 'caixa', cor(c.nome)) +
          '<div><div class="lbl">' + esc(c.nome) + '</div><div class="mid">' + brl(c.valor) + '</div>' + u.varHtml(c.varPct, 'antes') + '</div></div>' +
          '<div class="v-share"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + cor(c.nome) + '"></i></div>' +
          '<div class="v-meta"><span>' + num(c.pedidos) + ' pedidos · TM ' + brl(c.ticket) + '</span><span>' + (pct * 100).toFixed(0) + '%</span></div>' +
          metricasHtml(c, u) + porLojaHtml(c, u) + '</div>';
      });
      h += '</section>';
    }

    // metas (mês, mês anterior e semana)
    if (ve('metas') && d.metas) h += metasHtml(d, ctx);

    // gráfico + online × físico
    var serie = ve('grafico') && d.serie ? d.serie : null;
    var nomes = nomesSerie;
    var blocoGraf = serie && serie.length ? '<div class="card">' + titulo(u, 'tendencia', d.serieTipo === 'mes' ? 'Faturamento por mês' : 'Faturamento por dia') +
      u.grafico(serie, nomes, cor, { todosRotulos: d.serieTipo === 'mes' || serie.length <= 7 }) + '</div>'
      : ve('metas') && d.metasAtuais && d.metasAtuais.length ? metasAtuaisHtml(d, u)
      : serie ? '<div class="card">' + titulo(u, 'tendencia', 'Faturamento por dia') + '<div class="empty">O gráfico aparece nos períodos de semana, 7 dias, mês e ano.</div></div>' : '';
    var blocoOF = ve('onlineFisico') ? onlineFisicoHtml(d, u) : '';
    if (blocoGraf || blocoOF) h += '<section class="v-row2"' + (blocoGraf && blocoOF ? '' : ' style="grid-template-columns:1fr"') + '>' + blocoGraf + blocoOF + '</section>';

    // vendedores: uma coluna por loja
    if (ve('vendedores')) h += vendedoresHtml(d, u);

    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    if (serie && serie.length) u.ligarGrafico(el, serie, nomes);
    ligarMetas(el, d, ctx);
  }

  /** Métricas-chave do canal (Site: visitas do GA4 + vendas do Tiny). */
  function metricasHtml(c, u) {
    var v = c.visitas;
    if (!v || !v.temDados) return '';
    var cel = function (lbl, val) { return '<div><span>' + lbl + '</span><b>' + val + '</b></div>'; };
    return '<div class="v-metr">' + cel('Visitas únicas', u.num(v.unicas)) + cel('Vendas', u.num(c.pedidos)) +
      cel('Faturamento', u.brl(c.valor)) + cel('Ticket médio', u.brl(c.ticket)) +
      cel('Conversão', v.conversao == null ? '—' : u.pct(v.conversao, 2)) + cel('Sessões', u.num(v.sessoes)) + '</div>';
  }

  /** Canal online: quanto saiu de cada loja (pedidos transferidos pelo multiempresa incluídos). */
  function porLojaHtml(c, u) {
    if (!c.porLoja || !c.porLoja.length) return '';
    return '<div class="v-porloja"><div class="v-porloja-tit">Atendido por loja</div>' + c.porLoja.map(function (l) {
      var pct = c.valor ? l.valor / c.valor : 0;
      return '<div class="v-pl"><span>' + u.esc(l.nome) + ' <em>' + u.num(l.pedidos) + '</em></span>' +
        '<span>' + u.brl(l.valor) + ' <em>' + (pct * 100).toFixed(0) + '%</em></span></div>';
    }).join('') + '</div>';
  }

  // ---------- metas ----------
  /** Barra com realizado, marcas de cada nível e a projeção. */
  function barraNiveis(x, niveis, proj, u) {
    var max = Math.max.apply(null, x.metas.concat([x.realizado, proj ? x.projecao : 0])) || 1;
    var batidos = x.metas.filter(function (m) { return m && x.realizado >= m; }).length;
    var cls = batidos === 0 ? '' : batidos >= x.metas.filter(Boolean).length ? 'ok' : 'vai';
    var h = '<div class="v-nv-bar ' + cls + '"><i style="width:' + (x.realizado / max * 100).toFixed(1) + '%"></i>';
    if (proj) h += '<s style="left:' + Math.min(100, x.projecao / max * 100).toFixed(1) + '%" title="projeção"></s>';
    x.metas.forEach(function (m, i) {
      if (m) h += '<b style="left:' + (m / max * 100).toFixed(1) + '%" title="' + u.esc(niveis[i]) + '"><span>' + (i + 1) + '</span></b>';
    });
    return h + '</div>';
  }

  function linhaMeta(x, nome, niveis, proj, u, total) {
    var chips = x.metas.map(function (m, i) {
      if (!m) return '';
      var p = x.pcts[i], ok = p >= 1;
      return '<span class="v-chip' + (ok ? ' ok' : '') + '">' + u.esc(niveis[i]) + ' ' + u.brl(m) + ' · <b>' + u.pct(p) + '</b>' + (ok ? ' ✓' : '') + '</span>';
    }).join('');
    return '<div class="v-mt' + (total ? ' total' : '') + '"><div class="v-mt-top"><span>' + u.esc(nome) + '</span><b>' + u.brl(x.realizado) + '</b></div>' +
      barraNiveis(x, niveis, proj, u) + '<div class="v-chips">' + chips + '</div>' +
      (proj ? '<div class="v-mt-sub">projeção ' + u.brl(x.projecao) + x.metas.map(function (m, i) { return m ? ' · ' + u.esc(niveis[i]) + ' ' + u.pct(x.pctsProjecao[i]) : ''; }).join('') + '</div>' : '') +
      '</div>';
  }

  /** Hoje/Ontem: andamento das metas da semana e do mês (total do que a pessoa vê; loja restrita = só a loja dela). */
  function metasAtuaisHtml(d, u) {
    var h = '<div class="card v-metas v-metas-atuais">' + titulo(u, 'alvo', 'Metas da semana e do mês');
    d.metasAtuais.forEach(function (m) {
      var titulo = m.tipo === 'semana' ? 'Semana · ' + m.rotulo.replace(/^semana /, '') : 'Mês · ' + m.rotulo;
      if (!m.total.metas.some(Boolean)) {
        h += '<div class="v-mt"><div class="v-mt-top"><span>' + u.esc(titulo) + '</span><b>' + u.brl(m.total.realizado) + '</b></div>' +
          '<div class="var">Sem meta ' + (m.tipo === 'semana' ? 'semanal' : 'mensal') + ' cadastrada.</div></div>';
        return;
      }
      var comMeta = m.itens.filter(function (x) { return x.metas.some(Boolean); });
      // uma loja/canal só: a linha dela; vários: total + cada um
      if (comMeta.length === 1) h += linhaMeta(comMeta[0], titulo + ' · ' + comMeta[0].recorte, m.niveis, m.projecaoAtiva, u, true);
      else {
        h += linhaMeta(m.total, titulo + ' · total', m.niveis, m.projecaoAtiva, u, true);
        h += '<div class="v-metas-grid">' + comMeta.map(function (x) { return linhaMeta(x, x.recorte, m.niveis, m.projecaoAtiva, u); }).join('') + '</div>';
      }
    });
    return h + '<div class="v-metas-dica">Barra = vendido até agora · números = níveis de meta · traço = projeção.</div></div>';
  }

  function metasHtml(d, ctx) {
    var u = ctx.util, m = d.metas, esc = u.esc;
    var proj = !!(d.projecao && d.projecao.ativa);
    var temMeta = m.total.metas.some(Boolean);
    var h = '<section class="card v-metas"><div class="v-metas-top">' + titulo(u, 'alvo', 'Metas ' + (m.tipo === 'semana' ? 'da ' : 'de ') + esc(m.rotulo)) +
      (ctx.admin ? '<button class="btn-s" type="button" id="v-edit-metas">Editar metas</button>' : '') + '</div>';
    if (!temMeta) {
      h += '<div class="empty">Nenhuma meta ' + (m.tipo === 'semana' ? 'semanal' : 'mensal') + ' cadastrada para este período.' + (ctx.admin ? ' Clique em "Editar metas".' : '') + '</div>';
    } else {
      h += '<div class="v-metas-grid">' + m.itens.filter(function (x) { return x.metas.some(Boolean); }).map(function (x) {
        return linhaMeta(x, x.recorte, m.niveis, proj, u);
      }).join('') + '</div>';
      h += linhaMeta(m.total, 'Total', m.niveis, proj, u, true);
    }
    h += '<div class="v-metas-dica">' + (m.tipo === 'semana' ? 'Metas semanais aparecem no período <b>Semana</b>.' : 'Metas mensais aparecem em <b>Mês</b> e <b>Mês anterior</b>; as semanais, em <b>Semana</b>.') + '</div>';
    h += '<div id="v-metas-form" hidden></div></section>';
    return h;
  }

  function ligarMetas(el, d, ctx) {
    var bt = el.querySelector('#v-edit-metas');
    if (!bt) return;
    var u = ctx.util, m = d.metas;
    bt.addEventListener('click', function () {
      var f = el.querySelector('#v-metas-form');
      if (!f.hidden) { f.hidden = true; return; }
      var atual = m.editaveis.filter(function (p) { return p.chave === m.chave; })[0] || m.editaveis[1];
      f.innerHTML = '<div class="v-metas-sel"><label>' + (m.tipo === 'semana' ? 'Semana' : 'Mês') + ' <select class="campo" id="v-meta-per">' +
        m.editaveis.map(function (p) { return '<option value="' + u.esc(p.chave) + '"' + (p.chave === atual.chave ? ' selected' : '') + '>' + u.esc(p.rotulo) + (p.atual ? ' (atual)' : '') + '</option>'; }).join('') +
        '</select></label></div>' +
        '<div class="tab-wrap"><table class="v-metas-tab"><thead><tr><th></th>' + m.niveis.map(function (n) { return '<th>' + u.esc(n) + '</th>'; }).join('') + '</tr></thead><tbody>' +
        m.itens.map(function (x) {
          return '<tr><td>' + u.esc(x.recorte) + '</td>' + m.niveis.map(function (_, i) {
            return '<td><input class="campo" type="number" min="0" step="100" inputmode="decimal" data-rc="' + u.esc(x.recorte) + '" data-n="' + i + '" placeholder="R$"></td>';
          }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="v-metas-acoes"><button class="btn-p" type="button" id="v-salvar-metas">Salvar</button>' +
        '<button class="btn-s" type="button" id="v-cancelar-metas">Cancelar</button></div><div class="msg" id="v-metas-msg"></div>';
      f.hidden = false;
      var msg = f.querySelector('#v-metas-msg');
      var preencher = function (metas) {
        f.querySelectorAll('[data-rc]').forEach(function (i) {
          var v = (metas[i.dataset.rc] || [])[+i.dataset.n];
          i.value = v ? v : '';
        });
      };
      var carregar = function (chave) {
        if (chave === m.chave) {
          var atuais = {};
          m.itens.forEach(function (x) { atuais[x.recorte] = x.metas; });
          preencher(atuais);
          return;
        }
        msg.textContent = 'Carregando…'; msg.className = 'msg';
        ctx.acao('lerMetas', { periodo: chave }).then(function (r) { preencher(r.metas || {}); msg.textContent = ''; })
          .catch(function () { msg.textContent = 'Não foi possível carregar.'; msg.className = 'msg erro'; });
      };
      carregar(atual.chave);
      f.querySelector('#v-meta-per').addEventListener('change', function () { carregar(this.value); });
      f.querySelector('#v-cancelar-metas').addEventListener('click', function () { f.hidden = true; });
      f.querySelector('#v-salvar-metas').addEventListener('click', function () {
        var metas = {};
        f.querySelectorAll('[data-rc]').forEach(function (i) {
          (metas[i.dataset.rc] = metas[i.dataset.rc] || [0, 0, 0])[+i.dataset.n] = Number(i.value) || 0;
        });
        var chave = f.querySelector('#v-meta-per').value;
        this.disabled = true;
        msg.textContent = 'Salvando…'; msg.className = 'msg';
        var b = this;
        ctx.acao('salvarMetas', { periodo: chave, metas: metas }).then(function () {
          if (chave === m.chave) ctx.recarregar();
          else { msg.textContent = 'Metas salvas.'; b.disabled = false; }
        }).catch(function () { msg.textContent = 'Não foi possível salvar.'; msg.className = 'msg erro'; b.disabled = false; });
      });
    });
  }

  // ---------- online × físico ----------
  function onlineFisicoHtml(d, u) {
    var o = d.onlineFisico;
    if (!o) return '';
    var dif = o.pctOnlineAnt == null ? null : o.pctOnline - o.pctOnlineAnt;
    var pOn = (o.pctOnline * 100).toFixed(1), vazio = !(o.online + o.fisico);
    var rosca = 'conic-gradient(' + (vazio ? 'var(--line) 0 100%' : cor('Online') + ' 0 ' + pOn + '%,' + cor('Lojas físicas') + ' ' + pOn + '% 100%') + ')';
    return '<div class="card v-of">' + titulo(u, 'camadas', 'Online × Físico') +
      '<div class="v-of-corpo"><div class="v-donut" style="background:' + rosca + '"><div><b>' + u.brl(o.online + o.fisico) + '</b><span>Total</span></div></div>' +
      '<div class="v-of-lins"><div class="v-of-lin"><span><i class="sw" style="background:' + cor('Online') + '"></i>Online <em>' + u.num(o.pedidosOnline) + ' ped.</em></span><span><b>' + u.brl(o.online) + '</b> ' + u.pct(o.pctOnline) + '</span></div>' +
      '<div class="v-of-lin"><span><i class="sw" style="background:' + cor('Lojas físicas') + '"></i>Lojas físicas <em>' + u.num(o.pedidosFisico) + ' ped.</em></span><span><b>' + u.brl(o.fisico) + '</b> ' + u.pct(1 - o.pctOnline) + '</span></div></div></div>' +
      '<div class="var">' + (dif === null ? 'sem base de comparação' : 'participação do online: <b class="' + (dif >= 0 ? 'up' : 'dn') + '">' + (dif >= 0 ? '+' : '') + (dif * 100).toFixed(1).replace('.', ',') + ' p.p.</b> vs ' + u.esc(d.rotuloComp)) + '</div></div>';
  }

  // ---------- vendedores: uma coluna por loja ----------
  function vendedoresHtml(d, u) {
    var lojas = d.vendedoresPorLoja;
    if (!lojas) return '';
    var resumoLoja = {};
    (d.lojas || []).forEach(function (l) { resumoLoja[l.nome] = l; });
    var h = '<section class="card v-vend">' + titulo(u, 'pessoas', 'Lojas físicas · ranking de vendedores') + '<div class="v-vend-cols">';
    lojas.forEach(function (l, iLoja) {
      var r = resumoLoja[l.loja] || {}, k = CORES_LOJA[iLoja % CORES_LOJA.length];
      h += '<div class="v-vend-col" style="--k:' + k + '"><div class="v-vc-top">' + ico(u, 'loja', k) + '<div><div class="nome">' + u.esc(l.loja) + '</div>' +
        '<div class="val">' + u.brl(l.total) + (r.varPct == null ? '' : ' <b class="' + (r.varPct >= 0 ? 'up' : 'dn') + '">' + (r.varPct >= 0 ? '▲ +' : '▼ ') + (r.varPct * 100).toFixed(0) + '%</b>') + '</div>' +
        '<div class="sub">' + u.num(l.pedidos) + ' vendas · TM ' + u.brl(r.ticket || 0) + '</div></div></div>';
      if (!l.vendedores.length) h += '<div class="empty">Sem vendas no período.</div>';
      var max = (l.vendedores[0] || {}).valor || 1;
      h += l.vendedores.map(function (x, i) {
        return '<div class="v-vd"><span class="pos">' + (i + 1) + '</span><div class="info"><div class="top"><span>' + u.esc(x.nome) + '</span><b>' + u.brl(x.valor) + '</b></div>' +
          '<div class="v-vd-bar"><i style="width:' + (x.valor / max * 100).toFixed(1) + '%"></i></div>' +
          '<div class="sub"><span>' + u.num(x.pedidos) + ' vendas · TM ' + u.brl(x.ticket) + '</span><span>' + u.pct(x.pct) + '</span></div></div></div>';
      }).join('') + '</div>';
    });
    return h + '</div></section>';
  }

  Painel.registrarModulo({ id: 'vendas', nome: 'Vendas', icone: '📈', simbolo: 'grafico', descricao: 'Acompanhe o faturamento, pedidos, canais e a performance da equipe.', periodos: PERIODOS, periodoPadrao: 'hoje', render: render });
})();

/* ---- ecommerce ---- */
/* E-COMMERCE DE PERFORMANCE · online (Site e ML), tráfego pago, cancelamentos e dia da semana. */
(function () {
  var CORES = { 'Site': 'var(--s2)', 'Mercado Livre': 'var(--s3)', 'Outros': 'var(--s4)' };
  var cor = function (n) { return CORES[n] || 'var(--s4)'; };

  function renderVisao(el, d, ctx) {
    var u = ctx.util, brl = u.brl, num = u.num, esc = u.esc, o = d.online, h = '';
    var ve = function (s) { return ctx.visivel ? ctx.visivel(s) : true; }; // blocos liberados para essa pessoa

    if (ve('resumo') && o) {
      h += '<section class="v-hero">' +
        '<div class="card"><div class="lbl">Faturamento online · ' + esc(d.rotulo) + '</div><div class="big">' + brl(o.valor) + '</div>' + u.varHtml(o.varPct, d.rotuloComp) +
        '<div class="var">' + u.pct(o.pctDoTotal) + ' do faturamento total da empresa</div></div>' +
        '<div class="card"><div class="lbl">Pedidos online</div><div class="mid">' + num(o.pedidos) + '</div><div class="var">antes: ' + num(o.pedidosAnt) + '</div></div>' +
        '<div class="card"><div class="lbl">Ticket médio online</div><div class="mid">' + brl(o.ticket) + '</div><div class="var">&nbsp;</div></div>' +
        '</section>';
    }

    // canais online com a loja que atendeu (a % usa a soma dos canais)
    if (ve('canais') && d.canais) {
      var tot = d.canais.reduce(function (s, c) { return s + c.valor; }, 0);
      h += '<section class="e-grid2">';
      d.canais.forEach(function (c) {
        var pct = tot ? c.valor / tot : 0;
        h += '<div class="card v-ch"><div class="head"><i class="sw" style="background:' + cor(c.nome) + '"></i><span class="lbl">' + esc(c.nome) + '</span></div>' +
          '<div class="mid">' + brl(c.valor) + '</div>' + u.varHtml(c.varPct, 'antes') +
          '<div class="v-share"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + cor(c.nome) + '"></i></div>' +
          '<div class="v-meta"><span>' + num(c.pedidos) + ' pedidos · TM ' + brl(c.ticket) + '</span><span>' + (pct * 100).toFixed(0) + '% do online</span></div>' +
          (c.porLoja && c.porLoja.length ? '<div class="v-porloja"><div class="v-porloja-tit">Atendido por loja</div>' + c.porLoja.map(function (l) {
            return '<div class="v-pl"><span>' + esc(l.nome) + ' <em>' + num(l.pedidos) + '</em></span><span>' + brl(l.valor) + ' <em>' + u.pct(c.valor ? l.valor / c.valor : 0) + '</em></span></div>';
          }).join('') + '</div>' : '') + '</div>';
      });
      h += '</section>';
    }

    if (ve('trafego') && d.trafego) h += trafegoHtml(d, ctx);
    if (ve('googleAds') && d.googleAds && d.googleAds.temDados) h += adsHtml(d.googleAds, u, 'Google Ads', 'Conversões (Google)', 'pelo Google',
      'Atualizado pelo script da própria conta do Google Ads. As conversões são as que o Google atribui (podem diferir das vendas reais do Tiny).');
    if (ve('metaAds') && d.metaAds && d.metaAds.temDados) h += adsHtml(d.metaAds, u, 'Meta Ads', 'Compras (Meta)', 'pelo Meta',
      'Atualizado pela API do Meta de hora em hora. As compras são as que o Meta atribui (somadas ao Google passam do real: a receita sem contar 2x está em Mensal).');
    if (ve('ga4') && d.ga4 && (d.ga4.temDados || d.ga4.configurado)) h += ga4Html(d, u);
    var bc = ve('cancelamentos') && d.cancelamentos ? cancelHtml(d, u) : '';
    var bd = ve('diaSemana') && d.diaSemana ? diaSemanaHtml(d, u) : '';
    if (bc || bd) h += '<section class="e-grid2"' + (bc && bd ? '' : ' style="grid-template-columns:1fr"') + '>' + bc + bd + '</section>';

    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    var ds = bd ? serieDias(d) : [];
    if (ds.length && el.querySelector('.e-dias')) u.ligarGrafico(el.querySelector('.e-dias'), ds, nomesDias(d));
  }

  function adsHtml(a, u, titulo, rotConv, fonte, nota) {
    var brl = u.brl, num = u.num, esc = u.esc;
    var kpi = function (lbl, val, sub) { return '<div class="e-kpi"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    var x = function (v) { return v == null ? '—' : v.toFixed(1).replace('.', ',') + 'x'; };
    var h = '<section class="card e-traf"><h2>' + titulo + '</h2><div class="e-kpis">' +
      kpi('Custo', brl(a.custo), a.varCusto == null ? 'sem base de comparação' : (a.varCusto >= 0 ? '▲ +' : '▼ ') + u.pct(a.varCusto, 1) + ' vs antes') +
      kpi('Cliques', num(a.cliques), 'CTR ' + u.pct(a.ctr, 2) + ' · CPC ' + (a.cpc == null ? '—' : brl(a.cpc))) +
      kpi(rotConv, num(Math.round(a.conversoes)), 'valor ' + brl(a.valorConversoes)) +
      kpi('ROAS informado', x(a.roasPlataforma), 'valor de conversões ÷ custo, ' + fonte) +
      '</div>';
    if (a.campanhas.length) {
      h += '<div class="tab-wrap e-plat"><table class="p-tab"><thead><tr><th>Campanha</th><th class="r">Custo</th><th class="r">Cliques</th><th class="r">Conv.</th><th class="r">ROAS</th></tr></thead><tbody>' +
        a.campanhas.map(function (c) {
          return '<tr><td class="e-camp">' + esc(c.campanha) + '</td><td class="r">' + brl(c.custo) + '</td><td class="r">' + num(c.cliques) + '</td><td class="r">' + num(Math.round(c.conversoes)) + '</td><td class="r">' + x(c.roas) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    return h + '<div class="var e-nota">' + nota + '</div></section>';
  }

  function ga4Html(d, u) {
    var g = d.ga4, num = u.num, brl = u.brl, esc = u.esc;
    var h = '<section class="card e-traf"><h2>Google Analytics (site)</h2>';
    if (!g.temDados) return h + '<div class="empty">Conexão configurada, aguardando a primeira leitura do GA4 (roda de hora em hora).</div></section>';
    var kpi = function (lbl, val, sub) { return '<div class="e-kpi"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    h += '<div class="e-kpis">' +
      kpi('Sessões', num(g.sessoes), g.varSessoes == null ? 'sem base de comparação' : (g.varSessoes >= 0 ? '▲ +' : '▼ ') + u.pct(g.varSessoes, 1) + ' vs antes') +
      kpi('Usuários', num(g.usuarios), '&nbsp;') +
      kpi('Taxa de conversão', u.pct(g.conversao, 2), num(g.transacoes) + ' compras no GA4') +
      kpi('Receita no GA4', brl(g.receita), 'pelo rastreamento do site') +
      '</div>';
    if (g.origens.length) {
      var max = g.origens[0].sessoes || 1;
      h += '<h2 class="p-sub">Origem / mídia</h2><div class="e-origens">' + g.origens.map(function (o) {
        return '<div class="e-or"><div class="top"><span>' + esc(o.origem) + '</span><b>' + num(o.sessoes) + ' sessões</b></div>' +
          '<div class="e-bar"><i style="width:' + (o.sessoes / max * 100).toFixed(1) + '%;background:var(--s2)"></i></div>' +
          '<div class="sub"><span>conv. ' + u.pct(o.conversao, 2) + ' · ' + num(o.transacoes) + ' compras</span><span>' + brl(o.receita) + '</span></div></div>';
      }).join('') + '</div>';
    }
    return h + '<div class="var e-nota">Dados do GA4 (sessões e compras rastreadas no site). A receita do GA4 costuma ser menor que a do Tiny (bloqueadores, cookies).</div></section>';
  }

  function trafegoHtml(d, ctx) {
    var u = ctx.util, t = d.trafego, brl = u.brl;
    var h = '<section class="card e-traf"><h2>Tráfego pago × ' + u.esc(t.canal) + '</h2>';
    if (!t.temDados) {
      return h + '<div class="empty">Sem investimento lançado ainda.' + (ctx.admin
        ? '<br>Lance na planilha, aba <b>ecommerce_investimento</b>: <b>data</b> (dd/mm/aaaa) · <b>plataforma</b> (Meta Ads, Google Ads…) · <b>valor</b>. Pode ser um total por dia ou por semana.'
        : '') + '</div></section>';
    }
    var varInv = t.investimentoAnt ? (t.investimento - t.investimentoAnt) / t.investimentoAnt : null;
    var kpi = function (lbl, val, sub) { return '<div class="e-kpi"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    h += '<div class="e-kpis">' +
      kpi('Investimento', brl(t.investimento), varInv === null ? 'sem base de comparação' : (varInv >= 0 ? '▲ +' : '▼ ') + u.pct(varInv, 1) + ' vs antes') +
      kpi('ROAS', t.roas == null ? '—' : t.roas.toFixed(1).replace('.', ',') + 'x', t.roasAnt == null ? 'faturamento ÷ investimento' : 'antes: ' + t.roasAnt.toFixed(1).replace('.', ',') + 'x') +
      kpi('Custo por pedido', t.custoPedido == null ? '—' : brl(t.custoPedido), u.num(t.pedidos) + ' pedidos no ' + u.esc(t.canal)) +
      kpi('Investimento ÷ faturamento', u.pct(t.pctFaturamento, 1), 'faturamento ' + brl(t.faturamento)) +
      '</div>';
    if (t.porPlataforma.length) {
      h += '<div class="e-plat">' + t.porPlataforma.map(function (p) {
        return '<div class="v-pl"><span>' + u.esc(p.nome) + '</span><span>' + brl(p.valor) + ' <em>' + u.pct(p.pct) + '</em></span></div>';
      }).join('') + '</div>';
    }
    return h + '<div class="var e-nota">' + (t.googleAdsAuto || t.metaAdsAuto ? [t.googleAdsAuto ? 'Google Ads' : '', t.metaAdsAuto ? 'Meta Ads' : ''].filter(Boolean).join(' e ') + ' entram sozinhos; outras plataformas: aba ecommerce_investimento. ' : 'Investimento lançado à mão na planilha (aba ecommerce_investimento). ') + 'ROAS real = faturamento do ' + u.esc(t.canal) + ' no Tiny ÷ investimento.</div></section>';
  }

  function cancelHtml(d, u) {
    var c = d.cancelamentos;
    var linha = function (x, total) {
      var dif = x.taxa != null && x.taxaAnt != null ? x.taxa - x.taxaAnt : null;
      return '<div class="e-can' + (total ? ' total' : '') + '"><div class="top"><span>' + (total ? '' : '<i class="sw" style="background:' + cor(x.nome) + '"></i>') + u.esc(x.nome) + '</span>' +
        '<b>' + u.pct(x.taxa, 1) + '</b></div><div class="sub"><span>' + u.num(x.qtd) + ' de ' + u.num(x.pedidos) + ' pedidos · ' + u.brl(x.valor) + '</span>' +
        '<span>' + (dif === null ? '—' : '<b class="' + (dif <= 0 ? 'up' : 'dn') + '">' + (dif >= 0 ? '+' : '') + (dif * 100).toFixed(1).replace('.', ',') + ' p.p.</b>') + '</span></div></div>';
    };
    return '<div class="card"><h2>Cancelamentos</h2>' + c.canais.map(function (x) { return linha(x); }).join('') + linha(c.total, true) +
      '<div class="var e-nota">Não conta o cancelamento automático das transferências entre lojas (multiempresa).</div></div>';
  }

  function nomesDias(d) { return d.canais.map(function (c) { return c.nome; }).filter(function (n) { return n === 'Site' || n === 'Mercado Livre'; }); }
  function serieDias(d) { return (d.diaSemana && d.diaSemana.dias) || []; }

  function diaSemanaHtml(d, u) {
    var ds = d.diaSemana, serie = serieDias(d);
    var h = '<div class="card e-dias"><h2>Melhor dia da semana · online</h2>';
    if (!ds || !ds.melhor) return h + '<div class="empty">Ainda sem vendas online suficientes nas últimas semanas.</div></div>';
    h += '<div class="var" style="margin:-6px 0 10px">Média por dia nas últimas ' + ds.semanas + ' semanas (' + u.esc(ds.de) + ' a ' + u.esc(ds.ate) + ') · melhor: <b>' + u.esc(ds.melhor) + '</b> · mais fraco: <b>' + u.esc(ds.pior) + '</b></div>';
    return h + u.grafico(serie, nomesDias(d), cor, { todosRotulos: true, baixo: true }) + '</div>';
  }

  // ================= planejamento (abas da planilha) =================
  var LS_SUB = 'painel_ecom_sub';
  var SUBS = [['visao', 'Visão geral'], ['mensal', 'Mensal'], ['diario', 'Diário'], ['planejador', 'Planejador'], ['acoes', 'Ações'], ['biblioteca', 'Biblioteca'], ['projecao', 'Projeção']];
  var estE = { mesAcomp: 0, editando: false, proj: null, mesAcoes: null, bibTipo: 'metrica' };
  var subAtual = function () { try { return localStorage.getItem(LS_SUB) || 'visao'; } catch (e) { return 'visao'; } };
  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

  function render(el, d, ctx) {
    var ve = function (s) { return ctx.visivel ? ctx.visivel(s) : true; };
    var disp = SUBS.filter(function (s) {
      return s[0] === 'visao' || (s[0] === 'mensal' && ve('mensal') && d.mensal) || (s[0] === 'diario' && ve('acompanhamento') && d.acompanhamento) ||
        (s[0] === 'planejador' && ve('planejador') && d.planejador) || (s[0] === 'projecao' && ve('projecao') && d.projecao) ||
        (s[0] === 'acoes' && ve('acoes') && d.acoes) || (s[0] === 'biblioteca' && ve('biblioteca') && d.biblioteca);
    });
    var sub = subAtual();
    if (!disp.some(function (s) { return s[0] === sub; })) sub = 'visao';
    if (ctx.mostrarPeriodos) ctx.mostrarPeriodos(sub === 'visao');
    var nav = disp.length > 1 ? '<nav class="crm-sub e-sub">' + disp.map(function (s) {
      return '<button type="button" data-s="' + s[0] + '"' + (s[0] === sub ? ' class="on"' : '') + '>' + s[1] + '</button>';
    }).join('') + '</nav>' : '';
    var corpo = document.createElement('div');
    if (sub === 'visao') renderVisao(corpo, d, ctx);
    else if (sub === 'mensal') corpo.innerHTML = mensalHtml(d, ctx);
    else if (sub === 'diario') corpo.innerHTML = diarioHtml(d, ctx);
    else if (sub === 'planejador') corpo.innerHTML = planejadorHtml(d, ctx);
    else if (sub === 'acoes') corpo.innerHTML = acoesHtml(d, ctx);
    else if (sub === 'biblioteca') corpo.innerHTML = bibliotecaHtml(d, ctx);
    else corpo.innerHTML = projecaoHtml(d, ctx);
    el.innerHTML = nav;
    el.appendChild(corpo);
    if (nav) el.querySelector('.e-sub').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      try { localStorage.setItem(LS_SUB, b.dataset.s); } catch (er) { /* sem storage */ }
      estE.editando = false;
      render(el, d, ctx);
    });
    if (sub === 'diario') ligarDiario(el, d, ctx);
    if (sub === 'planejador') ligarPlanejador(el, d, ctx);
    if (sub === 'projecao') ligarProjecao(el, d, ctx);
    if (sub === 'acoes') ligarAcoes(el, d, ctx);
    if (sub === 'biblioteca') ligarBiblioteca(el, d, ctx);
  }

  // ---------- formatos ----------
  function F(u) {
    return {
      brl: function (v) { return v == null || !isFinite(v) ? '—' : u.brl(v); },
      num: function (v) { return v == null || !isFinite(v) ? '—' : u.num(Math.round(v)); },
      pct: function (v, c) { return v == null || !isFinite(v) ? '—' : u.pct(v, c == null ? 1 : c); },
      x: function (v) { return v == null || !isFinite(v) ? '—' : v.toFixed(2).replace('.', ',') + 'x'; },
      cps: function (v) { return v == null || !isFinite(v) ? '—' : 'R$ ' + v.toFixed(2).replace('.', ','); },
    };
  }

  // ---------- Mensal (abas 2 e 5) ----------
  function mensalHtml(d, ctx) {
    var f = F(ctx.util), m = d.mensal, esc = ctx.util.esc;
    var cols = m.meses;
    var linhas = [
      ['Crescimento mensal', 'crescimento', f.pct, 'sub'],
      ['Receita captada', 'captada', f.brl, 'forte'],
      ['Receita faturada', 'faturada', f.brl],
      ['Receita mídia paga (Google + Meta)', 'receitaMidia', f.brl, 'forte'],
      ['· Google Ads', 'receitaGoogle', f.brl, 'sub'],
      ['· Meta Ads', 'receitaMeta', f.brl, 'sub'],
      ['% mídia paga', 'pctMidia', f.pct],
      ['Receita outros canais', 'receitaOutros', f.brl],
      ['% outros canais', 'pctOutros', f.pct],
      ['Receita cancelada', 'cancelada', f.brl],
      ['% de aprovação', 'aprovacao', f.pct],
      ['Investimento (ads)', 'invest', f.brl, 'forte'],
      ['% aumento / redução ads', 'varInvest', f.pct, 'sub'],
      ['Sessões mídia', 'sessoesMidia', f.num],
      ['Sessões', 'sessoes', f.num],
      ['CPS mídia', 'cpsMidia', f.cps],
      ['CPS geral', 'cps', f.cps],
      ['Pedidos (captado)', 'pedidos', f.num],
      ['Ticket médio', 'tm', f.brl],
      ['Taxa de conversão', 'tc', function (v) { return f.pct(v, 2); }],
      ['ROAS captado', 'roasCaptado', f.x, 'forte'],
      ['ROAS faturado', 'roasFaturado', f.x],
      ['ROAS mídia paga', 'roasMidia', f.x],
    ];
    var h = '<section class="card e-tab-card"><h2>Dados de atingimento · ' + m.ano + ' (Site)</h2>' +
      '<div class="tab-wrap"><table class="p-tab e-mensal"><thead><tr><th></th>' +
      cols.map(function (c) { return '<th class="r">' + MESES[c.mes] + (c.parcial ? '*' : '') + '</th>'; }).join('') + '<th class="r e-med">Média</th></tr></thead><tbody>' +
      linhas.map(function (l) {
        return '<tr class="' + (l[3] || '') + '"><td>' + esc(l[0]) + '</td>' + cols.map(function (c) { return '<td class="r">' + l[2](c[l[1]]) + '</td>'; }).join('') +
          '<td class="r e-med">' + l[2](m.media[l[1]]) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<div class="var e-nota">* mês em andamento. Média = meses completos. Mídia paga = receita do Tiny × a fatia que o GA4 atribui ao Google Ads e ao Meta Ads (cada venda conta uma vez). Investimento: Google Ads automático + lançamentos manuais (Meta, por enquanto).</div></section>';

    var cn = m.canais;
    if (cn.nomes.length) {
      h += '<section class="card e-tab-card"><h2>Receita por canal · ' + m.ano + '</h2><div class="tab-wrap"><table class="p-tab e-mensal"><thead><tr><th>Canal</th>' +
        cols.map(function (c) { return '<th class="r">' + MESES[c.mes] + (c.parcial ? '*' : '') + '</th>'; }).join('') + '<th class="r e-med">Total</th></tr></thead><tbody>' +
        cn.nomes.map(function (n) {
          var tot = 0;
          return '<tr><td>' + esc(n) + '</td>' + cn.porMes.map(function (pm) {
            var x = pm[n]; tot += x ? x.estimada : 0;
            return '<td class="r">' + (x ? f.brl(x.estimada) + '<small>' + f.pct(x.fatia, 0) + '</small>' : '—') + '</td>';
          }).join('') + '<td class="r e-med">' + f.brl(tot) + '</td></tr>';
        }).join('') + '</tbody></table></div>' +
        '<div class="var e-nota">Receita real do Site (Tiny) dividida pela participação de cada origem no GA4. Em cinza, a % do mês.</div></section>';
    } else h += '<div class="card empty">Receita por canal aparece quando o GA4 estiver conectado.</div>';
    return h;
  }

  // ---------- Diário (aba 4) ----------
  function diarioHtml(d, ctx) {
    var f = F(ctx.util), a = d.acompanhamento[estE.mesAcomp] || d.acompanhamento[0];
    var e = a.esperado;
    var cmp = function (real, esp, inverso) {
      if (real == null || esp == null || !isFinite(real) || !isFinite(esp) || !esp) return '';
      var bom = inverso ? real <= esp : real >= esp;
      return bom ? ' e-ok' : ' e-ruim';
    };
    var h = '<nav class="crm-sub e-mes">' + d.acompanhamento.map(function (x, i) {
      return '<button type="button" data-m="' + i + '"' + (i === estE.mesAcomp ? ' class="on"' : '') + '>' + MESES[x.mes] + '/' + x.ano + '</button>';
    }).join('') + '</nav>';
    if (!a.definido) h += '<div class="aviso">Plano deste mês ainda não definido: o "esperado" usa os valores da planilha original. Defina em <b>Planejador</b>.</div>';
    var ea = a.esperadoAteHoje, t = a.total;
    var card = function (lbl, real, esp, fmt) {
      var p = esp ? real / esp : null;
      return '<div class="card"><div class="lbl">' + lbl + '</div><div class="mid">' + fmt(real) + '</div><div class="var">esperado até hoje ' + fmt(esp) +
        (p == null ? '' : ' · <b class="' + (p >= 1 ? 'up' : 'dn') + '">' + f.pct(p, 0) + '</b>') + '</div></div>';
    };
    h += '<section class="crm-kpis">' + card('Receita captada', t.receita, ea.receita, f.brl) + card('Sessões', t.sessoes, ea.sessoes, f.num) +
      card('Investimento', t.invest, ea.invest, f.brl) +
      '<div class="card"><div class="lbl">ROAS do mês</div><div class="mid">' + f.x(t.roas) + '</div><div class="var">esperado ' + f.x(e.roas) + ' · TM ' + f.brl(t.tm) + '</div></div></section>';
    h += '<section class="card e-tab-card"><h2>Acompanhamento diário · ' + MESES[a.mes] + '/' + a.ano + '</h2><div class="tab-wrap"><table class="p-tab e-diario"><thead><tr>' +
      '<th>Dia</th><th class="r">Invest.</th><th class="r">Sessões</th><th class="r">Receita</th><th class="r">Pedidos</th><th class="r">TM</th><th class="r">ROAS</th><th class="r">Conv.</th><th class="r">CPS</th></tr>' +
      '<tr class="e-esp"><th>esperado/dia</th><th class="r">' + f.brl(e.invest) + '</th><th class="r">' + f.num(e.sessoes) + '</th><th class="r">' + f.brl(e.receita) + '</th><th class="r">—</th><th class="r">' + f.brl(e.tm) +
      '</th><th class="r">' + f.x(e.roas) + '</th><th class="r">' + f.pct(e.tc, 2) + '</th><th class="r">' + f.cps(e.cps) + '</th></tr></thead><tbody>' +
      a.linhas.map(function (l) {
        if (l.futuro) return '<tr class="e-fut"><td>' + l.dia + ' <small>' + l.semana + '</small></td><td colspan="8"></td></tr>';
        return '<tr><td>' + l.dia + ' <small>' + l.semana + '</small></td>' +
          '<td class="r">' + f.brl(l.invest) + '</td><td class="r' + cmp(l.sessoes, e.sessoes) + '">' + f.num(l.sessoes) + '</td>' +
          '<td class="r' + cmp(l.receita, e.receita) + '">' + f.brl(l.receita) + '</td><td class="r">' + f.num(l.pedidos) + '</td>' +
          '<td class="r' + cmp(l.tm, e.tm) + '">' + f.brl(l.tm) + '</td><td class="r' + cmp(l.roas, e.roas) + '">' + f.x(l.roas) + '</td>' +
          '<td class="r' + cmp(l.tc, e.tc) + '">' + f.pct(l.tc, 2) + '</td><td class="r' + cmp(l.cps, e.cps, true) + '">' + f.cps(l.cps) + '</td></tr>';
      }).join('') +
      '<tr class="e-tot"><td>Total</td><td class="r">' + f.brl(t.invest) + '</td><td class="r">' + f.num(t.sessoes) + '</td><td class="r">' + f.brl(t.receita) + '</td><td class="r">' + f.num(t.pedidos) +
      '</td><td class="r">' + f.brl(t.tm) + '</td><td class="r">' + f.x(t.roas) + '</td><td class="r">' + f.pct(t.tc, 2) + '</td><td class="r">' + f.cps(t.cps) + '</td></tr>' +
      '</tbody></table></div><div class="var e-nota">Atualiza sozinho: receita e pedidos do Tiny (a cada 10 min), sessões do GA4 (de hora em hora; o Google atrasa algumas horas), investimento do Google Ads (diário) + manuais. Verde = no ou acima do esperado.</div></section>';
    return h;
  }

  function ligarDiario(el, d, ctx) {
    var nav = el.querySelector('.e-mes');
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      estE.mesAcomp = +b.dataset.m; render(el, d, ctx);
    });
  }

  // ---------- Planejador (aba 3) ----------
  function planejadorHtml(d, ctx) {
    var f = F(ctx.util), p = d.planejador, esc = ctx.util.esc;
    var A = p.atual, D = p.desejado, I = p.ideal;
    var h = '';
    if (!p.definido) h += '<div class="aviso">Cenário ideal deste mês ainda não definido: usando os valores da planilha original.' + (ctx.admin ? ' Clique em "Editar plano do mês".' : '') + '</div>';
    if (ctx.admin) h += '<div class="e-acoes-plano"><button class="btn-s" type="button" id="e-edit-plano">' + (estE.editando ? 'Fechar edição' : 'Editar plano do mês') + '</button></div>';
    if (estE.editando) h += editorPlano(p, ctx);
    var col = function (tit, sub, linhas) {
      return '<div class="card e-cen"><div class="lbl">' + tit + '</div><div class="var">' + sub + '</div>' +
        linhas.map(function (l) { return '<div class="e-cl' + (l[2] ? ' forte' : '') + '"><span>' + l[0] + '</span><b>' + l[1] + '</b></div>'; }).join('') + '</div>';
    };
    h += '<section class="e-cens">' +
      col('Cenário atual', 'últimos 30 dias reais', [['Investimento', f.brl(A.invest)], ['CPS', f.cps(A.cps)], ['Ticket médio', f.brl(A.tm)], ['Taxa de conversão', f.pct(A.tc, 2)],
        ['% aprovação', f.pct(A.aprovacao)], ['Visitas', f.num(A.visitas)], ['Pedidos', f.num(A.pedidos)], ['CPA', f.brl(A.cpa)],
        ['Faturamento captado', f.brl(A.captado), 1], ['ROAS bruto', f.x(A.roasBruto)], ['Faturamento real', f.brl(A.real), 1], ['ROAS real', f.x(A.roasReal)]]) +
      col('Cenário desejado', 'quero faturar ' + f.brl(D.faturamento) + ' com as taxas de hoje', [['Investimento necessário', f.brl(D.invest), 1], ['CPS (atual)', f.cps(D.cps)], ['Ticket médio (atual)', f.brl(D.tm)],
        ['Taxa de conversão (atual)', f.pct(D.tc, 2)], ['% aprovação (atual)', f.pct(D.aprovacao)], ['Visitas necessárias', f.num(D.visitas)], ['Pedidos necessários', f.num(D.pedidos)],
        ['CPA', f.brl(D.cpa)], ['Faturamento captado', f.brl(D.captado)], ['ROAS bruto', f.x(D.roasBruto)], ['Faturamento desejado', f.brl(D.faturamento), 1], ['ROAS desejado', f.x(D.roasReal)]]) +
      col('Cenário ideal', 'plano de ' + esc(p.mes.split('-').reverse().join('/')), [['Verba mensal', f.brl(I.invest), 1], ['CPS ideal', f.cps(I.cps)], ['Ticket médio ideal', f.brl(I.tm)],
        ['Conversão ideal', f.pct(I.tc, 2)], ['Aprovação de pagamento', f.pct(I.aprovacao)], ['Visitas ideais', f.num(I.visitas)], ['Pedidos ideais', f.num(I.pedidos)],
        ['CPA ideal', f.brl(I.cpa)], ['Faturamento bruto', f.brl(I.captado)], ['ROAS bruto', f.x(I.roasBruto)], ['Faturamento desejado', f.brl(I.real), 1], ['ROAS real', f.x(I.roasReal)]]) +
      '</section>';
    // ideal × média do ano
    var nomes = { verba: ['Verba mensal', f.brl], cps: ['CPS', f.cps], tm: ['Ticket médio', f.brl], tc: ['Taxa de conversão', function (v) { return f.pct(v, 2); }], aprovacao: ['Aprovação', f.pct] };
    h += '<section class="card e-tab-card"><h2>Ideal × média do ano</h2><div class="tab-wrap"><table class="p-tab"><thead><tr><th></th><th class="r">Média ' + d.mensal.ano + '</th><th class="r">Ideal</th><th class="r">Variação</th><th class="r">Máx. recomendado</th></tr></thead><tbody>' +
      Object.keys(nomes).map(function (k) {
        var c = p.comparacao[k];
        return '<tr><td>' + nomes[k][0] + '</td><td class="r">' + nomes[k][1](c.media) + '</td><td class="r">' + nomes[k][1](c.ideal) + '</td>' +
          '<td class="r' + (c.acimaDoLimite ? ' e-ruim' : '') + '">' + f.pct(c.pct) + (c.acimaDoLimite ? ' ⚠️' : '') + '</td><td class="r">±' + f.pct(c.max, 0) + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="var e-nota">⚠️ = o ideal está mais longe da média do ano do que o recomendado (meta difícil de atingir num mês).</div></section>';
    // diário
    var da = p.diarioAtual, di = p.diarioIdeal;
    h += '<section class="card e-tab-card"><h2>Cenário diário</h2><div class="tab-wrap"><table class="p-tab"><thead><tr><th></th><th class="r">Atual (média 30 dias)</th><th class="r">Ideal (' + p.diasMes + ' dias)</th></tr></thead><tbody>' +
      [['Investimento diário', 'invest', f.brl], ['Visitas diárias', 'visitas', f.num], ['Pedidos diários', 'pedidos', function (v) { return v == null ? '—' : v.toFixed(1).replace('.', ','); }], ['Faturamento diário', 'captado', f.brl]]
        .map(function (l) { return '<tr><td>' + l[0] + '</td><td class="r">' + l[2](da[l[1]]) + '</td><td class="r">' + l[2](di[l[1]]) + '</td></tr>'; }).join('') + '</tbody></table></div></section>';
    // canais e 80/20
    h += '<section class="e-grid2"><div class="card"><h2>Canais de venda</h2><table class="p-tab"><thead><tr><th>Canal</th><th class="r">%</th><th class="r">Receita</th><th class="r">Pedidos</th></tr></thead><tbody>' +
      p.canais.map(function (c) { return '<tr><td>' + esc(c.canal) + '</td><td class="r">' + f.pct(c.pct, 0) + '</td><td class="r">' + f.brl(c.receita) + '</td><td class="r">' + f.num(c.pedidos) + '</td></tr>'; }).join('') +
      '</tbody></table>' + (Math.abs(p.somaCanais - 1) > 0.001 ? '<div class="aviso">Os % dos canais somam ' + f.pct(p.somaCanais, 0) + ' (deveria ser 100%).</div>' : '') + '</div>' +
      '<div class="card"><h2>80/20 produtos</h2><table class="p-tab"><thead><tr><th>Produto</th><th class="r">%</th><th class="r">Pedidos</th><th class="r">TM</th><th class="r">Faturamento</th></tr></thead><tbody>' +
      p.produtos.map(function (x) { return '<tr><td>' + esc(x.produto) + '</td><td class="r">' + f.pct(x.pct, 0) + '</td><td class="r">' + f.num(x.pedidos) + '</td><td class="r">' + f.brl(x.tm) + '</td><td class="r">' + f.brl(x.faturamento) + '</td></tr>'; }).join('') +
      '</tbody></table><div class="var e-nota">Os primeiros produtos devem somar ~80% das vendas.</div></div></section>';
    return h;
  }

  function editorPlano(p, ctx) {
    var esc = ctx.util.esc, pl = p.plano;
    var campo = function (id, lbl, val, passo) { return '<label><span>' + lbl + '</span><input class="campo" type="number" step="' + passo + '" min="0" data-k="' + id + '" value="' + val + '"></label>'; };
    return '<section class="card e-editor"><h2>Plano de ' + esc(p.mes.split('-').reverse().join('/')) + '</h2><div class="v-metas-edit">' +
      campo('verba', 'Verba mensal (R$)', pl.verba, 100) + campo('cps', 'CPS ideal (R$)', pl.cps, 0.01) + campo('tm', 'Ticket médio ideal (R$)', pl.tm, 1) +
      campo('tc', 'Conversão ideal (%)', +(pl.tc * 100).toFixed(3), 0.01) + campo('aprovacao', 'Aprovação de pagamento (%)', +(pl.aprovacao * 100).toFixed(2), 0.1) +
      campo('faturamentoDesejado', 'Faturamento desejado (R$)', pl.faturamentoDesejado, 1000) + '</div>' +
      '<h2 class="p-sub">Canais (% da receita)</h2><div class="e-lista-ed" id="e-canais">' + pl.canais.map(function (c) {
        return '<div class="e-li"><input class="campo" data-c="nome" value="' + esc(c[0]) + '"><input class="campo" type="number" step="1" min="0" data-c="pct" value="' + +(c[1] * 100).toFixed(1) + '"><span>%</span></div>';
      }).join('') + '</div>' +
      '<h2 class="p-sub">Produtos 80/20 (nome · % dos pedidos · ticket)</h2><div class="e-lista-ed" id="e-prods">' + pl.produtos.map(function (x) {
        return '<div class="e-li"><input class="campo" data-c="nome" value="' + esc(x[0]) + '"><input class="campo" type="number" step="1" min="0" data-c="pct" value="' + +(x[1] * 100).toFixed(1) + '"><span>%</span><input class="campo" type="number" step="1" min="0" data-c="tm" value="' + x[2] + '"></div>';
      }).join('') + '</div>' +
      '<div class="v-metas-acoes"><button class="btn-p" type="button" id="e-salvar-plano">Salvar plano</button></div><div class="msg" id="e-plano-msg"></div></section>';
  }

  function ligarPlanejador(el, d, ctx) {
    var b = el.querySelector('#e-edit-plano');
    if (b) b.addEventListener('click', function () { estE.editando = !estE.editando; render(el, d, ctx); });
    var s = el.querySelector('#e-salvar-plano');
    if (!s) return;
    s.addEventListener('click', function () {
      var v = function (k) { return Number(el.querySelector('[data-k="' + k + '"]').value) || 0; };
      var lista = function (id, comTm) {
        return Array.prototype.map.call(el.querySelectorAll('#' + id + ' .e-li'), function (li) {
          var r = [li.querySelector('[data-c="nome"]').value.trim(), (Number(li.querySelector('[data-c="pct"]').value) || 0) / 100];
          if (comTm) r.push(Number(li.querySelector('[data-c="tm"]').value) || 0);
          return r;
        }).filter(function (r) { return r[0]; });
      };
      var plano = { verba: v('verba'), cps: v('cps'), tm: v('tm'), tc: v('tc') / 100, aprovacao: v('aprovacao') / 100,
        faturamentoDesejado: v('faturamentoDesejado'), canais: lista('e-canais'), produtos: lista('e-prods', true) };
      var msg = el.querySelector('#e-plano-msg');
      s.disabled = true; msg.textContent = 'Salvando…'; msg.className = 'msg';
      ctx.acao('salvarPlano', { mes: d.planejador.mes, plano: plano }).then(function () { estE.editando = false; ctx.recarregar(); })
        .catch(function () { s.disabled = false; msg.textContent = 'Não foi possível salvar.'; msg.className = 'msg erro'; });
    });
  }

  // ---------- Ações do mês (aba 6) ----------
  var PRI_CLS = { 'Alta': 'e-pri-a', 'Média': 'e-pri-m', 'Baixa': 'e-pri-b' };

  function acoesHtml(d, ctx) {
    var f = F(ctx.util), esc = ctx.util.esc;
    if (estE.mesAcoes == null) estE.mesAcoes = Math.max(0, d.acoes.findIndex(function (x) { return x.atual; }));
    var a = d.acoes[estE.mesAcoes] || d.acoes[0], t = a.total;
    var nomeMes = function (x) { return MESES[+x.mes.slice(5, 7) - 1] + '/' + x.mes.slice(0, 4); };
    var wpp = d.acoesWhatsapp;
    var h = '<nav class="crm-sub e-mes e-mes-acoes">' + d.acoes.map(function (x, i) {
      return '<button type="button" data-m="' + i + '"' + (i === estE.mesAcoes ? ' class="on"' : '') + '>' + nomeMes(x) + '</button>';
    }).join('') + '</nav>';
    var k = function (lbl, val, sub) { return '<div class="card"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    var pAte = t.atingidoAteHoje;
    h += '<section class="crm-kpis">' +
      k('Meta do mês (receita captada)', f.brl(t.meta), t.comAcao + ' de ' + a.dias + ' dias com ação planejada') +
      k('Receita captada', f.brl(t.captada), 'meta até hoje ' + f.brl(t.metaAteHoje) + (pAte == null ? '' : ' · <b class="' + (pAte >= 1 ? 'up' : 'dn') + '">' + f.pct(pAte, 0) + '</b>')) +
      k('Receita WhatsApp', wpp ? f.brl(t.whatsapp) : '—', wpp ? 'pedidos do Site após envio do CRM (7 dias)' : 'precisa do módulo CRM') +
      k('% de aprovação', f.pct(t.aprovacao), 'faturada ' + f.brl(t.faturada) + ' · cancelada ' + f.brl(t.cancelada)) + '</section>';
    if (ctx.admin) h += '<div class="e-acoes-plano"><button class="btn-s" type="button" id="e-edit-acoes">' + (estE.editando ? 'Fechar edição' : 'Editar ações do mês') + '</button></div>';
    var ed = estE.editando && ctx.admin;
    if (ed) {
      var todas = [];
      ['metrica', 'canal'].forEach(function (tp) { ((d.biblioteca || {})[tp] || []).forEach(function (g) { g.itens.forEach(function (x) { if (todas.indexOf(x) < 0) todas.push(x); }); }); });
      h += '<datalist id="e-bib-lista">' + todas.map(function (x) { return '<option value="' + esc(x) + '">'; }).join('') + '</datalist>';
    }
    h += '<section class="card e-tab-card"><h2>Ações do mês · ' + nomeMes(a) + '</h2><div class="tab-wrap"><table class="p-tab e-acoes' + (ed ? ' e-acoes-ed' : '') + '"><thead><tr>' +
      '<th>Data</th><th>Ação do dia</th><th>Prioridade</th><th class="r">Meta</th><th class="r">% atingido</th><th class="r">Captada</th>' +
      (wpp ? '<th class="r">WhatsApp</th>' : '') + '<th class="r">Faturada</th><th class="r">Cancelada</th><th class="r">% aprov.</th></tr></thead><tbody>' +
      a.linhas.map(function (l) {
        var cls = (l.hoje ? 'e-hoje' : '') + (l.futuro ? ' e-fut' : '');
        var acao = ed ? '<input class="campo" data-a="acao" list="e-bib-lista" maxlength="200" value="' + esc(l.acao) + '" placeholder="Ação do dia">' : (l.acao ? esc(l.acao) : '<span class="e-vazio">—</span>');
        var pri = ed ? '<select class="campo" data-a="prioridade"><option value=""></option>' + a.prioridades.map(function (p) { return '<option' + (p === l.prioridade ? ' selected' : '') + '>' + p + '</option>'; }).join('') + '</select>'
          : (l.prioridade ? '<span class="e-pri ' + (PRI_CLS[l.prioridade] || '') + '">' + esc(l.prioridade) + '</span>' : '');
        var meta = ed ? '<input class="campo" type="number" min="0" step="10" data-a="meta" value="' + (l.metaSalva ? l.meta : '') + '" placeholder="' + Math.round(a.metaPadrao) + '">'
          : f.brl(l.meta) + (l.metaSalva ? '' : ' <small title="meta do plano do mês ÷ dias">plano</small>');
        var real = function (v) { return l.futuro ? '' : f.brl(v); };
        return '<tr class="' + cls + '" data-dia="' + l.dia + '"><td>' + l.data + ' <small>' + l.semana + '</small></td><td class="e-acao-txt">' + acao + '</td><td>' + pri + '</td><td class="r">' + meta + '</td>' +
          '<td class="r' + (l.atingido == null ? '' : l.atingido >= 1 ? ' e-ok' : ' e-ruim') + '">' + (l.futuro ? '' : f.pct(l.atingido, 0)) + '</td><td class="r">' + real(l.captada) + '</td>' +
          (wpp ? '<td class="r">' + real(l.whatsapp) + '</td>' : '') + '<td class="r">' + real(l.faturada) + '</td><td class="r">' + real(l.cancelada) + '</td><td class="r">' + (l.futuro ? '' : f.pct(l.aprovacao, 0)) + '</td></tr>';
      }).join('') +
      '<tr class="e-tot"><td>Total</td><td></td><td></td><td class="r">' + f.brl(t.meta) + '</td><td class="r">' + f.pct(t.atingido, 0) + '</td><td class="r">' + f.brl(t.captada) + '</td>' +
      (wpp ? '<td class="r">' + f.brl(t.whatsapp) + '</td>' : '') + '<td class="r">' + f.brl(t.faturada) + '</td><td class="r">' + f.brl(t.cancelada) + '</td><td class="r">' + f.pct(t.aprovacao, 0) + '</td></tr>' +
      '</tbody></table></div>' +
      (ed ? '<div class="v-metas-acoes"><button class="btn-p" type="button" id="e-salvar-acoes">Salvar ações</button></div><div class="msg" id="e-acoes-msg"></div>' : '') +
      '<div class="var e-nota">Meta em branco = receita captada do plano do mês (Planejador) ÷ ' + a.dias + ' dias (' + f.brl(a.metaPadrao) + '/dia). Captada, faturada e cancelada: Site, do Tiny.' +
      (ed ? ' Dica: comece a digitar para escolher uma ação da Biblioteca.' : '') + '</div></section>';
    return h;
  }

  function ligarAcoes(el, d, ctx) {
    var nav = el.querySelector('.e-mes-acoes');
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      estE.mesAcoes = +b.dataset.m; estE.editando = false; render(el, d, ctx);
    });
    var b = el.querySelector('#e-edit-acoes');
    if (b) b.addEventListener('click', function () { estE.editando = !estE.editando; render(el, d, ctx); });
    var s = el.querySelector('#e-salvar-acoes');
    if (!s) return;
    s.addEventListener('click', function () {
      var a = d.acoes[estE.mesAcoes] || d.acoes[0];
      var dias = Array.prototype.map.call(el.querySelectorAll('tr[data-dia]'), function (tr) {
        var v = function (k) { return tr.querySelector('[data-a="' + k + '"]').value; };
        var meta = v('meta').trim();
        return { dia: +tr.dataset.dia, acao: v('acao').trim(), prioridade: v('prioridade'), meta: meta === '' ? null : Number(meta) };
      }).filter(function (x) { return x.acao || x.meta !== null; });
      var msg = el.querySelector('#e-acoes-msg');
      s.disabled = true; msg.textContent = 'Salvando…'; msg.className = 'msg';
      ctx.acao('salvarAcoes', { mes: a.mes, dias: dias }).then(function () { estE.editando = false; ctx.recarregar(); })
        .catch(function () { s.disabled = false; msg.textContent = 'Não foi possível salvar.'; msg.className = 'msg erro'; });
    });
  }

  // ---------- Biblioteca de ações (abas 7 e 8) ----------
  var BIB_TIPOS = [['metrica', 'Por métrica'], ['canal', 'Por canal']];

  function bibliotecaHtml(d, ctx) {
    var esc = ctx.util.esc, tipo = estE.bibTipo, grupos = d.biblioteca[tipo] || [];
    var ed = estE.editando && ctx.admin;
    var h = '<nav class="crm-sub e-bib-tipo">' + BIB_TIPOS.map(function (x) {
      return '<button type="button" data-t="' + x[0] + '"' + (x[0] === tipo ? ' class="on"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</nav>';
    if (ctx.admin) h += '<div class="e-acoes-plano"><button class="btn-s" type="button" id="e-edit-bib">' + (ed ? 'Fechar edição' : 'Editar biblioteca') + '</button></div>';
    h += '<div class="var e-nota" style="margin:0 2px 12px">' + (tipo === 'metrica'
      ? 'O que fazer quando uma métrica precisa melhorar. Use em <b>Ações</b> para planejar o mês.'
      : 'Ideias de ação para cada canal de aquisição.') + '</div>';
    if (ed) {
      h += '<section class="e-bib" id="e-bib-ed">' + grupos.map(function (g) {
        return '<div class="card e-bib-g"><input class="campo e-bib-nome" value="' + esc(g.grupo) + '" maxlength="60">' +
          '<textarea class="campo e-bib-itens" rows="10" placeholder="Uma ação por linha">' + esc(g.itens.join('\n')) + '</textarea></div>';
      }).join('') + '<div class="card e-bib-g"><input class="campo e-bib-nome" placeholder="Novo grupo (opcional)" maxlength="60">' +
        '<textarea class="campo e-bib-itens" rows="10" placeholder="Uma ação por linha"></textarea></div></section>' +
        '<div class="v-metas-acoes"><button class="btn-p" type="button" id="e-salvar-bib">Salvar biblioteca</button></div><div class="msg" id="e-bib-msg"></div>' +
        '<div class="var e-nota">Para apagar um grupo, deixe o nome em branco.</div>';
      return h;
    }
    h += '<section class="e-bib">' + grupos.map(function (g) {
      return '<div class="card e-bib-g"><h2>' + esc(g.grupo) + '</h2>' + (g.itens.length
        ? '<ol>' + g.itens.map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>'
        : '<div class="e-vazio">Sem ações ainda' + (ctx.admin ? ' · clique em "Editar biblioteca"' : '') + '</div>') + '</div>';
    }).join('') + '</section>';
    return h;
  }

  function ligarBiblioteca(el, d, ctx) {
    el.querySelector('.e-bib-tipo').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      estE.bibTipo = b.dataset.t; estE.editando = false; render(el, d, ctx);
    });
    var b = el.querySelector('#e-edit-bib');
    if (b) b.addEventListener('click', function () { estE.editando = !estE.editando; render(el, d, ctx); });
    var s = el.querySelector('#e-salvar-bib');
    if (!s) return;
    s.addEventListener('click', function () {
      var grupos = Array.prototype.map.call(el.querySelectorAll('#e-bib-ed .e-bib-g'), function (c) {
        return { grupo: c.querySelector('.e-bib-nome').value.trim(),
          itens: c.querySelector('.e-bib-itens').value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean) };
      }).filter(function (g) { return g.grupo; });
      var msg = el.querySelector('#e-bib-msg');
      s.disabled = true; msg.textContent = 'Salvando…'; msg.className = 'msg';
      ctx.acao('salvarBiblioteca', { tipo: estE.bibTipo, grupos: grupos }).then(function () { estE.editando = false; ctx.recarregar(); })
        .catch(function () { s.disabled = false; msg.textContent = 'Não foi possível salvar.'; msg.className = 'msg erro'; });
    });
  }

  // ---------- Projeção rápida (aba 1) ----------
  var ALAVANCAS = {
    'Melhorar CPS': ['Criativo', 'Copy', 'Produto', 'Oferta', 'Otimização', 'Qualidade da página', 'Número de eventos'],
    'Melhorar taxa de conversão': ['Página do produto', 'Objeções', 'Gatilhos', 'Oferta (preço, frete e prazo)', 'UX', 'Checkout', 'Velocidade do site'],
    'Melhorar ticket médio': ['Página do produto', 'Objeções', 'Gatilhos', 'Oferta (preço, frete e prazo)', 'UX', 'Checkout', 'Velocidade do site'],
  };

  function projecaoHtml(d, ctx) {
    var f = F(ctx.util), b = d.projecao.base, esc = ctx.util.esc;
    var p = estE.proj || (estE.proj = { invest: Math.round(b.invest || 3000), cps: +((b.cps || 0.5).toFixed(2)), tm: Math.round(b.tm || 300), tc: +(((b.tc || 0.01) * 100).toFixed(2)) });
    var mk = d.projecao.mercado;
    var inp = function (k, lbl, passo) { return '<label><span>' + lbl + '</span><input class="campo" type="number" min="0" step="' + passo + '" data-p="' + k + '" value="' + p[k] + '"></label>'; };
    return '<section class="card e-tab-card"><h2>Projeção rápida</h2><div class="var" style="margin:-6px 0 12px">Comece pelos números reais dos últimos 30 dias e mude o que quiser.</div>' +
      '<div class="v-metas-edit">' + inp('invest', 'Investimento (R$)', 100) + inp('cps', 'CPS — custo por sessão (R$)', 0.01) + inp('tm', 'Ticket médio (R$)', 1) + inp('tc', 'Taxa de conversão (%)', 0.01) + '</div>' +
      '<div class="crm-kpis e-proj" id="e-proj-res"></div>' +
      '<div class="var">Reais (30 dias): investimento ' + f.brl(b.invest) + ' · CPS ' + f.cps(b.cps) + ' · ticket ' + f.brl(b.tm) + ' · conversão ' + f.pct(b.tc, 2) + ' · ROAS ' + f.x(b.roas) +
      ' <button class="lnk e-reset" type="button" id="e-proj-reset">voltar aos reais</button></div></section>' +
      '<section class="e-grid2"><div class="card"><h2>Média de mercado</h2>' +
      '<div class="e-cl"><span>CPS</span><b>menor ' + f.cps(mk.cps[0]) + ' · médio ' + f.cps(mk.cps[1]) + ' · alto ' + f.cps(mk.cps[2]) + '</b></div>' +
      '<div class="e-cl"><span>Taxa de conversão</span><b>menor ' + f.pct(mk.tc[0]) + ' · médio ' + f.pct(mk.tc[1]) + ' · alto ' + f.pct(mk.tc[2]) + '</b></div></div>' +
      '<div class="card"><h2>Alavancas de melhoria</h2>' + Object.keys(ALAVANCAS).map(function (k) {
        return '<div class="e-alav"><b>' + esc(k) + '</b><span>' + ALAVANCAS[k].map(esc).join(' · ') + '</span></div>';
      }).join('') + '</div></section>';
  }

  function ligarProjecao(el, d, ctx) {
    var f = F(ctx.util);
    var calc = function () {
      var p = estE.proj;
      el.querySelectorAll('[data-p]').forEach(function (i) { p[i.dataset.p] = Number(i.value) || 0; });
      var visitas = p.cps ? p.invest / p.cps : 0, pedidos = visitas * p.tc / 100, fat = pedidos * p.tm;
      var k = function (lbl, val, sub) { return '<div class="card"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
      el.querySelector('#e-proj-res').innerHTML = k('Visitas', f.num(visitas), 'investimento ÷ CPS') + k('Pedidos', f.num(pedidos), 'visitas × conversão') +
        k('Faturamento', f.brl(fat), 'pedidos × ticket') + k('ROAS', f.x(p.invest ? fat / p.invest : null), 'CPA ' + f.brl(pedidos ? p.invest / pedidos : null));
    };
    el.querySelectorAll('[data-p]').forEach(function (i) { i.addEventListener('input', calc); });
    el.querySelector('#e-proj-reset').addEventListener('click', function () { estE.proj = null; render(el, d, ctx); });
    calc();
  }

  Painel.registrarModulo({ id: 'ecommerce', nome: 'E-Commerce de Performance', icone: '🛒', simbolo: 'carrinho', descricao: 'Site: vendas, tráfego pago, planejamento e ações do mês.', periodoPadrao: 'mes', render: render });
})();

/* ---- mapa ---- */
/* GERADO por scripts/gerar-geo.js — não editar. Contorno das UFs (IBGE, malha mínima) projetado para SVG. */
window.MAPA_BRASIL = {"largura":1000,"altura":897,"proj":{"lon0":-74.2,"lon1":-28.6,"lat0":5.5,"lat1":-34,"k":0.9659258262890683},"ufs":[{"uf":"RO","d":"M258.4 422.8L261.4 423.6L262.8 422.6L265 423.8L265 426L270 430.1L271.6 432.1L276.8 431.7L279.2 432.7L284 431.4L285.2 432.3L289.3 431.6L291.3 432.6L292.1 434.1L295.8 435.9L297.5 433.1L302.9 430.4L303.3 427.3L304.1 426L305.5 421.9L307.4 419.4L308.8 419.2L310.8 411.5L312.6 411L316.2 405.2L313.9 403L313.6 400.1L311.9 398.1L311.8 395.5L309.2 393.9L309 387.9L312.8 384.3L313.2 382.4L311.8 380.1L311.9 377.5L302.8 376.8L301.3 374.5L289.5 374.5L280.1 374.4L277.4 374.4L279 369.4L279.3 361.5L277.3 359L276.6 353.4L277.6 352L278.3 348.8L276.9 345.6L279 343.6L276.7 339.7L276 336.7L275.7 335.1L277.9 334.9L277.3 331.4L279.2 327.5L276.7 324.7L273.8 322.2L271.1 323.2L269.7 326.2L267.8 326.4L266.9 324.7L264.8 324.8L263.4 320L261.6 319.6L261.2 321.1L259.5 317.8L259.6 315.6L257.3 314.3L256.2 315.3L255.2 313L253.2 311.8L252.4 308.7L248.5 306L232 306L232 307.2L229.2 311.3L228.3 314.1L226.5 313.1L224.9 314.1L224.3 317.4L225.4 319.3L222.9 322.3L220.5 323.4L220.6 328L216.9 329.2L216.6 327.7L211 329L210.3 329.7L206 329L203.1 332.1L203.5 334.3L200.6 338.4L198.6 339.4L197.1 335.6L195.8 335.3L193.1 337L192.1 336.4L192.3 339.7L188.9 338.7L186.9 339.5L185.7 342.1L183.7 341.3L180.5 338.7L176 339.1L170.9 338.5L171.2 340.6L168.8 343.7L166.5 344.4L162.1 347.9L166.1 349.7L175.1 348.2L176.5 347.1L180.2 347.6L182.3 346.4L186.3 346.6L189.6 348.2L192 344.5L193.9 345.6L195.4 348.9L194.5 350.7L195.4 357L193.2 360.5L193.4 361.7L192.3 362.9L192.9 366.5L194.2 367.9L193.8 370.2L195.7 371.8L196.3 374.3L193.8 378L195.1 386.1L197.1 386.7L197.3 391.7L199.8 390.8L201.1 397.4L205.3 397.6L208.4 399.8L208.1 401.3L210.6 402.3L212.4 402.5L212.4 405.2L214.8 407.6L218.5 407.7L224.5 409.4L226.2 407.6L230.6 407.7L236 410.2L239 412.9L243.6 411.8L245.5 416.5L248 416.9L250.1 420L253.1 419.4L254.1 421.1L258.4 422.8Z"},{"uf":"AC","d":"M154.9 344.6L150.8 342.7L150.7 342.7L146.6 342L136.5 337.3L131.1 334.8L121.8 330.4L115.8 325.1L109.4 319.4L104.3 314.9L96.5 308L90.9 303.1L80.8 301.9L68.2 300.4L61.8 299.6L49.4 298.1L44.5 297.5L35.4 296.4L28.5 293.8L10.1 286.9L8.7 286.4L11 290.6L7.1 292.5L5.1 292L6.2 294.4L4.8 296.7L8.3 300.2L11.1 301.4L10.9 303.7L9.5 303.4L10.3 305.9L12.5 307.9L14.5 314.4L19 317.4L18.8 320.2L23.5 324.1L25.1 327.2L26.4 327.5L27.6 330.8L24.1 336.2L21.7 338.6L32.5 338.6L36.9 340.4L40.8 340.8L42.7 343.4L42.3 346.2L44.9 347.4L44.3 352L61.9 352L65.6 351.2L68.5 348.1L70.2 347.9L73.1 344.4L74.6 343.9L79.6 339.1L81 338.9L79 343.1L80.6 345.5L78.5 348.2L78.5 353.8L78.5 361.6L78.5 368L78.5 374.7L80.5 373.2L82.8 375.6L85.5 376.3L88.6 375.7L93.6 372.9L97.9 374.1L104.7 373L108.9 373.3L116 375.2L119.5 375.1L120.3 378L124.1 377.2L127.5 375.6L130.7 373.7L135.9 366.7L138.9 366.5L142.4 367.9L145.5 363.6L151.1 360.6L151 359.2L154 359.7L157.8 357.2L160.1 354.5L166.1 349.7L162.1 347.9L154.9 344.6Z"},{"uf":"AM","d":"M352 291.7L351.3 288L347.9 283.6L345.7 281.8L344.7 278.9L345.9 275.1L349.4 272L358.3 252.1L369.5 227.1L378.2 208L379.1 205.8L381.4 200.6L382.3 198.5L390.3 180.7L388.9 180.1L390.6 176.6L394.7 174.5L397 170.9L394.1 171.6L390 174.3L387.6 173.5L386.3 174.3L384.2 175.1L382.4 174.3L382.7 170.6L380.3 170.7L376.6 168.5L375.4 165.4L371.5 163.4L369.4 164.3L364.3 160.8L362.4 161.1L361.6 159L356.1 156.6L355.3 155.1L356 151.5L354.5 149.8L351.8 152.9L349.6 150.6L348.3 151L345.9 148.3L345.7 145.2L340.7 141.2L339.1 138.8L339.4 134.9L336.2 132.8L336.3 126.7L335.6 125.1L335.6 118.9L327.6 118.9L323.8 118.9L310.6 118.9L306.4 127.7L302.8 137.4L304.6 141.2L300.5 142.6L299.6 144.6L296.7 145.1L294.7 144.2L293.5 140.6L290.9 137.3L284.6 136.3L284.3 137.7L279.4 139.8L277.7 142L276.7 147.1L277.6 149L275.7 154.5L275.9 156.6L277.7 157.4L279.1 160.8L276.2 157.8L272 156.3L271.1 156.7L269.8 156.6L267.2 150.8L264.8 148.5L261.9 147.1L258.9 143.5L256.4 142.1L256.9 140.4L259.7 140.8L261.3 139.3L260.6 137.3L263.4 132.2L262.1 131.6L262.2 128.8L260.5 127.1L260.4 125L258.6 123.2L257.6 120.2L257.8 116.3L256.2 114.8L255.7 109.6L257.4 107.3L257.8 103.1L257.2 100.2L256.1 100.3L253.5 92.2L251.4 90.2L249.9 88.8L251.6 86.3L252.1 81L249.2 79.1L245.1 79.1L242.6 75.8L239.6 76L237.5 74.7L236.9 76.1L233.3 76.5L227.4 80.2L224.2 79.7L222.3 81.1L222.3 86.8L216.5 92.3L214.9 93.2L215 90.2L211.6 92.7L210.7 94.5L206.9 96.9L205.6 95.9L202.8 96.9L201.3 99.6L198.4 99.4L198.1 103.3L194.5 103.7L192 109.2L189.9 110.2L188.8 108.5L190.8 105.8L188.9 102L185.5 102.2L181.5 104.7L180.6 106.5L176.5 108L175.2 107.2L172.9 108.2L172.8 107.8L161 97L156 98.4L156.3 92.1L155.8 85.6L154.4 82.9L151.8 82.3L149.4 73.9L146.4 75.6L144.3 78.9L140.8 78.8L137.3 83.3L134 81.7L132.9 79.8L130.6 81.1L130.1 83.4L132.5 85.6L105.5 85.6L102.3 84.5L99.7 85.9L95.5 86.1L95.5 100.4L98.6 99.5L98.6 100.5L107 100.2L108.6 101.1L111 104.8L109.9 107.9L111.5 110.3L106.4 111L103.5 108.2L100.3 110.6L99 109.8L96 111.5L91.1 112.1L91.1 123.3L90.8 129.1L93.8 132.4L95.5 132.8L100.6 136.6L101.7 139.4L100.3 141.9L102.5 145.8L104.8 147.6L105.3 150.9L104.6 156.4L100.6 180.3L95.7 208.6L93.2 221.8L91.1 224.2L89.2 222.1L87.7 223.8L85.4 221.3L85.7 219.4L80.7 218.9L78.6 220.1L75.5 219.3L73.1 221.5L71.5 224.4L64.3 224.5L64.4 225.4L59.2 225.7L56.6 227.7L53.1 226.7L50.1 227.8L49.4 229.6L42.9 233.5L40.1 234.1L39.2 236.2L35.2 238.1L28.8 242.1L29.2 245.2L27.1 249.8L27.2 253.3L23 258L20.8 264.4L23.9 270.5L21.6 274.3L18.5 274.7L12.2 278.5L9.8 282.5L10.4 284.4L8.7 286.4L10.1 286.9L28.5 293.8L35.4 296.4L44.5 297.5L49.4 298.1L61.8 299.6L68.2 300.4L80.8 301.9L90.9 303.1L96.5 308L104.3 314.9L109.4 319.4L115.8 325.1L121.8 330.4L131.1 334.8L136.5 337.3L146.6 342L150.7 342.7L150.8 342.7L154.9 344.6L162.1 347.9L166.5 344.4L168.8 343.7L171.2 340.6L170.9 338.5L176 339.1L180.5 338.7L183.7 341.3L185.7 342.1L186.9 339.5L188.9 338.7L192.3 339.7L192.1 336.4L193.1 337L195.8 335.3L197.1 335.6L198.6 339.4L200.6 338.4L203.5 334.3L203.1 332.1L206 329L210.3 329.7L211 329L216.6 327.7L216.9 329.2L220.6 328L220.5 323.4L222.9 322.3L225.4 319.3L224.3 317.4L224.9 314.1L226.5 313.1L228.3 314.1L229.2 311.3L232 307.2L232 306L248.5 306L252.4 308.7L253.2 311.8L255.2 313L256.2 315.3L257.3 314.3L259.6 315.6L259.5 317.8L261.2 321.1L261.6 319.6L263.4 320L264.8 324.8L266.9 324.7L267.8 326.4L269.7 326.2L271.1 323.2L273.8 322.2L276.7 324.7L302.2 324.7L330.5 324.8L345.6 324.7L348.1 322.7L345.7 322.5L346.7 320.1L346.1 317.7L348.4 313.9L349 308.6L347 302.7L348.8 301.4L350.8 298L350.6 294.3L352.3 291.9L352 291.7Z"},{"uf":"RR","d":"M219.6 45.7L221.1 49.1L218.9 54.7L220.5 56.2L223.4 61L224 64.7L222.3 68L224.6 68.7L227.1 68.2L228.9 69.4L232.4 69.1L235.4 70.4L236.5 69.2L237.8 70.8L237.5 74.7L239.6 76L242.6 75.8L245.1 79.1L249.2 79.1L252.1 81L251.6 86.3L249.9 88.8L251.4 90.2L253.5 92.2L256.1 100.3L257.2 100.2L257.8 103.1L257.4 107.3L255.7 109.6L256.2 114.8L257.8 116.3L257.6 120.2L258.6 123.2L260.4 125L260.5 127.1L262.2 128.8L262.1 131.6L263.4 132.2L260.6 137.3L261.3 139.3L259.7 140.8L256.9 140.4L256.4 142.1L258.9 143.5L261.9 147.1L264.8 148.5L267.2 150.8L269.8 156.6L271.1 156.7L272 156.3L276.2 157.8L279.1 160.8L277.7 157.4L275.9 156.6L275.7 154.5L277.6 149L276.7 147.1L277.7 142L279.4 139.8L284.3 137.7L284.6 136.3L290.9 137.3L293.5 140.6L294.7 144.2L296.7 145.1L299.6 144.6L300.5 142.6L304.6 141.2L302.8 137.4L306.4 127.7L310.6 118.9L323.8 118.9L327.6 118.9L335.6 118.9L335.6 97L335 95L332.3 94.9L327.8 93.4L326.1 90.5L324.3 89.7L321.6 85.9L318.2 85L318.8 82.6L317 82.8L317.2 79.5L317.1 72.8L314.8 72.2L311.7 64L311.7 58.4L313.4 52L315.6 48.7L315.7 45.2L314.2 44L318.8 40.5L321.8 35.8L317.8 30.4L317.3 27.6L318.5 26.2L317.2 24.4L312 22.5L307.9 22.3L310.8 18L312 9.7L309.3 8.2L308.4 5.7L306.7 5.2L304.2 6.7L298.7 6.9L296.1 6.2L298.6 12.4L297.1 14L294.9 16.9L290.6 19.2L289.5 22.4L286.2 23.1L283.6 21.8L281.8 24.6L279.6 24.1L278.3 26.8L277.2 28.4L273.3 28.2L271.5 30.3L267.7 30.1L264.4 32.4L259 30L255.4 31.6L255.9 33L251.4 33.2L250.2 36.5L251.6 38.5L251.1 41.5L249.8 40.1L245.9 42.9L243.8 41L244.3 39.7L241.1 38.3L241.1 35.2L235.7 35.1L236.6 36.1L234.4 37.5L230.8 33.6L230 36.2L229 35.4L225.3 35.7L224.4 37.1L221.3 32.1L219.9 31.1L214.2 31L211.4 31.8L206.6 27.6L205.9 30.1L213.2 39L217.3 40.9L219.4 43.6L219.6 45.7Z"},{"uf":"PA","d":"M570.3 236.4L573.3 234L574 233.4L578.6 229.7L581.6 229.6L583 228.5L586.8 222.3L588.3 221.3L588.9 218.2L594.5 212.6L595.8 206.8L595.7 205.8L597.6 203.9L597.7 201.6L600.6 199.9L601.6 197L603.6 195.2L603.5 190.6L605.5 189.5L603.7 187L605.1 184.8L607.3 184.3L608.9 181L608.8 179.7L609.3 176.5L612.2 173.8L612.6 171.4L613.5 168.4L613.8 166.5L611.6 165.9L611.5 164.4L613.8 164.1L614.9 161.8L614.6 158.4L616.1 155.3L614.9 154L616.1 152.2L617 150L616.3 148.1L614.2 149.4L613.9 145L611 148.1L608.1 148.2L607.5 144.7L606.8 146.5L604.5 146.9L604.6 143.1L601 144.7L600.1 141.9L597.8 144.4L596.7 141.1L595.1 142.9L594.5 140.2L593 142.2L592.7 140.2L590.7 139.6L588 138.6L587.1 139.8L586.1 138.3L585.9 141.7L583.6 138L583.2 140.7L582.6 140.9L582.6 138.6L579.9 138.7L576.4 137.8L575.1 140.5L573.4 139.9L571.5 142L570.8 143.4L568.1 145.8L565.6 145.5L564.2 144.7L563.5 142L564.9 134.3L566.3 131.8L565.2 130.1L558.3 130.6L554.4 130.1L549 127.9L544.2 129.2L543 127.8L544.8 125.5L543.9 123.5L538.8 123.2L537.3 121.5L538.7 119.4L541.9 117.3L540.1 115.4L533.1 117.6L527 117.2L526.9 115.9L529.9 112.8L529.1 110.5L525.7 109.1L521.7 110.7L517.6 119.2L516.6 120.2L514.4 121.9L509.3 123.9L506.2 127.1L504.2 127.6L501.1 131.7L499.3 135.6L495.7 139.7L493.8 143L493.4 149L491.7 150.8L489.3 151.4L487.6 150.5L484.4 152.5L484.2 150.9L479.5 150.2L477.6 148.8L476.9 143.8L475.6 144.4L475.9 141.1L475.1 137.9L472.8 138.2L471.6 136.2L471.8 132L466.4 128.1L465.3 124.1L462.8 120.5L461.1 116.2L461.7 111.3L462.6 109.5L455.9 103.8L454.8 99.2L455.4 96.9L453.4 97.4L453.2 94.9L445.4 92.9L445.3 91.9L441 91L440.3 88.4L434.7 84.8L432.1 85.2L429.8 84.4L426.6 84.6L426.4 80.1L425.2 78.6L426.2 74.9L423.9 69.6L422.1 66.2L418.8 67.5L417.3 66.8L414 67.8L412.6 70L410.1 69.4L405.5 70.3L405.3 70.3L400.6 67.4L398 71.9L396.1 73.4L398.2 74.3L399.8 77.5L401.2 82L399.1 83.3L395.8 82L393.8 82.2L389.5 80.6L386.4 81.6L383.3 81.2L381.8 82.8L379 81.1L377.2 81.6L375.3 78.9L371.6 80.7L370.5 79.5L367.7 81.6L367.3 83.9L364.5 86.5L359.8 85.7L359.7 86.6L355.5 87.2L355.2 90.8L352.4 90.9L351.7 89.5L348.3 89.3L347.1 91.3L344.1 91.7L345.2 93.8L344.4 96.1L339.7 95.6L339.4 97.2L337.2 98.3L335.6 97L335.6 118.9L335.6 125.1L336.3 126.7L336.2 132.8L339.4 134.9L339.1 138.8L340.7 141.2L345.7 145.2L345.9 148.3L348.3 151L349.6 150.6L351.8 152.9L354.5 149.8L356 151.5L355.3 155.1L356.1 156.6L361.6 159L362.4 161.1L364.3 160.8L369.4 164.3L371.5 163.4L375.4 165.4L376.6 168.5L380.3 170.7L382.7 170.6L382.4 174.3L384.2 175.1L386.3 174.3L387.6 173.5L390 174.3L394.1 171.6L397 170.9L394.7 174.5L390.6 176.6L388.9 180.1L390.3 180.7L382.3 198.5L381.4 200.6L379.1 205.8L378.2 208L369.5 227.1L358.3 252.1L349.4 272L345.9 275.1L344.7 278.9L345.7 281.8L347.9 283.6L351.3 288L352 291.7L352.3 291.9L353.9 292.8L357.5 299.3L358.9 305.7L363.1 311.6L362.1 315.8L363.3 318.5L364.2 323.7L368 324.6L368.1 326.1L372.7 327.5L376.3 331.5L375.9 333.4L377.3 334.6L381.1 334.9L382.6 338.5L384.4 337.6L393.2 338.4L395.7 338.6L402 339.1L421.1 340.8L429.5 341.4L440.6 342.3L452 343.2L462 343.9L473.3 344.8L481.2 345.3L502.1 346.8L512.1 347.5L525.8 348.4L528.7 341.4L529.9 335.9L531.4 334.5L533.7 331.1L534 330.7L537.6 326L539.6 325.6L542.1 321.9L543.9 318.9L545 316.1L546.4 315.2L547.8 311.2L548.8 306.8L549 303.3L549.1 301.8L545.1 298.8L544.7 297.8L544.3 295.1L546.8 292.1L548.5 288.3L548.4 286.8L548.4 284.8L548 282.2L550.8 280.3L551.8 279.5L555.9 278.2L559.9 276.2L560.7 272.3L560.8 272L563.6 269.1L566.3 269L565 265.7L566 264.5L568.2 263.4L567.2 261.2L569.5 260L568.2 257.4L568.5 254.9L570.8 254.5L571.5 252.1L567.4 249.7L566.4 247.6L564.9 247.7L561.5 248L558 246.4L564.7 241L569.9 236.7L570.3 236.4Z"},{"uf":"AP","d":"M515.7 76.2L513.3 68.2L512.6 67.8L511.2 62.5L509.8 60.5L508.1 51.9L506.4 46.5L507 44.1L507 36.7L505.5 36L504 30.7L502.6 28.4L498.1 24.1L494.8 22.5L493.9 26.5L495.1 28.9L494.4 32.8L491.6 34.9L491.3 36.6L487.4 40.8L487.1 42.5L481.7 51.3L479.1 53.9L479.7 54.9L476.4 61.7L474.7 67.7L472.4 71L468.4 72.9L467 75.2L463.1 74.7L458.8 75.3L459.9 73.5L457.8 71.6L454.5 73.7L448.5 72.4L448.1 70.9L444.2 74L438.8 75.4L433.4 74.7L429.8 71.8L427.8 71.3L426.7 68.8L423.9 69.6L426.2 74.9L425.2 78.6L426.4 80.1L426.6 84.6L429.8 84.4L432.1 85.2L434.7 84.8L440.3 88.4L441 91L445.3 91.9L445.4 92.9L453.2 94.9L453.4 97.4L455.4 96.9L454.8 99.2L455.9 103.8L462.6 109.5L461.7 111.3L461.1 116.2L462.8 120.5L465.3 124.1L466.4 128.1L471.8 132L471.6 136.2L472.8 138.2L475.1 137.9L475.9 141.1L475.6 144.4L476.9 143.8L477.6 148.8L479.5 150.2L484.2 150.9L484.4 152.5L487.6 150.5L489.3 151.4L491.7 150.8L493.4 149L493.8 143L495.7 139.7L499.3 135.6L501.1 131.7L504.2 127.6L506.2 127.1L509.3 123.9L514.4 121.9L516.6 120.2L517.6 119.2L521.7 110.7L525.7 109.1L531 105L530.9 103.6L533.1 101.9L532.9 96.7L533.3 90.8L532.4 86.6L527.2 83.8L521.4 83.9L515.7 76.2ZM519.5 75.3L519.6 77.2L521.4 76.8L519.5 75.3ZM520.8 77L519.3 79.4L520.7 82L523.7 80.7L522.8 78.2L520.8 77Z"},{"uf":"TO","d":"M587.1 270.7L588.1 266.8L587.1 262.7L586.9 261.4L586.9 257.9L586.8 257.3L586 252.9L586 252.6L584.2 249L581.6 247.9L578.3 247.2L577.5 245.4L575.9 243.9L574.2 243.8L573 244.6L570.5 244.3L569.6 243.8L566.6 242.3L563.9 242.8L562.3 243.7L561.3 246.1L558 246.4L561.5 248L564.9 247.7L566.4 247.6L567.4 249.7L571.5 252.1L570.8 254.5L568.5 254.9L568.2 257.4L569.5 260L567.2 261.2L568.2 263.4L566 264.5L565 265.7L566.3 269L563.6 269.1L560.8 272L560.7 272.3L559.9 276.2L555.9 278.2L551.8 279.5L550.8 280.3L548 282.2L548.4 284.8L548.4 286.8L548.5 288.3L546.8 292.1L544.3 295.1L544.7 297.8L545.1 298.8L549.1 301.8L549 303.3L548.8 306.8L547.8 311.2L546.4 315.2L545 316.1L543.9 318.9L542.1 321.9L539.6 325.6L537.6 326L534 330.7L533.7 331.1L531.4 334.5L529.9 335.9L528.7 341.4L525.8 348.4L524.1 352.8L522 355.5L521.5 360L520.3 361.2L518.8 365.8L517.5 367L517.5 367L518.2 369.1L516.8 373.1L517.3 376.2L515.4 381.8L514.5 387.1L516 387.9L515 391.2L516.7 394.8L515.7 397.2L515.8 402.3L516.6 402.5L517 407.7L515.7 412.1L517 416L519.5 417L521.2 412.2L524 408.6L527.6 406.4L526 408.4L526.5 410.2L525.3 411L523.9 415.4L526.6 417.7L532.7 419.5L544.6 426.3L544.8 423.7L547.4 417.5L550.1 415.3L553.2 419.2L555.3 416L555.5 415.6L560.4 420.4L561.9 422.9L561.8 427.2L563.2 423.3L564.5 426.5L571.4 423.6L570.8 426.9L572.9 425.5L575.3 427.3L579 427.6L581.6 430.7L582.8 428.5L581.9 425.1L584 422.8L587.9 426.1L599.7 421.6L602 419.4L604.5 419.4L608.5 419.5L608.6 418.7L609.3 416.1L610.4 419.9L615.9 418.3L611.2 419.1L612.2 414.8L611.9 410.5L614.1 408.9L614.1 408.9L612.6 408.9L612.1 406L610.3 405.3L610.3 399.7L609.9 398.5L611.6 396.1L610.1 394.3L611 393.2L610.1 391.7L611.7 390.3L610.5 389L615.3 388.9L616.6 388.9L615.9 388.5L610.7 386.2L608.8 386.5L606.1 383.1L606.3 380.7L610.9 373.3L612.6 373.2L612.7 370.4L613.9 370.2L615.6 366.1L622.4 362.3L622.8 359.3L625 357.9L624.5 355.5L624 357.4L620.7 358L620.4 360.4L618.1 357.7L617.9 356.2L614.1 356.1L611.3 356.1L608.7 353.7L608 349.8L607.2 347.4L604.3 346.1L605.4 342.6L606.6 342L604.5 338.6L601.9 338.7L599.8 335.9L600.4 334.1L598.1 332.3L597.8 330.7L595 330.7L595.7 329.3L598.3 326L598.6 320L599.9 318.7L601.3 314.9L602.5 315.3L606.5 313.8L608.2 308.2L607.4 306L605.1 304.1L600.7 305.5L596.2 307.9L592.3 303L591.1 302.2L587.1 296.3L585.5 293.8L583.5 293.9L586 291.5L584.6 289.9L582.2 290.7L581.5 289.4L580.2 287.6L582 287.3L584.5 284.2L585.1 280.2L585.6 277L586.3 274.4L587.2 272.4L587.1 270.7Z"},{"uf":"MA","d":"M574 233.4L573.3 234L570.3 236.4L569.9 236.7L564.7 241L558 246.4L561.3 246.1L562.3 243.7L563.9 242.8L566.6 242.3L569.6 243.8L570.5 244.3L573 244.6L574.2 243.8L575.9 243.9L577.5 245.4L578.3 247.2L581.6 247.9L584.2 249L586 252.6L586 252.9L586.8 257.3L586.9 257.9L586.9 261.4L587.1 262.7L588.1 266.8L587.1 270.7L587.2 272.4L586.3 274.4L585.6 277L585.1 280.2L584.5 284.2L582 287.3L580.2 287.6L581.5 289.4L582.2 290.7L584.6 289.9L586 291.5L583.5 293.9L585.5 293.8L587.1 296.3L591.1 302.2L592.3 303L596.2 307.9L600.7 305.5L605.1 304.1L607.4 306L608.2 308.2L606.5 313.8L602.5 315.3L601.3 314.9L599.9 318.7L598.6 320L598.3 326L595.7 329.3L595 330.7L597.8 330.7L598.1 332.3L600.4 334.1L599.8 335.9L601.9 338.7L604.5 338.6L606.6 342L605.4 342.6L604.3 346.1L607.2 347.4L608 349.8L608.7 353.7L611.3 356.1L614.1 356.1L617.9 356.2L618.1 357.7L619.6 357.9L621.9 350.6L621.4 349.1L622.2 344.7L621.9 342.1L623 340.2L620.8 337.1L619.8 330.1L618.5 327.6L619.8 324.4L621.9 322.8L624.9 315.4L625.8 312.3L627.6 310.1L628.9 304L628.5 303.4L630.4 299.1L632.9 297.1L638.5 295.3L640.6 294.8L640.7 294.8L644.4 292.1L647.1 292.8L649.9 289.1L653.8 286.6L655.4 286.6L656.2 285.2L656.8 283.9L659.7 279.5L663.8 278.7L667.7 277.1L670.2 277.5L673.5 279.8L674.2 280.4L675.6 280.1L678.8 278.6L684.4 278.2L686.1 275.9L686.7 272.6L687.6 267.5L684.7 264.3L683.1 263.5L682.1 259.1L682.6 258.1L682.1 252.4L684.1 250.8L684.9 248.7L688.3 245.7L688.6 242.8L686.6 236.1L686.6 235.9L685.2 231.3L687.5 227L685.3 224.5L685 223.9L684.5 220.7L685.5 219.5L687.4 217.5L688.8 215.3L690.3 213.1L691.4 211L691.2 208.8L692.3 207.4L692.6 206.9L693.8 205.7L695.3 203.2L695.8 204L697.4 203.8L700.2 203.1L701.7 202.8L703.4 200.9L703.4 199.1L706.5 198.1L706.6 197.9L709 194.4L710.6 192.1L709.8 191.1L710 187.5L710.4 186.9L705.2 186.9L704.6 185.9L701.3 186L700.4 187.5L695.4 186.3L692.1 184.5L683.9 180.7L679 178.5L677.4 178L675.9 178.1L673.6 179.1L674.1 181.4L672.4 179.9L671.5 181.8L668.9 182L668 180.2L670.1 179.4L671.2 176.7L668.4 176.9L667.5 179.8L665.8 179.8L665.6 181.9L663.8 183.1L660.6 187.2L659 187.8L656.5 187.6L658.4 186.3L660.2 183.4L661.5 183L661.1 180.9L661.6 179.5L658.5 180.7L658.3 180.8L657.4 181.1L655.6 181.4L653.3 188.5L653 191.8L651.4 193.6L650.3 194L649.3 194L647.8 193.3L648 190.6L648 188.6L650.1 183.9L654.4 178L652.1 173.6L648.1 177L647.4 176.7L651.4 170.9L649.6 171L651.7 170.1L650.2 167.8L650.6 166.3L648.8 164.9L645.6 165.4L646.9 164.1L644.7 163.6L648.3 161.6L646.4 160.2L643.6 161.6L642.8 161.3L643.4 156.9L641.4 160.3L640.2 158.6L636.1 158.7L634.5 161.2L633.3 161.2L633.6 155.2L629.9 158.5L629.1 154.6L627 153.8L625.2 153.8L623.2 152L623 151.9L622.9 151.8L621.8 152.4L621.6 148.8L619.4 152.2L618.5 148.8L616.1 152.2L614.9 154L616.1 155.3L614.6 158.4L614.9 161.8L613.8 164.1L611.5 164.4L611.6 165.9L613.8 166.5L613.5 168.4L612.6 171.4L612.2 173.8L609.3 176.5L608.8 179.7L608.9 181L607.3 184.3L605.1 184.8L603.7 187L605.5 189.5L603.5 190.6L603.6 195.2L601.6 197L600.6 199.9L597.7 201.6L597.6 203.9L595.7 205.8L595.8 206.8L594.5 212.6L588.9 218.2L588.3 221.3L586.8 222.3L583 228.5L581.6 229.6L578.6 229.7L574 233.4ZM651.7 186.8L649.4 188.8L648.3 192.6L650 193.5L651.8 192.1L651.7 186.8ZM641.1 153.8L639.7 154.8L640.6 156.7L643.3 155.1L641.1 153.8Z"},{"uf":"PI","d":"M733.2 312.1L736.8 308.9L737.4 307.3L737.4 307.3L737.7 306.5L738.1 305.7L737.8 302.4L735.2 301.2L736.4 298.8L734.3 294.8L735.7 293.7L738 292.8L738.5 291.1L738.9 288.7L739.9 285.6L740.7 282.4L741.9 279.4L739.5 277.8L734.4 276.5L733.9 274.8L732.7 272.5L732.9 268.9L731.3 266.2L731.2 263.5L730.1 262.2L730.8 260.5L730 255.8L730.1 253L729.6 249.6L729.5 248.4L729.6 242.3L726.3 240.5L725.4 239L722.6 235.5L723 234.1L724.2 230.8L722.8 228.8L724.2 226.4L724.8 224.1L725.5 223.1L725.9 219.9L725.9 219.8L725 218.5L724.1 216.1L723.1 215L722.7 213.4L722.8 209.2L720.7 208.6L720 205.8L721.4 204.2L721 201.8L719 201L721 197.1L722.3 194.2L722.1 192.4L721 191.2L718.5 190.9L713.8 189.9L710.9 187.5L710 187.5L709.8 191.1L710.6 192.1L709 194.4L706.6 197.9L706.5 198.1L703.4 199.1L703.4 200.9L701.7 202.8L700.2 203.1L697.4 203.8L695.8 204L695.3 203.2L693.8 205.7L692.6 206.9L692.3 207.4L691.2 208.8L691.4 211L690.3 213.1L688.8 215.3L687.4 217.5L685.5 219.5L684.5 220.7L685 223.9L685.3 224.5L687.5 227L685.2 231.3L686.6 235.9L686.6 236.1L688.6 242.8L688.3 245.7L684.9 248.7L684.1 250.8L682.1 252.4L682.6 258.1L682.1 259.1L683.1 263.5L684.7 264.3L687.6 267.5L686.7 272.6L686.1 275.9L684.4 278.2L678.8 278.6L675.6 280.1L674.2 280.4L673.5 279.8L670.2 277.5L667.7 277.1L663.8 278.7L659.7 279.5L656.8 283.9L656.2 285.2L655.4 286.6L653.8 286.6L649.9 289.1L647.1 292.8L644.4 292.1L640.7 294.8L640.6 294.8L638.5 295.3L632.9 297.1L630.4 299.1L628.5 303.4L628.9 304L627.6 310.1L625.8 312.3L624.9 315.4L621.9 322.8L619.8 324.4L618.5 327.6L619.8 330.1L620.8 337.1L623 340.2L621.9 342.1L622.2 344.7L621.4 349.1L621.9 350.6L619.6 357.9L618.1 357.7L620.4 360.4L620.7 358L624 357.4L624.5 355.5L627.1 354.4L628.1 356.9L629.6 358.8L631.7 362.1L630.5 363.6L631.3 366.6L635 370.7L638.6 371.1L641.6 372.9L643.3 372.1L647.7 369.2L647.6 367.6L649.6 366.2L651.3 366.7L654.7 364.5L658.7 366.6L660.5 365.4L662.5 361.5L664.1 360.9L665.9 358.8L667.6 353.7L669 353.3L668.7 350.2L669.9 348.4L667 346.6L665.6 341.7L667 339.7L667.1 339.6L670.9 337.3L672.3 336.3L674.6 335.3L678 338.8L679.4 338.4L682.6 338.4L682.9 338.3L685.1 339L685.3 340.9L689.3 343.3L691 341.7L692.9 341L695.3 340.5L699.2 336.5L701.2 335.7L704.6 335.1L708 335.6L709.3 334.7L712 331.3L712.2 329.6L716.1 328L719 324.2L719.7 322.6L720.2 322.6L723.5 321L724.8 318.7L728.5 315.6L729.7 316.7L731.1 315L732.9 313.3L733.2 312.1Z"},{"uf":"CE","d":"M741.8 188.8L740 188.6L737.1 189.5L733.3 189.6L725.8 190.8L722.1 190.5L721 191.2L722.1 192.4L722.3 194.2L721 197.1L719 201L721 201.8L721.4 204.2L720 205.8L720.7 208.6L722.8 209.2L722.7 213.4L723.1 215L724.1 216.1L725 218.5L725.9 219.8L725.9 219.9L725.5 223.1L724.8 224.1L724.2 226.4L722.8 228.8L724.2 230.8L723 234.1L722.6 235.5L725.4 239L726.3 240.5L729.6 242.3L729.5 248.4L729.6 249.6L730.1 253L730 255.8L730.8 260.5L730.1 262.2L731.2 263.5L731.3 266.2L732.9 268.9L732.7 272.5L733.9 274.8L734.4 276.5L739.5 277.8L741.9 279.4L740.7 282.4L739.9 285.6L738.9 288.7L738.5 291.1L740.5 292.2L742.4 291.3L744.7 291.1L746.6 292.3L752.1 291.5L752.4 291.6L755.7 291.3L758.8 293.6L760 294.8L761.8 294.6L762.1 296.9L763.3 297.7L763.8 297.9L766.1 299L768.7 300.2L769.7 301.4L769.9 303.3L771.5 302.3L772.7 303.1L772.8 303L774.2 300.9L778.1 298.1L778.2 298L778.9 297L781.8 291.5L781.7 289.6L780.3 288.9L779.7 288L779.2 284.9L779.1 284.9L777.1 283.7L777.1 281.8L779.1 280.4L780.4 278.9L779.6 278.3L779.1 277.2L779.6 275.4L780.5 273.2L780.5 273.2L782.1 270.7L781.5 269.2L781.4 267.8L782.5 266.2L783.6 263.9L785 262.5L786.4 262.9L787.8 262.6L788.3 261.4L790.3 259.8L790.4 259.4L792.6 255.6L792 253.7L793.2 252.6L796 249.8L798 245.6L798.5 245.2L798.6 243.9L798.5 243.4L800.9 239.6L801.7 236.8L805.5 235.9L806 235.7L808 235.2L810.2 234.6L808.6 231.6L803.9 230.4L802.6 229.8L798.9 225.4L797.3 224.4L790.6 218.1L789 215.9L785 211.7L783.7 209.1L781 208.8L779.6 208.5L776.2 205.5L773.4 203.6L770.5 202.3L768.3 200.4L766.3 198L763.6 197.2L759.9 194.8L756.1 193L751.3 190L745.9 188.7L741.8 188.8Z"},{"uf":"RN","d":"M826.7 269.9L830.2 268L831.2 267.8L831.6 268.4L831.2 269.6L832.8 271L833.9 270.9L835.6 270.7L835.6 270.7L838.5 272.2L840.6 272.2L842.5 272.1L842.7 272.1L845.1 271.3L845.7 271.5L846.9 272.1L850 272.2L850.7 272.3L851.7 272.8L852.2 273.4L854.7 273L855.4 273.6L856.5 273.7L857.2 272.6L860.3 272.2L858.9 268.2L858.9 267.7L857.6 265.3L857.5 264.3L857 260.7L856.3 258.8L855.2 255.3L854.7 252.3L854 250.2L852.5 247.1L851.3 244.6L848.9 242L846.1 241L842.3 240.2L839.7 239.8L836.9 239.6L835.5 240.2L831 240.8L828.8 240.3L822 240.3L819 237.8L816.7 236.6L812.8 237.3L810.9 235.7L810.2 234.6L808 235.2L806 235.7L805.5 235.9L801.7 236.8L800.9 239.6L798.5 243.4L798.6 243.9L798.5 245.2L798 245.6L796 249.8L793.2 252.6L792 253.7L792.6 255.6L790.4 259.4L790.3 259.8L788.3 261.4L787.8 262.6L786.4 262.9L785 262.5L783.6 263.9L782.5 266.2L781.4 267.8L781.5 269.2L783.8 268.7L784 270.3L786.3 271.5L787.5 272.6L788.8 272.1L791.2 273L792.3 271.7L793.3 271.9L795.6 270.5L797.3 268.7L798.8 266.7L800.2 265.2L802.3 265.2L804.3 264.6L807.5 263.1L810.2 261.8L812 262.2L812.3 264.6L810.7 266L808.5 268.2L807.3 270L807.4 271.1L805.6 273.2L805.2 277.3L808.9 276.8L810 277.8L810.6 279.9L812.5 279.3L814.1 278.3L815 277.8L815.7 277.3L816.7 278.9L817.8 278.3L819.4 277.8L821.7 280.1L821.1 281.9L823.4 282.2L825.3 281L825.4 280.2L825.8 280.3L826 277.8L826.3 275L828.1 275.4L827.2 273L826.1 272L826.7 269.9Z"},{"uf":"PB","d":"M803.3 295L804.3 293.8L806.3 292L807.3 292L808.9 290.4L810.1 290.1L811.9 290.9L814.6 292.5L815.5 293L816.1 294.7L815.2 295.1L815.2 295.1L814.1 295.6L811.4 298.3L812.3 299.7L812.5 300.1L812.5 301.6L812 302L808.1 305.4L812.5 307.1L812.6 309.4L812.3 310.4L815.3 313.1L816.8 313.4L817.8 312.3L820.4 310.9L822.7 310.1L823.9 309.1L825.2 305.1L826 304.3L827.9 304.7L829 302.3L831.9 302.7L833 301.2L834.9 301.7L837.2 302.3L837.6 302.3L839 301.8L840.3 301.3L841.6 300.9L842.3 300.7L844.7 299.8L846.1 298.9L848.1 298.5L848.6 295.5L848.8 294.8L850.1 294.6L851.7 293.9L852.1 293.4L852.3 293.3L853.5 292.7L856.3 292.8L860 294.4L860 295.2L862.9 296.1L863.3 296.3L864 292.7L863.9 289.4L863.1 285.1L862.7 284.5L862.5 283.4L861.9 280.8L861.3 278.6L861.2 277.5L860.4 274.8L860.3 272.2L857.2 272.6L856.5 273.7L855.4 273.6L854.7 273L852.2 273.4L851.7 272.8L850.7 272.3L850 272.2L846.9 272.1L845.7 271.5L845.1 271.3L842.7 272.1L842.5 272.1L840.6 272.2L838.5 272.2L835.6 270.7L835.6 270.7L833.9 270.9L832.8 271L831.2 269.6L831.6 268.4L831.2 267.8L830.2 268L826.7 269.9L826.1 272L827.2 273L828.1 275.4L826.3 275L826 277.8L825.8 280.3L825.4 280.2L825.3 281L823.4 282.2L821.1 281.9L821.7 280.1L819.4 277.8L817.8 278.3L816.7 278.9L815.7 277.3L815 277.8L814.1 278.3L812.5 279.3L810.6 279.9L810 277.8L808.9 276.8L805.2 277.3L805.6 273.2L807.4 271.1L807.3 270L808.5 268.2L810.7 266L812.3 264.6L812 262.2L810.2 261.8L807.5 263.1L804.3 264.6L802.3 265.2L800.2 265.2L798.8 266.7L797.3 268.7L795.6 270.5L793.3 271.9L792.3 271.7L791.2 273L788.8 272.1L787.5 272.6L786.3 271.5L784 270.3L783.8 268.7L781.5 269.2L782.1 270.7L780.5 273.2L780.5 273.2L779.6 275.4L779.1 277.2L779.6 278.3L780.4 278.9L779.1 280.4L777.1 281.8L777.1 283.7L779.1 284.9L779.2 284.9L779.7 288L780.3 288.9L781.7 289.6L781.8 291.5L778.9 297L778.2 298L780.8 301L783.8 300.2L784.3 300.2L786.1 299.3L787 300.6L789 302.5L791 301.9L791.2 302.5L792.3 301.4L793.8 301.6L794.8 301.3L796 299.7L799 298.8L799.3 298.1L799.4 297.7L799.7 297.4L802.2 295.8L803.3 295Z"},{"uf":"PE","d":"M720.2 322.6L722 323.3L725.6 322.6L725.8 324.3L729 325.7L731.3 328.2L732 331.1L735.3 333.5L733.2 339.4L734.3 339.5L736.3 340.2L740.8 337.3L742.2 337.8L744 331.1L745.4 330.7L747.2 331.8L749.9 330.6L750.5 330.5L752.8 327.8L752.3 325.4L757.2 324.4L757.8 321.6L761.5 320L764.1 319L766 319.8L766.9 322.7L770.5 323.2L773 324.8L775.1 324.4L778.4 326.2L778.6 327.4L780.5 328.3L781.4 325.4L783.6 326.2L782.6 328.4L785 330.1L786.8 329.1L787 332.6L788.6 336.8L790.4 335L791.8 333.2L793.6 332.8L794.9 331.5L797.7 327.8L799.2 325.8L800.5 327.8L801.8 329.4L804.3 328.4L804.4 328.6L807.1 329.9L809.7 332.7L810.8 334.4L811.4 334.2L812.1 335.3L814.5 336.5L814.6 336.3L816.2 337.4L817.2 337.8L818.4 335.6L820.2 335.6L822.4 335.9L824 336.8L826.7 335.2L828.9 334.4L829.9 334.2L831.3 333.2L833.4 330.3L835.1 329.9L835.3 329.7L834.9 328.3L837 327.2L838 327.1L838.8 326.8L841.1 326.4L841.5 326.3L843.8 327.2L845.4 326.6L846.9 325.8L847.1 325.7L847.8 325.2L850.7 325.6L852 326.1L854.5 326.6L856.3 327.3L856.8 326.2L857.4 324.4L857.7 322.3L858.6 320.4L860.5 314.9L861.2 311.7L861.6 310.1L862.7 307.6L863.4 305.6L863.1 303.1L863 302.4L863 299.5L863.3 296.3L862.9 296.1L860 295.2L860 294.4L856.3 292.8L853.5 292.7L852.3 293.3L852.1 293.4L851.7 293.9L850.1 294.6L848.8 294.8L848.6 295.5L848.1 298.5L846.1 298.9L844.7 299.8L842.3 300.7L841.6 300.9L840.3 301.3L839 301.8L837.6 302.3L837.2 302.3L834.9 301.7L833 301.2L831.9 302.7L829 302.3L827.9 304.7L826 304.3L825.2 305.1L823.9 309.1L822.7 310.1L820.4 310.9L817.8 312.3L816.8 313.4L815.3 313.1L812.3 310.4L812.6 309.4L812.5 307.1L808.1 305.4L812 302L812.5 301.6L812.5 300.1L812.3 299.7L811.4 298.3L814.1 295.6L815.2 295.1L815.2 295.1L816.1 294.7L815.5 293L814.6 292.5L811.9 290.9L810.1 290.1L808.9 290.4L807.3 292L806.3 292L804.3 293.8L803.3 295L802.2 295.8L799.7 297.4L799.4 297.7L799.3 298.1L799 298.8L796 299.7L794.8 301.3L793.8 301.6L792.3 301.4L791.2 302.5L791 301.9L789 302.5L787 300.6L786.1 299.3L784.3 300.2L783.8 300.2L780.8 301L778.2 298L778.1 298.1L774.2 300.9L772.8 303L772.7 303.1L771.5 302.3L769.9 303.3L769.7 301.4L768.7 300.2L766.1 299L763.8 297.9L763.3 297.7L762.1 296.9L761.8 294.6L760 294.8L758.8 293.6L755.7 291.3L752.4 291.6L752.1 291.5L746.6 292.3L744.7 291.1L742.4 291.3L740.5 292.2L738.5 291.1L738 292.8L735.7 293.7L734.3 294.8L736.4 298.8L735.2 301.2L737.8 302.4L738.1 305.7L737.7 306.5L737.4 307.3L737.4 307.3L736.8 308.9L733.2 312.1L732.9 313.3L731.1 315L729.7 316.7L728.5 315.6L724.8 318.7L723.5 321L720.2 322.6Z"},{"uf":"AL","d":"M793.6 332.8L791.8 333.2L790.4 335L788.6 336.8L789.1 337.3L789.4 338.7L792.2 339.3L793.8 341L796.2 341.5L797.3 342.4L801.2 344.4L801.3 344.7L805.6 346.3L809.3 348.1L810.8 349.7L812.9 350L816.8 352.5L816.9 353.6L816.9 353.7L817.6 354.8L818.4 355.3L819.1 356L819.2 356.3L821.9 358L822.3 358.1L822.7 358.1L823.9 357.7L824.8 358.8L825.4 361.4L827 361.6L827 361.6L829 363.3L831.1 359.8L832 358L837 353.1L838.5 350.6L839.8 348.7L840.9 347.2L842.3 345.4L843.8 344.8L847.4 340.3L848.1 339.3L849.3 337.4L851.2 335.8L852.2 334.5L853.2 332.8L854.4 330.7L856.3 327.3L854.5 326.6L852 326.1L850.7 325.6L847.8 325.2L847.1 325.7L846.9 325.8L845.4 326.6L843.8 327.2L841.5 326.3L841.1 326.4L838.8 326.8L838 327.1L837 327.2L834.9 328.3L835.3 329.7L835.1 329.9L833.4 330.3L831.3 333.2L829.9 334.2L828.9 334.4L826.7 335.2L824 336.8L822.4 335.9L820.2 335.6L818.4 335.6L817.2 337.8L816.2 337.4L814.6 336.3L814.5 336.5L812.1 335.3L811.4 334.2L810.8 334.4L809.7 332.7L807.1 329.9L804.4 328.6L804.3 328.4L801.8 329.4L800.5 327.8L799.2 325.8L797.7 327.8L794.9 331.5L793.6 332.8Z"},{"uf":"SE","d":"M817.6 354.8L816.9 353.7L816.9 353.6L816.8 352.5L812.9 350L810.8 349.7L809.3 348.1L805.6 346.3L801.3 344.7L801.2 344.4L797.3 342.4L796.2 341.5L793.8 341L792.5 342.6L793.8 349.8L796 350.1L798.4 352.7L798.2 354.5L798.8 355.3L799 356.4L798.9 358.6L799.5 359.7L797.2 362.1L797.9 363.7L798.1 365.6L798 367.6L794.5 369.2L792.9 367.9L790.7 368.3L789.4 368.1L788.6 370.2L789.2 373.1L789.9 373.4L791.5 375.3L792.8 378.8L794.3 379.2L794 382.5L794.3 382.6L797.5 385.6L798.2 386.5L801 387.6L801.9 386.5L803.1 387.2L807.7 385.1L808.3 384.7L810.1 381.3L812.4 378.4L815 373.7L819 368.9L823 366.3L827.1 364.2L829 363.3L827 361.6L827 361.6L825.4 361.4L824.8 358.8L823.9 357.7L822.7 358.1L822.3 358.1L821.9 358L819.2 356.3L819.1 356L818.4 355.3L817.6 354.8Z"},{"uf":"BA","d":"M764.1 319L761.5 320L757.8 321.6L757.2 324.4L752.3 325.4L752.8 327.8L750.5 330.5L749.9 330.6L747.2 331.8L745.4 330.7L744 331.1L742.2 337.8L740.8 337.3L736.3 340.2L734.3 339.5L733.2 339.4L735.3 333.5L732 331.1L731.3 328.2L729 325.7L725.8 324.3L725.6 322.6L722 323.3L720.2 322.6L719.7 322.6L719 324.2L716.1 328L712.2 329.6L712 331.3L709.3 334.7L708 335.6L704.6 335.1L701.2 335.7L699.2 336.5L695.3 340.5L692.9 341L691 341.7L689.3 343.3L685.3 340.9L685.1 339L682.9 338.3L682.6 338.4L679.4 338.4L678 338.8L674.6 335.3L672.3 336.3L670.9 337.3L667.1 339.6L667 339.7L665.6 341.7L667 346.6L669.9 348.4L668.7 350.2L669 353.3L667.6 353.7L665.9 358.8L664.1 360.9L662.5 361.5L660.5 365.4L658.7 366.6L654.7 364.5L651.3 366.7L649.6 366.2L647.6 367.6L647.7 369.2L643.3 372.1L641.6 372.9L638.6 371.1L635 370.7L631.3 366.6L630.5 363.6L631.7 362.1L629.6 358.8L628.1 356.9L627.1 354.4L624.5 355.5L625 357.9L622.8 359.3L622.4 362.3L615.6 366.1L613.9 370.2L612.7 370.4L612.6 373.2L610.9 373.3L606.3 380.7L606.1 383.1L608.8 386.5L610.7 386.2L615.9 388.5L616.6 388.9L615.3 388.9L610.5 389L611.7 390.3L610.1 391.7L611 393.2L610.1 394.3L611.6 396.1L609.9 398.5L610.3 399.7L610.3 405.3L612.1 406L612.6 408.9L614.1 408.9L614.1 408.9L611.9 410.5L612.2 414.8L611.2 419.1L615.9 418.3L611.9 421.6L611.2 425.9L612 427.3L616.2 426L616.9 426.8L613 430L613.8 430.7L613 433.3L614.9 433.8L613.3 436.2L612.6 441.6L613.8 443.1L613.4 443.9L614.4 446.4L617.1 448.1L620.5 450.9L618.4 453L618.7 457.7L618 458L617.9 458.2L617.6 462.7L617.6 462.7L619.2 464.8L616.7 471.5L619 469L624.1 468.3L626.8 465.9L633.6 461.8L635.8 459.7L638.3 459.9L639.5 458.3L643 456.4L644 454.2L646 453.4L650.1 450.5L653.3 449.2L655.8 448.6L661.3 449.3L662.9 449L667 450.5L666.3 451.6L664.9 455.6L664.8 457.6L668.6 459.1L672.6 461.3L672.6 461.3L673.5 460.8L677.4 458L680.4 457.6L685.6 458.9L687 460.2L692.6 464.2L694.8 465.1L695.6 465.9L700.1 468.1L700.3 468.4L702.3 467.5L705.1 469.4L707.2 469.5L710.3 467.8L710.5 467.8L711.4 468.7L718.1 474.8L720.1 476.7L720.1 476.8L720.6 480L720.8 482.4L724.9 483.1L732.1 480.2L733.2 481.7L734.6 480.7L735.9 482.1L738.6 483.6L740.1 482.8L740.7 483.8L744.8 483.8L747.2 486.1L749.9 488.3L751.9 488.2L753.1 490.8L751.8 494.7L749.6 496.1L747.6 498.4L746.5 501.4L744 501.3L743.1 503.7L743.3 504.1L743.8 508.7L741.2 508.5L741.1 508.6L740.5 508.4L739.2 508.4L737.3 514.3L738 517.4L736.7 519L738.6 521.1L739.4 522L740.9 524.8L742.5 524.9L744.7 527.6L745.1 527.6L745.4 531.3L745.1 533.2L745.2 533.2L751.9 537.7L757.3 541.3L758 538.9L761.2 533.6L766.3 529.8L768.9 526.5L767.7 521.1L767.3 514.6L769.4 508.5L768.8 505.5L769.7 504.1L770.6 498.1L771.7 496.1L771.7 493.8L773.1 490.3L775.2 484.8L774.3 482.9L773.4 480.6L772.5 474.3L772 467.5L771.3 460.6L770.6 459.8L771.2 454.5L771.5 452.3L772.2 447.8L773.5 440.7L773 439.9L772.6 439.4L772.5 439.2L772.2 436.4L772.6 435.4L774.3 434.7L773.4 432.5L774.3 430.6L773 429L773.7 425L776.4 423.2L779.8 420.5L781 420.4L783.6 420.5L787.2 418.1L787.7 417.4L793.2 411L796.2 406.7L798.9 402.8L800.8 399.7L804.5 391.5L808.3 384.7L807.7 385.1L803.1 387.2L801.9 386.5L801 387.6L798.2 386.5L797.5 385.6L794.3 382.6L794 382.5L794.3 379.2L792.8 378.8L791.5 375.3L789.9 373.4L789.2 373.1L788.6 370.2L789.4 368.1L790.7 368.3L792.9 367.9L794.5 369.2L798 367.6L798.1 365.6L797.9 363.7L797.2 362.1L799.5 359.7L798.9 358.6L799 356.4L798.8 355.3L798.2 354.5L798.4 352.7L796 350.1L793.8 349.8L792.5 342.6L793.8 341L792.2 339.3L789.4 338.7L789.1 337.3L788.6 336.8L787 332.6L786.8 329.1L785 330.1L782.6 328.4L783.6 326.2L781.4 325.4L780.5 328.3L778.6 327.4L778.4 326.2L775.1 324.4L773 324.8L770.5 323.2L766.9 322.7L766 319.8L764.1 319Z"},{"uf":"MG","d":"M581.6 541.7L579.6 543.2L577.6 543.7L577.5 543.9L575.6 545L574 543.6L569.6 541.5L568.6 541.1L567.1 542.1L560.2 541.4L557.3 541.7L554.4 540.6L553.5 541L551.5 542.8L548.1 543.1L547.2 545.5L546.2 546.5L544.4 548.1L542 545.7L540.6 545.9L536.8 547.5L536 547.5L535.2 548.3L530.1 547.3L529 548.9L524.8 549.2L523 550.9L520.3 554.6L519 558.6L516.5 559.4L514.6 560.6L514.5 561.2L512.5 563.4L511.5 566L512.6 567.1L510.2 567L510.3 569.8L507.9 572.1L508 574.3L508.8 581L511.3 578.9L512.2 578.3L515.6 577.2L517.2 575.9L518.4 574.8L520.7 574.2L523.3 576.1L526.9 576.2L528.4 576.2L529.7 577.2L532.8 577.6L536.2 577.4L539.2 577.3L542.7 578.6L547.1 578.4L545.9 581.7L546.8 584.3L546.9 585L548.6 586.2L550 585.2L551.2 582.6L552.9 583L553.4 588.2L555.1 589L555.5 588.1L555.1 585.3L556.5 582.7L558.6 582.5L560.4 582.9L562.8 582.1L564.7 581.9L569.8 582L570.1 580.1L572.9 582.4L575 579.9L576.8 581.9L577.4 580.8L577.8 578.8L579.8 578.8L582.5 580.1L584.4 578.9L585.8 578.4L589.3 581.7L591.4 584.1L591.4 584.2L590.4 585.7L590.1 588.6L591.6 590.2L593.3 591.4L593.5 591.8L593.4 591.9L594.3 594.6L592.4 595.7L591.5 598.5L591.5 598.5L592.5 600.7L593.2 602.6L593.9 605.3L593.9 606L595.5 607.9L596.6 609.9L596.2 611.4L599 611L601.3 610.2L601.7 610L604.2 610.4L604.9 611.6L607.3 612.9L607.2 614.6L606.3 616.6L604.9 617.1L604.6 619.2L603.3 620.8L604.9 624.4L604.2 624.7L602.6 626.4L605.3 627.6L604.3 628.6L603.7 628.5L603.5 629.4L602.6 631.5L603.9 632.8L604.9 634.5L606.4 635.2L608.4 636.3L609.1 638.1L609.8 639.5L608 640.5L611.1 641.9L610.2 643.1L610.9 645L614.2 644.1L617.3 644.9L619.4 643.8L621.3 644.3L623.5 643.5L624.7 642L622.7 641.2L625.1 639.3L624.3 638.5L625.5 637.5L625.7 639.3L627.7 638.2L627.6 639.3L629.8 637.9L631.1 638.6L631.6 639.3L634.4 638.4L636.7 636.5L637.6 635.8L638.1 635.6L641.1 635.3L643.8 634.2L644.5 633.7L644.5 633.7L644.7 633.4L647.7 633L647.8 633.1L650.4 632L652.3 630.3L654.4 630.3L656.6 630.6L658.1 630L658.3 629.7L662.8 627.8L667.4 625.9L668.7 626.2L669.6 626.4L671.2 625.8L674.6 625.9L676.6 624.6L677 624.7L679.2 625.1L681.3 625.2L681.3 625.3L681.1 626.9L684.2 625.2L686.2 624.3L691.6 621.6L692.9 621L696 619.6L696.1 619.6L697.9 618.8L700.3 618L698.4 615.2L698.6 615L700.6 612.8L700.1 611.5L701 609.6L701.2 609.5L701.7 606.8L701.9 605.4L702.3 604.8L703.5 603.5L704.4 602.5L704.3 602.3L702.8 601.2L706.7 600.3L707.7 598.2L707.7 597.1L708.9 596.5L709.4 594.8L710 590.1L710.5 589.9L710.5 588.7L709.7 588.4L709.2 587.5L710 586.1L711.1 585L711.5 583.8L713.5 583.8L719 583.8L719 583.8L721.5 577.7L722.1 577.8L724 576.6L724.2 573.8L724.4 571.6L728.7 567.8L728.8 566L729.6 562.1L729.5 561.4L728.9 559.1L726.7 557.7L726.6 555.1L725.1 553.9L722.7 553L723 551.8L724.9 551.8L727.5 552.7L729.9 552.2L729.4 549.3L727 548.1L727.5 545.6L727.6 544L724.1 543.6L724.9 542.9L724.6 540.7L726.9 537.4L733 536.1L730.2 533.3L732.5 532.7L735.5 533.9L738.4 531.2L741.9 531.9L745.1 533.2L745.4 531.3L745.1 527.6L744.7 527.6L742.5 524.9L740.9 524.8L739.4 522L738.6 521.1L736.7 519L738 517.4L737.3 514.3L739.2 508.4L740.5 508.4L741.1 508.6L741.2 508.5L743.8 508.7L743.3 504.1L743.1 503.7L744 501.3L746.5 501.4L747.6 498.4L749.6 496.1L751.8 494.7L753.1 490.8L751.9 488.2L749.9 488.3L747.2 486.1L744.8 483.8L740.7 483.8L740.1 482.8L738.6 483.6L735.9 482.1L734.6 480.7L733.2 481.7L732.1 480.2L724.9 483.1L720.8 482.4L720.6 480L720.1 476.8L720.1 476.7L718.1 474.8L711.4 468.7L710.5 467.8L710.3 467.8L707.2 469.5L705.1 469.4L702.3 467.5L700.3 468.4L700.1 468.1L695.6 465.9L694.8 465.1L692.6 464.2L687 460.2L685.6 458.9L680.4 457.6L677.4 458L673.5 460.8L672.6 461.3L672.6 461.3L668.6 459.1L664.8 457.6L664.9 455.6L666.3 451.6L667 450.5L662.9 449L661.3 449.3L655.8 448.6L653.3 449.2L650.1 450.5L646 453.4L644 454.2L643 456.4L639.5 458.3L638.3 459.9L635.8 459.7L633.6 461.8L626.8 465.9L624.1 468.3L619 469L616.7 471.5L619.2 464.8L617.6 462.7L617.6 462.7L614.5 464.4L611.4 463.3L611.4 461.3L607.4 458.8L606.1 461.3L607.4 466.7L606.9 466.8L604.7 467.6L599.6 465.8L598.1 466.8L597.9 470.2L599.3 472L599.8 474L598 475.6L597.7 478.3L599.1 479.4L600.7 485.3L597.5 486.3L593.5 486.6L589.7 489.1L589.7 489.4L589.4 493L586.5 498.8L587.4 501.3L590 502.5L591.5 504.6L591.9 508.1L593.7 510.5L592.5 512.4L588.8 514.7L585.8 518.9L585.3 518.4L585 520.3L584.7 521.3L586.3 523.1L589.6 523.3L590.7 524.8L588.4 529.8L590.3 534.6L587.5 536.9L587.1 537.4L583.2 539.2L583.1 540.8L581.6 541.7Z"},{"uf":"ES","d":"M722.1 577.8L721.5 577.7L719 583.8L719 583.8L713.5 583.8L711.5 583.8L711.1 585L710 586.1L709.2 587.5L709.7 588.4L710.5 588.7L710.5 589.9L710 590.1L709.4 594.8L708.9 596.5L709.5 596.7L711.1 597.2L711.8 598.9L712 600.5L712.3 604.2L713.9 605L715.8 605.7L717.8 606.4L722 607.2L725.1 606.9L728.9 608.6L729.7 606.1L732.3 601.7L733.4 598.7L734.6 598L737.5 596.5L741.7 591.2L744 586.3L745.3 584.6L745.8 580.3L746.6 579.4L748.8 574.9L751.9 572L754.1 571.1L756.8 563.3L756.2 558.6L755.6 549.7L756 545.4L757.3 541.3L751.9 537.7L745.2 533.2L745.1 533.2L741.9 531.9L738.4 531.2L735.5 533.9L732.5 532.7L730.2 533.3L733 536.1L726.9 537.4L724.6 540.7L724.9 542.9L724.1 543.6L727.6 544L727.5 545.6L727 548.1L729.4 549.3L729.9 552.2L727.5 552.7L724.9 551.8L723 551.8L722.7 553L725.1 553.9L726.6 555.1L726.7 557.7L728.9 559.1L729.5 561.4L729.6 562.1L728.8 566L728.7 567.8L724.4 571.6L724.2 573.8L724 576.6L722.1 577.8Z"},{"uf":"RJ","d":"M648.3 645.3L644.9 646.8L644.2 650.9L642.9 651.8L646.4 655.6L649.5 655.3L650.5 653.8L648 651.5L646.5 651.8L647.6 648.4L650.9 647.8L654.7 645.4L654.7 647.9L658.6 648L662.2 645.9L664.9 645.3L666.8 645.3L671.9 648.4L677.9 647.5L680.7 645.1L678.2 642.9L679.5 641L683.4 640.2L683.6 641L683.6 641.4L681.9 643.9L681.8 646.1L683.9 646.7L692.1 645.8L697.8 645.7L700 645.8L705.3 645.7L706.8 643.2L706.7 641.1L706.3 638.1L706.6 637.3L710.1 634L713 631.3L716.2 629.8L725.1 626.7L728 625L728.5 622.5L727 615.8L726.6 613.1L728.9 608.6L725.1 606.9L722 607.2L717.8 606.4L715.8 605.7L713.9 605L712.3 604.2L712 600.5L711.8 598.9L711.1 597.2L709.5 596.7L708.9 596.5L707.7 597.1L707.7 598.2L706.7 600.3L702.8 601.2L704.3 602.3L704.4 602.5L703.5 603.5L702.3 604.8L701.9 605.4L701.7 606.8L701.2 609.5L701 609.6L700.1 611.5L700.6 612.8L698.6 615L698.4 615.2L700.3 618L697.9 618.8L696.1 619.6L696 619.6L692.9 621L691.6 621.6L686.2 624.3L684.2 625.2L681.1 626.9L681.3 625.3L681.3 625.2L679.2 625.1L677 624.7L676.6 624.6L674.6 625.9L671.2 625.8L669.6 626.4L668.7 626.2L667.4 625.9L662.8 627.8L658.3 629.7L658.1 630L656.6 630.6L654.4 630.3L652.3 630.3L650.4 632L647.8 633.1L647.7 633L644.7 633.4L644.5 633.7L644.5 633.7L647.2 636.3L648.1 638.2L652.1 638.5L654.4 638.4L654.8 637.9L657.3 638.2L658.6 639.8L655.3 643.7L651.4 643.7L648.5 645L648.3 645.3ZM654.6 652.1L659.2 651L657.2 649.3L654.1 651L654.6 652.1ZM666.8 648.6L662.9 648.2L663.3 649.2L666.8 648.7L669.6 648.4L669.6 648.2L666.8 648.6Z"},{"uf":"SP","d":"M603.3 620.8L604.6 619.2L604.9 617.1L606.3 616.6L607.2 614.6L607.3 612.9L604.9 611.6L604.2 610.4L601.7 610L601.3 610.2L599 611L596.2 611.4L596.6 609.9L595.5 607.9L593.9 606L593.9 605.3L593.2 602.6L592.5 600.7L591.5 598.5L591.5 598.5L592.4 595.7L594.3 594.6L593.4 591.9L593.5 591.8L593.3 591.4L591.6 590.2L590.1 588.6L590.4 585.7L591.4 584.2L591.4 584.1L589.3 581.7L585.8 578.4L584.4 578.9L582.5 580.1L579.8 578.8L577.8 578.8L577.4 580.8L576.8 581.9L575 579.9L572.9 582.4L570.1 580.1L569.8 582L564.7 581.9L562.8 582.1L560.4 582.9L558.6 582.5L556.5 582.7L555.1 585.3L555.5 588.1L555.1 589L553.4 588.2L552.9 583L551.2 582.6L550 585.2L548.6 586.2L546.9 585L546.8 584.3L545.9 581.7L547.1 578.4L542.7 578.6L539.2 577.3L536.2 577.4L532.8 577.6L529.7 577.2L528.4 576.2L526.9 576.2L523.3 576.1L520.7 574.2L518.4 574.8L517.2 575.9L515.6 577.2L512.2 578.3L511.3 578.9L508.8 581L508.7 581.3L506.4 585.4L501.2 587.2L499.6 589.6L496.3 593.1L496.2 593.2L494.8 596.2L495.1 600.5L491.8 602.9L489.5 606.3L489.9 609.4L487.7 613L484.6 614.7L485.6 617.2L483.3 619.3L479.8 623.9L478.2 627.1L476.8 628.7L472.5 631.4L466 635.2L463.3 637L462.6 638.6L464.1 638.5L464.7 638.1L466.6 637.3L469.7 638.2L470.1 638.3L473.9 637.3L475 638.5L477.1 638.3L477.6 638.4L480.5 638.8L482.8 639.4L483.5 637.4L483.9 636.5L486.1 636.7L486.2 636.7L489 638.2L489.3 638.4L490 638.8L493 639.7L494.9 639.4L495 639.4L497.4 640.2L499 639.3L501.5 639.6L502.2 639.8L504.1 640.9L504.9 641.3L508.7 642.5L509.2 642.3L510.4 642.6L512.6 644.2L513.2 646.1L516.7 645.1L518 645L519.1 645.7L522.8 645.3L523.2 646L526.2 646.1L527.8 645.8L529.5 645.1L531.3 646.2L531.3 646.3L534.3 648.7L534.7 649L534.9 649.2L536.9 650.6L538.9 653.6L538.6 655.1L539.5 657.6L538.9 659.1L539.4 662L540 662.6L540.4 665.2L539.3 666.3L540.9 668.3L541.2 668L541.9 670.5L545.3 673L544.9 674.9L547.1 677.1L547.1 679.1L547.1 679.8L547.1 680L545.7 682.5L545.8 685L548.1 685.8L549.2 685.2L549.8 685.4L554.6 685.2L556.8 685.2L561.4 685.1L562.8 686.4L562.1 690.7L561.4 692.7L562.4 694.5L565.5 692.2L567.5 693.5L569.3 692.4L572.5 699.6L576.4 696.2L576.5 693.8L580.4 689.9L587.4 685.3L594.8 680.1L598.7 675.7L602.9 673.2L605.2 671.9L609.8 669.9L610.6 669.3L611.7 669.8L614.4 669.7L615.5 666.7L621.9 664.4L628.2 665.3L629.1 666.3L631.7 665.6L631 663.3L631.4 661.4L634.3 660.3L638.9 658.4L642.4 654.8L643.8 656L646.4 655.6L642.9 651.8L644.2 650.9L644.9 646.8L648.3 645.3L648.5 645L651.4 643.7L655.3 643.7L658.6 639.8L657.3 638.2L654.8 637.9L654.4 638.4L652.1 638.5L648.1 638.2L647.2 636.3L644.5 633.7L643.8 634.2L641.1 635.3L638.1 635.6L637.6 635.8L636.7 636.5L634.4 638.4L631.6 639.3L631.1 638.6L629.8 637.9L627.6 639.3L627.7 638.2L625.7 639.3L625.5 637.5L624.3 638.5L625.1 639.3L622.7 641.2L624.7 642L623.5 643.5L621.3 644.3L619.4 643.8L617.3 644.9L614.2 644.1L610.9 645L610.2 643.1L611.1 641.9L608 640.5L609.8 639.5L609.1 638.1L608.4 636.3L606.4 635.2L604.9 634.5L603.9 632.8L602.6 631.5L603.5 629.4L603.7 628.5L604.3 628.6L605.3 627.6L602.6 626.4L604.2 624.7L604.9 624.4L603.3 620.8ZM634 666.9L635.3 664.9L632.9 663.7L630.6 668.4L634.9 667.7L634 666.9Z"},{"uf":"PR","d":"M549.8 685.4L549.2 685.2L548.1 685.8L545.8 685L545.7 682.5L547.1 680L547.1 679.8L547.1 679.1L547.1 677.1L544.9 674.9L545.3 673L541.9 670.5L541.2 668L540.9 668.3L539.3 666.3L540.4 665.2L540 662.6L539.4 662L538.9 659.1L539.5 657.6L538.6 655.1L538.9 653.6L536.9 650.6L534.9 649.2L534.7 649L534.3 648.7L531.3 646.3L531.3 646.2L529.5 645.1L527.8 645.8L526.2 646.1L523.2 646L522.8 645.3L519.1 645.7L518 645L516.7 645.1L513.2 646.1L512.6 644.2L510.4 642.6L509.2 642.3L508.7 642.5L504.9 641.3L504.1 640.9L502.2 639.8L501.5 639.6L499 639.3L497.4 640.2L495 639.4L494.9 639.4L493 639.7L490 638.8L489.3 638.4L489 638.2L486.2 636.7L486.1 636.7L483.9 636.5L483.5 637.4L482.8 639.4L480.5 638.8L477.6 638.4L477.1 638.3L475 638.5L473.9 637.3L470.1 638.3L469.7 638.2L466.6 637.3L464.7 638.1L464.1 638.5L462.6 638.6L462.1 639.3L459.6 641.2L457.7 641.9L455.9 643L452.9 644.7L451 647.3L451 650L449.2 653.6L448.2 655.4L443.9 657.3L442.3 661.5L441.9 662.8L441.1 665.5L441.1 666.8L439.3 669.9L436.7 671.5L435.4 673.5L437.2 678.4L436.5 679.6L436 683.3L435.8 684.9L435.7 685.7L434.4 687.6L433 693.5L433.7 696.1L432.6 697.4L429.4 702.9L430 706.1L433.2 707.7L436.5 705.3L439.1 705.9L439.8 704.5L443.2 705.9L446.3 708.3L446.4 710.1L447 713.3L446.6 714.6L448.8 716.3L450.2 719.3L450.6 720L450.9 721L455.5 721.7L455.5 721.7L455.5 721.7L457.4 721L461.2 723.2L461.4 723.3L464.3 723.7L466.3 723.6L466.9 723.5L470.1 723.4L471.5 723.5L472.7 724L474.6 724.6L475.4 724.4L477.1 725.3L483.4 725.9L486.2 727.7L490.7 728.5L497.5 728.5L499.7 731.6L500.2 730.4L503.5 729.6L503.9 728.8L502.2 724.8L502.8 724.1L503.2 723.3L504.3 722.1L507 720.5L509 720.7L511 721.9L515.3 719.6L515.4 719.5L516.9 716.8L518.2 715.4L522.7 717.9L524.8 716.3L526.5 716.9L530.8 715.6L532.1 715.8L533.7 716.1L537.5 719.6L539.4 720.5L541.9 719.7L542 719.5L543.2 719.2L544.7 718.4L547.5 716L553.3 715L553.7 715.1L559.6 715L561.5 714.8L562.5 712L564.1 708.8L566.7 705.9L567.8 703.8L569.9 703.4L572.5 699.6L569.3 692.4L567.5 693.5L565.5 692.2L562.4 694.5L561.4 692.7L562.1 690.7L562.8 686.4L561.4 685.1L556.8 685.2L554.6 685.2L549.8 685.4ZM450.6 700.6L451.2 700.5L451.2 700.5L450.6 700.6ZM456.6 652.7L456.6 652.7L456.7 652.6L456.6 652.7Z"},{"uf":"SC","d":"M477.1 725.3L475.4 724.4L474.6 724.6L472.7 724L471.5 723.5L470.1 723.4L466.9 723.5L466.3 723.6L464.3 723.7L461.4 723.3L461.2 723.2L457.4 721L455.5 721.7L455.5 721.7L450.9 721L449.8 725.1L449.8 725.4L449.1 727.5L448.9 729L449.2 732.4L450.1 734.5L450.1 735.6L450.2 736.7L448.8 738.1L446.6 741.9L446.9 742L449.2 742.2L451.8 742.3L452.9 742L454.2 742.4L457.1 740.6L458.4 741L457.8 742.8L460.8 742.4L463.2 740.5L464.5 740.2L465.1 741.2L465.5 743L468.2 741.9L469.3 742.7L469.6 742.7L471.7 744.5L474.9 743.5L475.1 743.9L477.4 743L477.6 744.5L478.1 744.7L480.3 745.3L481.1 743.9L481.9 745.5L484.5 745.8L485.8 745.9L487.2 746.6L490 748.8L490.4 749.9L491.5 749.7L493.4 748.9L494.9 749.1L496.1 751.1L496.8 750.7L498.7 751.8L502 754.4L502.8 754.7L507.6 757.8L507.5 758.2L508.7 759.9L509.2 759.6L511.5 761.7L514.3 766.4L515.4 766.9L517.2 769.7L521.4 770.6L529.2 771.6L531.3 770.7L534.7 771.4L536.7 772.5L537.2 775L537.2 775.1L535.5 774.6L534.2 776.9L532.1 777.2L531.8 781L531.7 782.3L531.6 785L530.3 787.6L527.7 787.9L527.5 789.6L529.8 791.5L530 791.4L528.2 789.3L531.6 788L532.9 788.3L535.3 789.9L537 790.8L538.5 788.9L541.3 785.6L544.4 782.5L546.3 780.8L548.5 779L555.7 774.7L558.2 772.2L559.1 768.5L560.7 763.3L560.9 759.5L561.7 758.6L561.9 757.2L563.2 755.8L566.4 748.3L565.4 746.7L563 747.3L561.5 745.2L561.3 743L561.9 742.8L563.7 742.5L563.4 740.5L561.7 741.3L561.6 739.4L560.8 737.1L560.5 736.1L560.9 734.1L560.1 732.8L559.6 731.6L560 728.5L560.3 727.8L561.5 725.6L563.7 720.3L562.1 719.1L561.5 714.8L559.6 715L553.7 715.1L553.3 715L547.5 716L544.7 718.4L543.2 719.2L542 719.5L541.9 719.7L539.4 720.5L537.5 719.6L533.7 716.1L532.1 715.8L530.8 715.6L526.5 716.9L524.8 716.3L522.7 717.9L518.2 715.4L516.9 716.8L515.4 719.5L515.3 719.6L511 721.9L509 720.7L507 720.5L504.3 722.1L503.2 723.3L502.8 724.1L502.2 724.8L503.9 728.8L503.5 729.6L500.2 730.4L499.7 731.6L497.5 728.5L490.7 728.5L486.2 727.7L483.4 725.9L477.1 725.3Z"},{"uf":"RS","d":"M444.1 850.6L449 853.8L450.1 857L450.8 860.3L455.3 864L461 866.5L465 865L465.6 862.7L469.2 861.7L471 860L468.8 859.2L471.1 855.1L473.2 854.9L471.7 858.8L473.6 862L473.2 866.1L471 870.5L468.6 872.4L464.9 869.7L462.2 869.6L461.1 874.4L459.2 876.7L457.8 875.8L454.6 880.1L455.6 884.2L453.8 886.4L453.4 889.9L455.7 891.2L456.8 891.2L469.8 880.7L473.2 876.7L476 871.3L477.6 865.9L480.4 859.3L484.7 855.3L484.3 850.3L481.2 848.2L481.9 846.8L483.5 844.8L486.1 844.7L486.5 842.4L486.6 840.2L488.6 835.9L491 835.4L495.2 835L495 832.3L497 831.5L499.1 830.9L497.8 828.3L498.9 826L500.6 826L500.4 820.8L501.8 820.8L503 817.1L505.8 816.1L504.2 813L501.6 811.3L502.2 807.4L502.8 807.1L503.7 810.3L507.4 812.1L507.6 815.1L510.3 816.1L510.6 813.6L516.3 812.7L517.1 810.7L518.8 811.9L517.9 817.3L514.7 814.5L515.6 817.5L515.6 822.2L514.2 824.8L509.5 826.5L509.8 828.9L504.8 831.9L505.3 835.3L503.6 839.3L500.9 841L499.4 840L494.3 846.3L490.4 847.1L489 848.6L484.7 847.9L486.5 849.8L485.1 854.8L490.6 849.7L499.4 844.7L504.7 840.3L512.2 833.2L513.9 831.4L523.4 817.5L525.2 813.1L525.8 811.5L527 808.4L528.1 805.6L529.1 803.5L529.3 803L530.3 801L532.2 797.7L532.4 797.2L535 793.5L537 790.8L535.3 789.9L532.9 788.3L531.6 788L528.2 789.3L530 791.4L529.8 791.5L527.5 789.6L527.7 787.9L530.3 787.6L531.6 785L531.7 782.3L531.8 781L532.1 777.2L534.2 776.9L535.5 774.6L537.2 775.1L537.2 775L536.7 772.5L534.7 771.4L531.3 770.7L529.2 771.6L521.4 770.6L517.2 769.7L515.4 766.9L514.3 766.4L511.5 761.7L509.2 759.6L508.7 759.9L507.5 758.2L507.6 757.8L502.8 754.7L502 754.4L498.7 751.8L496.8 750.7L496.1 751.1L494.9 749.1L493.4 748.9L491.5 749.7L490.4 749.9L490 748.8L487.2 746.6L485.8 745.9L484.5 745.8L481.9 745.5L481.1 743.9L480.3 745.3L478.1 744.7L477.6 744.5L477.4 743L475.1 743.9L474.9 743.5L471.7 744.5L469.6 742.7L469.3 742.7L468.2 741.9L465.5 743L465.1 741.2L464.5 740.2L463.2 740.5L460.8 742.4L457.8 742.8L458.4 741L457.1 740.6L454.2 742.4L452.9 742L451.8 742.3L449.2 742.2L446.9 742L446.6 741.9L444.2 741.5L441.8 744L440.5 744.9L438.9 744.1L438.2 746.8L436.8 748.2L434 747.2L432.6 749L430.1 748.4L429.1 750.4L427.1 750.8L425.1 750.2L423.2 753.9L421.1 756L419.9 757.4L416.6 757.5L415 759.2L413.6 760L412.8 761.5L411.4 762.7L404.1 766.2L406.4 768.5L405.9 770.2L402.4 768.8L401.7 771.6L398.6 772.6L399.1 773.9L394.9 778.4L392.6 779.1L392 781.7L389.7 785.3L386.2 786.2L384.6 790.2L382 793L377.8 798.1L374.3 800.9L372 801.2L370 803.6L370 805.5L367 808.7L364.2 810.2L364.7 811.9L368.7 813L372.7 812.6L374.7 808.7L380.5 808.2L384.7 810.7L387.1 814.4L389 814.9L390.8 817.6L392.8 818.3L395 819.9L395.8 822.2L398.6 824L398.9 830.7L402 830.5L406.4 827.8L408.4 825.1L411.5 829L413.3 829.7L415.6 834.6L419.4 836.4L420.3 835.3L424.6 838.9L427.6 838.8L430.1 839.2L432.6 841.8L433 843.7L441.1 850L444.1 850.6Z"},{"uf":"MS","d":"M456.1 533.5L454.3 534.6L451.5 533.2L447.9 533.7L444 531.7L446.1 526.9L448.3 526.2L449.5 526L450 516.7L446.9 517.6L443.6 521.7L442.5 521.8L441.3 524.9L438.8 524.7L436.4 526L432 521.9L426.6 522.8L424.1 525.1L418 525.7L418 525.7L414.5 523.2L410 522L407.8 519.3L407.8 519.3L399.4 516.8L398.2 514.8L393.6 515.9L389.5 518.5L383.3 518L379.9 523.1L377.6 524.1L377.5 525.9L374.6 528.7L368.9 529.7L367.4 530.8L364 529.2L362.2 527.2L362 525.2L360.7 523.8L360 525.4L361.6 527.5L361.4 529.8L364.6 536.6L367.2 539L364.9 539.1L360.4 554.1L361.6 557.2L360 557.2L352.4 573.6L358.4 578.4L351.6 582.8L353.1 584.8L353.7 587.9L355.3 589.1L355 592.9L356.2 595.1L358.2 596L356.2 597.2L358.3 597.8L356.8 599.4L358.9 600.3L358.2 602.7L358.4 609L356.1 614.6L357.8 617.3L355.9 621L357.1 621.7L355.4 626.5L360.8 627.7L363.8 626.7L365.9 628.4L370.2 630.1L376.1 629.8L380.6 631.3L386.6 629.2L388.1 626.7L390.5 626.2L391.5 628.6L394.5 630.8L402.6 631L404.2 633.2L405.2 637L407.6 640.2L406.4 643.9L408 650.7L409.2 652.7L410 655.8L408.8 658.2L409.4 661.5L411.5 663.5L411.3 668L412.2 669.3L415.3 669.7L419.7 669.8L428 666.1L433.6 668.3L436.7 671.5L439.3 669.9L441.1 666.8L441.1 665.5L441.9 662.8L442.3 661.5L443.9 657.3L448.2 655.4L449.2 653.6L451 650L451 647.3L452.9 644.7L455.9 643L457.7 641.9L459.6 641.2L462.1 639.3L462.6 638.6L463.3 637L466 635.2L472.5 631.4L476.8 628.7L478.2 627.1L479.8 623.9L483.3 619.3L485.6 617.2L484.6 614.7L487.7 613L489.9 609.4L489.5 606.3L491.8 602.9L495.1 600.5L494.8 596.2L496.2 593.2L496.3 593.1L499.6 589.6L501.2 587.2L506.4 585.4L508.7 581.3L508.8 581L508 574.3L507.9 572.1L510.3 569.8L510.2 567L506.8 563.4L498.9 560L496.9 559.6L493.6 559L490.1 557.6L488.1 555.6L485.1 555.3L482.8 552.9L479.5 552.5L477.8 550.6L475.8 549L470.4 549.4L467.7 548.3L466.6 547.6L465.7 546.1L468.5 543.3L470.2 541.9L468.8 540.7L462.7 540.8L461.8 535.6L463.3 534.4L459.7 533.8L456.1 533.5Z"},{"uf":"MT","d":"M393.2 338.4L384.4 337.6L382.6 338.5L381.1 334.9L377.3 334.6L375.9 333.4L376.3 331.5L372.7 327.5L368.1 326.1L368 324.6L364.2 323.7L363.3 318.5L362.1 315.8L363.1 311.6L358.9 305.7L357.5 299.3L353.9 292.8L352.3 291.9L350.6 294.3L350.8 298L348.8 301.4L347 302.7L349 308.6L348.4 313.9L346.1 317.7L346.7 320.1L345.7 322.5L348.1 322.7L345.6 324.7L330.5 324.8L302.2 324.7L276.7 324.7L279.2 327.5L277.3 331.4L277.9 334.9L275.7 335.1L276 336.7L276.7 339.7L279 343.6L276.9 345.6L278.3 348.8L277.6 352L276.6 353.4L277.3 359L279.3 361.5L279 369.4L277.4 374.4L280.1 374.4L289.5 374.5L301.3 374.5L302.8 376.8L311.9 377.5L311.8 380.1L313.2 382.4L312.8 384.3L309 387.9L309.2 393.9L311.8 395.5L311.9 398.1L313.6 400.1L313.9 403L316.2 405.2L312.6 411L310.8 411.5L308.8 419.2L307.4 419.4L305.5 421.9L304.1 426L303.3 427.3L302.9 430.4L297.5 433.1L295.8 435.9L301 438.1L301.5 441.4L303 442.7L300.9 445L301.5 450L305.4 456.9L306 467.7L298.8 467.7L306.2 476.3L307.6 494.3L323 494.6L338 495.2L345.8 495.6L348.2 494.3L347.7 500L345.7 501.7L344.8 509.5L346.7 511.9L346.5 515.1L349.9 519L355.3 522.7L357.8 521.2L360.7 523.8L362 525.2L362.2 527.2L364 529.2L367.4 530.8L368.9 529.7L374.6 528.7L377.5 525.9L377.6 524.1L379.9 523.1L383.3 518L389.5 518.5L393.6 515.9L398.2 514.8L399.4 516.8L407.8 519.3L407.8 519.3L410 522L414.5 523.2L418 525.7L418 525.7L424.1 525.1L426.6 522.8L432 521.9L436.4 526L438.8 524.7L441.3 524.9L442.5 521.8L443.6 521.7L446.9 517.6L450 516.7L449.5 526L448.3 526.2L446.1 526.9L444 531.7L447.9 533.7L451.5 533.2L454.3 534.6L456.1 533.5L459.7 533.8L463.3 534.4L461.3 528.3L459.8 527.1L459.6 524.6L459.6 522.4L460.1 517.7L462.5 513.4L463.6 512.7L464.6 507.9L466.5 507.3L466.8 506.7L468.6 505.8L471.2 502.7L470.8 501.5L473 500L471.9 495.1L474.9 493.3L476.5 491.1L478.9 490.1L481.3 485.8L486.6 485.6L487.5 484.6L489.5 484.3L491.9 480.4L491.7 477.9L493.4 476.5L494.6 469.5L497.1 467L501 465.4L499.6 465.3L501.1 465.3L501.3 465.1L501.3 465L501.5 464.9L502 465.1L502.7 466.5L506.5 463.9L506.6 463.8L506.9 463.7L506.7 463.1L506.7 463L509.6 454.8L508.8 452.2L510.7 446.2L512.2 445.2L511.5 436.8L513 436L514.1 431.9L516.1 430L517.3 427.4L518.2 420.9L519.5 417L517 416L515.7 412.1L517 407.7L516.6 402.5L515.8 402.3L515.7 397.2L516.7 394.8L515 391.2L516 387.9L514.5 387.1L515.4 381.8L517.3 376.2L516.8 373.1L518.2 369.1L517.5 367L517.5 367L518.8 365.8L520.3 361.2L521.5 360L522 355.5L524.1 352.8L525.8 348.4L512.1 347.5L502.1 346.8L481.2 345.3L473.3 344.8L462 343.9L452 343.2L440.6 342.3L429.5 341.4L421.1 340.8L402 339.1L395.7 338.6L393.2 338.4Z"},{"uf":"GO","d":"M569.4 480.5L570.2 476.9L572.9 476.9L573.4 476.9L573.4 476.9L573.8 476.9L585.7 476.9L589.5 478.9L589.6 482.5L588.2 485.6L588.4 488.3L589.7 489.1L593.5 486.6L597.5 486.3L600.7 485.3L599.1 479.4L597.7 478.3L598 475.6L599.8 474L599.3 472L597.9 470.2L598.1 466.8L599.6 465.8L604.7 467.6L606.9 466.8L607.4 466.7L606.1 461.3L607.4 458.8L611.4 461.3L611.4 463.3L614.5 464.4L617.6 462.7L617.9 458.2L618 458L618.7 457.7L618.4 453L620.5 450.9L617.1 448.1L614.4 446.4L613.4 443.9L613.8 443.1L612.6 441.6L613.3 436.2L614.9 433.8L613 433.3L613.8 430.7L613 430L616.9 426.8L616.2 426L612 427.3L611.2 425.9L611.9 421.6L615.9 418.3L610.4 419.9L609.3 416.1L608.6 418.7L608.5 419.5L604.5 419.4L602 419.4L599.7 421.6L587.9 426.1L584 422.8L581.9 425.1L582.8 428.5L581.6 430.7L579 427.6L575.3 427.3L572.9 425.5L570.8 426.9L571.4 423.6L564.5 426.5L563.2 423.3L561.8 427.2L561.9 422.9L560.4 420.4L555.5 415.6L555.3 416L553.2 419.2L550.1 415.3L547.4 417.5L544.8 423.7L544.6 426.3L532.7 419.5L526.6 417.7L523.9 415.4L525.3 411L526.5 410.2L526 408.4L527.6 406.4L524 408.6L521.2 412.2L519.5 417L518.2 420.9L517.3 427.4L516.1 430L514.1 431.9L513 436L511.5 436.8L512.2 445.2L510.7 446.2L508.8 452.2L509.6 454.8L506.7 463L506.7 463.1L506.9 463.7L506.6 463.8L506.5 463.9L502.7 466.5L502 465.1L501.3 465L501.3 465.1L501.2 465.3L501 465.4L497.1 467L494.6 469.5L493.4 476.5L491.7 477.9L491.9 480.4L489.5 484.3L487.5 484.6L486.6 485.6L481.3 485.8L478.9 490.1L476.5 491.1L474.9 493.3L471.9 495.1L473 500L470.8 501.5L471.2 502.7L468.6 505.8L466.8 506.7L466.5 507.3L464.6 507.9L463.6 512.7L462.5 513.4L460.1 517.7L459.6 522.4L459.6 524.6L459.8 527.1L461.3 528.3L463.3 534.4L461.8 535.6L462.7 540.8L468.8 540.7L470.2 541.9L468.5 543.3L465.7 546.1L466.6 547.6L467.7 548.3L470.4 549.4L475.8 549L477.8 550.6L479.5 552.5L482.8 552.9L485.1 555.3L488.1 555.6L490.1 557.6L493.6 559L496.9 559.6L498.9 560L506.8 563.4L510.2 567L512.6 567.1L511.5 566L512.5 563.4L514.5 561.2L514.6 560.6L516.5 559.4L519 558.6L520.3 554.6L523 550.9L524.8 549.2L529 548.9L530.1 547.3L535.2 548.3L536 547.5L536.8 547.5L540.6 545.9L542 545.7L544.4 548.1L546.2 546.5L547.2 545.5L548.1 543.1L551.5 542.8L553.5 541L554.4 540.6L557.3 541.7L560.2 541.4L567.1 542.1L568.6 541.1L569.6 541.5L574 543.6L575.6 545L577.5 543.9L577.6 543.7L579.6 543.2L581.6 541.7L583.1 540.8L583.2 539.2L587.1 537.4L587.5 536.9L590.3 534.6L588.4 529.8L590.7 524.8L589.6 523.3L586.3 523.1L584.7 521.3L585 520.3L585.3 518.4L585.8 518.9L588.8 514.7L592.5 512.4L593.7 510.5L591.9 508.1L591.5 504.6L590 502.5L587.4 501.3L586.5 498.8L589.4 493L589.7 489.4L581.5 489.4L575.9 489.4L574.2 489.4L574.2 489.4L574.2 489.4L572.7 489.4L568.5 489.4L568.4 484.4L570 481.8L569.4 480.5Z"},{"uf":"DF","d":"M574.2 489.4L575.9 489.4L581.5 489.4L589.7 489.4L589.7 489.1L588.4 488.3L588.2 485.6L589.6 482.5L589.5 478.9L585.7 476.9L573.8 476.9L573.4 476.9L573.4 476.9L572.9 476.9L570.2 476.9L569.4 480.5L570 481.8L568.4 484.4L568.5 489.4L572.7 489.4L574.2 489.4L574.2 489.4Z"}],"centros":{"RO":[238.2,370.8],"AC":[80,324.1],"AM":[199.6,203.7],"RR":[282.2,79.7],"PA":[476.3,211],"AP":[491.9,92.9],"TO":[568.9,339.7],"MA":[630.7,248],"PI":[700,274.8],"CE":[760.3,243],"RN":[824.8,256.8],"PB":[821.9,290.2],"PE":[796.9,315.2],"AL":[819.7,343.4],"SE":[805.9,364.9],"BA":[712.5,426.7],"MG":[653.9,535.9],"ES":[742.5,560.7],"RJ":[691.7,630.2],"SP":[557.2,628.8],"PR":[496.7,690.1],"SC":[509.9,748.3],"RS":[453.9,810],"MS":[431.1,590.7],"MT":[411.8,411.9],"GO":[533.8,487.8],"DF":[577.6,484.4]}};

/* ---- mapa ---- */
/* MAPA DE VENDAS · Brasil em SVG (estados do IBGE), pontos laranja por cidade com agrupamento, zoom/arrastar, filtros
   no servidor (ação "consultar", sem recarregar a página), cartões, rankings de estados e cidades, sem localização.
   Sem biblioteca externa: o desenho dos estados vem de brasil.js (gerado por scripts/gerar-geo.js). */
(function () {
  var B = window.MAPA_BRASIL;
  var PERIODOS = [['hoje', 'Hoje'], ['ontem', 'Ontem'], ['7d', '7 dias'], ['15d', '15 dias'], ['30d', '30 dias'], ['mes', 'Mês atual'], ['mes_anterior', 'Mês anterior'], ['personalizado', 'Personalizado']];
  var est = {
    f: { periodo: '30d', de: '', ate: '', uf: '', cidade: '', marca: '', categoria: '', status: '' },
    modo: 'pedidos', view: null, sel: null, ordUf: 'valor', ordCid: 'valor', dados: null, carregando: false, seq: 0, timer: null,
  };

  // ---------- projeção (a mesma do gerador) ----------
  function xy(lat, lon) {
    var p = B.proj;
    return [(lon - p.lon0) / (p.lon1 - p.lon0) * B.largura, (p.lat0 - lat) / (p.lat0 - p.lat1) * B.altura];
  }
  function viewInicial() { return { x: -10, y: -10, w: B.largura + 20 }; }

  // ---------- render principal ----------
  function padrao() { var f = est.f; return f.periodo === '30d' && !f.uf && !f.cidade && !f.marca && !f.categoria && !f.status; }

  /** O painel entrega os dados do padrão (30 dias, sem filtro) na abertura e a cada 2 min; com filtro ativo, refaz a consulta. */
  function render(el, d, ctx) {
    if (est.dadosBase !== d) {
      est.dadosBase = d;
      if (padrao() || !est.dados || d.semAcesso) est.dados = d;
      else { desenhar(el, ctx); consultar(el, ctx, true); return; }
    }
    desenhar(el, ctx);
  }

  function desenhar(el, ctx) {
    var d = est.dados, u = ctx.util, esc = u.esc, num = u.num, brl = u.brl;
    if (d.semAcesso) { el.innerHTML = '<div class="card empty">O mapa mostra as vendas do Site, que não fazem parte do seu acesso.</div>'; return; }
    if (!est.view) est.view = viewInicial();
    var k = d.kpis || {}, f = est.f;
    var h = '';
    if (d.progresso && !d.progresso.iniciado) h += '<div class="aviso">A localização dos pedidos ainda não rodou. Ela começa sozinha no próximo gatilho do mapa (de hora em hora) ou rodando sincronizarAgora no editor.</div>';
    else if (d.progresso && d.progresso.pendentes) h += '<div class="aviso">Localizando pedidos: faltam ' + num(d.progresso.pendentes) + '. Os mais recentes vêm primeiro; os que faltam já contam nos cartões, mas ainda não aparecem no mapa.</div>';

    // filtros
    var sel = function (id, rotulo, ops, atual, fmt) {
      return '<label class="mp-f"><span>' + rotulo + '</span><select class="campo" data-f="' + id + '"><option value="">Todos</option>' +
        ops.map(function (o) { var v = fmt ? fmt(o) : [o, o]; return '<option value="' + esc(v[0]) + '"' + (String(v[0]) === String(atual) ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select></label>';
    };
    var op = d.opcoes || { ufs: [], cidades: [], marcas: [], categorias: [], status: [] };
    var cidades = op.cidades.filter(function (c) { return !f.uf || c.uf === f.uf; });
    h += '<section class="card mp-filtros"><div class="mp-per">' + PERIODOS.map(function (p) {
      return '<button type="button" class="mp-chip' + (d.periodo === p[0] ? ' on' : '') + '" data-per="' + p[0] + '">' + p[1] + '</button>';
    }).join('') + '</div>' +
      (f.periodo === 'personalizado' ? '<div class="mp-datas"><label class="mp-f"><span>De</span><input class="campo" type="date" data-d="de" value="' + esc(f.de || d.de) + '"></label>' +
        '<label class="mp-f"><span>Até</span><input class="campo" type="date" data-d="ate" value="' + esc(f.ate || d.ate) + '"></label>' +
        '<button type="button" class="btn-p" data-acao="datas">Aplicar</button></div>' : '') +
      '<div class="mp-sels">' + sel('uf', 'Estado', op.ufs, f.uf) +
      sel('cidade', 'Cidade', cidades, f.cidade, function (c) { return [c.ibge, c.nome + (f.uf ? '' : ' - ' + c.uf)]; }) +
      sel('marca', 'Marca', op.marcas, f.marca) + sel('categoria', 'Categoria', op.categorias, f.categoria) + sel('status', 'Status', op.status, f.status) +
      '<button type="button" class="btn-s mp-limpar" data-acao="limpar">Limpar filtros</button></div>' +
      '<div class="var mp-per-txt">' + esc(d.rotulo || '') + ' · ' + dataBR(d.de) + (d.de !== d.ate ? ' a ' + dataBR(d.ate) : '') +
      (est.carregando ? ' · <b>atualizando…</b>' : '') + '</div></section>';

    // cartões
    var kp = function (ico, lbl, val, cor) { return '<div class="card mp-k" style="--k:' + cor + '"><span class="mp-k-ico">' + (u.icone ? u.icone(ico) : '') + '</span><div><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div></div></div>'; };
    h += '<section class="mp-kpis">' + kp('carrinho', 'Total de pedidos', num(k.pedidos || 0), 'var(--mp-laranja)') + kp('pessoas', 'Clientes únicos', num(k.clientes || 0), 'var(--s1)') +
      kp('moedas', 'Faturamento', brl(k.faturamento || 0), 'var(--s3)') + kp('camadas', 'Estados alcançados', num(k.estados || 0), 'var(--s5)') +
      kp('mapa', 'Cidades alcançadas', num(k.cidades || 0), 'var(--s2)') + kp('etiqueta', 'Ticket médio', brl(k.ticket || 0), 'var(--s4)') + '</section>';
    if (k.semLocal || k.pendentes) h += '<div class="var mp-obs">' + (k.semLocal ? num(k.semLocal) + ' pedido(s) com cidade não reconhecida' : '') +
      (k.semLocal && k.pendentes ? ' · ' : '') + (k.pendentes ? num(k.pendentes) + ' ainda sendo localizados' : '') + ': contam nos cartões, mas não aparecem no mapa.</div>';

    // mapa + detalhe
    h += '<section class="mp-corpo"><div class="card mp-mapa-card"><div class="mp-topo"><div class="mp-modo">' +
      [['pedidos', 'Pedidos'], ['clientes', 'Clientes']].map(function (m) { return '<button type="button" class="mp-chip' + (est.modo === m[0] ? ' on' : '') + '" data-modo="' + m[0] + '">' + m[1] + '</button>'; }).join('') +
      '</div><div class="mp-zoom"><button type="button" class="btn-s" data-z="1.6" title="Aproximar">+</button><button type="button" class="btn-s" data-z="0.625" title="Afastar">−</button>' +
      '<button type="button" class="btn-s" data-z="0" title="Brasil inteiro">⟲</button></div></div>' +
      '<div class="mp-svg-wrap">' + svgMapa(d) + '</div>' +
      '<div class="var mp-leg"><i class="mp-dot"></i> cada ponto = ' + (est.modo === 'pedidos' ? 'pedidos' : 'clientes') + ' na cidade (o número é a quantidade) · role ou use + − para aproximar · arraste para mover</div></div>' +
      '<div class="card mp-det">' + detalheHtml(d, u) + '</div></section>';

    // rankings
    h += '<section class="mp-rank">' + rankEstados(d, u) + rankCidades(d, u) + '</section>';
    if (d.semLocal && d.semLocal.length) {
      h += '<section class="card mp-semloc"><h2>Cidades não reconhecidas</h2><div class="var">Estão no cadastro do cliente com um nome que não bate com a base do IBGE. Corrija o cadastro no Tiny para o pedido aparecer no mapa.</div>' +
        '<div class="mp-semloc-l">' + d.semLocal.map(function (x) { return '<span>' + esc(x.cidade) + (x.uf ? ' - ' + esc(x.uf) : '') + ' <em>' + num(x.pedidos) + '</em></span>'; }).join('') + '</div></section>';
    }
    el.innerHTML = h;
    ligar(el, ctx);
    desenharPontos(el);
  }

  function dataBR(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] + '/' + m[1] : s || ''; }

  // ---------- mapa ----------
  function svgMapa(d) {
    var maxUf = Math.max.apply(null, (d.estados || []).map(function (e) { return e.valor; }).concat([1]));
    var porUf = {};
    (d.estados || []).forEach(function (e) { porUf[e.uf] = e; });
    var v = est.view;
    var ufs = B.ufs.map(function (s) {
      var e = porUf[s.uf], a = e ? 0.18 + 0.5 * Math.sqrt(e.valor / maxUf) : 0;
      return '<path class="mp-uf' + (e ? ' tem' : '') + (est.f.uf === s.uf ? ' on' : '') + '" data-uf="' + s.uf + '" d="' + s.d + '"' + (e ? ' style="--a:' + a.toFixed(2) + '"' : '') + '><title>' +
        s.uf + (e ? ' · ' + e.pedidos + ' pedidos' : '') + '</title></path>';
    }).join('');
    var siglas = Object.keys(B.centros).map(function (uf) { var c = B.centros[uf]; return '<text class="mp-sigla" x="' + c[0] + '" y="' + c[1] + '">' + uf + '</text>'; }).join('');
    return '<svg class="mp-svg" viewBox="' + v.x + ' ' + v.y + ' ' + v.w + ' ' + (v.w * B.altura / B.largura) + '" preserveAspectRatio="xMidYMid meet">' +
      '<g class="mp-ufs">' + ufs + '</g><g class="mp-siglas">' + siglas + '</g><g class="mp-pontos"></g></svg>';
  }

  /** Agrupa cidades próximas na tela (o raio é em pixels: aproximar separa os grupos). */
  function grupos(svg) {
    var d = est.dados, v = est.view;
    var px = svg.clientWidth || 800, upp = v.w / px; // unidades do mapa por pixel
    var R = 30 * upp;
    var lista = (d.cidades || []).map(function (c) { var p = xy(c.lat, c.lon); return { c: c, x: p[0], y: p[1], n: est.modo === 'pedidos' ? c.pedidos : c.clientes }; })
      .sort(function (a, b) { return b.n - a.n; });
    var gs = [];
    lista.forEach(function (it) {
      var g = null;
      for (var i = 0; i < gs.length; i++) { var dx = gs[i].x - it.x, dy = gs[i].y - it.y; if (dx * dx + dy * dy < R * R) { g = gs[i]; break; } }
      if (!g) gs.push({ x: it.x, y: it.y, n: it.n, cidades: [it.c], sx: it.x * it.n, sy: it.y * it.n });
      else { g.cidades.push(it.c); g.n += it.n; g.sx += it.x * it.n; g.sy += it.y * it.n; }
    });
    gs.forEach(function (g) { if (g.n) { g.x = g.sx / g.n; g.y = g.sy / g.n; } });
    return { gs: gs, upp: upp };
  }

  function desenharPontos(el) {
    var svg = el.querySelector('.mp-svg');
    if (!svg) return;
    var r = grupos(svg), alvo = svg.querySelector('.mp-pontos');
    alvo.innerHTML = r.gs.map(function (g, i) {
      var rad = Math.min(26, 7 + Math.sqrt(g.n) * 2.6) * r.upp;
      var sel = g.cidades.some(function (c) { return est.sel === c.ibge; });
      var nome = g.cidades.length === 1 ? g.cidades[0].nome + ' - ' + g.cidades[0].uf : g.cidades.length + ' cidades';
      return '<g class="mp-pt' + (g.cidades.length > 1 ? ' grupo' : '') + (sel ? ' sel' : '') + '" data-g="' + i + '">' +
        '<circle cx="' + g.x.toFixed(2) + '" cy="' + g.y.toFixed(2) + '" r="' + (rad * 1.55).toFixed(2) + '" class="mp-halo"/>' +
        '<circle cx="' + g.x.toFixed(2) + '" cy="' + g.y.toFixed(2) + '" r="' + rad.toFixed(2) + '"/>' +
        '<text x="' + g.x.toFixed(2) + '" y="' + g.y.toFixed(2) + '" style="font-size:' + (11 * r.upp).toFixed(2) + 'px">' + g.n + '</text>' +
        '<title>' + nome + ' · ' + g.n + ' ' + (est.modo === 'pedidos' ? 'pedido(s)' : 'cliente(s)') + '</title></g>';
    }).join('');
    est.grupos = r.gs;
  }

  function aplicarView(el) {
    var svg = el.querySelector('.mp-svg'), v = est.view;
    svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + (v.w * B.altura / B.largura));
    desenharPontos(el);
  }

  /** Zoom por fator, mantendo o ponto (cx, cy) do mapa no mesmo lugar da tela. */
  function zoom(el, fator, cx, cy) {
    var v = est.view, h = v.w * B.altura / B.largura;
    var nw = Math.max(18, Math.min(B.largura + 20, v.w / fator));
    if (cx == null) { cx = v.x + v.w / 2; cy = v.y + h / 2; }
    var nh = nw * B.altura / B.largura;
    est.view = { x: cx - (cx - v.x) * nw / v.w, y: cy - (cy - v.y) * nh / h, w: nw };
    aplicarView(el);
  }

  function pontoMapa(svg, ev) {
    var b = svg.getBoundingClientRect(), v = est.view, h = v.w * B.altura / B.largura;
    var esc = Math.max(v.w / b.width, h / b.height); // preserveAspectRatio meet
    var ox = (b.width - v.w / esc) / 2, oy = (b.height - h / esc) / 2;
    return [v.x + (ev.clientX - b.left - ox) * esc, v.y + (ev.clientY - b.top - oy) * esc, esc];
  }

  // ---------- detalhe da cidade ----------
  function detalheHtml(d, u) {
    var esc = u.esc, num = u.num, brl = u.brl;
    var c = (d.cidades || []).filter(function (x) { return x.ibge === est.sel; })[0];
    if (!c) {
      var top = (d.cidades || []).slice(0, 5);
      return '<h2>Detalhe</h2><div class="var">Toque num ponto do mapa para ver os ' + (est.modo === 'pedidos' ? 'pedidos' : 'clientes') + ' da cidade.</div>' +
        (top.length ? '<div class="mp-top"><div class="lbl">Maiores cidades no período</div>' + top.map(function (x) {
          return '<button type="button" class="mp-top-i" data-cid="' + x.ibge + '"><span>' + esc(x.nome) + ' - ' + esc(x.uf) + '</span><b>' + brl(x.valor) + '</b></button>';
        }).join('') + '</div>' : '<div class="empty">Nenhum pedido localizado com esses filtros.</div>');
    }
    var h = '<div class="mp-det-top"><div><h2>' + esc(c.nome) + ' - ' + esc(c.uf) + '</h2><div class="var">' + num(c.pedidos) + ' pedido(s) · ' + num(c.clientes) + ' cliente(s) · ' + brl(c.valor) + '</div></div>' +
      '<button type="button" class="btn-s" data-acao="fechar">×</button></div>';
    if (est.modo === 'pedidos') {
      h += '<div class="mp-lista">' + c.listaPedidos.map(function (p) {
        return '<div class="mp-li"><div class="mp-li-top"><b>Pedido ' + esc(p.numero) + '</b><b>' + brl(p.valor) + '</b></div>' +
          '<div class="var">' + esc(p.data) + ' · ' + esc(p.status) + ' · ' + esc(c.nome) + '/' + esc(c.uf) + '</div>' +
          (p.itens ? '<div class="mp-itens">' + esc(p.itens) + '</div>' : '') + '</div>';
      }).join('') + '</div>';
      if (c.pedidos > c.listaPedidos.length) h += '<div class="var">Mostrando os ' + c.listaPedidos.length + ' mais recentes.</div>';
    } else {
      h += '<div class="mp-lista">' + c.listaClientes.map(function (x) {
        return '<div class="mp-li"><div class="mp-li-top"><b>Cliente ' + esc(x.id) + '</b><b>' + brl(x.total) + '</b></div>' +
          '<div class="var">' + num(x.pedidos) + ' pedido(s) · ticket ' + brl(x.ticket) + ' · última compra ' + esc(x.ultima) + ' · ' + esc(c.nome) + '/' + esc(c.uf) + '</div></div>';
      }).join('') + '</div>';
      if (c.clientes > c.listaClientes.length) h += '<div class="var">Mostrando os ' + c.listaClientes.length + ' que mais compraram.</div>';
    }
    return h;
  }

  // ---------- rankings ----------
  function ordenar(lista, campo) { return lista.slice().sort(function (a, b) { return b[campo] - a[campo]; }); }
  function cabOrd(tipo, atual) {
    return [['valor', 'Faturamento'], ['pedidos', 'Pedidos'], ['clientes', 'Clientes']].map(function (o) {
      return '<button type="button" class="mp-chip mini' + (atual === o[0] ? ' on' : '') + '" data-ord="' + tipo + '|' + o[0] + '">' + o[1] + '</button>';
    }).join('');
  }
  function rankEstados(d, u) {
    var l = ordenar(d.estados || [], est.ordUf);
    return '<div class="card"><div class="mp-rank-top"><h2>Ranking de estados</h2><div>' + cabOrd('uf', est.ordUf) + '</div></div>' +
      (l.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Estado</th><th class="r">Pedidos</th><th class="r">Clientes</th><th class="r">Faturamento</th><th class="r">%</th></tr></thead><tbody>' +
        l.map(function (e) {
          return '<tr class="mp-tr" data-uf-rank="' + e.uf + '"><td><b>' + e.uf + '</b> <span class="var">' + u.esc(e.nome) + '</span></td><td class="r">' + u.num(e.pedidos) + '</td><td class="r">' + u.num(e.clientes) +
            '</td><td class="r">' + u.brl(e.valor) + '</td><td class="r"><span class="mp-bar"><i style="width:' + (e.pct * 100).toFixed(1) + '%"></i></span>' + u.pct(e.pct, 1) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Sem pedidos localizados.</div>') + '</div>';
  }
  function rankCidades(d, u) {
    var l = ordenar(d.cidades || [], est.ordCid).slice(0, 50);
    return '<div class="card"><div class="mp-rank-top"><h2>Ranking de cidades</h2><div>' + cabOrd('cid', est.ordCid) + '</div></div>' +
      (l.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Cidade</th><th>UF</th><th class="r">Pedidos</th><th class="r">Faturamento</th><th class="r">Clientes</th></tr></thead><tbody>' +
        l.map(function (c) {
          return '<tr class="mp-tr" data-cid="' + c.ibge + '"><td>' + u.esc(c.nome) + '</td><td>' + c.uf + '</td><td class="r">' + u.num(c.pedidos) + '</td><td class="r">' + u.brl(c.valor) + '</td><td class="r">' + u.num(c.clientes) + '</td></tr>';
        }).join('') + '</tbody></table></div>' + ((d.cidades || []).length > 50 ? '<div class="var">Mostrando 50 de ' + d.cidades.length + ' cidades.</div>' : '') : '<div class="empty">Sem pedidos localizados.</div>') + '</div>';
  }

  // ---------- consulta (filtros) ----------
  function consultar(el, ctx, imediato) {
    clearTimeout(est.timer);
    est.timer = setTimeout(function () {
      var seq = ++est.seq;
      est.carregando = true; desenhar(el, ctx);
      ctx.acao('consultar', est.f).then(function (r) {
        if (seq !== est.seq) return;
        est.carregando = false; est.dados = r;
        if (est.sel && !(r.cidades || []).some(function (c) { return c.ibge === est.sel; })) est.sel = null;
        desenhar(el, ctx);
      }).catch(function () {
        if (seq !== est.seq) return;
        est.carregando = false; desenhar(el, ctx);
        var t = el.querySelector('.mp-per-txt'); if (t) t.innerHTML += ' · <b class="mp-erro">não foi possível atualizar</b>';
      });
    }, imediato ? 0 : 300); // debounce: várias mudanças seguidas viram 1 consulta
  }

  function centrarCidade(el, c) {
    var p = xy(c.lat, c.lon), nw = Math.min(est.view.w, 140);
    est.view = { x: p[0] - nw / 2, y: p[1] - nw * B.altura / B.largura / 2, w: nw };
    aplicarView(el);
  }

  function ligar(el, ctx) {
    var d = est.dados;
    el.querySelectorAll('[data-per]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.f.periodo = b.dataset.per;
        if (b.dataset.per === 'personalizado') { est.f.de = est.f.de || d.de; est.f.ate = est.f.ate || d.ate; desenhar(el, ctx); return; }
        consultar(el, ctx, true);
      });
    });
    var bd = el.querySelector('[data-acao="datas"]');
    if (bd) bd.addEventListener('click', function () {
      est.f.de = el.querySelector('[data-d="de"]').value; est.f.ate = el.querySelector('[data-d="ate"]').value;
      consultar(el, ctx, true);
    });
    el.querySelectorAll('[data-f]').forEach(function (s) {
      s.addEventListener('change', function () {
        est.f[s.dataset.f] = s.value;
        if (s.dataset.f === 'uf') est.f.cidade = '';
        consultar(el, ctx);
      });
    });
    el.querySelector('[data-acao="limpar"]').addEventListener('click', function () {
      est.f = { periodo: est.f.periodo, de: est.f.de, ate: est.f.ate, uf: '', cidade: '', marca: '', categoria: '', status: '' };
      est.sel = null; est.view = viewInicial();
      consultar(el, ctx, true);
    });
    el.querySelectorAll('[data-modo]').forEach(function (b) { b.addEventListener('click', function () { est.modo = b.dataset.modo; desenhar(el, ctx); }); });
    el.querySelectorAll('[data-ord]').forEach(function (b) {
      b.addEventListener('click', function () { var p = b.dataset.ord.split('|'); if (p[0] === 'uf') est.ordUf = p[1]; else est.ordCid = p[1]; desenhar(el, ctx); });
    });
    el.querySelectorAll('[data-cid]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.sel = Number(b.dataset.cid);
        var c = (d.cidades || []).filter(function (x) { return x.ibge === est.sel; })[0];
        el.querySelector('.mp-det').innerHTML = detalheHtml(d, ctx.util);
        ligarDetalhe(el, ctx);
        if (c) centrarCidade(el, c);
        el.querySelector('.mp-mapa-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    el.querySelectorAll('[data-uf-rank]').forEach(function (b) {
      b.addEventListener('click', function () { est.f.uf = b.dataset.ufRank; est.f.cidade = ''; consultar(el, ctx, true); });
    });
    ligarDetalhe(el, ctx);

    // zoom / arrastar / clique nos pontos
    var svg = el.querySelector('.mp-svg');
    if (!svg) return;
    el.querySelectorAll('[data-z]').forEach(function (b) {
      b.addEventListener('click', function () { var z = Number(b.dataset.z); if (!z) { est.view = viewInicial(); aplicarView(el); } else zoom(el, z); });
    });
    svg.addEventListener('wheel', function (ev) {
      ev.preventDefault();
      var p = pontoMapa(svg, ev);
      zoom(el, ev.deltaY < 0 ? 1.25 : 0.8, p[0], p[1]);
    }, { passive: false });
    var arr = null;
    svg.addEventListener('pointerdown', function (ev) { arr = { x: ev.clientX, y: ev.clientY, v: est.view, mov: false }; svg.setPointerCapture(ev.pointerId); });
    svg.addEventListener('pointermove', function (ev) {
      if (!arr) return;
      var dx = ev.clientX - arr.x, dy = ev.clientY - arr.y;
      if (!arr.mov && Math.abs(dx) + Math.abs(dy) < 4) return;
      arr.mov = true;
      var esc = pontoMapa(svg, ev)[2];
      est.view = { x: arr.v.x - dx * esc, y: arr.v.y - dy * esc, w: arr.v.w };
      var v = est.view;
      svg.setAttribute('viewBox', v.x + ' ' + v.y + ' ' + v.w + ' ' + (v.w * B.altura / B.largura));
    });
    svg.addEventListener('pointerup', function (ev) {
      var foi = arr && arr.mov; arr = null;
      if (foi) { desenharPontos(el); return; }
      var gEl = ev.target.closest && ev.target.closest('.mp-pt');
      if (gEl) {
        var g = est.grupos[Number(gEl.dataset.g)];
        if (g.cidades.length > 1) { zoom(el, 2.6, g.x, g.y); return; } // grupo: aproxima para separar
        est.sel = g.cidades[0].ibge;
        el.querySelector('.mp-det').innerHTML = detalheHtml(d, ctx.util);
        ligarDetalhe(el, ctx);
        desenharPontos(el);
        return;
      }
      var uf = ev.target.dataset && ev.target.dataset.uf;
      if (uf) { est.f.uf = est.f.uf === uf ? '' : uf; est.f.cidade = ''; consultar(el, ctx, true); }
    });
  }

  function ligarDetalhe(el, ctx) {
    var bf = el.querySelector('[data-acao="fechar"]');
    if (bf) bf.addEventListener('click', function () { est.sel = null; el.querySelector('.mp-det').innerHTML = detalheHtml(est.dados, ctx.util); ligarDetalhe(el, ctx); desenharPontos(el); });
    el.querySelectorAll('.mp-det [data-cid]').forEach(function (b) {
      b.addEventListener('click', function () {
        est.sel = Number(b.dataset.cid);
        var c = (est.dados.cidades || []).filter(function (x) { return x.ibge === est.sel; })[0];
        el.querySelector('.mp-det').innerHTML = detalheHtml(est.dados, ctx.util);
        ligarDetalhe(el, ctx);
        if (c) centrarCidade(el, c);
      });
    });
  }

  Painel.registrarModulo({ id: 'mapa', nome: 'Mapa de Vendas', icone: '🗺️', simbolo: 'mapa', descricao: 'Onde estão os pedidos e os clientes do site, por cidade e estado.', periodos: null, render: render });
})();

/* ---- estoque ---- */
/* ESTOQUE · Inventário (Fase 3). Central (prévia + iniciar + lista) e tela de contagem.
   Leitura: leitor USB/Bluetooth (age como teclado: código + Enter), digitação, câmera (BarcodeDetector do navegador:
   Android/Chrome) e arquivo .txt (um código por linha, ou "código;quantidade"). O aparelho resolve o código na hora
   (correspondência EXATA, igual ao servidor), guarda cada leitura com um uid e envia em lotes — sem internet, fica na
   fila e vai depois; reenviar não duplica. Contagem CEGA: nunca mostra o saldo esperado de cada produto. */
(function () {
  var LS_ATIVO = 'painel_est_inv_ativo';
  var S = { ativo: null, previa: null, form: { tipo: 'marca', loja: 'registro', marca: '', categoria: '', selecao: '' }, msg: '', enviando: false, timer: null };
  var ls = { get: function (k, p) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : p; } catch (e) { return p; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* cheio/sem storage: segue na memória */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* nada */ } } };
  var uid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); };
  var LOJAS = [['registro', 'Joá Registro'], ['itanhaem', 'Joá Itanhaém'], ['sneakers', 'Joá Sneakers']];
  var TIPOS = [['marca', 'Por marca'], ['categoria', 'Por categoria'], ['geral', 'Geral (todos os produtos)'], ['selecao', 'Seleção de produtos']];

  // ---------- som e resolução de código (mesma regra do servidor) ----------
  var audio = null;
  function bip(ok) {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      var o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = ok ? 1250 : 220; o.type = ok ? 'sine' : 'square';
      g.gain.value = 0.08; o.connect(g); g.connect(audio.destination);
      o.start(); o.stop(audio.currentTime + (ok ? 0.09 : 0.35));
    } catch (e) { /* sem áudio */ }
    if (!ok && navigator.vibrate) navigator.vibrate(250);
  }
  function indice(prods) {
    var I = { gtin: {}, sku: {}, sem: {}, ch: {} };
    var add = function (m, k, c) { if (!k) return; (m[k] = m[k] || []); if (m[k].indexOf(c) < 0) m[k].push(c); };
    prods.forEach(function (p) {
      var o = { chave: p[0], sku: p[1], gtin: p[2], desc: p[3], vari: p[4], esc: p[5] === 1 };
      I.ch[o.chave] = o;
      add(I.gtin, String(o.gtin || '').replace(/\D/g, ''), o.chave);
      add(I.sku, String(o.sku || '').trim().toUpperCase(), o.chave);
      add(I.sem, String(o.sku || '').toUpperCase().replace(/\s+/g, ''), o.chave);
    });
    return I;
  }
  function resolver(I, codigo) {
    var c = String(codigo || '').trim(), d = c.replace(/\D/g, '');
    var t = function (m, k, por) { var l = k && m[k]; return l && l.length ? { status: l.length === 1 ? 'ok' : 'ambiguo', por: por, chaves: l } : null; };
    return (/^\d{8,14}$/.test(c) && t(I.gtin, d, 'GTIN')) || t(I.sku, c.toUpperCase(), 'SKU') || t(I.sem, c.toUpperCase().replace(/\s+/g, ''), 'SKU') ||
      (/^\d+$/.test(c) && t(I.gtin, d, 'GTIN')) || { status: 'nao_encontrado', por: /^\d{8,14}$/.test(c) ? 'GTIN e SKU' : 'SKU', chaves: [] };
  }

  // ---------- estado local do inventário ativo ----------
  function chaveLocal(id) { return 'painel_est_inv_' + id; }
  function salvarLocal() { var a = S.ativo; if (a) ls.set(chaveLocal(a.inv.id), { pend: a.pend, contLocal: a.contLocal, ult: a.ult.slice(0, 40) }); }
  function contados() {
    var a = S.ativo, c = {}, k;
    for (k in a.contServ) c[k] = a.contServ[k];
    for (k in a.contLocal) c[k] = (c[k] || 0) + a.contLocal[k];
    return c;
  }

  /** Registra uma leitura no aparelho (fila) e dá o retorno na hora. */
  function registrar(l, ctx) {
    var a = S.ativo;
    l.uid = uid(); l.quando = new Date().toISOString();
    a.pend.push(l);
    var p = l.chave ? a.I.ch[l.chave] : null;
    var st = !p ? 'nao_encontrado' : p.esc ? 'ok' : 'fora_escopo';
    if (st === 'ok') a.contLocal[l.chave] = (a.contLocal[l.chave] || 0) + l.qtd;
    a.ult.unshift({ codigo: l.codigo, chave: l.chave, desc: p ? p.desc + (p.vari ? ' · ' + p.vari : '') : '', qtd: l.qtd, st: st, tipo: l.tipo, origem: l.origem, quando: l.quando });
    a.ult = a.ult.slice(0, 40);
    salvarLocal();
    agendarEnvio(ctx);
    return st;
  }

  function agendarEnvio(ctx, ja) {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () { enviar(ctx); }, ja ? 0 : 2500);
  }

  function enviar(ctx) {
    var a = S.ativo;
    if (!a || S.enviando || !a.pend.length) return;
    S.enviando = true;
    var lote = a.pend.slice(0, 300);
    ctx.acao('inventarioRegistrar', { id: a.inv.id, leituras: lote }).then(function (r) {
      S.enviando = false;
      var ids = {}; lote.forEach(function (l) { ids[l.uid] = true; });
      a.pend = a.pend.filter(function (l) { return !ids[l.uid]; });
      // o que foi aceito passa a contar pelo servidor; o local fica só com o que ainda está na fila
      return ctx.acao('inventarioEstado', { id: a.inv.id }).then(function (e) {
        a.contServ = e.contagem || {}; a.resumo = e.resumo; a.inv = e.inv;
        a.contLocal = {};
        a.pend.forEach(function (l) { var p = l.chave && a.I.ch[l.chave]; if (p && p.esc) a.contLocal[l.chave] = (a.contLocal[l.chave] || 0) + l.qtd; });
        a.erroEnvio = r && r.recusadas ? r.recusadas + ' leitura(s) recusada(s) pelo servidor' : '';
        salvarLocal(); atualizarContagem(); if (a.pend.length) agendarEnvio(ctx);
      });
    }).catch(function (e) {
      S.enviando = false;
      a.erroEnvio = e.message === 'inventario_fechado' ? 'inventário já finalizado: as leituras pendentes não entram' : 'sem conexão: as leituras ficam guardadas neste aparelho e vão depois';
      atualizarContagem(); setTimeout(function () { agendarEnvio(ctx); }, 8000);
    });
  }

  // ---------- central ----------
  function montar(el, d, ctx) {
    S.el = el; S.ctx = ctx; S.d = d;
    var ativoId = ls.get(LS_ATIVO, null);
    if (S.ativo) return telaContagem();
    if (ativoId && (d.inventarios || []).some(function (x) { return x.id === ativoId && x.status === 'contando'; })) return abrir(ativoId);
    central();
  }

  function central() {
    var d = S.d, u = S.ctx.util, esc = u.esc, num = u.num, f = S.form, op = d.opcoes || { marcas: [], categorias: [] };
    var sel = function (id, lista, atual) {
      return '<select class="campo" data-if="' + id + '">' + lista.map(function (x) { var v = typeof x === 'string' ? [x, x] : x; return '<option value="' + esc(v[0]) + '"' + (v[0] === atual ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select>';
    };
    var h = '<section class="card iv-novo"><h2>Novo inventário</h2><div class="iv-form">' +
      '<label class="mp-f"><span>Tipo</span>' + sel('tipo', TIPOS, f.tipo) + '</label>' +
      '<label class="mp-f"><span>Loja</span>' + sel('loja', LOJAS, f.loja) + '</label>' +
      (f.tipo === 'marca' ? '<label class="mp-f"><span>Marca</span>' + sel('marca', [['', 'Escolha…']].concat(op.marcas.map(function (m) { return [m, m]; })), f.marca) + '</label>' : '') +
      (f.tipo === 'categoria' ? '<label class="mp-f"><span>Categoria</span>' + sel('categoria', [['', 'Escolha…']].concat(op.categorias.map(function (m) { return [m, m]; })), f.categoria) + '</label>' : '') +
      '</div>' + (f.tipo === 'selecao' ? '<label class="mp-f iv-sel"><span>SKUs ou GTINs (um por linha, ou separados por vírgula)</span><textarea class="campo" rows="4" data-if="selecao">' + esc(f.selecao) + '</textarea></label>' : '') +
      '<div class="iv-bts"><button type="button" class="btn-s" data-iacao="previa">Ver prévia</button>' +
      '<button type="button" class="btn-p" data-iacao="iniciar"' + (S.previa && !S.previa.erro ? '' : ' disabled') + '>Iniciar inventário</button></div>';
    var p = S.previa;
    if (p && p.erro) h += '<div class="aviso">' + ({ escopo_vazio: 'Escolha a marca, a categoria ou os produtos do inventário.', dados_invalidos: 'Confira o tipo e a loja.' }[p.erro] || 'Não foi possível calcular a prévia.') + '</div>';
    else if (p) {
      h += '<div class="iv-prev"><div><span>SKUs no inventário</span><b>' + num(p.skusEscopo) + '</b></div><div><span>Com saldo na loja</span><b>' + num(p.skusComSaldo) + '</b></div>' +
        '<div><span>Unidades esperadas</span><b>' + num(p.unidadesEsperadas) + '</b></div><div><span>Negativos no escopo</span><b>' + num(p.negativos) + '</b></div></div>';
      var av = [];
      if (f.tipo === 'marca') av.push(num(p.semMarca) + ' produtos <b>sem marca</b> não entram em inventário por marca (veja Qualidade do Cadastro).');
      if (f.tipo === 'categoria') av.push(num(p.semCategoria) + ' produtos <b>sem categoria</b> não entram em inventário por categoria.');
      if (f.tipo === 'geral' && p.naoIdentificaveis) av.push(num(p.naoIdentificaveis) + ' produtos sem SKU e sem GTIN ficam de fora (não dá para bipar).');
      if (p.semSaldoAinda) av.push(num(p.semSaldoAinda) + ' produtos do escopo ainda sem saldo do Tiny: entram com esperado 0 até a próxima atualização.');
      if (p.selecaoNaoAchados && p.selecaoNaoAchados.length) av.push('Não encontrados: ' + esc(p.selecaoNaoAchados.slice(0, 20).join(', ')));
      if (p.selecaoAmbiguos && p.selecaoAmbiguos.length) av.push('Código de mais de um produto (use o SKU): ' + esc(p.selecaoAmbiguos.slice(0, 20).join(', ')));
      av.push('Saldo esperado = foto da atualização de ' + (p.baseSaldoEm ? new Date(p.baseSaldoEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—') + ' (8h e 13h). Vendas depois disso aparecem como diferença.');
      h += '<div class="aviso iv-av">' + av.map(function (x) { return '<div>• ' + x + '</div>'; }).join('') + '</div>';
    }
    h += '<div class="msg" id="iv-msg">' + esc(S.msg) + '</div></section>';
    S.msg = ''; // aviso aparece uma vez
    var lista = d.inventarios || [];
    h += '<section class="card"><h2>Inventários</h2>' + (lista.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Nº</th><th>Tipo</th><th>Loja</th><th>Status</th><th>Operador</th><th>Início</th><th class="r">Contado</th><th class="r">Esperado</th><th></th></tr></thead><tbody>' +
      lista.map(function (x) {
        return '<tr><td><b>' + esc(x.id) + '</b></td><td>' + esc(x.tipoNome) + (x.marca ? ' · ' + esc(x.marca) : '') + (x.categoria ? ' · ' + esc(x.categoria) : '') + (x.selecaoQtd ? ' · ' + x.selecaoQtd + ' SKUs' : '') + '</td><td>' + esc(x.lojaNome) +
          '</td><td><span class="ac-st iv-' + x.status + '">' + ({ contando: 'Contando', finalizado: 'Finalizado', aprovado: 'Aprovado', cancelado: 'Cancelado' }[x.status] || x.status) + '</span></td><td>' + esc(String(x.operador).split('@')[0]) +
          '</td><td>' + (x.inicio ? new Date(x.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '') + '</td><td class="r">' + num(x.contadoUnid) + '</td><td class="r">' + num(x.esperadoUnid) +
          '</td><td class="r iv-acoes">' + (x.status === 'contando' ? '<button type="button" class="btn-p ac-bt" data-abrir="' + esc(x.id) + '">Continuar</button>' : x.status === 'cancelado' ? '<span class="var">' + esc(x.obs || '') + '</span>' : '') +
          (x.status !== 'cancelado' ? '<button type="button" class="btn-s ac-bt" data-div="' + esc(x.id) + '">' + (x.status === 'contando' ? 'Parcial' : 'Ver divergências') + '</button>' : '') +
          (S.ctx.admin ? '<button type="button" class="btn-s ac-bt iv-del" data-excluir="' + esc(x.id) + '" title="Excluir inventário">🗑</button>' : '') + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum inventário ainda.</div>') + '</section>';
    S.el.innerHTML = h;
    ligarCentral();
  }

  function ligarCentral() {
    var el = S.el, ctx = S.ctx;
    el.querySelectorAll('[data-if]').forEach(function (c) {
      c.addEventListener(c.tagName === 'TEXTAREA' ? 'input' : 'change', function () {
        S.form[c.dataset.if] = c.value; S.previa = null;
        if (c.tagName !== 'TEXTAREA') central();
      });
    });
    var bp = el.querySelector('[data-iacao="previa"]');
    bp.addEventListener('click', function () {
      bp.disabled = true; S.msg = 'Calculando…'; el.querySelector('#iv-msg').textContent = S.msg;
      ctx.acao('inventarioPrevia', S.form).then(function (r) { S.previa = r; S.msg = ''; central(); })
        .catch(function (e) { S.previa = { erro: e.message }; S.msg = ''; central(); });
    });
    var bi = el.querySelector('[data-iacao="iniciar"]');
    bi.addEventListener('click', function () {
      if (!confirm('Iniciar o inventário agora? O saldo esperado fica congelado neste momento.')) return;
      bi.disabled = true; el.querySelector('#iv-msg').textContent = 'Iniciando…';
      ctx.acao('inventarioIniciar', S.form).then(function (r) { S.previa = null; ctx.recarregar(); abrir(r.id); })
        .catch(function () { bi.disabled = false; el.querySelector('#iv-msg').textContent = 'Não foi possível iniciar.'; });
    });
    el.querySelectorAll('[data-abrir]').forEach(function (b) { b.addEventListener('click', function () { abrir(b.dataset.abrir); }); });
    el.querySelectorAll('[data-div]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (window.EstoqueDiv) window.EstoqueDiv.ir(b.dataset.div);
        var aba = document.querySelector('.es-sub [data-s="divergencias"]'); if (aba) aba.click();
      });
    });
    el.querySelectorAll('[data-excluir]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.dataset.excluir;
        var motivo = prompt('Excluir o inventário ' + id + '?\nIsso apaga a contagem e as leituras dele (não dá para desfazer; fica registrado na auditoria).\n\nMotivo da exclusão:');
        if (motivo === null) return;
        if (!motivo.trim()) { alert('O motivo é obrigatório.'); return; }
        b.disabled = true;
        ctx.acao('inventarioExcluir', { id: id, motivo: motivo.trim() }).then(function () {
          ls.del(chaveLocal(id)); if (ls.get(LS_ATIVO, null) === id) ls.del(LS_ATIVO);
          S.msg = 'Inventário ' + id + ' excluído.'; ctx.recarregar();
        }).catch(function () { b.disabled = false; alert('Não foi possível excluir agora.'); });
      });
    });
  }

  // ---------- contagem ----------
  function abrir(id) {
    var ctx = S.ctx;
    S.el.innerHTML = '<div class="card empty">Abrindo o inventário ' + ctx.util.esc(id) + '… (baixando o catálogo para ler os códigos)</div>';
    Promise.all([ctx.acao('inventarioCatalogo', { id: id }), ctx.acao('inventarioEstado', { id: id })]).then(function (r) {
      var loc = ls.get(chaveLocal(id), { pend: [], contLocal: {}, ult: [] });
      S.ativo = { inv: r[1].inv, I: indice(r[0].produtos), contServ: r[1].contagem || {}, resumo: r[1].resumo, pend: loc.pend || [], contLocal: loc.contLocal || {},
        ult: loc.ult && loc.ult.length ? loc.ult : (r[1].resumo.ultimas || []).map(function (x) { return { codigo: x.codigo, chave: x.chave, desc: '', qtd: x.qtd, st: x.status, tipo: x.tipo, origem: x.origem, quando: x.quando }; }),
        modo: null, ultimo: null };
      ls.set(LS_ATIVO, id);
      telaContagem();
      if (S.ativo.pend.length) agendarEnvio(ctx, true);
    }).catch(function () { S.el.innerHTML = '<div class="card empty">Não foi possível abrir o inventário. <button type="button" class="btn-s" data-volta="1">Voltar</button></div>';
      S.el.querySelector('[data-volta]').addEventListener('click', function () { ls.del(LS_ATIVO); central(); }); });
  }

  function telaContagem() {
    var a = S.ativo, u = S.ctx.util, esc = u.esc, inv = a.inv;
    var temCamera = 'BarcodeDetector' in window && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
    S.el.innerHTML = '<section class="card iv-top"><div><h2>' + esc(inv.id) + ' · ' + esc(inv.tipoNome) + (inv.marca ? ' · ' + esc(inv.marca) : '') + (inv.categoria ? ' · ' + esc(inv.categoria) : '') + '</h2>' +
      '<div class="var">' + esc(inv.lojaNome) + ' · contagem cega (o saldo de cada produto não aparece) · iniciado por ' + esc(String(inv.operador).split('@')[0]) + '</div></div>' +
      '<div class="iv-top-bts"><button type="button" class="btn-s" data-c="voltar">Voltar</button><button type="button" class="btn-p iv-fin" data-c="finalizar">Finalizar inventário</button></div></section>' +
      '<section class="iv-kpis" id="iv-kpis"></section>' +
      '<section class="card iv-leitor"><label class="iv-cod"><span>Bipe com o leitor ou digite o SKU/GTIN e aperte Enter</span>' +
      '<input class="campo" id="iv-in" autocomplete="off" autocapitalize="characters" spellcheck="false" inputmode="text" placeholder="Código…"></label>' +
      '<div class="iv-ferr">' + (temCamera ? '<button type="button" class="btn-s" data-c="camera">📷 Câmera</button>' : '<span class="var">Câmera: use no Android/Chrome (no iPhone, use leitor, digitação ou arquivo .txt)</span>') +
      '<label class="btn-s iv-arq">📄 Importar .txt<input type="file" accept=".txt,.csv,text/plain" data-c="arquivo" hidden></label>' +
      '<button type="button" class="btn-s" data-c="correcao">✎ Correção manual</button></div>' +
      '<div id="iv-ret" class="iv-ret"></div><div id="iv-extra"></div></section>' +
      '<section class="card"><div class="iv-ult-top"><h2>Últimas leituras</h2><span id="iv-fila" class="var"></span></div><div id="iv-ult"></div></section>';
    ligarContagem();
    atualizarContagem();
    focar();
  }

  function focar() { var i = S.el && S.el.querySelector('#iv-in'); if (i && !S.ativo.modo) i.focus(); }

  function atualizarContagem() {
    var a = S.ativo, el = S.el; if (!a || !el.querySelector('#iv-kpis')) return;
    var u = S.ctx.util, num = u.num, esc = u.esc, c = contados(), unid = 0, skus = 0;
    Object.keys(c).forEach(function (k) { if (c[k] > 0) { unid += c[k]; skus++; } });
    var pct = a.inv.esperadoUnid ? Math.min(999, unid / a.inv.esperadoUnid * 100) : 0;
    var k = function (lbl, v, sub) { return '<div class="card"><div class="lbl">' + lbl + '</div><div class="mid">' + v + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    el.querySelector('#iv-kpis').innerHTML = k('SKUs localizados', num(skus), 'de ' + num(a.inv.esperadoSkus) + ' com saldo esperado') + k('Unidades contadas', num(unid), 'de ' + num(a.inv.esperadoUnid) + ' esperadas') +
      k('Progresso', pct.toFixed(0) + '%', '<span class="iv-bar"><i style="width:' + Math.min(100, pct).toFixed(1) + '%"></i></span>') +
      k('Fora do escopo · não encontrados', num(a.ult.filter(function (x) { return x.st === 'fora_escopo'; }).length) + ' · ' + num(a.ult.filter(function (x) { return x.st === 'nao_encontrado'; }).length), 'nas últimas leituras');
    var fila = el.querySelector('#iv-fila');
    fila.innerHTML = a.pend.length ? '⏳ ' + num(a.pend.length) + ' leitura(s) aguardando envio' + (a.erroEnvio ? ' · <b class="es-ruim">' + esc(a.erroEnvio) + '</b>' : '') : '✓ tudo enviado';
    el.querySelector('#iv-ult').innerHTML = a.ult.length ? '<div class="iv-ult">' + a.ult.slice(0, 15).map(function (x) {
      return '<div class="iv-li iv-' + x.st + '"><span class="iv-qt">' + (x.qtd > 0 ? '+' : '') + x.qtd + '</span><div><b>' + esc(x.codigo || x.chave) + '</b> <small>' +
        ({ ok: 'ok', fora_escopo: 'fora do escopo', nao_encontrado: 'não encontrado' }[x.st] || x.st) + ' · ' + esc(x.tipo === 'correcao' ? 'correção' : x.origem || x.tipo) + '</small><div class="var">' + esc(x.desc || '') + '</div></div></div>';
    }).join('') + '</div>' : '<div class="empty">Nenhuma leitura ainda.</div>';
  }

  function retorno(st, codigo, chave, extra) {
    var a = S.ativo, u = S.ctx.util, esc = u.esc, p = chave ? a.I.ch[chave] : null, r = S.el.querySelector('#iv-ret');
    var txt = { ok: '✓ Contado', fora_escopo: '⚠ Produto fora do escopo deste inventário (registrado à parte)', nao_encontrado: '✕ Código não encontrado', ambiguo: '? Este código pertence a mais de um produto' }[st];
    r.className = 'iv-ret iv-' + st;
    r.innerHTML = '<b>' + txt + '</b><div>' + esc(codigo) + (p ? ' · ' + esc(p.desc) + (p.vari ? ' · ' + esc(p.vari) : '') : '') + (extra ? ' · ' + extra : '') + '</div>';
    bip(st === 'ok');
  }

  /** Processa um código lido (leitor, digitação, câmera). */
  function processar(codigo, origem) {
    var a = S.ativo, ctx = S.ctx;
    codigo = String(codigo || '').trim();
    if (!codigo) return;
    var agora = Date.now();
    if (a.ultimo && a.ultimo.c === codigo && agora - a.ultimo.t < (origem === 'camera' ? 1500 : 120)) return; // leitura dupla acidental
    a.ultimo = { c: codigo, t: agora };
    var r = resolver(a.I, codigo);
    if (r.status === 'ok') {
      var st = registrar({ codigo: codigo, chave: r.chaves[0], qtd: 1, tipo: 'leitura', origem: origem }, ctx);
      retorno(st, codigo, r.chaves[0], 'lido como ' + r.por);
    } else if (r.status === 'ambiguo') {
      retorno('ambiguo', codigo, null, 'escolha abaixo qual é');
      escolher(codigo, r.chaves, origem);
    } else {
      registrar({ codigo: codigo, chave: '', qtd: 1, tipo: 'leitura', origem: origem }, ctx);
      retorno('nao_encontrado', codigo, null, 'procurado como ' + r.por + ' · <button type="button" class="lnk" data-c="buscar">buscar manualmente</button>');
      var b = S.el.querySelector('#iv-ret [data-c="buscar"]');
      if (b) b.addEventListener('click', function () { busca(codigo); });
    }
    atualizarContagem();
  }

  function escolher(codigo, chaves, origem, qtd) {
    var a = S.ativo, esc = S.ctx.util.esc, ex = S.el.querySelector('#iv-extra');
    a.modo = 'escolha';
    ex.innerHTML = '<div class="iv-box"><b>Qual destes produtos é o ' + esc(codigo) + '?</b>' + chaves.map(function (c) {
      var p = a.I.ch[c]; return '<button type="button" class="es-q-i" data-esc="' + esc(c) + '"><span>' + esc(p.sku) + ' · ' + esc(p.desc) + (p.vari ? ' · ' + esc(p.vari) : '') + '</span></button>';
    }).join('') + '<button type="button" class="btn-s" data-esc="">Cancelar (não contar)</button></div>';
    ex.querySelectorAll('[data-esc]').forEach(function (b) {
      b.addEventListener('click', function () {
        a.modo = null; ex.innerHTML = '';
        if (b.dataset.esc) { var st = registrar({ codigo: codigo, chave: b.dataset.esc, qtd: qtd || 1, tipo: 'escolha', origem: origem }, S.ctx); retorno(st, codigo, b.dataset.esc, 'escolhido'); atualizarContagem(); }
        focar();
      });
    });
  }

  function busca(codigo) {
    var a = S.ativo, esc = S.ctx.util.esc, ex = S.el.querySelector('#iv-extra');
    a.modo = 'busca';
    ex.innerHTML = '<div class="iv-box"><b>Buscar o produto do código ' + esc(codigo) + '</b><input class="campo" id="iv-bq" placeholder="Descrição ou SKU"><div id="iv-br"></div><button type="button" class="btn-s" data-x="1">Fechar</button></div>';
    var q = ex.querySelector('#iv-bq'), res = ex.querySelector('#iv-br');
    q.focus();
    q.addEventListener('input', function () {
      var t = q.value.trim().toLowerCase();
      if (t.length < 3) { res.innerHTML = ''; return; }
      var achou = Object.keys(a.I.ch).map(function (k) { return a.I.ch[k]; }).filter(function (p) { return (p.desc + ' ' + p.sku).toLowerCase().indexOf(t) >= 0; }).slice(0, 12);
      res.innerHTML = achou.map(function (p) { return '<button type="button" class="es-q-i" data-esc="' + esc(p.chave) + '"><span>' + esc(p.sku) + ' · ' + esc(p.desc) + (p.vari ? ' · ' + esc(p.vari) : '') + '</span></button>'; }).join('') || '<div class="var">Nada encontrado.</div>';
      res.querySelectorAll('[data-esc]').forEach(function (b) {
        b.addEventListener('click', function () {
          a.modo = null; ex.innerHTML = '';
          var st = registrar({ codigo: codigo, chave: b.dataset.esc, qtd: 1, tipo: 'manual', origem: 'busca' }, S.ctx);
          retorno(st, codigo, b.dataset.esc, 'associado manualmente (fica na auditoria)'); atualizarContagem(); focar();
        });
      });
    });
    ex.querySelector('[data-x]').addEventListener('click', function () { a.modo = null; ex.innerHTML = ''; focar(); });
  }

  function correcao() {
    var a = S.ativo, u = S.ctx.util, esc = u.esc, ex = S.el.querySelector('#iv-extra'), c = contados();
    a.modo = 'correcao';
    var lista = Object.keys(c).filter(function (k) { return c[k] !== 0; });
    ex.innerHTML = '<div class="iv-box"><b>Correção manual da contagem</b><div class="var">Escolha o produto contado, informe a quantidade certa e o motivo (fica registrado com seu nome e horário).</div>' +
      '<select class="campo" id="iv-cp"><option value="">Produto…</option>' + lista.map(function (k) { var p = a.I.ch[k]; return '<option value="' + esc(k) + '">' + esc(p ? p.sku + ' · ' + p.desc : k) + ' — contado: ' + c[k] + '</option>'; }).join('') + '</select>' +
      '<div class="iv-corr"><input class="campo" id="iv-cq" type="number" min="0" step="1" placeholder="Quantidade certa"><input class="campo" id="iv-cj" placeholder="Motivo (obrigatório)"></div>' +
      '<div class="iv-bts"><button type="button" class="btn-p" data-x="ok">Salvar correção</button><button type="button" class="btn-s" data-x="nao">Cancelar</button></div><div class="msg" id="iv-cm"></div></div>';
    ex.querySelector('[data-x="nao"]').addEventListener('click', function () { a.modo = null; ex.innerHTML = ''; focar(); });
    ex.querySelector('[data-x="ok"]').addEventListener('click', function () {
      var k = ex.querySelector('#iv-cp').value, q = ex.querySelector('#iv-cq').value, j = ex.querySelector('#iv-cj').value.trim(), m = ex.querySelector('#iv-cm');
      if (!k || q === '' || !(Number(q) >= 0)) { m.textContent = 'Escolha o produto e a quantidade.'; return; }
      if (!j) { m.textContent = 'O motivo é obrigatório.'; return; }
      var delta = Math.trunc(Number(q)) - (contados()[k] || 0);
      if (!delta) { m.textContent = 'A quantidade já é essa.'; return; }
      registrar({ codigo: '', chave: k, qtd: delta, tipo: 'correcao', origem: 'correcao', justificativa: j }, S.ctx);
      a.modo = null; ex.innerHTML = ''; retorno('ok', a.I.ch[k] ? a.I.ch[k].sku : k, k, 'corrigido para ' + q); atualizarContagem(); focar();
    });
  }

  /** Arquivo .txt: um código por linha ou "código;quantidade" (também , ou tab). Ambíguos vão para escolha um a um. */
  function arquivo(file) {
    var a = S.ativo, ctx = S.ctx, num = ctx.util.num, rd = new FileReader();
    rd.onload = function () {
      var linhas = String(rd.result || '').split(/\r?\n/), soma = {};
      linhas.forEach(function (l) {
        l = l.trim(); if (!l) return;
        var m = l.match(/^(.+?)[;,\t ]+(-?\d+)$/);
        var cod = (m ? m[1] : l).trim(), q = m ? Number(m[2]) : 1;
        if (q > 0) soma[cod] = (soma[cod] || 0) + q;
      });
      var ok = 0, unid = 0, nao = [], amb = [];
      Object.keys(soma).forEach(function (cod) {
        var r = resolver(a.I, cod);
        if (r.status === 'ok') { registrar({ codigo: cod, chave: r.chaves[0], qtd: soma[cod], tipo: 'arquivo', origem: 'arquivo' }, ctx); ok++; unid += soma[cod]; }
        else if (r.status === 'ambiguo') amb.push({ cod: cod, q: soma[cod], chaves: r.chaves });
        else { registrar({ codigo: cod, chave: '', qtd: soma[cod], tipo: 'arquivo', origem: 'arquivo' }, ctx); nao.push(cod + ' (' + soma[cod] + ')'); }
      });
      var ret = S.el.querySelector('#iv-ret');
      ret.className = 'iv-ret ' + (nao.length || amb.length ? 'iv-fora_escopo' : 'iv-ok');
      ret.innerHTML = '<b>Arquivo ' + ctx.util.esc(file.name) + ': ' + num(ok) + ' códigos · ' + num(unid) + ' unidades lançadas</b>' +
        (nao.length ? '<div>Não encontrados (registrados à parte): ' + ctx.util.esc(nao.slice(0, 30).join(', ')) + (nao.length > 30 ? '…' : '') + '</div>' : '') +
        (amb.length ? '<div>' + amb.length + ' código(s) de mais de um produto: escolha abaixo.</div>' : '');
      bip(!nao.length && !amb.length);
      atualizarContagem();
      var proximo = function () {
        var x = amb.shift(); if (!x) return;
        escolher(x.cod, x.chaves, 'arquivo', x.q);
        S.el.querySelectorAll('#iv-extra [data-esc]').forEach(function (b) { b.addEventListener('click', function () { setTimeout(proximo, 50); }); });
      };
      proximo();
    };
    rd.readAsText(file, 'utf-8');
  }

  /** Câmera (BarcodeDetector): lê e conta; o mesmo código só conta de novo depois de 1,5 s. */
  function camera() {
    var a = S.ativo, ex = S.el.querySelector('#iv-extra');
    a.modo = 'camera';
    ex.innerHTML = '<div class="iv-box iv-cam"><video id="iv-v" playsinline muted></video><div class="var">Aponte para o código de barras. Cada produto: afaste e aproxime para contar de novo.</div>' +
      '<button type="button" class="btn-s" data-x="1">Fechar câmera</button></div>';
    var v = ex.querySelector('#iv-v'), parar = false, stream = null;
    var fechar = function () { parar = true; if (stream) stream.getTracks().forEach(function (t) { t.stop(); }); a.modo = null; ex.innerHTML = ''; focar(); };
    ex.querySelector('[data-x]').addEventListener('click', fechar);
    var det;
    try { det = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] }); }
    catch (e) { ex.innerHTML = '<div class="aviso">Este navegador não lê código pela câmera. Use o leitor, a digitação ou o arquivo .txt.</div>'; a.modo = null; return; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } }).then(function (s) {
      stream = s; v.srcObject = s; v.play();
      var loop = function () {
        if (parar) return;
        det.detect(v).then(function (cs) { if (cs && cs[0]) processar(cs[0].rawValue, 'camera'); }).catch(function () { /* quadro sem código */ })
          .then(function () { setTimeout(loop, 250); });
      };
      loop();
    }).catch(function () { ex.innerHTML = '<div class="aviso">Sem permissão para usar a câmera. Libere nas configurações do navegador.</div>'; a.modo = null; });
    S.fecharCamera = fechar;
  }

  function ligarContagem() {
    var el = S.el, ctx = S.ctx, a = S.ativo;
    var inp = el.querySelector('#iv-in');
    inp.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var v = inp.value; inp.value = ''; processar(v, /^\d{8,14}$/.test(v.trim()) ? 'leitor' : 'digitado'); }
    });
    el.addEventListener('click', function (e) { if (!a.modo && e.target.tagName !== 'INPUT' && e.target.tagName !== 'SELECT' && !e.target.closest('button,label,textarea')) focar(); });
    el.querySelector('[data-c="voltar"]').addEventListener('click', function () { if (S.fecharCamera) S.fecharCamera(); S.ativo = null; ls.del(LS_ATIVO); central(); });
    el.querySelector('[data-c="correcao"]').addEventListener('click', correcao);
    var cam = el.querySelector('[data-c="camera"]'); if (cam) cam.addEventListener('click', camera);
    el.querySelector('[data-c="arquivo"]').addEventListener('change', function (e) { var f = e.target.files[0]; if (f) arquivo(f); e.target.value = ''; });
    el.querySelector('[data-c="finalizar"]').addEventListener('click', function () {
      if (a.pend.length) { alert('Ainda há ' + a.pend.length + ' leitura(s) aguardando envio. Aguarde o envio (ou a internet voltar) antes de finalizar.'); agendarEnvio(ctx, true); return; }
      if (!confirm('Finalizar o inventário ' + a.inv.id + '? Depois disso não dá para bipar mais. As divergências (faltantes e sobras) aparecem na Fase 4.')) return;
      ctx.acao('inventarioFinalizar', { id: a.inv.id }).then(function () { ls.del(chaveLocal(a.inv.id)); ls.del(LS_ATIVO); S.ativo = null; ctx.recarregar(); })
        .catch(function () { alert('Não foi possível finalizar agora. Tente de novo.'); });
    });
  }

  window.EstoqueInventario = { montar: montar, ocupado: function () { return !!S.ativo; }, _resolver: resolver, _indice: indice };
})();

/* ---- estoque ---- */
/* ESTOQUE · Divergências (Fase 4). Escolhe um inventário (finalizado ou ainda contando = parcial) e mostra conferidos,
   faltantes, sobras, fora do escopo e não identificados. Excel = CSV gerado no navegador; PDF = impressão (Salvar como PDF).
   Somente leitura: o ajuste no Tiny continua manual (lista de ajustes = Fase 5). */
(function () {
  var LS_ID = 'painel_est_div_id';
  var S = { id: null, f: { status: 'divergentes', busca: '', pagina: 1 }, r: null, carregando: false, seq: 0, timer: null };
  var ls = { get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem storage */ } } };
  var FILTROS = [['divergentes', 'Só divergentes'], ['faltante', 'Faltantes'], ['sobra', 'Sobras'], ['conferido', 'Conferidos'], ['todos', 'Todos']];
  var ST = { conferido: 'Conferido', faltante: 'Faltante', sobra: 'Sobra' };

  function montar(el, d, ctx) {
    S.el = el; S.ctx = ctx; S.d = d;
    var lista = (d.inventarios || []).filter(function (x) { return x.status === 'finalizado' || x.status === 'contando' || x.status === 'aprovado'; });
    if (!lista.length) { el.innerHTML = '<section class="card empty">Nenhum inventário finalizado ainda. Faça a contagem na aba Inventário e finalize; as divergências aparecem aqui.</section>'; return; }
    var pedido = ls.get(LS_ID);
    if (!S.id || !lista.some(function (x) { return x.id === S.id; })) {
      S.id = lista.some(function (x) { return x.id === pedido; }) ? pedido : (lista.filter(function (x) { return x.status === 'finalizado'; })[0] || lista[0]).id;
      S.r = null;
    }
    S.lista = lista;
    if (!S.r || S.r.inv.id !== S.id) { desenhar(); buscar(true); } else desenhar();
  }

  function buscar(ja) {
    clearTimeout(S.timer);
    S.timer = setTimeout(function () {
      var seq = ++S.seq; S.carregando = true; desenhar();
      S.ctx.acao('divergencias', Object.assign({ id: S.id }, S.f)).then(function (r) {
        if (seq !== S.seq) return; S.carregando = false; S.r = r; S.erro = ''; desenhar();
      }).catch(function () { if (seq !== S.seq) return; S.carregando = false; S.erro = 'Não foi possível calcular agora. Tente de novo.'; desenhar(); });
    }, ja ? 0 : 350);
  }

  function desenhar() {
    var u = S.ctx.util, esc = u.esc, num = u.num, r = S.r;
    var data = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
    var h = '<section class="card dv-top"><label class="mp-f"><span>Inventário</span><select class="campo" data-dv="inv">' + S.lista.map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === S.id ? ' selected' : '') + '>' + esc(x.id + ' · ' + x.tipoNome + (x.marca ? ' ' + x.marca : '') + (x.categoria ? ' ' + x.categoria : '') + ' · ' + x.lojaNome + (x.status === 'contando' ? ' (contando)' : x.status === 'aprovado' ? ' (aprovado)' : '')) + '</option>';
    }).join('') + '</select></label>' +
      '<div class="iv-bts"><button type="button" class="btn-s" data-dv="excel"' + (r ? '' : ' disabled') + '>⬇ Excel</button><button type="button" class="btn-s" data-dv="pdf"' + (r ? '' : ' disabled') + '>🖨 PDF</button></div></section>';
    if (S.erro) h += '<div class="aviso">' + esc(S.erro) + '</div>';
    if (!r) { S.el.innerHTML = h + '<section class="card empty">Calculando as divergências…</section>'; ligar(); return; }
    var s = r.resumo, inv = r.inv;
    if (S.aprovar) { S.el.innerHTML = h + aprovarHtml(); ligar(); ligarAprovar(); return; }
    if (s.parcial) h += '<div class="aviso">Inventário ainda em contagem: resultado <b>parcial</b> (o que não foi bipado ainda aparece como faltante).</div>';
    if (inv.status === 'finalizado') h += '<section class="card dv-apr"><div><b>Aguardando aprovação.</b> Confira as divergências; ao aprovar, sai a lista de ajustes para lançar à mão no Tiny (aba Ajustes p/ Tiny).</div>' +
      (S.ctx.admin ? '<div class="iv-bts"><button type="button" class="btn-p" data-dv="aprovar">Aprovar e gerar ajustes</button><button type="button" class="btn-s" data-dv="reabrir">Reabrir para recontagem</button></div>' : '<div class="var">Só um admin aprova.</div>') + '</section>';
    if (inv.status === 'aprovado') h += '<section class="card dv-apr dv-ok"><div><b>Aprovado</b> por ' + esc(String(inv.aprovadoPor).split('@')[0]) + ' em ' + data(inv.aprovadoEm) + (inv.obs ? ' · ' + esc(inv.obs) : '') + '. A lista de ajustes está na aba Ajustes p/ Tiny.</div>' +
      '<div class="iv-bts"><button type="button" class="btn-s" data-dv="veraj">Ver ajustes deste inventário</button></div></section>';
    h += '<div class="var es-at">Esperado = foto do saldo de ' + data(inv.baseSaldoEm) + ' (início ' + data(inv.inicio) + (inv.fim ? ', fim ' + data(inv.fim) : '') + '). ' +
      '"Mov. desde a foto" = saldo de hoje no Tiny − esperado: vendas e transferências depois da foto explicam parte das diferenças.</div>';
    var k = function (lbl, v, sub, cor) { return '<div class="card es-k" style="--k:' + cor + '"><div><div class="lbl">' + lbl + '</div><div class="mid">' + v + '</div>' + (sub ? '<div class="var">' + sub + '</div>' : '') + '</div></div>'; };
    var pct = function (x) { return x === null || x === undefined ? '—' : u.pct(x, 1); };
    h += '<section class="es-kpis">' + k('Acuracidade', pct(s.acuracidadeSkus), 'dos SKUs · ' + pct(s.acuracidadeUnid) + ' das unidades', 'var(--s2)') +
      k('Conferidos', num(s.conferidos), 'de ' + num(s.skus) + ' SKUs', '#2a9d5c') +
      k('Faltantes', num(s.faltantes) + ' SKUs', num(s.unidFaltantes) + ' un. · ' + u.brl(s.valorFaltante) + ' a custo', 'var(--bad)') +
      k('Sobras', num(s.sobras) + ' SKUs', num(s.unidSobras) + ' un. · ' + u.brl(s.valorSobra) + ' a custo', '#d9a400') +
      k('Fora do escopo', num(s.foraEscopoSkus) + ' SKUs', num(s.foraEscopoUnid) + ' un. bipadas', 'var(--s5)') +
      k('Não identificados', num(s.naoIdentificados) + ' códigos', num(s.naoIdentificadosUnid) + ' un. bipadas', 'var(--s4)') + '</section>';
    if (s.semCusto) h += '<div class="var">' + num(s.semCusto) + ' produtos com diferença estão sem preço de custo no cadastro (entram como R$ 0 no valor).</div>';
    // lista
    h += '<section class="card"><div class="dv-fil"><div class="dv-chips">' + FILTROS.map(function (x) {
      return '<button type="button" class="dv-chip' + (S.f.status === x[0] ? ' on' : '') + '" data-dvs="' + x[0] + '">' + x[1] + '</button>';
    }).join('') + '</div><input class="campo" data-dv="busca" placeholder="Buscar SKU, GTIN, descrição ou marca" value="' + esc(S.f.busca) + '"></div>' +
      (S.carregando ? '<div class="var">Atualizando…</div>' : '') +
      (r.linhas.length ? '<div class="tab-wrap"><table class="p-tab es-tab"><thead><tr><th>Produto</th><th>Marca</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Diferença</th><th class="r">Valor (custo)</th><th class="r">Saldo hoje</th><th class="r">Mov. desde a foto</th><th>Status</th></tr></thead><tbody>' +
        r.linhas.map(function (l) {
          var mv = l.movDesdeFoto;
          return '<tr><td><b>' + esc(l.sku) + '</b><small>' + esc(l.descricao) + (l.variacao ? ' · ' + esc(l.variacao) : '') + '</small></td><td>' + esc(l.marca) + '</td><td class="r">' + num(l.esperado) + '</td><td class="r">' + num(l.contado) +
            '</td><td class="r dv-' + l.status + '"><b>' + (l.diferenca > 0 ? '+' : '') + num(l.diferenca) + '</b></td><td class="r">' + (l.valor ? u.brl(l.valor) : '—') + '</td><td class="r">' + (l.atual === null ? '—' : num(l.atual)) +
            '</td><td class="r">' + (mv === null ? '—' : mv ? (mv > 0 ? '+' : '') + num(mv) : '0') + '</td><td><span class="ac-st dv-st-' + l.status + '">' + ST[l.status] + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nada neste filtro.</div>') +
      (r.paginas > 1 ? '<div class="es-pag"><button type="button" class="btn-s" data-pg="-1"' + (r.filtros.pagina <= 1 ? ' disabled' : '') + '>‹</button><span>Página ' + r.filtros.pagina + ' de ' + r.paginas + ' · ' + num(r.total) + ' produtos</span><button type="button" class="btn-s" data-pg="1"' + (r.filtros.pagina >= r.paginas ? ' disabled' : '') + '>›</button></div>' : '<div class="var">' + num(r.total) + ' produtos</div>') + '</section>';
    // fora do escopo e não identificados
    h += '<section class="es-2"><div class="card"><h2>Fora do escopo</h2><div class="var">Produtos bipados que não pertencem a este inventário (outra marca/categoria). Não entram na conta acima.</div>' +
      (r.fora.length ? '<div class="tab-wrap"><table class="p-tab es-tab"><thead><tr><th>Produto</th><th>Marca</th><th class="r">Bipado</th><th class="r">Saldo hoje</th></tr></thead><tbody>' + r.fora.map(function (l) {
        return '<tr><td><b>' + esc(l.sku) + '</b><small>' + esc(l.descricao) + '</small></td><td>' + esc(l.marca) + '</td><td class="r">' + num(l.contado) + '</td><td class="r">' + (l.atual === null ? '—' : num(l.atual)) + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (r.foraTotal > r.fora.length ? '<div class="var">+' + num(r.foraTotal - r.fora.length) + ' no Excel</div>' : '') : '<div class="empty">Nenhum.</div>') + '</div>' +
      '<div class="card"><h2>Não identificados</h2><div class="var">Códigos sem cadastro no Tiny (ou cadastro com GTIN/SKU diferente). Confira no ERP.</div>' +
      (r.nao.length ? '<div class="tab-wrap"><table class="p-tab es-tab"><thead><tr><th>Código lido</th><th class="r">Unidades</th><th class="r">Leituras</th><th>Origem</th></tr></thead><tbody>' + r.nao.map(function (l) {
        return '<tr><td><b>' + esc(l.codigo) + '</b></td><td class="r">' + num(l.qtd) + '</td><td class="r">' + num(l.leituras) + '</td><td>' + esc(l.origens) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum.</div>') + '</div></section>';
    S.el.innerHTML = h;
    ligar();
  }

  function ligar() {
    var el = S.el;
    var sel = el.querySelector('[data-dv="inv"]');
    sel.addEventListener('change', function () { S.id = sel.value; ls.set(LS_ID, S.id); S.r = null; S.f.pagina = 1; desenhar(); buscar(true); });
    el.querySelectorAll('[data-dvs]').forEach(function (b) { b.addEventListener('click', function () { S.f.status = b.dataset.dvs; S.f.pagina = 1; buscar(true); }); });
    var bu = el.querySelector('[data-dv="busca"]');
    if (bu) bu.addEventListener('input', function () { S.f.busca = bu.value; S.f.pagina = 1; buscar(); });
    el.querySelectorAll('[data-pg]').forEach(function (b) { b.addEventListener('click', function () { S.f.pagina = Math.max(1, (S.r.filtros.pagina || 1) + Number(b.dataset.pg)); buscar(true); }); });
    var bx = el.querySelector('[data-dv="excel"]'); if (bx) bx.addEventListener('click', function () { exportar('excel', bx); });
    var bp = el.querySelector('[data-dv="pdf"]'); if (bp) bp.addEventListener('click', function () { exportar('pdf', bp); });
    var ba = el.querySelector('[data-dv="aprovar"]');
    if (ba) ba.addEventListener('click', function () {
      ba.disabled = true;
      S.ctx.acao('divergenciasExportar', { id: S.id, status: 'divergentes' }).then(function (r) { S.aprovar = { linhas: r.linhas, tirar: {}, qtd: {} }; desenhar(); })
        .catch(function () { ba.disabled = false; alert('Não foi possível carregar agora.'); });
    });
    var br = el.querySelector('[data-dv="reabrir"]');
    if (br) br.addEventListener('click', function () {
      var m = prompt('Reabrir ' + S.id + ' para recontagem? As leituras continuam; dá para bipar e corrigir de novo.\n\nMotivo:');
      if (m === null) return; if (!m.trim()) { alert('O motivo é obrigatório.'); return; }
      S.ctx.acao('inventarioReabrir', { id: S.id, motivo: m.trim() }).then(function () { S.r = null; S.ctx.recarregar(); }).catch(function () { alert('Não foi possível reabrir agora.'); });
    });
    var bv = el.querySelector('[data-dv="veraj"]');
    if (bv) bv.addEventListener('click', function () { if (window.EstoqueAjustes) window.EstoqueAjustes.ir(S.id); var a = document.querySelector('.es-sub [data-s="ajustes"]'); if (a) a.click(); });
  }

  function exportar(tipo, bt) {
    var ctx = S.ctx; bt.disabled = true;
    ctx.acao('divergenciasExportar', { id: S.id, status: S.f.status, busca: S.f.busca }).then(function (r) {
      bt.disabled = false;
      if (tipo === 'excel') excel(r); else pdf(r);
    }).catch(function () { bt.disabled = false; alert('Não foi possível gerar agora.'); });
  }

  function excel(r) {
    var q = function (v) { v = v === null || v === undefined ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var br = function (v) { return typeof v === 'number' ? String(v).replace('.', ',') : v; };
    var inv = r.inv, s = r.resumo;
    var cab = ['SKU', 'GTIN', 'Descrição', 'Variação', 'Marca', 'Categoria', 'Esperado', 'Contado', 'Diferença', 'Custo', 'Valor diferença', 'Saldo hoje', 'Mov. desde a foto', 'Status'];
    var L = ['Inventário;' + q(inv.id + ' · ' + inv.tipoNome + (inv.marca ? ' ' + inv.marca : '') + (inv.categoria ? ' ' + inv.categoria : '') + ' · ' + inv.lojaNome + (s.parcial ? ' (PARCIAL)' : '')),
      'Conferidos;' + s.conferidos + ';Faltantes;' + s.faltantes + ';Sobras;' + s.sobras + ';Valor faltante;' + br(s.valorFaltante) + ';Valor sobra;' + br(s.valorSobra), '', cab.join(';')];
    r.linhas.forEach(function (l) { L.push(l.map(function (v, i) { return i === 1 && v ? '="' + v + '"' : i === 13 ? ST[v] || v : q(br(v)); }).join(';')); });
    L.push('', 'FORA DO ESCOPO', 'SKU;GTIN;Descrição;Variação;Marca;Bipado;Saldo hoje');
    r.fora.forEach(function (l) { L.push(l.map(function (v, i) { return i === 1 && v ? '="' + v + '"' : q(v); }).join(';')); });
    L.push('', 'NÃO IDENTIFICADOS', 'Código;Unidades;Leituras;Origem');
    r.nao.forEach(function (l) { L.push(['="' + l[0] + '"', l[1], l[2], q(l[3])].join(';')); });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + L.join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = 'divergencias_' + inv.id + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  }

  /** PDF: monta uma página de impressão (só ela aparece ao imprimir) e abre o diálogo — escolha "Salvar como PDF". */
  function pdf(r) {
    var u = S.ctx.util, esc = u.esc, num = u.num, inv = r.inv, s = r.resumo;
    var pct = function (x) { return x === null || x === undefined ? '—' : u.pct(x, 1); };
    var dt = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR') : '—'; };
    var div = r.linhas.filter(function (l) { return l[13] !== 'conferido'; }).slice(0, 3000);
    var h = '<h1>Divergências de inventário · ' + esc(inv.id) + (s.parcial ? ' (PARCIAL)' : '') + '</h1>' +
      '<p>' + esc(inv.tipoNome + (inv.marca ? ' · ' + inv.marca : '') + (inv.categoria ? ' · ' + inv.categoria : '') + ' · ' + inv.lojaNome) + ' · início ' + dt(inv.inicio) + (inv.fim ? ' · fim ' + dt(inv.fim) : '') +
      ' · foto do saldo ' + dt(inv.baseSaldoEm) + ' · operador ' + esc(String(inv.operador).split('@')[0]) + '</p>' +
      '<table class="pr-res"><tr><td>Acuracidade (SKUs)</td><td>' + pct(s.acuracidadeSkus) + '</td><td>Acuracidade (unid.)</td><td>' + pct(s.acuracidadeUnid) + '</td></tr>' +
      '<tr><td>Conferidos</td><td>' + num(s.conferidos) + ' de ' + num(s.skus) + '</td><td>Fora do escopo</td><td>' + num(s.foraEscopoSkus) + ' SKUs · ' + num(s.foraEscopoUnid) + ' un.</td></tr>' +
      '<tr><td>Faltantes</td><td>' + num(s.faltantes) + ' SKUs · ' + num(s.unidFaltantes) + ' un. · ' + u.brl(s.valorFaltante) + '</td><td>Não identificados</td><td>' + num(s.naoIdentificados) + ' códigos · ' + num(s.naoIdentificadosUnid) + ' un.</td></tr>' +
      '<tr><td>Sobras</td><td>' + num(s.sobras) + ' SKUs · ' + num(s.unidSobras) + ' un. · ' + u.brl(s.valorSobra) + '</td><td></td><td></td></tr></table>' +
      '<h2>Produtos com diferença' + (S.f.status !== 'divergentes' && S.f.status !== 'todos' ? ' (' + esc(S.f.status) + ')' : '') + '</h2>' +
      (div.length ? '<table><thead><tr><th>SKU</th><th>Descrição</th><th>Marca</th><th>Esp.</th><th>Cont.</th><th>Dif.</th><th>Valor</th><th>Mov. foto</th><th>Status</th></tr></thead><tbody>' + div.map(function (l) {
        return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[2]) + (l[3] ? ' · ' + esc(l[3]) : '') + '</td><td>' + esc(l[4]) + '</td><td>' + num(l[6]) + '</td><td>' + num(l[7]) + '</td><td><b>' + (l[8] > 0 ? '+' : '') + num(l[8]) + '</b></td><td>' + (l[10] ? u.brl(l[10]) : '—') +
          '</td><td>' + (l[12] === null ? '—' : num(l[12])) + '</td><td>' + (ST[l[13]] || l[13]) + '</td></tr>';
      }).join('') + '</tbody></table>' : '<p>Nenhuma diferença.</p>') +
      (r.fora.length ? '<h2>Fora do escopo</h2><table><thead><tr><th>SKU</th><th>Descrição</th><th>Marca</th><th>Bipado</th></tr></thead><tbody>' + r.fora.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td>' + esc(l[2]) + '</td><td>' + esc(l[4]) + '</td><td>' + num(l[5]) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      (r.nao.length ? '<h2>Não identificados</h2><table><thead><tr><th>Código</th><th>Unidades</th><th>Leituras</th></tr></thead><tbody>' + r.nao.map(function (l) { return '<tr><td>' + esc(l[0]) + '</td><td>' + num(l[1]) + '</td><td>' + num(l[2]) + '</td></tr>'; }).join('') + '</tbody></table>' : '') +
      '<p class="pr-rod">Gerado pelo painel em ' + new Date().toLocaleString('pt-BR') + '. Somente leitura: nenhum ajuste foi feito no Tiny.</p>';
    var box = document.getElementById('es-print');
    if (!box) { box = document.createElement('div'); box.id = 'es-print'; document.body.appendChild(box); }
    box.innerHTML = h;
    document.body.classList.add('es-imprimindo');
    var fim = function () { document.body.classList.remove('es-imprimindo'); box.innerHTML = ''; window.removeEventListener('afterprint', fim); };
    window.addEventListener('afterprint', fim);
    setTimeout(function () { window.print(); }, 50);
  }

  /** Abre já num inventário (botão "Ver divergências" da lista de inventários). */
  // ---------- aprovação (admin): tirar linhas ou trocar a quantidade antes de gerar os ajustes ----------
  function aprovarHtml() {
    var u = S.ctx.util, esc = u.esc, num = u.num, A = S.aprovar;
    var n = A.linhas.filter(function (l) { return !A.tirar[l[14]]; }).length;
    return '<section class="card"><h2>Aprovar ' + esc(S.id) + '</h2><div class="var">Cada linha vira um ajuste para lançar à mão no Tiny (entrada se positivo, saída se negativo). Desmarque o que não deve ser ajustado ' +
      'ou troque a quantidade (ex.: produto achado depois). Atenção às linhas com <b>⚠</b>: o Tiny mudou desde a foto (venda/transferência), confira antes.</div>' +
      '<div class="tab-wrap dv-apr-tab"><table class="p-tab es-tab"><thead><tr><th>Ajustar</th><th>Produto</th><th class="r">Esperado</th><th class="r">Contado</th><th class="r">Ajuste</th><th class="r">Mov. desde a foto</th></tr></thead><tbody>' +
      A.linhas.map(function (l, i) {
        var ch = l[14], q = A.qtd[ch] !== undefined ? A.qtd[ch] : l[8];
        return '<tr' + (A.tirar[ch] ? ' class="dv-tirada"' : '') + '><td><input type="checkbox" data-apt="' + i + '"' + (A.tirar[ch] ? '' : ' checked') + '></td><td><b>' + esc(l[0]) + '</b><small>' + esc(l[2]) + (l[3] ? ' · ' + esc(l[3]) : '') + '</small></td>' +
          '<td class="r">' + num(l[6]) + '</td><td class="r">' + num(l[7]) + '</td><td class="r"><input class="campo dv-q" type="number" step="1" data-apq="' + i + '" value="' + q + '"></td>' +
          '<td class="r">' + (l[12] ? '<b class="es-ruim">⚠ ' + (l[12] > 0 ? '+' : '') + num(l[12]) + '</b>' : l[12] === null ? '—' : '0') + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      '<label class="mp-f iv-sel"><span>Observação da aprovação (opcional)</span><input class="campo" data-apo="1" maxlength="200" value="' + esc(A.obs || '') + '"></label>' +
      '<div class="iv-bts"><button type="button" class="btn-p" data-apx="ok">Aprovar e gerar ' + n + ' ajuste(s)</button><button type="button" class="btn-s" data-apx="nao">Voltar</button></div><div class="msg" id="apr-msg"></div></section>';
  }
  function ligarAprovar() {
    var el = S.el, A = S.aprovar;
    el.querySelectorAll('[data-apt]').forEach(function (c) { c.addEventListener('change', function () { var ch = A.linhas[c.dataset.apt][14]; if (c.checked) delete A.tirar[ch]; else A.tirar[ch] = true; desenhar(); }); });
    el.querySelectorAll('[data-apq]').forEach(function (c) { c.addEventListener('change', function () { var l = A.linhas[c.dataset.apq]; var q = Math.trunc(Number(c.value)); if (!isFinite(q)) q = l[8]; if (q === l[8]) delete A.qtd[l[14]]; else A.qtd[l[14]] = q; c.value = q; }); });
    el.querySelector('[data-apo]').addEventListener('input', function (e) { A.obs = e.target.value; });
    el.querySelector('[data-apx="nao"]').addEventListener('click', function () { S.aprovar = null; desenhar(); });
    var ok = el.querySelector('[data-apx="ok"]');
    ok.addEventListener('click', function () {
      if (!confirm('Aprovar ' + S.id + '? Depois de aprovado, o inventário não pode ser reaberto (só excluído).')) return;
      ok.disabled = true; el.querySelector('#apr-msg').textContent = 'Aprovando…';
      S.ctx.acao('inventarioAprovar', { id: S.id, excluir: Object.keys(A.tirar), ajustes: A.qtd, obs: A.obs || '' }).then(function () {
        S.aprovar = null; S.r = null; if (window.EstoqueAjustes) window.EstoqueAjustes.invalidar(); S.ctx.recarregar();
      }).catch(function () { ok.disabled = false; el.querySelector('#apr-msg').textContent = 'Não foi possível aprovar agora.'; });
    });
  }

  function ir(id) { S.id = id; S.r = null; ls.set(LS_ID, id); }

  window.EstoqueDiv = { montar: montar, ir: ir };
})();

/* ---- estoque ---- */
/* ESTOQUE · Fase 5 (tela): Ajustes para lançar À MÃO no Tiny e Histórico (inventários, fechamentos mensais e auditoria).
   O painel nunca grava no Tiny: quem lança no ERP marca "lançado" aqui. */
(function () {
  var A = { f: { status: 'pendente', loja: '', inv: '' }, r: null, sel: {}, seq: 0 };
  var H = { r: null, mes: '', inv: '', aba: 'inventarios' };
  var EV = { iniciado: 'Iniciado', correcao: 'Correção', finalizado: 'Finalizado', cancelado: 'Cancelado', excluido: 'Excluído', aprovado: 'Aprovado', reaberto: 'Reaberto',
    ajustes_lancados: 'Ajustes lançados', ajustes_desmarcados: 'Ajustes desmarcados', fechamento: 'Fechamento do mês' };
  var dt = function (iso, comHora) { if (!iso) return '—'; var o = { day: '2-digit', month: '2-digit', year: '2-digit' }; if (comHora !== false) { o.hour = '2-digit'; o.minute = '2-digit'; } return new Date(iso).toLocaleString('pt-BR', o); };
  var csv = function (nome, linhas) {
    var q = function (v) { v = v === null || v === undefined ? '' : typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + linhas.map(function (l) { return l.map(q).join(';'); }).join('\n')], { type: 'text/csv;charset=utf-8' }));
    a.download = nome + '.csv'; document.body.appendChild(a); a.click(); a.remove();
  };

  // ================= AJUSTES =================
  function ajustes(el, d, ctx, irPara) {
    A.el = el; A.ctx = ctx;
    if (irPara) { A.f = { status: 'pendente', loja: '', inv: irPara }; A.r = null; }
    if (!A.r) { el.innerHTML = '<section class="card empty">Carregando a lista de ajustes…</section>'; buscarAj(); } else desenharAj();
  }
  function buscarAj() {
    var seq = ++A.seq;
    A.ctx.acao('ajustes', A.f).then(function (r) { if (seq !== A.seq) return; A.r = r; A.sel = {}; desenharAj(); })
      .catch(function () { A.el.innerHTML = '<section class="card empty">Não foi possível carregar agora.</section>'; });
  }
  function desenharAj() {
    var ctx = A.ctx, u = ctx.util, esc = u.esc, num = u.num, r = A.r, s = r.resumo, adm = ctx.admin;
    var sel = function (k, ops) { return '<select class="campo" data-aj="' + k + '">' + ops.map(function (o) { return '<option value="' + esc(o[0]) + '"' + (A.f[k] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') + '</select>'; };
    var h = '<div class="aviso aj-av"><b>Somente leitura do Tiny.</b> Lance cada ajuste à mão no ERP (Estoque → lançar entrada/saída na loja indicada) e marque "lançado" aqui. ' +
      '<b>Entrada/Saída</b> é a diferença do inventário e continua valendo mesmo com vendas depois da contagem; <b>Saldo a informar</b> = saldo de hoje no painel + ajuste (use se preferir lançar como balanço; o saldo de hoje é o da última atualização, 8h/13h).</div>';
    h += '<section class="es-kpis"><div class="card es-k" style="--k:#d9a400"><div><div class="lbl">Pendentes de lançar</div><div class="mid">' + num(s.pendentes) + '</div><div class="var">linhas em todos os inventários</div></div></div>' +
      '<div class="card es-k" style="--k:#2a9d5c"><div><div class="lbl">Já lançados</div><div class="mid">' + num(s.lancados) + '</div></div></div>' +
      '<div class="card es-k" style="--k:var(--s2)"><div><div class="lbl">Entradas (nesta lista)</div><div class="mid">+' + num(s.entradas) + ' un.</div><div class="var">' + u.brl(s.valorEntradas) + ' a custo</div></div></div>' +
      '<div class="card es-k" style="--k:var(--bad)"><div><div class="lbl">Saídas (nesta lista)</div><div class="mid">−' + num(s.saidas) + ' un.</div><div class="var">' + u.brl(s.valorSaidas) + ' a custo</div></div></div></section>';
    h += '<section class="card"><div class="aj-fil">' + sel('status', [['pendente', 'Pendentes'], ['lancado', 'Lançados'], ['todos', 'Todos']]) +
      sel('loja', [['', 'Todas as lojas'], ['registro', 'Joá Registro'], ['itanhaem', 'Joá Itanhaém'], ['sneakers', 'Joá Sneakers']]) +
      sel('inv', [['', 'Todos os inventários']].concat(r.inventarios.map(function (x) { return [x, x]; }))) +
      '<button type="button" class="btn-s" data-aja="excel"' + (r.linhas.length ? '' : ' disabled') + '>⬇ Excel</button>' +
      (adm ? '<button type="button" class="btn-p" data-aja="lancar" disabled>Marcar selecionados como lançados</button><button type="button" class="btn-s" data-aja="desfazer" disabled>Voltar para pendente</button>' : '') + '</div>';
    h += r.linhas.length ? '<div class="tab-wrap"><table class="p-tab es-tab"><thead><tr>' + (adm ? '<th><input type="checkbox" data-aja="todos" title="Selecionar todos"></th>' : '') +
      '<th>Inventário</th><th>Loja</th><th>Produto</th><th class="r">Lançar no Tiny</th><th class="r">Saldo hoje</th><th class="r">Saldo a informar</th><th class="r">Valor (custo)</th><th>Status</th></tr></thead><tbody>' +
      r.linhas.map(function (a, i) {
        return '<tr>' + (adm ? '<td><input type="checkbox" data-ajs="' + i + '"' + (A.sel[i] ? ' checked' : '') + '></td>' : '') + '<td>' + esc(a.inv) + '</td><td>' + esc(a.lojaNome) + '</td><td><b>' + esc(a.sku) + '</b><small>' + esc(a.descricao) + (a.variacao ? ' · ' + esc(a.variacao) : '') +
          (a.gtin ? ' · GTIN ' + esc(a.gtin) : '') + (a.obs ? '<br><i>' + esc(a.obs) + '</i>' : '') + '</small></td><td class="r"><b class="' + (a.ajuste > 0 ? 'aj-ent' : 'aj-sai') + '">' + (a.ajuste > 0 ? 'Entrada +' + num(a.ajuste) : 'Saída −' + num(-a.ajuste)) + '</b></td>' +
          '<td class="r">' + (a.saldoHoje === null ? '—' : num(a.saldoHoje)) + '</td><td class="r">' + (a.status === 'pendente' && a.saldoInformar !== null ? '<b>' + num(a.saldoInformar) + '</b>' : '—') + '</td><td class="r">' + u.brl(a.valor) + '</td>' +
          '<td>' + (a.status === 'lancado' ? '<span class="ac-st dv-st-conferido">Lançado</span><small>' + esc(String(a.lancadoPor).split('@')[0]) + ' · ' + dt(a.lancadoEm) + '</small>' : '<span class="ac-st dv-st-sobra">Pendente</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div>' + (r.total > r.linhas.length ? '<div class="var">Mostrando ' + num(r.linhas.length) + ' de ' + num(r.total) + ' (filtre por inventário ou loja).</div>' : '<div class="var">' + num(r.total) + ' linhas</div>')
      : '<div class="empty">' + (A.f.status === 'pendente' ? 'Nenhum ajuste pendente. Aprove um inventário finalizado (aba Divergências) para gerar a lista.' : 'Nada neste filtro.') + '</div>';
    h += '<div class="msg" id="aj-msg"></div></section>';
    A.el.innerHTML = h;
    ligarAj();
  }
  function ligarAj() {
    var el = A.el, ctx = A.ctx;
    el.querySelectorAll('[data-aj]').forEach(function (s) { s.addEventListener('change', function () { A.f[s.dataset.aj] = s.value; buscarAj(); }); });
    var botoes = function () {
      var n = Object.keys(A.sel).filter(function (k) { return A.sel[k]; }).length;
      el.querySelectorAll('[data-aja="lancar"],[data-aja="desfazer"]').forEach(function (b) { b.disabled = !n; });
      var l = el.querySelector('[data-aja="lancar"]'); if (l) l.textContent = n ? 'Marcar ' + n + ' como lançado(s)' : 'Marcar selecionados como lançados';
    };
    el.querySelectorAll('[data-ajs]').forEach(function (c) { c.addEventListener('change', function () { A.sel[c.dataset.ajs] = c.checked; botoes(); }); });
    var tds = el.querySelector('[data-aja="todos"]');
    if (tds) tds.addEventListener('change', function () { el.querySelectorAll('[data-ajs]').forEach(function (c) { c.checked = tds.checked; A.sel[c.dataset.ajs] = tds.checked; }); botoes(); });
    var marcar = function (lancado) {
      var itens = Object.keys(A.sel).filter(function (k) { return A.sel[k]; }).map(function (k) { var a = A.r.linhas[k]; return { inv: a.inv, chave: a.chave }; });
      if (!itens.length) return;
      if (lancado && !confirm('Confirma que ' + itens.length + ' ajuste(s) já foram lançados no Tiny?')) return;
      el.querySelector('#aj-msg').textContent = 'Salvando…';
      ctx.acao('ajustesMarcar', { itens: itens, lancado: lancado }).then(function () { buscarAj(); }).catch(function () { el.querySelector('#aj-msg').textContent = 'Não foi possível salvar agora.'; });
    };
    var bl = el.querySelector('[data-aja="lancar"]'); if (bl) bl.addEventListener('click', function () { marcar(true); });
    var bd = el.querySelector('[data-aja="desfazer"]'); if (bd) bd.addEventListener('click', function () { marcar(false); });
    var bx = el.querySelector('[data-aja="excel"]');
    if (bx) bx.addEventListener('click', function () {
      csv('ajustes_tiny_' + (A.f.inv || A.f.status), [['Inventário', 'Loja', 'SKU', 'GTIN', 'Descrição', 'Variação', 'Tipo', 'Quantidade', 'Saldo hoje', 'Saldo a informar', 'Esperado', 'Contado', 'Custo', 'Valor', 'Status', 'Lançado por', 'Lançado em', 'Obs']]
        .concat(A.r.linhas.map(function (a) {
          return [a.inv, a.lojaNome, a.sku, a.gtin ? '="' + a.gtin + '"' : '', a.descricao, a.variacao, a.ajuste > 0 ? 'Entrada' : 'Saída', Math.abs(a.ajuste), a.saldoHoje, a.status === 'pendente' ? a.saldoInformar : '',
            a.esperado, a.contado, a.custo, a.valor, a.status === 'lancado' ? 'Lançado' : 'Pendente', a.lancadoPor, a.lancadoEm ? dt(a.lancadoEm) : '', a.obs];
        })));
    });
  }

  // ================= HISTÓRICO =================
  function historico(el, d, ctx) {
    H.el = el; H.ctx = ctx; H.d = d;
    if (!H.r) { el.innerHTML = '<section class="card empty">Carregando o histórico…</section>'; buscarH(); } else desenharH();
  }
  function buscarH() {
    H.ctx.acao('historico', { mes: H.mes, inv: H.inv }).then(function (r) { H.r = r; if (r.mesDetalhe) H.mes = r.mesDetalhe.mes; desenharH(); })
      .catch(function () { H.el.innerHTML = '<section class="card empty">Não foi possível carregar agora.</section>'; });
  }
  function desenharH() {
    var ctx = H.ctx, u = ctx.util, esc = u.esc, num = u.num, r = H.r;
    var pct = function (x) { return x === null || x === undefined || x === '' ? '—' : u.pct(x, 1); };
    var STL = { contando: 'Contando', finalizado: 'Finalizado', aprovado: 'Aprovado', cancelado: 'Cancelado' };
    var h = '<nav class="crm-sub es-sub2">' + [['inventarios', 'Inventários'], ['fechamentos', 'Fechamento mensal'], ['auditoria', 'Auditoria']].map(function (x) {
      return '<button type="button" data-ha="' + x[0] + '"' + (H.aba === x[0] ? ' class="on"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</nav>';
    if (H.aba === 'inventarios') {
      var ap = r.inventarios.filter(function (x) { return x.status === 'aprovado' && x.acurSkus !== null; });
      var media = ap.length ? ap.reduce(function (a, x) { return a + x.acurSkus; }, 0) / ap.length : null;
      h += '<section class="es-kpis"><div class="card es-k" style="--k:var(--s2)"><div><div class="lbl">Inventários</div><div class="mid">' + num(r.inventarios.length) + '</div><div class="var">' + num(ap.length) + ' aprovados</div></div></div>' +
        '<div class="card es-k" style="--k:#2a9d5c"><div><div class="lbl">Acuracidade média</div><div class="mid">' + pct(media) + '</div><div class="var">dos SKUs, nos aprovados</div></div></div>' +
        '<div class="card es-k" style="--k:var(--bad)"><div><div class="lbl">Faltas aprovadas</div><div class="mid">' + u.brl(ap.reduce(function (a, x) { return a + (x.valorFalt || 0); }, 0)) + '</div><div class="var">a custo</div></div></div>' +
        '<div class="card es-k" style="--k:#d9a400"><div><div class="lbl">Sobras aprovadas</div><div class="mid">' + u.brl(ap.reduce(function (a, x) { return a + (x.valorSobra || 0); }, 0)) + '</div><div class="var">a custo</div></div></div></section>';
      h += '<section class="card"><h2>Inventários</h2>' + (r.inventarios.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Nº</th><th>Escopo</th><th>Loja</th><th>Status</th><th>Início</th><th>Fim</th><th>Aprovado</th><th class="r">Contado</th><th class="r">Acur. SKUs</th><th class="r">Acur. unid.</th><th class="r">Faltas</th><th class="r">Sobras</th><th></th></tr></thead><tbody>' +
        r.inventarios.map(function (x) {
          return '<tr><td><b>' + esc(x.id) + '</b></td><td>' + esc(x.tipoNome + (x.marca ? ' · ' + x.marca : '') + (x.categoria ? ' · ' + x.categoria : '')) + '</td><td>' + esc(x.lojaNome) + '</td><td><span class="ac-st iv-' + x.status + '">' + (STL[x.status] || x.status) + '</span></td>' +
            '<td>' + dt(x.inicio) + '<small>' + esc(String(x.operador).split('@')[0]) + '</small></td><td>' + dt(x.fim) + '</td><td>' + (x.aprovadoEm ? dt(x.aprovadoEm) + '<small>' + esc(String(x.aprovadoPor).split('@')[0]) + '</small>' : '—') + '</td>' +
            '<td class="r">' + num(x.contadoUnid) + '</td><td class="r">' + pct(x.acurSkus) + '</td><td class="r">' + pct(x.acurUnid) + '</td><td class="r">' + (x.status === 'aprovado' ? u.brl(x.valorFalt) : '—') + '</td><td class="r">' + (x.status === 'aprovado' ? u.brl(x.valorSobra) : '—') + '</td>' +
            '<td><button type="button" class="lnk" data-hinv="' + esc(x.id) + '">auditoria</button></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhum inventário ainda.</div>') + '</section>';
    } else if (H.aba === 'fechamentos') {
      var lojas = r.lojas;
      h += '<section class="card"><div class="iv-ult-top"><h2>Fechamento mensal (foto do estoque)</h2>' + (ctx.admin ? '<button type="button" class="btn-s" data-ha2="fechar">📸 Gerar a foto deste mês agora</button>' : '') + '</div>' +
        '<div class="var">A foto é tirada sozinha no último dia de cada mês, às 23h (com o saldo da atualização das 13h). Gerar de novo no mesmo mês substitui a foto.</div>' +
        (r.fechamentos.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Mês</th>' + lojas.map(function (l) { return '<th class="r">' + esc(l.nome) + '<small>un. · valor</small></th>'; }).join('') + '<th class="r">Total lojas</th><th>Gerado</th></tr></thead><tbody>' +
          r.fechamentos.map(function (m, i) {
            var tot = 0, ant = r.fechamentos[i + 1], totAnt = 0;
            lojas.forEach(function (l) { if (l.id !== 'full') { tot += (m.lojas[l.id] || {}).valor || 0; if (ant) totAnt += (ant.lojas[l.id] || {}).valor || 0; } });
            var var_ = ant && totAnt ? (tot - totAnt) / totAnt : null;
            return '<tr' + (m.mes === H.mes ? ' class="aj-mes-on"' : '') + '><td><button type="button" class="lnk" data-hmes="' + esc(m.mes) + '"><b>' + esc(m.mes.split('-').reverse().join('/')) + '</b></button></td>' + lojas.map(function (l) {
              var x = m.lojas[l.id] || { unidades: 0, valor: 0 };
              return '<td class="r">' + num(x.unidades) + '<small>' + u.brl(x.valor) + '</small></td>';
            }).join('') + '<td class="r"><b>' + u.brl(tot) + '</b>' + (var_ !== null ? '<small class="' + (var_ >= 0 ? 'aj-ent' : 'aj-sai') + '">' + (var_ >= 0 ? '+' : '') + u.pct(var_, 1) + ' vs mês anterior</small>' : '') + '</td><td>' + dt(m.geradoEm) + '<small>' + esc(m.origem) + '</small></td></tr>';
          }).join('') + '</tbody></table></div>' : '<div class="empty">Nenhuma foto ainda. A primeira sai no último dia do mês às 23h' + (ctx.admin ? ' (ou gere agora).' : '.') + '</div>') + '<div class="msg" id="h-msg"></div></section>';
      if (r.mesDetalhe) {
        var mm = r.mesDetalhe;
        h += '<section class="card"><div class="iv-ult-top"><h2>Por marca · ' + esc(mm.mes.split('-').reverse().join('/')) + '</h2><button type="button" class="btn-s" data-ha2="excel">⬇ Excel</button></div><div class="tab-wrap"><table class="p-tab es-tab"><thead><tr><th>Marca</th>' +
          lojas.map(function (l) { return '<th class="r">' + esc(l.nome) + '</th>'; }).join('') + '<th class="r">Valor (custo)</th></tr></thead><tbody>' + marcasMes(mm.marcas, lojas).slice(0, 300).map(function (x) {
            return '<tr><td>' + esc(x.marca) + '</td>' + lojas.map(function (l) { return '<td class="r">' + num(x[l.id] || 0) + '</td>'; }).join('') + '<td class="r">' + u.brl(x.valor) + '</td></tr>';
          }).join('') + '</tbody></table></div></section>';
      }
    } else {
      h += '<section class="card"><div class="iv-ult-top"><h2>Auditoria' + (H.inv ? ' · ' + esc(H.inv) + ' <button type="button" class="lnk" data-hinv="">(ver tudo)</button>' : '') + '</h2></div>' +
        (r.auditoria.length ? '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Quando</th><th>Inventário</th><th>Evento</th><th>Usuário</th><th>Detalhe</th></tr></thead><tbody>' + r.auditoria.map(function (a) {
          return '<tr><td>' + dt(a.quando) + '</td><td>' + esc(a.inv || '—') + '</td><td>' + esc(EV[a.evento] || a.evento) + '</td><td>' + esc(String(a.usuario).split('@')[0]) + '</td><td>' + esc(a.detalhe) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">Nada registrado ainda.</div>') + '</section>';
    }
    H.el.innerHTML = h;
    ligarH();
  }
  function marcasMes(linhas, lojas) {
    var g = {};
    linhas.forEach(function (x) { var m = g[x.marca] = g[x.marca] || { marca: x.marca, valor: 0 }; m[x.loja] = (m[x.loja] || 0) + x.unidades; if (x.loja !== 'full') m.valor += x.valor; });
    void lojas;
    return Object.keys(g).map(function (k) { return g[k]; }).sort(function (a, b) { return b.valor - a.valor; });
  }
  function ligarH() {
    var el = H.el, ctx = H.ctx;
    el.querySelectorAll('[data-ha]').forEach(function (b) { b.addEventListener('click', function () { H.aba = b.dataset.ha; desenharH(); }); });
    el.querySelectorAll('[data-hmes]').forEach(function (b) { b.addEventListener('click', function () { H.mes = b.dataset.hmes; buscarH(); }); });
    el.querySelectorAll('[data-hinv]').forEach(function (b) { b.addEventListener('click', function () { H.inv = b.dataset.hinv; H.aba = 'auditoria'; buscarH(); }); });
    var bf = el.querySelector('[data-ha2="fechar"]');
    if (bf) bf.addEventListener('click', function () {
      if (!confirm('Gerar agora a foto do estoque deste mês? Se já houver uma, ela é substituída.')) return;
      bf.disabled = true; el.querySelector('#h-msg').textContent = 'Gerando…';
      ctx.acao('fecharMes', {}).then(function () { H.mes = ''; buscarH(); }).catch(function () { bf.disabled = false; el.querySelector('#h-msg').textContent = 'Não foi possível gerar agora.'; });
    });
    var bx = el.querySelector('[data-ha2="excel"]');
    if (bx) bx.addEventListener('click', function () {
      var lojas = H.r.lojas, mm = H.r.mesDetalhe;
      csv('fechamento_' + mm.mes, [['Marca'].concat(lojas.map(function (l) { return l.nome; })).concat(['Valor lojas (custo)'])].concat(marcasMes(mm.marcas, lojas).map(function (x) {
        return [x.marca].concat(lojas.map(function (l) { return x[l.id] || 0; })).concat([Math.round(x.valor * 100) / 100]);
      })));
    });
  }

  window.EstoqueAjustes = { montar: ajustes, invalidar: function () { A.r = null; H.r = null; }, ir: function (inv) { A.f = { status: 'todos', loja: '', inv: inv }; A.r = null; } };
  window.EstoqueHist = { montar: historico };
})();

/* ---- estoque ---- */
/* ESTOQUE · Joá Stock Intelligence. Sub-abas: Visão Geral · Consultar · Qualidade do cadastro · Inventário (inventario.js) · Divergências
   (divergencias.js) · (Histórico na Fase 5). Somente leitura do Tiny. Sem imagens de produto. Consulta paginada no servidor (ação "consultar"). */
(function () {
  var LS = 'painel_estoque_sub';
  var SUBS = [['geral', 'Visão Geral'], ['consultar', 'Consultar Estoque'], ['qualidade', 'Qualidade do Cadastro'],
    ['inventario', 'Inventário'], ['divergencias', 'Divergências'], ['ajustes', 'Ajustes p/ Tiny'], ['historico', 'Histórico']];
  var FUTURO = {};
  var est = { f: { loja: '', marca: '', categoria: '', busca: '', saldo: '', pendencia: '', ordem: 'saldo', pagina: 1 },
    q: null, qPend: null, fPend: { pendencia: 'sem_marca', pagina: 1, ordem: 'saldo' }, seq: 0, timer: null, carregando: false };
  var sub = function () { try { return localStorage.getItem(LS) || 'geral'; } catch (e) { return 'geral'; } };
  var LOJAS = [['registro', 'Registro'], ['itanhaem', 'Itanhaém'], ['sneakers', 'Sneakers'], ['full', 'ML FULL']];

  function render(el, d, ctx) {
    est.d = d;
    if (!est.q && d.consulta) est.q = d.consulta;
    // contagem em andamento: a atualização automática (2 min) não pode refazer a tela (perderia o foco do leitor e a câmera)
    if (sub() === 'inventario' && window.EstoqueInventario && window.EstoqueInventario.ocupado() && el.querySelector('.iv-top')) return;
    desenhar(el, ctx);
  }

  function desenhar(el, ctx) {
    var d = est.d, u = ctx.util, esc = u.esc;
    if (d.semBase) {
      el.innerHTML = '<section class="card"><h2>Estoque · aguardando a carga</h2><p>' + (d.temImportacao
        ? 'A aba <b>estoque_importacao</b> já está na planilha. Admin: rode <b>estoque_processarImportacao</b> no editor do Apps Script (arquivo estoque_base.gs).'
        : 'Importe o arquivo <b>estoque_importacao.csv</b> na planilha do painel (Arquivo → Importar → Inserir nova página) e rode <b>estoque_processarImportacao</b>.') + '</p></section>';
      return;
    }
    var s = sub();
    var h = '<nav class="crm-sub es-sub">' + SUBS.map(function (x) {
      return '<button type="button" data-s="' + x[0] + '"' + (x[0] === s ? ' class="on"' : '') + '>' + x[1] + (FUTURO[x[0]] ? ' <em>em breve</em>' : '') + '</button>';
    }).join('') + '</nav>';
    if (s === 'geral') h += geralHtml(d, u);
    else if (s === 'consultar') h += consultaHtml(d, u, est.f, est.q, 'q');
    else if (s === 'qualidade') h += qualidadeHtml(d, u);
    else if (s === 'inventario') h += '<div id="es-inv"></div>';
    else if (s === 'divergencias') h += '<div id="es-div"></div>';
    else if (s === 'ajustes' || s === 'historico') h += '<div id="es-f5"></div>';
    else h += '<section class="card empty">' + esc(FUTURO[s]) + '</section>';
    el.innerHTML = h;
    ligar(el, ctx);
    if (s === 'inventario') window.EstoqueInventario.montar(el.querySelector('#es-inv'), d, ctx);
    if (s === 'divergencias') window.EstoqueDiv.montar(el.querySelector('#es-div'), d, ctx);
    if (s === 'ajustes') window.EstoqueAjustes.montar(el.querySelector('#es-f5'), d, ctx);
    if (s === 'historico') { window.EstoqueAjustes.invalidar(); window.EstoqueHist.montar(el.querySelector('#es-f5'), d, ctx); }
  }

  function kpi(u, ico, lbl, val, sub, cor) {
    return '<div class="card es-k" style="--k:' + cor + '"><span class="es-k-ico">' + (u.icone ? u.icone(ico) : '') + '</span><div><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div>' +
      (sub ? '<div class="var">' + sub + '</div>' : '') + '</div></div>';
  }

  // ---------- Visão Geral ----------
  function geralHtml(d, u) {
    var k = d.kpis, num = u.num, esc = u.esc, a = d.atualizacao || {};
    var dt = function (iso) { return iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
    var h = '<div class="var es-at">Saldos atualizados ' + dt(a.ultima || a.importadoEm) + ' (8h e 13h)' + (a.pendentesSaldo ? ' · ' + num(a.pendentesSaldo) + ' produtos ainda sem saldo (a atualização completa)' : '') + ' · somente leitura do Tiny</div>';
    h += '<section class="es-kpis">' + kpi(u, 'caixa', 'Estoque nas lojas', num(k.unidades) + ' un.', 'Registro + Itanhaém + Sneakers', 'var(--s2)') +
      kpi(u, 'etiqueta', 'SKUs ativos', num(k.skusAtivos), num(k.comSaldo) + ' com saldo', 'var(--s1)') +
      kpi(u, 'camadas', 'Marcas · categorias', num(k.marcas) + ' · ' + num(k.categorias), '', 'var(--s5)') +
      kpi(u, 'caixa', 'Estoque zerado', num(k.zerados), 'SKUs sem saldo em nenhuma loja', 'var(--s4)') +
      '<button type="button" class="card es-k es-neg" data-neg="1" style="--k:var(--bad)"><span class="es-k-ico">−</span><div><div class="lbl">Estoque negativo</div><div class="mid">' + num(k.negativos) + ' SKUs</div>' +
      '<div class="var">' + num(k.unidadesNegativas) + ' un. · ver lista</div></div></button>' +
      kpi(u, 'alvo', 'Inventários', num(k.inventariosAndamento || 0) + ' em andamento', k.ultimoInventario ? 'último: ' + esc(k.ultimoInventario.id) + ' · ' + esc(k.ultimoInventario.lojaNome) + ' · ' + num(k.ultimoInventario.contadoUnid) + ' un. contadas' : 'nenhum finalizado ainda', 'var(--s3)') +
      (k.ajustesPendentes ? '<button type="button" class="card es-k es-neg" data-irs="ajustes" style="--k:#d9a400"><div><div class="lbl">Ajustes para lançar no Tiny</div><div class="mid">' + num(k.ajustesPendentes) + '</div><div class="var">pendentes · ver lista</div></div></button>' : '') + '</section>';

    // por loja
    h += '<section class="card"><h2>Por loja e depósito</h2><div class="tab-wrap"><table class="p-tab"><thead><tr><th>Loja / depósito</th><th class="r">Unidades</th><th class="r">SKUs com saldo</th><th class="r">Negativos</th><th class="r">Valor a custo</th></tr></thead><tbody>' +
      d.lojas.map(function (l) {
        return '<tr' + (l.id === 'full' ? ' class="es-full"' : '') + '><td>' + esc(l.nome) + (l.id === 'full' ? ' <small>(galpão do Mercado Livre)</small>' : '') + '</td><td class="r">' + num(l.unidades) + '</td><td class="r">' + num(l.skus) +
          '</td><td class="r' + (l.negativos ? ' es-ruim' : '') + '">' + num(l.negativos) + '</td><td class="r">' + u.brl(l.valorCusto) + '</td></tr>';
      }).join('') + '</tbody></table></div><div class="var">Valor a custo = saldo × preço de custo do cadastro (produtos sem custo entram como zero).</div></section>';

    // qualidade (resumo) + negativos
    var q = d.qualidade, c = q.contagens;
    h += '<section class="es-2"><div class="card"><h2>Qualidade do cadastro de produtos</h2>' +
      '<div class="es-q">' + [['sem_marca', 'Sem marca'], ['sem_categoria', 'Sem categoria'], ['sem_ambos', 'Sem marca e categoria'], ['sem_gtin', 'GTIN ausente'], ['gtin_repetido', 'GTIN repetido'], ['sem_sku', 'SKU ausente'], ['sku_repetido', 'SKU repetido']].map(function (x) {
        return '<button type="button" class="es-q-i" data-pend="' + x[0] + '"><span>' + x[1] + '</span><b>' + num(c[x[0]] || 0) + '</b></button>';
      }).join('') + '</div><div class="var">' + u.pct(q.pctClassificados || 0, 1) + ' dos ' + num(q.analisados) + ' produtos com marca e categoria. Os grupos se sobrepõem (não some as linhas).</div>' +
      '<button type="button" class="btn-p" data-pend="sem_marca">Ver produtos pendentes</button></div>' +
      '<div class="card"><h2>Estoque negativo</h2>' + (d.negativos.length ? '<div class="tab-wrap"><table class="p-tab es-tab"><thead><tr><th>Produto</th>' + LOJAS.map(function (l) { return '<th class="r">' + l[1] + '</th>'; }).join('') + '</tr></thead><tbody>' +
        d.negativos.slice(0, 15).map(function (p) {
          return '<tr><td><b>' + esc(p.sku) + '</b><small>' + esc(p.descricao) + '</small></td>' + LOJAS.map(function (l) { return '<td class="r' + (p[l[0]] < 0 ? ' es-ruim' : '') + '">' + num(p[l[0]]) + '</td>'; }).join('') + '</tr>';
        }).join('') + '</tbody></table></div>' + (d.kpis.negativos > 15 ? '<button type="button" class="btn-s" data-neg="1">Ver todos os ' + num(d.kpis.negativos) + '</button>' : '') : '<div class="empty">Nenhum saldo negativo. 👍</div>') + '</div></section>';

    // marcas e categorias
    var bloco = function (tit, lista, campo) {
      var max = Math.max.apply(null, lista.map(function (x) { return x.unidades; }).concat([1]));
      return '<div class="card"><h2>' + tit + '</h2>' + lista.map(function (x) {
        return '<button type="button" class="es-bar-i" data-' + campo + '="' + esc(x.nome) + '"><span>' + esc(x.nome) + ' <em>' + num(x.skus) + ' SKUs</em></span><b>' + num(x.unidades) + ' un.</b><i style="width:' + (x.unidades / max * 100).toFixed(1) + '%"></i></button>';
      }).join('') + '</div>';
    };
    h += '<section class="es-2">' + bloco('Estoque por marca', d.topMarcas, 'marca') + bloco('Estoque por categoria', d.topCategorias, 'categoria') + '</section>';
    return h;
  }

  // ---------- Consultar (também usado na Qualidade, com outro estado) ----------
  function consultaHtml(d, u, f, q, alvo) {
    var esc = u.esc, num = u.num, op = d.opcoes;
    var sel = function (id, rot, lista, atual, extra) {
      return '<label class="mp-f"><span>' + rot + '</span><select class="campo" data-' + alvo + 'f="' + id + '"><option value="">Todas</option>' + (extra || '') +
        lista.map(function (x) { var v = typeof x === 'string' ? [x, x] : [x.id, x.nome]; return '<option value="' + esc(v[0]) + '"' + (v[0] === atual ? ' selected' : '') + '>' + esc(v[1]) + '</option>'; }).join('') + '</select></label>';
    };
    var h = '';
    if (alvo === 'q') {
      h += '<section class="card es-filtros"><div class="es-fs">' + sel('loja', 'Loja / depósito', op.lojas, f.loja) +
        sel('marca', 'Marca', op.marcas, f.marca, '<option value="(sem marca)"' + (f.marca === '(sem marca)' ? ' selected' : '') + '>(sem marca)</option>') +
        sel('categoria', 'Categoria', op.categorias, f.categoria, '<option value="(sem categoria)"' + (f.categoria === '(sem categoria)' ? ' selected' : '') + '>(sem categoria)</option>') +
        '<label class="mp-f"><span>Saldo</span><select class="campo" data-qf="saldo">' + [['', 'Todos'], ['com_saldo', 'Com saldo'], ['zerado', 'Zerado'], ['negativo', 'Negativo']].map(function (x) {
          return '<option value="' + x[0] + '"' + (x[0] === f.saldo ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label>' +
        '<label class="mp-f es-busca"><span>Descrição, SKU ou GTIN</span><input class="campo" data-qf="busca" value="' + esc(f.busca) + '" placeholder="Digite ou bipe o código"></label>' +
        '<button type="button" class="btn-s" data-qacao="limpar">Limpar</button></div></section>';
    }
    if (!q) return h + '<div class="card empty">Carregando…</div>';
    h += '<div class="es-res"><b>' + num(q.resumo.skus) + '</b> SKUs · <b>' + num(q.resumo.unidades) + '</b> unidades' + (f.loja ? ' em ' + esc((op.lojas.filter(function (l) { return l.id === f.loja; })[0] || {}).nome || '') : ' nas lojas') +
      ' · ' + num(q.resumo.comSaldo) + ' com saldo' + (est.carregando ? ' · <b class="es-carr">atualizando…</b>' : '') +
      '<span class="es-res-bts"><button type="button" class="btn-s" data-' + alvo + 'acao="excel">Exportar Excel</button></span></div>';
    if (q.distribuicao && q.distribuicao.itens.length) {
      var max = Math.max.apply(null, q.distribuicao.itens.map(function (x) { return x.unidades; }).concat([1]));
      h += '<section class="card es-dist"><h2>' + (q.distribuicao.por === 'categoria' ? 'Distribuição por categoria' : 'Distribuição por marca') + '</h2><div class="es-dist-l">' + q.distribuicao.itens.map(function (x) {
        return '<div class="es-bar-i"><span>' + esc(x.nome) + ' <em>' + num(x.skus) + ' SKUs</em></span><b>' + num(x.unidades) + ' un.</b><i style="width:' + (x.unidades / max * 100).toFixed(1) + '%"></i></div>';
      }).join('') + '</div></section>';
    }
    var ord = function (id, txt) { return '<th class="' + (id === 'descricao' || id === 'sku' ? '' : 'r') + ' es-ord' + (f.ordem === id ? ' on' : '') + '" data-' + alvo + 'ord="' + id + '">' + txt + '</th>'; };
    h += '<section class="card es-tab-card"><div class="tab-wrap"><table class="p-tab es-tab"><thead><tr>' + ord('descricao', 'Descrição') + '<th>Marca</th><th>Categoria</th>' + ord('sku', 'SKU') + '<th>GTIN</th><th>Variação</th>' +
      LOJAS.map(function (l) { return '<th class="r">' + l[1] + '</th>'; }).join('') + ord('saldo', 'Total') + '</tr></thead><tbody>' +
      (q.linhas.length ? q.linhas.map(function (p) {
        return '<tr><td class="es-desc">' + esc(p.descricao) + '</td><td>' + (p.marca ? esc(p.marca) : '<span class="es-falta">sem marca</span>') + '</td><td>' + (p.categoria ? esc(p.categoria) : '<span class="es-falta">sem categoria</span>') +
          '</td><td class="es-cod">' + esc(p.sku) + '</td><td class="es-cod">' + (p.gtin ? esc(p.gtin) : '<span class="es-falta">—</span>') + '</td><td>' + esc(p.variacao.replace(/\|\|/g, ' · ').replace(/ · $/, '')) + '</td>' +
          LOJAS.map(function (l) { return '<td class="r' + (p[l[0]] < 0 ? ' es-ruim' : p[l[0]] ? '' : ' es-zero') + '">' + num(p[l[0]]) + '</td>'; }).join('') + '<td class="r"><b>' + num(p.total) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="11" class="empty">Nenhum produto com esses filtros.</td></tr>') + '</tbody></table></div>' +
      (q.paginas > 1 ? '<div class="es-pag"><button type="button" class="btn-s" data-' + alvo + 'pag="-1"' + (f.pagina <= 1 ? ' disabled' : '') + '>‹ Anterior</button><span>Página ' + f.pagina + ' de ' + q.paginas + '</span>' +
        '<button type="button" class="btn-s" data-' + alvo + 'pag="1"' + (f.pagina >= q.paginas ? ' disabled' : '') + '>Próxima ›</button></div>' : '') + '</section>';
    return h;
  }

  // ---------- Qualidade do cadastro (Organização cadastral: só aponta; a correção é no Tiny) ----------
  function qualidadeHtml(d, u) {
    var q = d.qualidade, c = q.contagens, num = u.num;
    var h = '<section class="es-kpis">' + kpi(u, 'etiqueta', 'Produtos analisados', num(q.analisados), '', 'var(--s1)') +
      kpi(u, 'alvo', 'Com marca e categoria', num(q.classificados), u.pct(q.pctClassificados || 0, 1), 'var(--s3)') +
      kpi(u, 'etiqueta', 'Sem marca', num(c.sem_marca), '', 'var(--bad)') + kpi(u, 'camadas', 'Sem categoria', num(c.sem_categoria), '', 'var(--bad)') +
      kpi(u, 'caixa', 'Sem marca e categoria', num(c.sem_ambos), '', 'var(--bad)') + kpi(u, 'etiqueta', 'GTIN ausente', num(c.sem_gtin), 'esses só são bipados pelo SKU', 'var(--s4)') + '</section>';
    h += '<div class="aviso">A correção é feita <b>direto no Tiny</b>: o painel só aponta. Na próxima atualização (8h ou 13h) a lista diminui sozinha.</div>';
    h += '<nav class="es-pend">' + q.tipos.map(function (t) {
      return '<button type="button" class="mp-chip' + (est.fPend.pendencia === t.id ? ' on' : '') + '" data-tpend="' + t.id + '">' + u.esc(t.nome) + ' <em>' + num(c[t.id] || 0) + '</em></button>';
    }).join('') + '</nav>';
    return h + consultaHtml(d, u, est.fPend, est.qPend, 'p');
  }

  // ---------- consultas ----------
  function buscar(el, ctx, alvo, imediato) {
    clearTimeout(est.timer);
    est.timer = setTimeout(function () {
      var seq = ++est.seq, f = alvo === 'q' ? est.f : est.fPend;
      est.carregando = true; desenhar(el, ctx);
      ctx.acao('consultar', f).then(function (r) {
        if (seq !== est.seq) return;
        est.carregando = false;
        if (alvo === 'q') est.q = r; else est.qPend = r;
        desenhar(el, ctx);
      }).catch(function () { if (seq === est.seq) { est.carregando = false; desenhar(el, ctx); } });
    }, imediato ? 0 : 350);
  }

  function exportar(ctx, f, nome) {
    ctx.acao('consultar', Object.assign({}, f, { pagina: 1, porPagina: 5000 })).then(function (r) {
      var cab = ['SKU', 'GTIN', 'Descrição', 'Marca', 'Categoria', 'Variação', 'Registro', 'Itanhaém', 'Sneakers', 'ML FULL', 'Total lojas', 'Pendências'];
      var q = function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
      var txt = '﻿' + [cab.join(';')].concat(r.linhas.map(function (p) {
        return [p.sku, p.gtin ? '="' + p.gtin + '"' : '', p.descricao, p.marca, p.categoria, p.variacao, p.registro, p.itanhaem, p.sneakers, p.full, p.total, (p.pend || []).join(' ')].map(q).join(';');
      })).join('\n');
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' }));
      a.download = nome + '.csv'; document.body.appendChild(a); a.click(); a.remove();
    });
  }

  function ligar(el, ctx) {
    el.querySelectorAll('.es-sub [data-s]').forEach(function (b) {
      b.addEventListener('click', function () {
        try { localStorage.setItem(LS, b.dataset.s); } catch (e) { /* sem storage */ }
        if (b.dataset.s === 'qualidade' && !est.qPend) buscar(el, ctx, 'p', true);
        desenhar(el, ctx);
      });
    });
    var ir = function (s) { try { localStorage.setItem(LS, s); } catch (e) { /* sem storage */ } };
    el.querySelectorAll('[data-irs]').forEach(function (b) { b.addEventListener('click', function () { ir(b.dataset.irs); }); });
    el.querySelectorAll('[data-neg]').forEach(function (b) { b.addEventListener('click', function () { est.f = Object.assign(est.f, { saldo: 'negativo', loja: '', marca: '', categoria: '', busca: '', pagina: 1 }); ir('consultar'); buscar(el, ctx, 'q', true); }); });
    el.querySelectorAll('[data-pend]').forEach(function (b) { b.addEventListener('click', function () { est.fPend = { pendencia: b.dataset.pend, pagina: 1, ordem: 'saldo' }; ir('qualidade'); buscar(el, ctx, 'p', true); }); });
    el.querySelectorAll('[data-tpend]').forEach(function (b) { b.addEventListener('click', function () { est.fPend.pendencia = b.dataset.tpend; est.fPend.pagina = 1; buscar(el, ctx, 'p', true); }); });
    el.querySelectorAll('.es-bar-i[data-marca]').forEach(function (b) { b.addEventListener('click', function () { est.f = Object.assign(est.f, { marca: b.dataset.marca, categoria: '', pagina: 1 }); ir('consultar'); buscar(el, ctx, 'q', true); }); });
    el.querySelectorAll('.es-bar-i[data-categoria]').forEach(function (b) { b.addEventListener('click', function () { est.f = Object.assign(est.f, { categoria: b.dataset.categoria, marca: '', pagina: 1 }); ir('consultar'); buscar(el, ctx, 'q', true); }); });
    ['q', 'p'].forEach(function (alvo) {
      var f = alvo === 'q' ? est.f : est.fPend;
      el.querySelectorAll('[data-' + alvo + 'f]').forEach(function (s) {
        var ev = s.tagName === 'INPUT' ? 'input' : 'change';
        s.addEventListener(ev, function () { f[s.getAttribute('data-' + alvo + 'f')] = s.value; f.pagina = 1; buscar(el, ctx, alvo, ev === 'change'); });
        if (s.tagName === 'INPUT') s.addEventListener('keydown', function (e) { if (e.key === 'Enter') { f.busca = s.value; f.pagina = 1; buscar(el, ctx, alvo, true); } });
      });
      el.querySelectorAll('[data-' + alvo + 'ord]').forEach(function (b) { b.addEventListener('click', function () { f.ordem = b.getAttribute('data-' + alvo + 'ord'); f.pagina = 1; buscar(el, ctx, alvo, true); }); });
      el.querySelectorAll('[data-' + alvo + 'pag]').forEach(function (b) { b.addEventListener('click', function () { f.pagina += Number(b.getAttribute('data-' + alvo + 'pag')); buscar(el, ctx, alvo, true); }); });
      var ex = el.querySelector('[data-' + alvo + 'acao="excel"]');
      if (ex) ex.addEventListener('click', function () { exportar(ctx, f, alvo === 'q' ? 'estoque_consulta' : 'estoque_pendencias_' + f.pendencia); });
    });
    var lp = el.querySelector('[data-qacao="limpar"]');
    if (lp) lp.addEventListener('click', function () { est.f = { loja: '', marca: '', categoria: '', busca: '', saldo: '', pendencia: '', ordem: 'saldo', pagina: 1 }; buscar(el, ctx, 'q', true); });
    var bi = el.querySelector('[data-qf="busca"]');
    if (bi && document.activeElement !== bi && est.focoBusca) { bi.focus(); bi.setSelectionRange(bi.value.length, bi.value.length); }
    if (bi) { bi.addEventListener('focus', function () { est.focoBusca = true; }); bi.addEventListener('blur', function () { est.focoBusca = false; }); }
  }

  Painel.registrarModulo({ id: 'estoque', nome: 'Estoque', icone: '📦', simbolo: 'caixa', descricao: 'Estoque por loja, marca e categoria, negativos e qualidade do cadastro (somente leitura do Tiny).', periodos: null, render: render });
})();

/* ---- marketplace ---- */
/* MARKETPLACE · render (usa estilos do vendas: .v-hero, .v-ch, .v-pl, .e-* não são necessários). */
(function () {
  var CORES = { 'Mercado Livre': 'var(--s3)', 'Shopee': 'var(--s2)', 'Amazon': 'var(--s4)' };
  var cor = function (n) { return CORES[n] || 'var(--s4)'; };

  function render(el, d, ctx) {
    var u = ctx.util, brl = u.brl, num = u.num, esc = u.esc, o = d.online, h = '';
    var ve = function (s) { return ctx.visivel ? ctx.visivel(s) : true; };
    if (ve('resumo') && o) {
      h += '<section class="v-hero">' +
        '<div class="card"><div class="lbl">Faturamento marketplace · ' + esc(d.rotulo) + '</div><div class="big">' + brl(o.valor) + '</div>' + u.varHtml(o.varPct, d.rotuloComp) +
        '<div class="var">' + u.pct(o.pctDoTotal) + ' do faturamento total da empresa</div></div>' +
        '<div class="card"><div class="lbl">Pedidos</div><div class="mid">' + num(o.pedidos) + '</div><div class="var">antes: ' + num(o.pedidosAnt) + '</div></div>' +
        '<div class="card"><div class="lbl">Ticket médio</div><div class="mid">' + brl(o.ticket) + '</div><div class="var">&nbsp;</div></div></section>';
    }
    if (ve('canais') && d.canais) {
      h += '<section class="v-grid3">' + d.canais.map(function (c) {
        return '<div class="card v-ch"><div class="head"><i class="sw" style="background:' + cor(c.nome) + '"></i><span class="lbl">' + esc(c.nome) + '</span></div>' +
          '<div class="mid">' + brl(c.valor) + '</div>' + u.varHtml(c.varPct, 'antes') +
          '<div class="v-meta"><span>' + num(c.pedidos) + ' pedidos · TM ' + brl(c.ticket) + '</span></div>' +
          (c.porLoja && c.porLoja.length ? '<div class="v-porloja"><div class="v-porloja-tit">Despachado por loja</div>' + c.porLoja.map(function (l) {
            return '<div class="v-pl"><span>' + esc(l.nome) + ' <em>' + num(l.pedidos) + '</em></span><span>' + brl(l.valor) + ' <em>' + u.pct(c.valor ? l.valor / c.valor : 0) + '</em></span></div>';
          }).join('') + '</div>' : '') + '</div>';
      }).join('') + '</section>';
    }
    if (ve('cancelamentos') && d.cancelamentos) {
      var cc = d.cancelamentos;
      h += '<section class="card" style="margin-bottom:12px"><h2>Cancelamentos</h2>' + cc.canais.map(function (x) {
        return '<div class="v-pl"><span><i class="sw" style="background:' + cor(x.nome) + '"></i> ' + esc(x.nome) + ' <em>' + num(x.qtd) + ' de ' + num(x.pedidos) + '</em></span><span>' + u.pct(x.taxa, 1) + ' <em>' + brl(x.valor) + '</em></span></div>';
      }).join('') + '<div class="var" style="margin-top:8px">Taxa no período anterior: ' + u.pct(cc.total.taxaAnt, 1) + '</div></section>';
    }
    if (ve('diaSemana') && d.diaSemana && d.diaSemana.melhor) {
      var nomes = d.canais ? d.canais.map(function (c) { return c.nome; }) : ['Mercado Livre'];
      h += '<section class="card mk-dias"><h2>Melhor dia da semana</h2><div class="var" style="margin:-6px 0 10px">Média das últimas ' + d.diaSemana.semanas + ' semanas · melhor: <b>' + esc(d.diaSemana.melhor) + '</b> · mais fraco: <b>' + esc(d.diaSemana.pior) + '</b></div>' +
        u.grafico(d.diaSemana.dias, nomes, cor, { todosRotulos: true, baixo: true }) + '</section>';
    }
    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    var g = el.querySelector('.mk-dias');
    if (g) u.ligarGrafico(g, d.diaSemana.dias, d.canais ? d.canais.map(function (c) { return c.nome; }) : ['Mercado Livre']);
  }

  Painel.registrarModulo({ id: 'marketplace', nome: 'Marketplace', icone: '🏪', simbolo: 'loja', descricao: 'Vendas do Mercado Livre.', periodoPadrao: 'mes', render: render });
})();

/* ---- pedidos ---- */
/* PEDIDOS ONLINE PARADOS · render (foto de agora, sem abas de período). */
(function () {
  var CORES = { 'Site': 'var(--s2)', 'Mercado Livre': 'var(--s3)' };
  var cor = function (n) { return CORES[n] || 'var(--s4)'; };

  function render(el, d, ctx) {
    var u = ctx.util, num = u.num, brl = u.brl, esc = u.esc, h = '';
    var ve = function (s) { return ctx.visivel ? ctx.visivel(s) : true; }; // blocos liberados para essa pessoa
    var p = d.parados;

    if (ve('resumo') && p) {
      h += '<section class="v-hero">' +
        '<div class="card"><div class="lbl">Parados há ' + d.diasMin + '+ dias</div><div class="big' + (p.qtd ? ' p-alerta' : '') + '">' + num(p.qtd) + '</div>' +
        '<div class="var">' + brl(p.valor) + (p.qtd ? ' · mais antigo: <b>' + p.maisAntigo + ' dias</b>' : ' · tudo em dia 👍') + '</div></div>' +
        '<div class="card"><div class="lbl">Em aberto (todos)</div><div class="mid">' + num(d.abertos.qtd) + '</div><div class="var">' + brl(d.abertos.valor) + '</div></div>' +
        '<div class="card"><div class="lbl">Por canal</div>' + d.porCanal.map(function (c) {
          return '<div class="p-lin"><span><i class="sw" style="background:' + cor(c.nome) + '"></i>' + esc(c.nome) + '</span><span><b>' + num(c.parados) + '</b> / ' + num(c.qtd) + '</span></div>';
        }).join('') + (d.porCanal.length ? '' : '<div class="var">—</div>') + '<div class="var">parados / em aberto</div></div>' +
        '</section>';
    }

    // idade dos pedidos em aberto
    var bIdade = '';
    if (ve('idade') && d.faixas) {
      var maxF = Math.max.apply(null, d.faixas.map(function (f) { return f.qtd; })) || 1;
      bIdade = '<div class="card"><h2>Há quanto tempo estão em aberto</h2>' + d.faixas.map(function (f) {
        return '<div class="p-faixa"><span>' + esc(f.rotulo) + '</span><div class="p-bar"><i class="' + (f.alerta ? 'alerta' : '') + '" style="width:' + (f.qtd / maxF * 100).toFixed(1) + '%"></i></div><b>' + num(f.qtd) + '</b></div>';
      }).join('') + '</div>';
    }
    var bLojas = '';
    if (ve('lojas') && d.porLoja) {
      bLojas = '<div class="card"><h2>Por loja que vai despachar</h2>' + (d.porLoja.length ? d.porLoja.map(function (l) {
        return '<div class="p-lin grande"><span>' + esc(l.nome) + '</span><span><b class="' + (l.parados ? 'p-txt-alerta' : '') + '">' + num(l.parados) + ' parados</b> · ' + num(l.qtd) + ' em aberto</span></div>';
      }).join('') : '<div class="empty">Nenhum pedido em aberto.</div>') +
        (d.porSituacao && d.porSituacao.length ? '<h2 class="p-sub">Por situação</h2>' + d.porSituacao.map(function (s) {
          return '<div class="p-lin"><span>' + esc(s.nome) + '</span><span><b>' + num(s.parados) + '</b> / ' + num(s.qtd) + '</span></div>';
        }).join('') : '') + '</div>';
    }
    if (bIdade || bLojas) h += '<section class="p-grid2"' + (bIdade && bLojas ? '' : ' style="grid-template-columns:1fr"') + '>' + bIdade + bLojas + '</section>';

    // lista
    if (ve('lista') && d.lista) {
      h += '<section class="card"><h2>Pedidos parados há ' + d.diasMin + '+ dias</h2>';
      if (!d.lista.length) h += '<div class="empty">Nenhum pedido parado. 👍</div>';
      else {
        h += '<div class="tab-wrap"><table class="p-tab"><thead><tr><th>Dias</th><th>Data</th><th>Nº Tiny</th><th>Nº site/ML</th><th>Canal</th><th>Loja</th><th>Situação</th><th class="r">Valor</th></tr></thead><tbody>' +
          d.lista.map(function (x) {
            return '<tr><td><b class="p-dias' + (x.dias >= 5 ? ' alto' : '') + '">' + x.dias + 'd</b></td><td>' + esc(x.data) + '</td><td>' + esc(x.numero) + '</td><td>' + esc(x.ec || '—') + '</td>' +
              '<td><span class="p-tag"><i class="sw" style="background:' + cor(x.canal) + '"></i>' + esc(x.canal) + '</span></td><td>' + esc(x.loja) + '</td><td>' + esc(x.situacao) + '</td><td class="r">' + brl(x.valor) + '</td></tr>';
          }).join('') + '</tbody></table></div>';
        if (d.listaTotal > d.lista.length) h += '<div class="var">mostrando os ' + d.lista.length + ' mais antigos de ' + d.listaTotal + '</div>';
      }
      h += '</section>';
    }
    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
  }

  Painel.registrarModulo({ id: 'pedidos', nome: 'Pedidos online parados', icone: '📦', simbolo: 'caixa', descricao: 'Pedidos online ainda não despachados.', periodos: null, render: render });
})();

/* ---- crm ---- */
/* CRM · Site | Lojas: resultados do mês, campanhas do plano (Axoly), segmentos com fila do dia (WhatsApp via wa.me + registro), base de clientes. */
(function () {
  var LS = 'painel_crm_canal';
  var est = { seg: { site: null, pdv: null }, marca: { site: '', pdv: '' }, filaMarca: { site: null, pdv: null }, abertos: {}, camp: null, importar: false, mesCamp: null, filtroCamp: '' };
  var canalAtual = function () { try { return localStorage.getItem(LS) || 'site'; } catch (e) { return 'site'; } };
  var NOMES_CANAL = { site: 'Site', pdv: 'Lojas' };

  function render(el, d, ctx) {
    var u = ctx.util, num = u.num, brl = u.brl, esc = u.esc;
    // pessoa restrita a lojas/canais: o servidor só manda os canais dela
    var disp = [['site', '🛍️ Site'], ['pdv', '🏬 Lojas']].filter(function (x) {
      return !d.recorte || (d.canais ? d.canais[x[0]] : d.filas && d.filas[x[0]]);
    });
    var canal = canalAtual();
    if (disp.length && !disp.some(function (x) { return x[0] === canal; })) canal = disp[0][0];
    var h = disp.length > 1 ? '<nav class="crm-sub">' + disp.map(function (x) {
      return '<button type="button" data-c="' + x[0] + '"' + (x[0] === canal ? ' class="on"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</nav>' : '';

    var pr = d.progresso;
    if (pr && !pr.iniciado) h += '<div class="aviso">A primeira carga de clientes ainda não rodou. Ela começa sozinha no próximo gatilho do CRM (de hora em hora).</div>';
    else if (pr && (pr.pendentes || pr.semMarca)) h += '<div class="aviso">Carga em andamento: faltam ' + num(pr.pendentes) + ' pedido(s) para ler o cliente e ' + num(pr.semMarca) + ' para identificar a marca. Os mais recentes vêm primeiro.</div>';

    // resultados do mês (topo)
    if (d.resultados) {
      var r = d.resultados, rc = resumoCanal(r, canal);
      h += '<section class="crm-kpis">' +
        kpi('Envios em ' + r.mes, num(rc.envios), num(rc.clientes) + ' clientes') +
        kpi('Conversão (7 dias)', rc.conversao == null ? '—' : u.pct(rc.conversao, 1), num(rc.compraram) + ' compraram') +
        kpi('Receita atribuída', brl(rc.receita), 'pedidos até 7 dias após o envio') +
        kpi('Base com aceite', r.base.pctAceite == null ? '—' : u.pct(r.base.pctAceite), num(r.base.aceitam) + ' de ' + num(r.base.clientes)) +
        '</section>';
    }

    // campanhas do plano (Axoly)
    if (d.campanhas) h += campanhasHtml(d, ctx);

    // segmentos + fila
    if (d.filas) h += filaHtml(d, ctx, canal);

    // resultado por segmento
    if (d.resultados) {
      var segs = d.resultados.segmentos.filter(function (s) { return s.canal === canal; });
      if (segs.length) {
        h += '<section class="card crm-res"><h2>Resultado por segmento · ' + esc(d.resultados.mes) + '</h2><div class="tab-wrap"><table class="p-tab"><thead><tr><th>Segmento</th><th class="r">Envios</th><th class="r">Compraram</th><th class="r">Conversão</th><th class="r">Receita</th></tr></thead><tbody>' +
          segs.map(function (s) {
            return '<tr><td>' + esc(nomeSeg(d, s.segmento)) + '</td><td class="r">' + num(s.envios) + '</td><td class="r">' + num(s.compraram) + '</td><td class="r">' + (s.conversao == null ? '—' : u.pct(s.conversao, 1)) + '</td><td class="r">' + brl(s.receita) + '</td></tr>';
          }).join('') + '</tbody></table></div></section>';
      }
    }

    // base
    if (d.canais) h += baseHtml(d, ctx, canal);

    if (!d.filas && !d.canais && !d.resultados && !d.campanhas) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    ligar(el, d, ctx, canal);
    ligarCampanhas(el, d, ctx);
  }

  function kpi(lbl, val, sub) { return '<div class="card"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + sub + '</div></div>'; }

  function resumoCanal(r, canal) {
    var t = { envios: 0, clientes: 0, compraram: 0, receita: 0 };
    r.segmentos.filter(function (s) { return s.canal === canal; }).forEach(function (s) { t.envios += s.envios; t.clientes += s.clientes; t.compraram += s.compraram; t.receita += s.receita; });
    t.conversao = t.clientes ? t.compraram / t.clientes : null;
    return t;
  }

  function nomeSeg(d, id) { var s = (d.segmentos || []).filter(function (x) { return x.id === id; })[0]; return s ? s.nome : id; }

  // ---------- fila ----------
  function filaHtml(d, ctx, canal) {
    var u = ctx.util, num = u.num, esc = u.esc;
    var filas = d.filas[canal] || {};
    var segs = d.segmentos.filter(function (s) { return s.canal === 'ambos' || s.canal === canal; });
    var sel = est.seg[canal];
    var h = '<section class="crm-segs">';
    segs.forEach(function (s) {
      var f = filas[s.id];
      var pront = s.filtro ? null : (f ? f.clientes.length : 0);
      h += '<button type="button" class="card crm-seg' + (sel === s.id ? ' on' : '') + '" data-seg="' + esc(s.id) + '">' +
        '<span class="lbl">' + esc(s.nome) + '</span>' +
        (s.filtro ? '<b class="crm-n">🔎</b><span class="var">escolher marca</span>'
          : '<b class="crm-n">' + num(pront) + '</b><span class="var">' + (f && f.enviadosHoje ? num(f.enviadosHoje) + ' enviados hoje · ' : '') + 'prontos hoje</span>') +
        '</button>';
    });
    h += '</section>';
    if (!sel) return h + '<div class="card empty crm-dica">Toque num segmento para ver quem está pronto para receber mensagem hoje.<br><small>Regras: só quem aceita contato · ninguém recebe 2 mensagens em ' + d.travas.dias + ' dias · máximo ' + d.travas.limite + ' por fila por dia.</small></div>';

    var fila;
    if (sel === 'marca') {
      h += '<div class="card crm-marca"><label>Marca <select class="campo" id="crm-marca"><option value="">escolha…</option>' +
        (d.marcas || []).map(function (m) { return '<option value="' + esc(m.nome) + '"' + (m.nome === est.marca[canal] ? ' selected' : '') + '>' + esc(m.nome) + ' (' + num(m.clientes) + ')</option>'; }).join('') +
        '</select></label></div>';
      fila = est.filaMarca[canal];
      if (!est.marca[canal]) return h;
      if (!fila) return h + '<div class="card empty">Carregando…</div>';
    } else fila = (d.filas[canal] || {})[sel] || { clientes: [], total: 0, enviadosHoje: 0, limite: d.travas.limite };

    var modelo = (d.modelos || {})[sel + '|' + canal];
    h += '<section class="card crm-fila"><div class="crm-fila-top"><h2>' + esc(nomeSeg(d, sel)) + ' · ' + NOMES_CANAL[canal] + '</h2>' +
      '<span class="var">' + num(fila.clientes.length) + ' na fila' + (fila.total > fila.clientes.length ? ' de ' + num(fila.total) : '') + ' · ' + num(fila.enviadosHoje || 0) + '/' + fila.limite + ' hoje</span></div>';
    if (!modelo) h += '<div class="aviso">Sem modelo de mensagem para este segmento/canal na aba crm_modelos. A mensagem começa em branco.</div>';
    if (!fila.clientes.length) return h + '<div class="empty">Ninguém pronto para receber hoje neste segmento. 👍</div></section>';
    h += '<div class="crm-lista">' + fila.clientes.map(function (c) {
      var aberto = est.abertos[c.tel];
      return '<div class="crm-cli" data-tel="' + esc(c.tel) + '">' +
        '<div class="crm-cli-top"><div><b>' + esc(c.nome || c.primeiro || 'Cliente') + '</b>' +
        '<div class="crm-tel' + (c.telOk ? '' : ' fora') + '">' + esc(fmtTel(c.tel)) + (c.telOk ? '' : ' · fora do padrão') + '</div></div>' +
        '<div class="crm-bts"><button type="button" class="btn-p crm-env" data-acao="enviar">Enviar</button><button type="button" class="btn-s" data-acao="pular">Pular</button></div></div>' +
        '<div class="crm-info">última compra ' + esc(c.ultima) + (c.dias != null ? ' (há ' + c.dias + ' dias)' : '') + ' · ' + num(c.qtd) + ' pedido(s) · ' + u.brl(c.total) +
        (c.marca ? ' · ' + esc(c.marca) : '') + (c.loja ? ' · ' + esc(c.loja) : '') + (c.vendedora ? ' · ' + esc(c.vendedora) : '') + '</div>' +
        '<button type="button" class="crm-ver" data-acao="ver">' + (aberto ? 'esconder mensagem' : 'ver/editar mensagem') + '</button>' +
        (aberto ? '<textarea class="campo crm-msg" rows="5">' + esc(montarMsg(d, sel, canal, c)) + '</textarea>' : '') +
        '<div class="msg"></div></div>';
    }).join('') + '</div></section>';
    return h;
  }

  function fmtTel(t) {
    var m = String(t).match(/^55(\d{2})(\d{4,5})(\d{4})$/);
    return m ? '(' + m[1] + ') ' + m[2] + '-' + m[3] : t;
  }

  function montarMsg(d, seg, canal, c) {
    var modelo = (d.modelos || {})[seg + '|' + canal];
    var txt = modelo ? modelo.texto : '';
    txt = txt.replace(/\{primeiro_nome\}/g, c.primeiro || '').replace(/\{marca\}/g, c.marca || 'novidades')
      .replace(/\{loja\}/g, c.loja || '').replace(/\{vendedora\}/g, c.vendedora || '').replace(/ {2,}/g, ' ').trim();
    if (d.sair && txt.indexOf('SAIR') < 0) txt += (txt ? '\n\n' : '') + d.sair;
    return txt;
  }

  function ligar(el, d, ctx, canal) {
    var nav = el.querySelector('.crm-sub');
    if (nav) nav.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      try { localStorage.setItem(LS, b.dataset.c); } catch (er) { /* sem storage */ }
      render(el, d, ctx);
    });
    el.querySelectorAll('.crm-seg').forEach(function (b) {
      b.addEventListener('click', function () {
        est.seg[canal] = est.seg[canal] === b.dataset.seg ? null : b.dataset.seg;
        render(el, d, ctx);
        var f = el.querySelector('.crm-fila,.crm-marca'); if (f) f.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
    var selM = el.querySelector('#crm-marca');
    if (selM) selM.addEventListener('change', function () {
      est.marca[canal] = selM.value; est.filaMarca[canal] = null;
      render(el, d, ctx);
      if (!selM.value) return;
      ctx.acao('filaMarca', { marca: selM.value, canal: canal }).then(function (f) { est.filaMarca[canal] = f; render(el, d, ctx); })
        .catch(function () { est.filaMarca[canal] = { clientes: [], total: 0, limite: d.travas.limite }; render(el, d, ctx); });
    });
    el.querySelectorAll('.crm-cli').forEach(function (cl) {
      var tel = cl.dataset.tel;
      var seg = est.seg[canal];
      var lista = seg === 'marca' ? (est.filaMarca[canal] || {}).clientes || [] : ((d.filas[canal] || {})[seg] || {}).clientes || [];
      var c = lista.filter(function (x) { return x.tel === tel; })[0];
      var msgEl = cl.querySelector('.msg');
      var tirar = function () {
        var i = lista.indexOf(c); if (i >= 0) lista.splice(i, 1);
        delete est.abertos[tel];
        render(el, d, ctx);
      };
      cl.addEventListener('click', function (e) {
        var a = e.target.dataset.acao; if (!a) return;
        if (a === 'ver') { est.abertos[tel] = !est.abertos[tel]; render(el, d, ctx); return; }
        if (a === 'pular') {
          ctx.acao('pular', { telefone: tel }).then(tirar).catch(function () { msgEl.textContent = 'Não foi possível pular agora.'; msgEl.className = 'msg erro'; });
          return;
        }
        if (a === 'enviar') {
          var ta = cl.querySelector('.crm-msg');
          var padrao = montarMsg(d, seg, canal, c);
          var texto = ta ? ta.value : padrao;
          var modelo = ((d.modelos || {})[seg + '|' + canal] || {}).id || seg;
          // abre o WhatsApp primeiro (precisa ser no clique, senão o navegador bloqueia) e depois registra
          window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
          e.target.disabled = true;
          ctx.acao('registrarEnvio', { telefone: tel, segmento: seg, canal: canal, modelo: modelo + (ta && texto !== padrao ? ' (editada)' : '') })
            .then(tirar)
            .catch(function (er) {
              e.target.disabled = false;
              msgEl.className = 'msg erro';
              msgEl.textContent = er.message === 'ja_enviado' ? 'Este cliente já recebeu mensagem nos últimos ' + d.travas.dias + ' dias.' : 'O WhatsApp abriu, mas o envio não foi registrado. Toque em Enviar de novo só se não tiver mandado.';
            });
        }
      });
    });
  }

  // ---------- campanhas do plano (Axoly) ----------
  var ERROS_CAMP = { link_invalido: 'O link precisa começar com https://', dados_invalidos: 'O texto colado não está no formato esperado.', ja_enviado: 'ja_enviado' };

  function dataBR(s) { var m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? m[3] + '/' + m[2] : s; }

  /** Texto da campanha para um cliente: {{Nome}}, {{LinkOferta}} e os campos do CRM; acrescenta o SAIR. */
  function msgCampanha(d, c, cli) {
    var txt = String(c.script || '')
      .replace(/\{\{\s*nome\s*\}\}/gi, cli.primeiro || '').replace(/\{\{\s*linkoferta\s*\}\}/gi, c.link || '')
      .replace(/\{primeiro_nome\}/g, cli.primeiro || '').replace(/\{marca\}/g, cli.marca || 'novidades')
      .replace(/\{loja\}/g, cli.loja || '').replace(/\{vendedora\}/g, cli.vendedora || '').replace(/^💬 WHATSAPP\s*/, '').trim();
    if (d.sair && txt.indexOf('SAIR') < 0) txt += (txt ? '\n\n' : '') + d.sair;
    return txt;
  }
  var precisaLink = function (c) { return /\{\{\s*linkoferta\s*\}\}/i.test(c.script || '') && !c.link; };

  var MESES_CAMP = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  var SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
  var STATUS_CLS = { 'Planejada': 'st-plan', 'Enviada': 'st-env', 'Finalizada': 'st-fim', 'Não enviada': 'st-nao' };
  var FILTROS_CAMP = [['', 'Todas'], ['Planejada', 'Planejadas'], ['Enviada', 'Enviadas'], ['Finalizada', 'Finalizadas']];

  /** Mês exibido: o escolhido; senão o atual se tiver ação, senão o próximo mês com ação. */
  function mesCampanhas(d) {
    if (est.mesCamp) return est.mesCamp;
    var h = new Date(), atual = h.getFullYear() + '-' + ('0' + (h.getMonth() + 1)).slice(-2);
    var meses = d.campanhas.map(function (c) { return c.data.slice(0, 7); }).sort();
    if (!meses.length || meses.indexOf(atual) >= 0) return atual;
    return meses.filter(function (m) { return m >= atual; })[0] || meses[meses.length - 1];
  }
  function somarMes(mes, n) { var p = mes.split('-'), dt = new Date(+p[0], +p[1] - 1 + n, 1); return dt.getFullYear() + '-' + ('0' + (dt.getMonth() + 1)).slice(-2); }

  function campanhasHtml(d, ctx) {
    var u = ctx.util, esc = u.esc, num = u.num, brl = u.brl;
    var mes = mesCampanhas(d), pm = mes.split('-'), nomeMes = MESES_CAMP[+pm[1] - 1] + ' ' + pm[0];
    var doMes = d.campanhas.filter(function (c) { return c.data.slice(0, 7) === mes; }).sort(function (a, b) { return a.data < b.data ? -1 : a.data > b.data ? 1 : 0; });
    var meta = (d.metasRetencao || {})[mes];
    var soma = function (f) { return doMes.reduce(function (s, c) { return s + (f(c) || 0); }, 0); };
    var proj = soma(function (c) { return c.receitaProj; }), real = soma(function (c) { return c.resultado.receita; });
    var custo = soma(function (c) { return c.custo; }), bases = soma(function (c) { return c.base; });
    var rois = doMes.filter(function (c) { return c.roiProj; });
    var roiMedio = rois.length ? rois.reduce(function (s, c) { return s + c.roiProj; }, 0) / rois.length : null;
    var x = function (v) { return v == null || !isFinite(v) ? '—' : v.toFixed(2).replace('.', ',') + 'x'; };
    var pct = function (v) { return v == null || !isFinite(v) ? '—' : u.pct(v, 0); };

    var h = '<section class="crm-acoes">' +
      '<div class="ac-head"><div><h2>Ações Pontuais CRM</h2><div class="var">Planejamento do Axoly · executado e medido com a base do Tiny</div></div>' +
      '<div class="ac-head-bts"><div class="ac-mes"><button type="button" class="btn-s" data-mes="-1">‹</button><b>' + nomeMes + '</b><button type="button" class="btn-s" data-mes="1">›</button></div>' +
      (ctx.admin ? '<button class="btn-s" type="button" id="crm-imp">' + (est.importar ? 'Fechar' : 'Importar do Axoly') + '</button>' : '') + '</div></div>';
    if (est.importar) h += '<div class="card crm-imp"><div class="var">Cole aqui o texto que o Claude gerou a partir do Axoly (as ações com o mesmo id são atualizadas; o link da oferta não se perde).</div>' +
      '<textarea class="campo" id="crm-imp-txt" rows="6" placeholder=\'{"campanhas": [ ... ], "metas": { ... }}\'></textarea>' +
      '<div class="v-metas-acoes"><button class="btn-p" type="button" id="crm-imp-ok">Importar</button></div><div class="msg" id="crm-imp-msg"></div></div>';

    // meta de retenção do mês
    h += '<div class="card ac-meta"><div><div class="lbl">Meta de retenção · ' + MESES_CAMP[+pm[1] - 1] + '</div><div class="ac-meta-v">' + (meta ? brl(meta.valor) : '—') + '</div>' +
      (meta ? '' : '<div class="var">sem meta importada para este mês</div>') + '</div>' +
      '<div class="ac-meta-n"><span><em>Projetado</em><b>' + brl(proj) + '</b></span>' +
      '<span><em>Cobertura</em><b class="' + (meta && proj >= meta.valor ? 'up' : '') + '">' + (meta && meta.valor ? pct(proj / meta.valor) : '—') + '</b></span>' +
      '<span><em>Realizado</em><b>' + brl(real) + '</b><small>' + (meta && meta.valor ? pct(real / meta.valor) + ' da meta' : '') + '</small></span>' +
      '<span><em>% retenção plan.</em><b>' + (meta && meta.pct ? String(meta.pct).replace('.', ',') + '%' : '—') + '</b></span></div></div>';

    // cartões
    var k = function (lbl, val, sub, cls) { return '<div class="card ac-k' + (cls ? ' ' + cls : '') + '"><div class="lbl">' + lbl + '</div><div class="mid">' + val + '</div><div class="var">' + (sub || '&nbsp;') + '</div></div>'; };
    h += '<div class="ac-kpis">' + k('Ações no mês', num(doMes.length)) + k('Bases ativadas', num(bases), 'clientes no painel') +
      k('Receita projetada', brl(proj), 'Axoly', 'ac-verde') + k('Custo total', brl(custo), '', 'ac-amarelo') +
      k('ROI médio', x(roiMedio), 'projetado') + k('Receita realizada', brl(real), custo && real ? 'ROI real ' + x(real / custo) : 'compras após os envios', 'ac-azul') + '</div>';

    // receita por dia (projetada na data da ação; realizada no dia da compra)
    var dias = new Date(+pm[0], +pm[1], 0).getDate(), projDia = {}, realDia = {};
    doMes.forEach(function (c) {
      projDia[+c.data.slice(8, 10)] = (projDia[+c.data.slice(8, 10)] || 0) + (c.receitaProj || 0);
      Object.keys(c.resultado.porDia || {}).forEach(function (iso) { if (iso.slice(0, 7) === mes) realDia[+iso.slice(8, 10)] = (realDia[+iso.slice(8, 10)] || 0) + c.resultado.porDia[iso]; });
    });
    var curto = function (v) { return v >= 1000 ? (v / 1000).toFixed(1).replace('.', ',') + 'k' : num(Math.round(v)); };
    h += '<div class="card ac-dias"><div class="ac-dias-top"><h2>Receita por dia</h2><span class="var"><i class="ac-sw p"></i>projetada <i class="ac-sw r"></i>realizada</span></div><div class="ac-grid">';
    for (var i = 1; i <= dias; i++) {
      var p = projDia[i], r = realDia[i];
      h += '<div class="ac-dia' + (p ? ' tem' : '') + '"><span>' + i + '</span><b>' + (p ? curto(p) : '—') + '</b>' + (r ? '<em>' + curto(r) + '</em>' : '') + '</div>';
    }
    h += '</div></div>';

    // filtros + tabela
    var filtro = est.filtroCamp || '';
    var vis = doMes.filter(function (c) { return !filtro || c.status === filtro; });
    h += '<div class="ac-filtros">' + FILTROS_CAMP.map(function (f) {
      var n = f[0] ? doMes.filter(function (c) { return c.status === f[0]; }).length : doMes.length;
      return '<button type="button" class="btn-s' + (filtro === f[0] ? ' on' : '') + '" data-fcamp="' + f[0] + '">' + f[1] + ' <em>' + n + '</em></button>';
    }).join('') + '</div>';
    if (!vis.length) return h + '<div class="card empty">' + (doMes.length ? 'Nenhuma ação com esse status.' : 'Nenhuma ação do Axoly em ' + nomeMes + '.' + (ctx.admin ? ' Peça ao Claude: "atualiza as campanhas do Axoly da JOÁ" e importe.' : '')) + '</div></section>';

    h += '<div class="card ac-tab-card"><div class="tab-wrap"><table class="p-tab ac-tab"><thead><tr>' +
      '<th>Data</th><th>Status</th><th>Base</th><th>Objetivo</th><th>Oferta</th><th>Regra</th><th class="r">Janela</th><th class="c">Script</th>' +
      '<th class="r">Tamanho da base</th><th class="r">Custo</th><th class="r">Tx conv</th><th class="r">Receita</th><th class="r">ROI</th><th></th></tr></thead><tbody>';
    vis.forEach(function (c) {
      var r = c.resultado, aberta = est.camp === c.id;
      var dt = c.data.split('-'), wd = SEMANA[new Date(+dt[0], +dt[1] - 1, +dt[2]).getDay()];
      var roiReal = c.custo && r.enviados ? r.receita / c.custo : null;
      h += '<tr class="ac-row' + (aberta ? ' on' : '') + '" data-camp="' + esc(c.id) + '">' +
        '<td><span class="ac-data">' + dt[2] + '/' + dt[1] + '</span><small>' + wd + '</small></td>' +
        '<td><span class="ac-st ' + (STATUS_CLS[c.status] || '') + '">' + esc(c.status) + '</span></td>' +
        '<td class="ac-base"><b>' + esc(c.nome) + '</b>' + (c.criterio ? '<small>' + esc(c.criterio) + '</small>' : '') + '</td>' +
        '<td class="ac-obj">' + esc(c.objetivo || c.criterio || '') + '</td>' +
        '<td>' + esc(c.oferta) + '</td><td class="ac-obj">' + esc(c.regra) + '</td>' +
        '<td class="r">' + num(c.janelaHoras) + 'h</td>' +
        '<td class="c">' + (c.script ? '<span class="ac-ok" title="script do Axoly">✓</span>' : '<span class="ac-nao" title="sem script no Axoly">—</span>') + (precisaLink(c) ? '<small class="ac-falta">sem link</small>' : '') + '</td>' +
        '<td class="r"><b>' + num(c.base) + '</b><small>Axoly ' + num(c.baseAxoly) + '</small></td>' +
        '<td class="r">' + (c.custo ? brl(c.custo) : '—') + '</td>' +
        '<td class="r"><b>' + (r.conversao == null ? '—' : u.pct(r.conversao, 1)) + '</b><small>meta ' + (c.conversaoProj ? String(c.conversaoProj).replace('.', ',') + '%' : '—') + '</small></td>' +
        '<td class="r"><b>' + brl(r.receita) + '</b><small>proj. ' + brl(c.receitaProj) + '</small></td>' +
        '<td class="r"><b' + (roiReal != null ? ' class="ac-roi"' : '') + '>' + x(roiReal) + '</b><small>proj. ' + x(c.roiProj || null) + '</small></td>' +
        '<td class="r"><button type="button" class="btn-p ac-bt" data-camp-acao="fila">' + (aberta ? 'Fechar' : 'Fila (' + num(c.prontos) + ')') + '</button></td></tr>';
    });
    h += '</tbody></table></div></div>';
    // fila da ação aberta: quadro próprio abaixo da tabela (cabe na tela do celular)
    var c = vis.filter(function (x) { return x.id === est.camp; })[0];
    if (c) {
      var r = c.resultado;
      h += '<div class="card ac-det" data-camp="' + esc(c.id) + '"><div class="crm-fila-top"><h2>Fila · ' + esc(c.nome) + ' · ' + esc(c.data.split('-').reverse().slice(0, 2).join('/')) + '</h2>' +
        '<button type="button" class="btn-s" data-camp-acao="fila">Fechar</button></div>' +
        '<div class="ac-det-info">' + num(r.enviados) + ' enviados · ' + num(r.compraram) + ' compraram · ' + num(r.enviadosHoje) + ' hoje · ' + num(c.prontos) + ' prontos · ' + esc(c.canal) + '</div>' +
        (ctx.admin ? '<div class="crm-camp-link"><input class="campo" data-camp-link value="' + esc(c.link || '') + '" placeholder="https://… link da oferta (entra no {{LinkOferta}})">' +
          '<button class="btn-s" type="button" data-camp-acao="link">Salvar link</button><button class="lnk" type="button" data-camp-acao="arquivar">arquivar</button></div>' : '') +
        (precisaLink(c) ? '<div class="aviso">Falta o link da oferta: ' + (ctx.admin ? 'cole acima' : 'peça ao administrador') + ' antes de enviar.</div>' : '') +
        (!c.script ? '<div class="aviso">Esta ação veio sem script do Axoly: abra "ver/editar mensagem" e escreva antes de enviar.</div>' : '') +
        '<div class="msg" data-camp-msg></div>' + filaCampanha(d, ctx, c) + '</div>';
    }
    return h + '</section>';
  }

  function filaCampanha(d, ctx, c) {
    var u = ctx.util, esc = u.esc, num = u.num;
    if (!c.fila.length) return '<div class="empty">Ninguém pronto para receber hoje nesta campanha. 👍</div>';
    var bloq = precisaLink(c);
    return '<div class="crm-lista">' + c.fila.map(function (cli) {
      var aberto = est.abertos['c|' + cli.tel];
      return '<div class="crm-cli" data-ctel="' + esc(cli.tel) + '">' +
        '<div class="crm-cli-top"><div><b>' + esc(cli.nome || cli.primeiro || 'Cliente') + '</b> <span class="tag-canal">' + NOMES_CANAL[cli.canal] + '</span>' +
        '<div class="crm-tel' + (cli.telOk ? '' : ' fora') + '">' + esc(fmtTel(cli.tel)) + (cli.telOk ? '' : ' · fora do padrão') + '</div></div>' +
        '<div class="crm-bts"><button type="button" class="btn-p crm-env" data-cacao="enviar"' + (bloq ? ' disabled' : '') + '>Enviar</button><button type="button" class="btn-s" data-cacao="pular">Pular</button></div></div>' +
        '<div class="crm-info">última compra ' + esc(cli.ultima) + (cli.dias != null ? ' (há ' + cli.dias + ' dias)' : '') + ' · ' + num(cli.qtd) + ' pedido(s) · ' + u.brl(cli.total) +
        (cli.marca ? ' · ' + esc(cli.marca) : '') + (cli.loja ? ' · ' + esc(cli.loja) : '') + '</div>' +
        '<button type="button" class="crm-ver" data-cacao="ver">' + (aberto ? 'esconder mensagem' : 'ver/editar mensagem') + '</button>' +
        (aberto ? '<textarea class="campo crm-msg" rows="6">' + esc(msgCampanha(d, c, cli)) + '</textarea>' : '') +
        '<div class="msg"></div></div>';
    }).join('') + '</div>' + (c.prontos > c.fila.length ? '<div class="var">Mostrando ' + num(c.fila.length) + ' de ' + num(c.prontos) + ' (os de maior gasto primeiro).</div>' : '');
  }

  function ligarCampanhas(el, d, ctx) {
    if (!d.campanhas) return;
    var bi = el.querySelector('#crm-imp');
    if (bi) bi.addEventListener('click', function () { est.importar = !est.importar; render(el, d, ctx); });
    var ok = el.querySelector('#crm-imp-ok');
    if (ok) ok.addEventListener('click', function () {
      var msg = el.querySelector('#crm-imp-msg'), lista, metas;
      try {
        var j = JSON.parse(el.querySelector('#crm-imp-txt').value);
        lista = Array.isArray(j) ? j : (j.campanhas || []);
        metas = Array.isArray(j) ? undefined : j.metas;
        if (!Array.isArray(lista) || (!lista.length && !metas)) throw new Error('formato');
      } catch (e) { msg.className = 'msg erro'; msg.textContent = ERROS_CAMP.dados_invalidos; return; }
      ok.disabled = true; msg.className = 'msg'; msg.textContent = 'Importando…';
      ctx.acao('importarCampanhas', { campanhas: lista, metas: metas }).then(function (r) {
        est.importar = false;
        msg.textContent = (r && r.novas || 0) + ' nova(s), ' + (r && r.atualizadas || 0) + ' atualizada(s).';
        ctx.recarregar();
      }).catch(function (e) { ok.disabled = false; msg.className = 'msg erro'; msg.textContent = ERROS_CAMP[e.message] || 'Não foi possível importar.'; });
    });
    el.querySelectorAll('[data-mes]').forEach(function (b) {
      b.addEventListener('click', function () { est.mesCamp = somarMes(mesCampanhas(d), +b.dataset.mes); est.camp = null; render(el, d, ctx); });
    });
    el.querySelectorAll('[data-fcamp]').forEach(function (b) {
      b.addEventListener('click', function () { est.filtroCamp = b.dataset.fcamp; render(el, d, ctx); });
    });
    el.querySelectorAll('tr[data-camp], .ac-det[data-camp]').forEach(function (box) {
      var c = d.campanhas.filter(function (x) { return x.id === box.dataset.camp; })[0];
      if (!c) return;
      var msgC = box.querySelector('[data-camp-msg]');
      box.addEventListener('click', function (e) {
        var a = e.target.dataset.campAcao;
        if (a === 'fila') { est.camp = est.camp === c.id ? null : c.id; render(el, d, ctx); return; }
        if (a === 'link' || a === 'arquivar') {
          if (a === 'arquivar' && !confirm('Arquivar a campanha "' + c.nome + '"? Ela sai do painel (os envios continuam registrados).')) return;
          var p = a === 'link' ? { id: c.id, link: box.querySelector('[data-camp-link]').value.trim() } : { id: c.id, status: 'arquivada' };
          e.target.disabled = true;
          ctx.acao('editarCampanha', p).then(function () { ctx.recarregar(); })
            .catch(function (er) { e.target.disabled = false; msgC.className = 'msg erro'; msgC.textContent = ERROS_CAMP[er.message] || 'Não foi possível salvar.'; });
          return;
        }
        var ca = e.target.dataset.cacao, cl = e.target.closest('.crm-cli');
        if (!ca || !cl) return;
        var tel = cl.dataset.ctel, cli = c.fila.filter(function (x) { return x.tel === tel; })[0];
        var msgEl = cl.querySelector('.msg');
        var tirar = function () {
          var i = c.fila.indexOf(cli); if (i >= 0) c.fila.splice(i, 1);
          c.prontos = Math.max(0, c.prontos - 1);
          delete est.abertos['c|' + tel];
          render(el, d, ctx);
        };
        if (ca === 'ver') { est.abertos['c|' + tel] = !est.abertos['c|' + tel]; render(el, d, ctx); return; }
        if (ca === 'pular') {
          ctx.acao('pular', { telefone: tel }).then(tirar).catch(function () { msgEl.className = 'msg erro'; msgEl.textContent = 'Não foi possível pular agora.'; });
          return;
        }
        if (ca === 'enviar') {
          var ta = cl.querySelector('.crm-msg'), padrao = msgCampanha(d, c, cli), texto = ta ? ta.value : padrao;
          window.open('https://wa.me/' + tel + '?text=' + encodeURIComponent(texto), '_blank', 'noopener');
          e.target.disabled = true;
          ctx.acao('registrarEnvio', { telefone: tel, segmento: 'camp:' + c.id, canal: cli.canal, modelo: 'camp:' + c.id + (ta && texto !== padrao ? ' (editada)' : '') })
            .then(function () { c.resultado.enviados++; c.resultado.enviadosHoje++; tirar(); })
            .catch(function (er) {
              e.target.disabled = false;
              msgEl.className = 'msg erro';
              msgEl.textContent = er.message === 'ja_enviado' ? 'Este cliente já recebeu mensagem nos últimos ' + d.travas.dias + ' dias.' : 'O WhatsApp abriu, mas o envio não foi registrado. Toque em Enviar de novo só se não tiver mandado.';
            });
        }
      });
    });
  }

  // ---------- base ----------
  function baseHtml(d, ctx, canal) {
    var u = ctx.util, num = u.num;
    var c = d.canais[canal] || d.canais.site || d.canais.pdv;
    var linha = function (rotulo, a, total) {
      var p = total ? a / total : 0;
      return '<div class="crm-l"><span>' + u.esc(rotulo) + '</span><b>' + num(a) + ' <em>' + u.pct(p) + '</em></b></div><div class="crm-bar"><i style="width:' + (p * 100).toFixed(1) + '%"></i></div>';
    };
    return '<section class="card crm-base"><h2>Base de clientes · ' + NOMES_CANAL[canal] + '</h2>' +
      '<div class="crm-l"><span>Clientes</span><b>' + num(c.clientes) + ' <em>' + num(d.ambos) + ' compraram nos dois canais</em></b></div>' +
      linha('WhatsApp no padrão', c.telefoneOk, c.clientes) +
      '<div class="crm-l"><span>Telefone fora do padrão (vermelho)</span><b class="crm-verm">' + num(c.telefoneForaPadrao) + '</b></div>' +
      linha('Aceitam contato (SAIR fica fora)', c.aceitam, c.clientes) +
      linha('Com marca identificada', c.comMarca, c.clientes) +
      (canal === 'pdv' ? linha('Com data de nascimento', c.comNascimento, c.clientes) : '') +
      '<div class="crm-l"><span>Pedidos sem telefone (não viram cliente)</span><b>' + num(c.pedidosSemTelefone) + '</b></div></section>';
  }

  Painel.registrarModulo({ id: 'crm', nome: 'CRM', icone: '💬', simbolo: 'pessoas', descricao: 'Clientes para contatar, campanhas e resultados do WhatsApp.', periodos: null, render: render });
})();

Painel.iniciar();
