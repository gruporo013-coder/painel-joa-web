/* CORE · aplica o tema salvo antes da pintura (evita piscar). Padrão = escuro; "light" = claro. */
(function () {
  var t = 'dark';
  try { if (localStorage.getItem('painel_tema') === 'light') t = 'light'; } catch (e) { /* sem storage: escuro */ }
  document.documentElement.setAttribute('data-theme', t);
})();
