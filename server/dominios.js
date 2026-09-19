// Quem e "da ADM" pelo e-mail. Um lugar so, porque duas portas dependem disto:
// o cadastro com senha (server/auth.js) e o login com o Google (server/google.js).
//
// ATENCAO: o dominio sozinho NAO prova nada. Qualquer um digita
// fulano@admsolucoes.com.br num formulario. So o login com o Google prova que a
// pessoa e dona do endereco - ver "Entrar com o Google" em docs/plano-login.md.
//
// VARIAS SEDES (scripts/sedes.sh): DOMINIOS_SEDE AUSENTE cai no padrao da ADM,
// como sempre foi. Mas DOMINIOS_SEDE PRESENTE E VAZIO quer dizer "nenhum
// dominio": ninguem cria conta por e-mail. Antes, vazio tambem caia no padrao -
// e a sede de um cliente criado sem dominio aceitaria cadastro de qualquer
// @admsolucoes. Com varias empresas no mesmo servidor, isso e vazamento.
const DOMINIOS_PADRAO = ['admsolucoes.com.br', 'admsolucoes.com'];
const bruto = process.env.DOMINIOS_SEDE;
const DOMINIOS = bruto === undefined
  ? DOMINIOS_PADRAO
  : String(bruto).split(',').map((d) => d.trim().toLowerCase()).filter(Boolean);

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
