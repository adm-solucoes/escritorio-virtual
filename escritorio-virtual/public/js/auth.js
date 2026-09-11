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

  function trocarModo(novo) {
    modo = novo;
    limparErro();
    const visita = modo === 'convidado';

    abaEntrar.classList.toggle('ativa', modo === 'entrar');
    abaCriar.classList.toggle('ativa', modo === 'criar');
    // No modo visita nao ha o que escolher: quem chegou pelo link nao tem conta
    // e nao pode criar uma sem o codigo da sede.
    document.getElementById('login-abas').classList.toggle('oculto', visita);

    // O nome aparece no cadastro E na visita; o resto do cadastro, so no cadastro.
    document.querySelectorAll('.campo-cadastro').forEach((el) => {
      el.classList.toggle('oculto', modo !== 'criar');
    });
    if (visita) document.getElementById('campo-nome').classList.remove('oculto');

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

  function mostrar() {
    tela.classList.remove('oculto');
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
    form.addEventListener('submit', enviar);
    trocarModo(tokenConvite ? 'convidado' : 'entrar');
  }

  window.Auth = { init, eu, sair, salvarPerfil, mostrar, esconder };
})();
