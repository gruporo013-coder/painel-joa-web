/**
 * CORE · shell do painel: login por código, sessão, navegação entre módulos,
 * abas de período, tema e atualização automática a cada 2 min.
 *
 * Contrato de módulo (web):
 *   Painel.registrarModulo({
 *     id: 'vendas', nome: 'Vendas', icone: '📈',
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

  // ---------- utilidades expostas aos módulos ----------
  var util = {
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

  // ---------- tema: auto → claro → escuro ----------
  function aplicarTema(t) {
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
    $('btn-tema').title = 'Tema: ' + ({ light: 'claro', dark: 'escuro' }[t] || 'automático');
  }
  $('btn-tema').addEventListener('click', function () {
    var atual = ls(LS.tema) || 'auto';
    var prox = { auto: 'light', light: 'dark', dark: 'auto' }[atual] || 'auto';
    ls(LS.tema, prox === 'auto' ? null : prox);
    aplicarTema(prox);
  });
  aplicarTema(ls(LS.tema) || 'auto');

  // ---------- app ----------
  function iniciar() {
    if (!ls(LS.token)) { mostrarLogin(); return; }
    api('sessao').then(function (r) {
      if (!r.ok) { mostrarLogin(); return; }
      st.modulos = (r.modulos || []).filter(function (m) { return Painel.modulos[m.id]; });
      st.admin = !!r.admin;
      $('btn-acesso').hidden = !st.admin;
      $('btn-conexoes').hidden = !st.admin;
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
    var nav = $('mods');
    nav.hidden = st.modulos.length < 2 && !st.admin; // admin precisa voltar da tela de acesso
    nav.innerHTML = st.modulos.map(function (m) {
      return '<button type="button" data-m="' + util.esc(m.id) + '">' + util.esc((m.icone ? m.icone + ' ' : '') + m.nome) + '</button>';
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
    $('titulo-mod').textContent = '· ' + (info.nome || def.nome);
    document.title = (CFG.nome || '') + ' · ' + (info.nome || def.nome);
    document.querySelectorAll('#mods button').forEach(function (b) { b.classList.toggle('on', b.dataset.m === id); });
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
      $('dot').classList.remove('off');
      $('upd').textContent = 'Atualizado ' + (d.atualizadoEm || '—') + (d.de ? ' · ' + d.de + (d.ate && d.de !== d.ate ? ' a ' + d.ate : '') : '');
      $('tip').style.opacity = 0;
      def.render(body, d, ctxModulo(id, d._ocultas));
      body.classList.remove('loading');
    }).catch(function (e) {
      if (seq !== st.seq || e.message === 'nao_autenticado') return;
      if (e.message === 'sem_permissao') { mostrarErro('Você não tem acesso a este painel.'); return; }
      $('dot').classList.add('off');
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
    document.querySelectorAll('#mods button').forEach(function (b) { b.classList.remove('on'); });
    $('tabs').hidden = true;
    $('titulo-mod').textContent = '· Acesso';
    $('upd').textContent = 'Quem pode entrar e o que cada um vê';
    $('body').innerHTML = '<div class="card empty">Carregando…</div>';
    api('admin.usuarios').then(function (r) {
      if (!r.ok) throw new Error(r.erro);
      desenharAcesso(r.usuarios, r.modulos);
    }).catch(function () { mostrarErro('Não foi possível carregar os usuários.'); });
  }

  var blocosAbertos = {}; // e-mails com o detalhe de blocos aberto (sobrevive ao redesenho)

  function desenharAcesso(usuarios, modulos) {
    var esc = util.esc;
    var nCols = modulos.length + 3;
    var ocultasPor = {};
    usuarios.forEach(function (u) { ocultasPor[u.email] = u.ocultas || {}; });
    var ck = function (attrs, on, dis) { return '<input type="checkbox" ' + attrs + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '>'; };
    var temSecoes = modulos.some(function (m) { return (m.secoes || []).length; });
    var cab = '<tr><th>E-mail</th>' + modulos.map(function (m) { return '<th class="c">' + esc(m.nome) + '</th>'; }).join('') + '<th class="c">Admin</th><th></th></tr>';
    var linhas = usuarios.map(function (u) {
      var tudo = u.modulos === '*';
      var ve = function (id) { return tudo || (u.modulos || []).indexOf(id) >= 0; };
      var nOcultos = Object.keys(u.ocultas || {}).reduce(function (s, k) { return s + (ve(k) ? u.ocultas[k].length : 0); }, 0);
      var podeBlocos = temSecoes && !u.adminFixo && !u.admin;
      var linha = '<tr data-email="' + esc(u.email) + '"><td class="em">' + esc(u.email) + (u.adminFixo ? ' <span class="tag-fixo">fixo</span>' : '') +
        (nOcultos ? ' <span class="tag-fixo">' + nOcultos + ' bloco(s) oculto(s)</span>' : '') + '</td>' +
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
      return linha + '<tr class="det" data-det="' + esc(u.email) + '"' + (blocosAbertos[u.email] ? '' : ' hidden') + '><td colspan="' + nCols + '">' +
        '<div class="blk-tit">Blocos que <b>' + esc(u.email) + '</b> vê (desmarque para esconder)</div>' +
        (grupos || '<div class="var">Libere algum painel para escolher os blocos.</div>') + '</td></tr>';
    }).join('');
    var novo = '<tr class="novo"><td><input id="ac-email" type="email" placeholder="novo@email.com" autocomplete="off"></td>' +
      modulos.map(function (m) { return '<td class="c"><input type="checkbox" data-novo-m="' + esc(m.id) + '" checked></td>'; }).join('') +
      '<td class="c"><input type="checkbox" id="ac-admin"></td><td class="c"><button class="btn-p" id="ac-add" type="button">Adicionar</button></td></tr>';
    $('body').innerHTML = '<section class="card acesso"><h2>Acesso ao painel</h2>' +
      '<p class="aviso">Marque quais painéis cada pessoa vê e, em <b>Blocos</b>, quais partes de cada painel. As mudanças valem na hora. Administradores veem tudo. O código de login chega no e-mail da pessoa.</p>' +
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
      return api('admin.salvarUsuario', { email: email, modulos: mods, admin: tr.querySelector('[data-admin]').checked, ocultas: ocultas });
    };
    var tratar = function (p, okMsg) {
      return p.then(function (r) {
        if (!r.ok) { msgA(ERROS_ACESSO[r.erro] || 'Não foi possível salvar.', true); return; }
        desenharAcesso(r.usuarios, modulos);
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
      tratar(api('admin.salvarUsuario', { email: email, modulos: mods, admin: $('ac-admin').checked, ocultas: {} }), email + ' adicionado.');
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
    document.querySelectorAll('#mods button').forEach(function (b) { b.classList.remove('on'); });
    $('tabs').hidden = true;
    $('titulo-mod').textContent = '· Conexões';
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
    if (ve('faturamento') && t.valor !== undefined) {
      hero.push('<div class="card"><div class="lbl">Faturamento · ' + esc(d.rotulo) + '</div><div class="big">' + brl(t.valor) + '</div>' + u.varHtml(t.varPct, d.rotuloComp) +
        (proj ? '<div class="v-proj"><span>Projeção ' + (nomeCiclo === 'mês' ? 'do mês' : 'da semana') + '</span><b>' + brl(proj.total) + '</b>' +
          (proj.varPct === null ? '' : '<em class="' + (proj.varPct >= 0 ? 'up' : 'dn') + '">' + (proj.varPct >= 0 ? '+' : '') + u.pct(proj.varPct, 1) + ' vs ' + (nomeCiclo === 'mês' ? 'mês passado' : 'semana passada') + ' (' + brl(proj.anteriorInteiro) + ')</em>') +
          '<small>ritmo de ' + proj.diasDecorridos + ' de ' + proj.diasTotal + ' dias</small></div>' : '') + '</div>');
    }
    if (ve('pedidos') && t.pedidos !== undefined) hero.push('<div class="card"><div class="lbl">Pedidos</div><div class="mid">' + num(t.pedidos) + '</div><div class="var">antes: ' + num(t.pedidosAnt) + '</div></div>');
    if (ve('ticket') && t.ticket !== undefined) hero.push('<div class="card"><div class="lbl">Ticket médio</div><div class="mid">' + brl(t.ticket) + '</div><div class="var">&nbsp;</div></div>');
    if (hero.length) h += '<section class="v-hero"' + (hero.length < 3 ? ' style="grid-template-columns:repeat(' + hero.length + ',1fr)"' : '') + '>' + hero.join('') + '</section>';

    // canais (a % usa a soma dos canais, que funciona mesmo com o faturamento oculto)
    if (ve('canais') && d.canais) {
      var totCanais = d.canais.reduce(function (s, c) { return s + c.valor; }, 0);
      h += '<section class="v-grid3">';
      d.canais.forEach(function (c) {
        var pct = totCanais ? c.valor / totCanais : 0;
        h += '<div class="card v-ch"><div class="head"><i class="sw" style="background:' + cor(c.nome) + '"></i><span class="lbl">' + esc(c.nome) + '</span></div>' +
          '<div class="mid">' + brl(c.valor) + '</div>' + u.varHtml(c.varPct, 'antes') +
          '<div class="v-share"><i style="width:' + (pct * 100).toFixed(1) + '%;background:' + cor(c.nome) + '"></i></div>' +
          '<div class="v-meta"><span>' + num(c.pedidos) + ' pedidos · TM ' + brl(c.ticket) + '</span><span>' + (pct * 100).toFixed(0) + '%</span></div>' +
          porLojaHtml(c, u) + '</div>';
      });
      h += '</section>';
    }

    // metas (mês, mês anterior e semana)
    if (ve('metas') && d.metas) h += metasHtml(d, ctx);

    // gráfico + online × físico
    var serie = ve('grafico') && d.serie ? d.serie : null;
    var nomes = d.canais ? d.canais.map(function (c) { return c.nome; })
      : (serie && serie[0] ? Object.keys(serie[0]).filter(function (k) { return k !== 'dia'; }) : []);
    var blocoGraf = serie ? '<div class="card"><h2>' + (d.serieTipo === 'mes' ? 'Faturamento por mês' : 'Faturamento por dia') + '</h2>' +
      (serie.length ? u.grafico(serie, nomes, cor, { todosRotulos: d.serieTipo === 'mes' || serie.length <= 7 })
        : '<div class="empty">O gráfico aparece nos períodos de semana, 7 dias, mês e ano.</div>') + '</div>' : '';
    var blocoOF = ve('onlineFisico') ? onlineFisicoHtml(d, u) : '';
    if (blocoGraf || blocoOF) h += '<section class="v-row2"' + (blocoGraf && blocoOF ? '' : ' style="grid-template-columns:1fr"') + '>' + blocoGraf + blocoOF + '</section>';

    // vendedores: uma coluna por loja
    if (ve('vendedores')) h += vendedoresHtml(d, u);

    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    if (serie && serie.length) u.ligarGrafico(el, serie, nomes);
    ligarMetas(el, d, ctx);
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

  function metasHtml(d, ctx) {
    var u = ctx.util, m = d.metas, esc = u.esc;
    var proj = !!(d.projecao && d.projecao.ativa);
    var temMeta = m.total.metas.some(Boolean);
    var h = '<section class="card v-metas"><div class="v-metas-top"><h2>Metas ' + (m.tipo === 'semana' ? 'da ' : 'de ') + esc(m.rotulo) + '</h2>' +
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
    return '<div class="card v-of"><h2>Online × Físico</h2>' +
      '<div class="v-of-bar"><i style="width:' + (o.pctOnline * 100).toFixed(1) + '%;background:' + cor('Online') + '"></i><i style="width:' + ((1 - o.pctOnline) * 100).toFixed(1) + '%;background:' + cor('Lojas físicas') + '"></i></div>' +
      '<div class="v-of-lin"><span><i class="sw" style="background:' + cor('Online') + '"></i>Online <em>' + u.num(o.pedidosOnline) + ' ped.</em></span><span><b>' + u.brl(o.online) + '</b> ' + u.pct(o.pctOnline) + '</span></div>' +
      '<div class="v-of-lin"><span><i class="sw" style="background:' + cor('Lojas físicas') + '"></i>Lojas físicas <em>' + u.num(o.pedidosFisico) + ' ped.</em></span><span><b>' + u.brl(o.fisico) + '</b> ' + u.pct(1 - o.pctOnline) + '</span></div>' +
      '<div class="var">' + (dif === null ? 'sem base de comparação' : 'participação do online: <b class="' + (dif >= 0 ? 'up' : 'dn') + '">' + (dif >= 0 ? '+' : '') + (dif * 100).toFixed(1).replace('.', ',') + ' p.p.</b> vs ' + u.esc(d.rotuloComp)) + '</div></div>';
  }

  // ---------- vendedores: uma coluna por loja ----------
  function vendedoresHtml(d, u) {
    var lojas = d.vendedoresPorLoja;
    if (!lojas) return '';
    var resumoLoja = {};
    (d.lojas || []).forEach(function (l) { resumoLoja[l.nome] = l; });
    var h = '<section class="card v-vend"><h2>Lojas físicas · ranking de vendedores</h2><div class="v-vend-cols">';
    lojas.forEach(function (l) {
      var r = resumoLoja[l.loja] || {};
      h += '<div class="v-vend-col"><div class="v-vc-top"><div class="nome">' + u.esc(l.loja) + '</div><div class="val">' + u.brl(l.total) + '</div>' +
        '<div class="sub">' + u.num(l.pedidos) + ' vendas · TM ' + u.brl(r.ticket || 0) +
        (r.varPct == null ? '' : ' · <b class="' + (r.varPct >= 0 ? 'up' : 'dn') + '">' + (r.varPct >= 0 ? '+' : '') + (r.varPct * 100).toFixed(0) + '%</b>') + '</div></div>';
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

  Painel.registrarModulo({ id: 'vendas', nome: 'Vendas', icone: '📈', periodos: PERIODOS, periodoPadrao: 'hoje', render: render });
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
      'Atualizado pela API do Meta a cada 6 h. As compras são as que o Meta atribui (somadas ao Google passam do real: a receita sem contar 2x está em Mensal).');
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
    if (!g.temDados) return h + '<div class="empty">Conexão configurada, aguardando a primeira leitura do GA4 (roda a cada 6 horas).</div></section>';
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
      '</tbody></table></div><div class="var e-nota">Atualiza sozinho: receita e pedidos do Tiny (a cada 10 min), sessões do GA4 (6 h), investimento do Google Ads (diário) + manuais. Verde = no ou acima do esperado.</div></section>';
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

  Painel.registrarModulo({ id: 'ecommerce', nome: 'E-Commerce de Performance', icone: '🛒', periodoPadrao: 'mes', render: render });
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

  Painel.registrarModulo({ id: 'marketplace', nome: 'Marketplace', icone: '🏪', periodoPadrao: 'mes', render: render });
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

  Painel.registrarModulo({ id: 'pedidos', nome: 'Pedidos online parados', icone: '📦', periodos: null, render: render });
})();

/* ---- crm ---- */
/* CRM · Site | Lojas: resultados do mês, segmentos com fila do dia (WhatsApp via wa.me + registro), base de clientes. */
(function () {
  var LS = 'painel_crm_canal';
  var est = { seg: { site: null, pdv: null }, marca: { site: '', pdv: '' }, filaMarca: { site: null, pdv: null }, abertos: {} };
  var canalAtual = function () { try { return localStorage.getItem(LS) || 'site'; } catch (e) { return 'site'; } };
  var NOMES_CANAL = { site: 'Site', pdv: 'Lojas' };

  function render(el, d, ctx) {
    var u = ctx.util, num = u.num, brl = u.brl, esc = u.esc;
    var canal = canalAtual();
    var h = '<nav class="crm-sub">' + [['site', '🛍️ Site'], ['pdv', '🏬 Lojas']].map(function (x) {
      return '<button type="button" data-c="' + x[0] + '"' + (x[0] === canal ? ' class="on"' : '') + '>' + x[1] + '</button>';
    }).join('') + '</nav>';

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

    if (!d.filas && !d.canais && !d.resultados) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    ligar(el, d, ctx, canal);
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
    el.querySelector('.crm-sub').addEventListener('click', function (e) {
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

  // ---------- base ----------
  function baseHtml(d, ctx, canal) {
    var u = ctx.util, num = u.num;
    var c = d.canais[canal] || d.canais.site;
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

  Painel.registrarModulo({ id: 'crm', nome: 'CRM', icone: '💬', periodos: null, render: render });
})();

Painel.iniciar();
