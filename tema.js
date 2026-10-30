/* CORE · aplica o tema salvo antes da pintura (evita piscar). auto = segue o sistema. */
(function () {
  try {
    var t = localStorage.getItem('painel_tema');
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
  } catch (e) { /* sem storage: segue o sistema */ }
})();
