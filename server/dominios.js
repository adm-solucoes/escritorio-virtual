// Quem e "da ADM" pelo e-mail. Um lugar so, porque duas portas dependem disto:
// o cadastro com senha (server/auth.js) e o login com o Google (server/google.js).
//
// ATENCAO: o dominio sozinho NAO prova nada. Qualquer um digita
// fulano@admsolucoes.com.br num formulario. So o login com o Google prova que a
// pessoa e dona do endereco - ver "Entrar com o Google" em docs/plano-login.md.
const DOMINIOS_PADRAO = ['admsolucoes.com.br', 'admsolucoes.com'];
const DOMINIOS_SEDE = String(process.env.DOMINIOS_SEDE || '')
  .split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);
const DOMINIOS = DOMINIOS_SEDE.length ? DOMINIOS_SEDE : DOMINIOS_PADRAO;

function dominioDe(email) {
  const texto = String(email || '').trim();
  const arroba = texto.lastIndexOf('@');
  return arroba < 0 ? '' : texto.slice(arroba + 1).toLowerCase();
}

function ehEmailDaSede(email) {
  const dominio = dominioDe(email);
  return !!dominio && DOMINIOS.includes(dominio);
}

module.exports = { DOMINIOS, dominioDe, ehEmailDaSede };
