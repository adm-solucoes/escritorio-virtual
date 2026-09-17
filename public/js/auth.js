// Tela de login e conversa com /api. A sessao vive num cookie HttpOnly, entao aqui
// nao tem token nenhum pra guardar. Ver docs/plano-login.md.
(function () {
  let tela, form, erroEl, botao;
  let abaEntrar, abaCriar;
  let modo = 'entrar'; // 'entrar' | 'criar' | 'convidado'
  let aoEntrar = null;

  // Link de visitante: `?convite=TOKEN`. Ver docs/plano-convidado.md.
  const tokenConvite = new URLSearchParams(location.search).get('convite');

  const ROTULO = {
    entrar: 'Entrar',
    criar: 'Criar conta e entrar',
    convidado: 'Entrar como visitante',
  };

  async function pedir(rota, opcoes) {
    const resposta = await fetch('/api' + rota, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    }, opcoes));

    let dados = null;
    try { dados = await resposta.json(); } catch (e) { dados = null; }
    if (!resposta.ok) {
      throw new Error((dados && dados.erro) || 'Nao consegui falar com o servidor.');
    }
    return dados;
  }

  function eu() {
    return pedir('/eu', { method: 'GET' }).then((d) => {
      if (tokenConvite) history.replaceState(null, '', location.pathname);
      return d.usuario;
    });
  }

  function salvarPerfil(dados) {
    return pedir('/perfil', { method: 'PUT', body: JSON.stringify(dados) })
      .then((d) => d.usuario);
  }

  function sair() {
    return pedir('/sair', { method: 'POST' });
  }

  // ---------- tela ----------

  function mostrarErro(mensagem) {
    erroEl.textContent = mensagem;
    erroEl.classList.remove('oculto');
  }

  function limparErro() {
    erroEl.textContent = '';
    erroEl.classList.add('oculto');
  }

  // Quem tem e-mail da empresa nao precisa de codigo nenhum, entao nem ve o
  // campo. Ele so aparece quando a pessoa digita um e-mail de FORA - e ai
  // aparece junto com a explicacao de por que ele apareceu.
  //
  // A lista de dominios e a mesma do servidor (server/auth.js), mas aqui ela e
  // so pra decidir o que MOSTRAR: quem decide quem entra continua sendo o
  // servidor. Se as duas divergirem, o pior que acontece e o campo aparecer a
  // toa - nunca o contrario.
  const DOMINIOS_SEDE = ['admsolucoes.com.br', 'admsolucoes.com'];

  function ehEmailDaSede(email) {
    const arroba = String(email || '').lastIndexOf('@');
    if (arroba < 0) return false;
    return DOMINIOS_SEDE.includes(email.slice(arroba + 1).toLowerCase().trim());
  }

  // O servidor diz se o login com o Google esta ligado (/api/login-opcoes).
  // Ligado, e-mail da ADM nao se cadastra com senha - entra pelo botao.
  let googleLigado = false;

  function mostrarCampoCodigo() {
    const campo = document.getElementById('campo-codigo');
    if (!campo) return;
    const email = document.getElementById('login-email').value;
    // Enquanto a pessoa nao digitou um e-mail completo, o campo fica fora do
    // caminho: mostrar "precisa do codigo" antes do @ seria assustar a toa.
    const deFora = email.includes('@') && !ehEmailDaSede(email);
    campo.classList.toggle('oculto', modo !== 'criar' || !deFora);
    // E o contrario: e-mail da ADM no cadastro, com o Google ligado, ganha o
    // aviso de que o caminho e o botao - antes de a pessoa inventar uma senha
    // que o servidor vai recusar.
    const dica = document.getElementById('dica-email-adm');
    if (dica) dica.classList.toggle('oculto', !(modo === 'criar' && googleLigado && ehEmailDaSede(email)));
  }

  // Volta do Google com problema: `?entrar=...` (ver server/auth.js).
  const AVISOS_GOOGLE = {
    cancelado: 'O login com o Google foi cancelado.',
    dominio: 'Essa conta Google nao e da ADM. Escolha a conta @admsolucoes.com.br.',
    erro: 'Nao deu pra entrar com o Google. Tenta de novo.',
    indisponivel: 'O login com o Google nao esta ligado neste servidor.',
  };
  const avisoGoogle = AVISOS_GOOGLE[new URLSearchParams(location.search).get('entrar')] || '';
  if (avisoGoogle) history.replaceState(null, '', location.pathname);

  function carregarOpcoes() {
    fetch('/api/login-opcoes', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((o) => {
        googleLigado = !!o.google;
        document.getElementById('login-google').classList.toggle('oculto', !googleLigado || modo === 'convidado');
        mostrarCampoCodigo();
      })
      .catch(() => { /* sem opcoes: fica so e-mail e senha */ });
  }

  function trocarModo(novo) {
    modo = novo;
    limparErro();
    const visita = modo === 'convidado';

    abaEntrar.classList.toggle('ativa', modo === 'entrar');
    abaCriar.classList.toggle('ativa', modo === 'criar');
    // No modo visita nao ha o que escolher: quem chegou pelo link nao tem conta
    // e nao pode criar uma sem o codigo da sede.
    document.getElementById('login-abas').classList.toggle('oculto', visita);
    document.getElementById('login-google').classList.toggle('oculto', visita || !googleLigado);

    // O nome aparece no cadastro E na visita; o resto do cadastro, so no cadastro.
    document.querySelectorAll('.campo-cadastro').forEach((el) => {
      el.classList.toggle('oculto', modo !== 'criar');
    });
    if (visita) document.getElementById('campo-nome').classList.remove('oculto');
    // O campo do codigo tem regra propria: ele so existe pra e-mail de fora.
    mostrarCampoCodigo();

    // E-mail e senha somem na visita - e param de ser obrigatorios, senao o
    // navegador barra o envio de um campo que nem esta na tela.
    document.querySelectorAll('.campo-conta').forEach((el) => {
      el.classList.toggle('oculto', visita);
      const campo = el.querySelector('input');
      if (campo) campo.required = !visita;
    });

    document.getElementById('login-sub').textContent = visita
      ? 'Voce foi convidado pra visitar a sede'
      : 'Escritorio virtual da empresa junior';

    botao.textContent = ROTULO[modo];
    document.getElementById('login-senha').setAttribute(
      'autocomplete', modo === 'entrar' ? 'current-password' : 'new-password'
    );
  }

  function ocupado(sim) {
    botao.disabled = sim;
    botao.textContent = sim ? 'So um instante...' : ROTULO[modo];
  }

  async function enviar(ev) {
    ev.preventDefault();
    limparErro();
    ocupado(true);

    const email = document.getElementById('login-email').value.trim();
    const senha = document.getElementById('login-senha').value;

    try {
      let usuario;
      if (modo === 'convidado') {
        usuario = (await pedir('/convite/entrar', {
          method: 'POST',
          body: JSON.stringify({
            token: tokenConvite,
            nome: document.getElementById('login-nome').value.trim(),
          }),
        })).usuario;
        // Tira o `?convite=` da barra de endereco. Sem isto, um F5 gastaria o
        // link de novo e criaria uma SEGUNDA conta de visitante pra mesma
        // pessoa - ela perderia a conversa e o nome na lista duplicaria.
        history.replaceState(null, '', location.pathname);
      } else if (modo === 'entrar') {
        usuario = (await pedir('/entrar', {
          method: 'POST',
          body: JSON.stringify({ email, senha }),
        })).usuario;
      } else {
        usuario = (await pedir('/registrar', {
          method: 'POST',
          body: JSON.stringify({
            nome: document.getElementById('login-nome').value.trim(),
            email,
            senha,
            codigo: document.getElementById('login-codigo').value.trim(),
            codigoAdmin: document.getElementById('login-admin').value.trim(),
          }),
        })).usuario;
      }
      form.reset();
      aoEntrar(usuario);
    } catch (e) {
      mostrarErro(e.message);
    } finally {
      ocupado(false);
    }
  }

  // Por que a pessoa caiu no login (a diretoria mexeu na conta dela). Vem do
  // network.js, que guarda o motivo antes de recarregar a pagina.
  const AVISOS_LOGIN = {
    'senha-redefinida': 'A diretoria redefiniu a sua senha. Entre com a senha provisoria que ela te passou.',
    'conta-removida': 'Esta conta foi removida da sede pela diretoria.',
  };

  function mostrar() {
    tela.classList.remove('oculto');
    let motivo = '';
    try {
      motivo = sessionStorage.getItem('aviso-login') || '';
      sessionStorage.removeItem('aviso-login');
    } catch (e) { /* sem storage */ }
    if (AVISOS_LOGIN[motivo]) mostrarErro(AVISOS_LOGIN[motivo]);
    else if (avisoGoogle) mostrarErro(avisoGoogle);
    document.getElementById('login-email').focus();
  }

  function esconder() {
    tela.classList.add('oculto');
  }

  function init(callback) {
    aoEntrar = callback;
    tela = document.getElementById('tela-login');
    form = document.getElementById('form-login');
    erroEl = document.getElementById('login-erro');
    botao = document.getElementById('btn-login');
    abaEntrar = document.getElementById('aba-entrar');
    abaCriar = document.getElementById('aba-criar');

    abaEntrar.addEventListener('click', () => trocarModo('entrar'));
    abaCriar.addEventListener('click', () => trocarModo('criar'));
    // O campo do codigo aparece e some conforme a pessoa digita o e-mail.
    document.getElementById('login-email').addEventListener('input', mostrarCampoCodigo);
    form.addEventListener('submit', enviar);
    trocarModo(tokenConvite ? 'convidado' : 'entrar');
    carregarOpcoes();
  }

  window.Auth = { init, eu, sair, salvarPerfil, mostrar, esconder };
})();
