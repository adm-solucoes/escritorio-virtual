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
    erroEl.classList.remove('oculto', 'login-info');
  }

  function limparErro() {
    erroEl.textContent = '';
    erroEl.classList.add('oculto');
    erroEl.classList.remove('login-info');
  }

  // Quem tem e-mail da empresa nao precisa de codigo nenhum, entao nem ve o
  // campo. Ele so aparece quando a pessoa digita um e-mail de FORA - e ai
  // aparece junto com a explicacao de por que ele apareceu.
  //
  // A lista de dominios e a mesma do servidor (server/auth.js), mas aqui ela e
  // so pra decidir o que MOSTRAR: quem decide quem entra continua sendo o
  // servidor. Se as duas divergirem, o pior que acontece e o campo aparecer a
  // toa - nunca o contrario.
  // Comeca vazia e recebe os que o servidor da sede informar
  // (/api/login-opcoes): cada sede de cliente tem os seus.
  let DOMINIOS_SEDE = [];

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
    // o nome da sede e o dominio chegam do servidor (carregarOpcoes)
    dominio: 'Essa conta Google nao e da empresa desta sede. Escolha a conta da empresa.',
    erro: 'Nao deu pra entrar com o Google. Tenta de novo.',
    indisponivel: 'O login com o Google nao esta ligado neste servidor.',
  };
  const codigoAvisoGoogle = new URLSearchParams(location.search).get('entrar');
  let avisoGoogle = AVISOS_GOOGLE[codigoAvisoGoogle] || '';
  if (avisoGoogle) history.replaceState(null, '', location.pathname);

  // Os links que chegam por e-mail (docs/email.md):
  //   ?confirmar=TOKEN  - confirmar o e-mail do cadastro. O link sozinho nao
  //                       entra: ele vai junto no "Entrar", com a senha;
  //   ?redefinir=TOKEN  - o link de senha nova: abre o formulario da senha.
  // O endereco e limpo na hora: o token nao deve ficar no historico do navegador.
  const parametros = new URLSearchParams(location.search);
  const tokenConfirmar = parametros.get('confirmar');
  const tokenRedefinir = parametros.get('redefinir');
  if (tokenConfirmar || tokenRedefinir) history.replaceState(null, '', location.pathname);

  // O servidor diz se esta sede manda e-mail (/api/login-opcoes).
  let emailLigado = false;

  function carregarOpcoes() {
    fetch('/api/login-opcoes', { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.json() : {}))
      .then((o) => {
        googleLigado = !!o.google;
        emailLigado = !!o.email;
        document.getElementById('esqueci-por-email').classList.toggle('oculto', !emailLigado);
        document.getElementById('esqueci-pela-diretoria').classList.toggle('oculto', emailLigado);
        if (Array.isArray(o.dominios)) DOMINIOS_SEDE = o.dominios;
        // Com a marca da sede em maos, o aviso de conta errada fica especifico.
        if (codigoAvisoGoogle === 'dominio' && o.sigla && o.dominio) {
          const antes = avisoGoogle;
          avisoGoogle = 'Essa conta Google nao e da ' + o.sigla + '. Escolha a conta @' + o.dominio + '.';
          if (erroEl && erroEl.textContent === antes) mostrarErro(avisoGoogle);
        }
        document.getElementById('login-google').classList.toggle('oculto', !googleLigado || modo === 'convidado' || !!tokenRedefinir);
        mostrarCampoCodigo();
      })
      .catch(() => { /* sem opcoes: fica so e-mail e senha */ });
  }

  // O subtitulo vem no HTML, ja com a marca da sede (server/marca.js). Guarda
  // pra voltar a ele depois do modo visita.
  let subtituloDaSede = '';

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
      : subtituloDaSede;

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
          body: JSON.stringify({ email, senha, confirmar: tokenConfirmar || undefined }),
        })).usuario;
      } else {
        const r = await pedir('/registrar', {
          method: 'POST',
          body: JSON.stringify({
            nome: document.getElementById('login-nome').value.trim(),
            email,
            senha,
            codigo: document.getElementById('login-codigo').value.trim(),
            codigoAdmin: document.getElementById('login-admin').value.trim(),
          }),
        });
        // Sede com e-mail: a conta so entra depois do link. Volta pra aba de
        // entrar com o e-mail preenchido, e diz onde procurar o link.
        if (r.pendente) {
          trocarModo('entrar');
          document.getElementById('login-senha').value = '';
          mostrarInfo('Quase la! Mandamos um link pra ' + r.email + '. Abra o link e entre com a senha que voce acabou de criar (confira o spam tambem).');
          return;
        }
        usuario = r.usuario;
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
    'senha-trocada': 'A senha desta conta foi trocada por um link de e-mail. Entre com a senha nova.',
    'conta-removida': 'Esta conta foi removida da sede pela diretoria.',
  };

  // Aviso positivo ("mandamos o link"): mesmo lugar do erro, outra cor.
  function mostrarInfo(mensagem) {
    mostrarErro(mensagem);
    erroEl.classList.add('login-info');
  }

  // "Esqueci minha senha", com e-mail: o link vai pro endereco do campo de cima.
  async function pedirSenhaNova() {
    const email = document.getElementById('login-email').value.trim();
    if (!email.includes('@')) {
      mostrarErro('Digite o seu e-mail no campo de cima e clique de novo.');
      document.getElementById('login-email').focus();
      return;
    }
    const b = document.getElementById('btn-esqueci');
    b.disabled = true;
    try {
      const r = await pedir('/esqueci-senha', { method: 'POST', body: JSON.stringify({ email }) });
      mostrarInfo(r.aviso);
    } catch (e) {
      mostrarErro(e.message);
    } finally {
      b.disabled = false;
    }
  }

  // A senha nova, com o token do link. So o formulario da senha fica na tela.
  function abrirSenhaNova() {
    form.classList.add('oculto');
    document.getElementById('login-abas').classList.add('oculto');
    document.getElementById('login-google').classList.add('oculto');
    const f = document.getElementById('form-nova-senha');
    f.classList.remove('oculto');
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const erro = document.getElementById('nova-senha-erro');
      erro.classList.add('oculto');
      const b = f.querySelector('button[type="submit"]');
      b.disabled = true;
      try {
        const r = await pedir('/redefinir-senha', {
          method: 'POST',
          body: JSON.stringify({ token: tokenRedefinir, novaSenha: document.getElementById('nova-senha').value }),
        });
        f.reset();
        aoEntrar(r.usuario);
      } catch (e) {
        erro.textContent = e.message;
        erro.classList.remove('oculto');
      } finally {
        b.disabled = false;
      }
    });
  }

  function mostrar() {
    tela.classList.remove('oculto');
    let motivo = '';
    try {
      motivo = sessionStorage.getItem('aviso-login') || '';
      sessionStorage.removeItem('aviso-login');
    } catch (e) { /* sem storage */ }
    if (AVISOS_LOGIN[motivo]) mostrarErro(AVISOS_LOGIN[motivo]);
    else if (avisoGoogle) mostrarErro(avisoGoogle);
    else if (tokenConfirmar) mostrarInfo('Falta so um passo: entre com o e-mail e a senha que voce escolheu no cadastro, e o e-mail fica confirmado.');
    document.getElementById(tokenRedefinir ? 'nova-senha' : 'login-email').focus();
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
    subtituloDaSede = document.getElementById('login-sub').textContent;

    abaEntrar.addEventListener('click', () => trocarModo('entrar'));
    abaCriar.addEventListener('click', () => trocarModo('criar'));
    // O campo do codigo aparece e some conforme a pessoa digita o e-mail.
    document.getElementById('login-email').addEventListener('input', mostrarCampoCodigo);
    form.addEventListener('submit', enviar);
    document.getElementById('btn-esqueci').addEventListener('click', pedirSenhaNova);
    trocarModo(tokenConvite ? 'convidado' : 'entrar');
    if (tokenRedefinir) abrirSenhaNova();
    carregarOpcoes();
  }

  window.Auth = { init, eu, sair, salvarPerfil, mostrar, esconder };
})();
