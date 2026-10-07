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

  Painel.registrarModulo({ id: 'vendas', nome: 'Vendas', icone: '📈', periodos: PERIODOS, periodoPadrao: 'mes', render: render });
})();

/* ---- ecommerce ---- */
/* E-COMMERCE DE PERFORMANCE · online (Site e ML), tráfego pago, cancelamentos e dia da semana. */
(function () {
  var CORES = { 'Site': 'var(--s2)', 'Mercado Livre': 'var(--s3)', 'Outros': 'var(--s4)' };
  var cor = function (n) { return CORES[n] || 'var(--s4)'; };

  function render(el, d, ctx) {
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
    var bc = ve('cancelamentos') && d.cancelamentos ? cancelHtml(d, u) : '';
    var bd = ve('diaSemana') && d.diaSemana ? diaSemanaHtml(d, u) : '';
    if (bc || bd) h += '<section class="e-grid2"' + (bc && bd ? '' : ' style="grid-template-columns:1fr"') + '>' + bc + bd + '</section>';

    if (!h) h = '<div class="card empty">Nenhum bloco deste painel está liberado para o seu acesso.</div>';
    el.innerHTML = h;
    var ds = bd ? serieDias(d) : [];
    if (ds.length && el.querySelector('.e-dias')) u.ligarGrafico(el.querySelector('.e-dias'), ds, nomesDias(d));
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
    return h + '<div class="var e-nota">Investimento lançado à mão na planilha (aba ecommerce_investimento). ROAS considera todo o faturamento do ' + u.esc(t.canal) + '.</div></section>';
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

  Painel.registrarModulo({ id: 'ecommerce', nome: 'E-Commerce de Performance', icone: '🛒', periodoPadrao: 'mes', render: render });
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

Painel.iniciar();
