// Editor de avatar, no formato do Gather: categorias na lateral, grade de
// opcoes e paleta de cores no meio, preview ao vivo do lado.
// So existem as categorias que os sprites LPC cobrem (pele, cabelo, camisa,
// calca, sapato e oculos) - barba/jaqueta/chapeu exigiriam novos assets.
// O nome e a aparencia moram na conta (servidor), nao no navegador: assim o avatar
// segue a pessoa em qualquer maquina. Ver docs/plano-login.md.
(function () {
  const CATEGORIAS = [
    { id: 'skin', nome: 'Pele', campoCor: 'skin', paleta: () => Character.SKIN_TONES },
    {
      id: 'hair', nome: 'Cabelo', campoCor: 'hairColor', paleta: () => Character.HAIR_COLORS,
      campoOpcao: 'hairStyle',
      opcoes: () => Character.HAIR_STYLES.map((v) => ({ valor: v, rotulo: ROTULO_CABELO[v] })),
    },
    { id: 'top', nome: 'Camisa', campoCor: 'shirt', paleta: () => Character.ROUPA_COLORS },
    { id: 'bottom', nome: 'Calca', campoCor: 'bottom', paleta: () => Character.ROUPA_COLORS },
    { id: 'shoes', nome: 'Sapato', campoCor: 'shoes', paleta: () => Character.ROUPA_COLORS },
    {
      id: 'glasses', nome: 'Oculos', campoCor: 'glassesColor', paleta: () => Character.ROUPA_COLORS,
      campoOpcao: 'glasses',
      opcoes: () => [{ valor: false, rotulo: 'Sem' }, { valor: true, rotulo: 'Com' }],
    },
  ];

  const ROTULO_CABELO = { curto: 'Curto', longo: 'Longo', moicano: 'Moicano', careca: 'Careca' };

  let appearance = null;
  let categoriaAtual = CATEGORIAS[0];
  // Da pra voltar ao editor pelo menu da conta, entao esses ficam no modulo: os
  // listeners entram uma vez so e leem sempre o estado da abertura atual.
  let listenersProntos = false;
  let onEntrarAtual = null;
  let previewIntervalId = null;


  // Miniatura da opcao mostrando o boneco com a aparencia atual, so trocando o
  // item daquela categoria - igual ao Gather, que mostra voce em cada variacao.
  function desenharMiniatura(canvas, variacao, escala) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const aparenciaVariante = Object.assign({}, appearance, variacao);
    Character.draw(ctx, canvas.width / 2, canvas.height - 4, aparenciaVariante, {
      dir: 'down', moving: false, walkTime: 0, scale: escala || 1.05,
    });
  }

  function montarCategorias() {
    const nav = document.getElementById('editor-categorias');
    nav.innerHTML = '';
    CATEGORIAS.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-categoria' + (cat.id === categoriaAtual.id ? ' ativa' : '');

      // miniatura do proprio boneco ao lado do nome, como na referencia
      const mini = document.createElement('canvas');
      mini.width = 30;
      mini.height = 34;
      btn.appendChild(mini);
      Character.ready.then(() => desenharMiniatura(mini, {}, 0.55));

      const rotulo = document.createElement('span');
      rotulo.textContent = cat.nome;
      btn.appendChild(rotulo);

      btn.addEventListener('click', () => {
        categoriaAtual = cat;
        montarCategorias();
        montarPainel();
      });
      nav.appendChild(btn);
    });
  }

  function montarPainel() {
    const grade = document.getElementById('editor-opcoes');
    const paleta = document.getElementById('editor-paleta');
    const cat = categoriaAtual;

    // A grade sempre mostra variacoes do SEU boneco, como no editor do Gather:
    // nas categorias com formato (cabelo, oculos) sao os formatos; nas que so
    // tem cor (pele, camisa, calca, sapato) e uma variacao por cor da paleta.
    const variacoes = cat.opcoes
      ? cat.opcoes().map((opt) => ({
        rotulo: opt.rotulo,
        variacao: { [cat.campoOpcao]: opt.valor },
        selecionada: appearance[cat.campoOpcao] === opt.valor,
        aplicar: () => { appearance[cat.campoOpcao] = opt.valor; },
      }))
      : cat.paleta().map((cor) => ({
        rotulo: '',
        variacao: { [cat.campoCor]: cor },
        selecionada: appearance[cat.campoCor] === cor,
        aplicar: () => { appearance[cat.campoCor] = cor; },
      }));

    grade.innerHTML = '';
    variacoes.forEach((v) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'editor-opcao' + (v.selecionada ? ' selecionada' : '');

      const mini = document.createElement('canvas');
      mini.width = 56;
      mini.height = 62;
      item.appendChild(mini);

      if (v.rotulo) {
        const rotulo = document.createElement('span');
        rotulo.textContent = v.rotulo;
        item.appendChild(rotulo);
      }

      Character.ready.then(() => desenharMiniatura(mini, v.variacao));

      item.addEventListener('click', () => {
        v.aplicar();
        montarPainel();
        montarCategorias();
      });
      grade.appendChild(item);
    });

    paleta.innerHTML = '';
    cat.paleta().forEach((cor) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.className = 'swatch' + (appearance[cat.campoCor] === cor ? ' selecionado' : '');
      sw.style.background = cor;
      sw.setAttribute('aria-label', cor);
      sw.addEventListener('click', () => {
        appearance[cat.campoCor] = cor;
        montarPainel();
      });
      paleta.appendChild(sw);
    });
  }

  // `conta` e o usuario logado ({ nome, appearance, ... }).
  function init(conta, onEntrar) {
    appearance = Character.resolver((conta && conta.appearance) || Character.randomAppearance());
    onEntrarAtual = onEntrar;

    const inputNome = document.getElementById('input-nome');
    inputNome.value = (conta && conta.nome) || '';

    const canvas = document.getElementById('canvas-preview');
    const ctx = canvas.getContext('2d');
    let previewTime = 0;

    function renderPreview() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      previewTime += 1 / 60;
      Character.draw(ctx, canvas.width / 2, canvas.height - 26, appearance, {
        dir: 'down', moving: true, walkTime: previewTime * 0.4, scale: 2,
      });
    }
    clearInterval(previewIntervalId);
    previewIntervalId = setInterval(renderPreview, 1000 / 60);

    montarCategorias();
    montarPainel();
    ligarListeners();
  }

  function ligarListeners() {
    if (listenersProntos) return;
    listenersProntos = true;

    const inputNome = document.getElementById('input-nome');
    const botaoPronto = document.getElementById('btn-entrar');

    document.getElementById('btn-aleatorio').addEventListener('click', () => {
      appearance = Character.resolver(Character.randomAppearance());
      montarPainel();
    });

    document.getElementById('form-criador').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const nome = inputNome.value.trim();
      if (!nome) {
        inputNome.focus();
        return;
      }

      botaoPronto.disabled = true;
      try {
        // O avatar e do dono da conta: quem manda e o servidor.
        const salvo = await Auth.salvarPerfil({ nome, appearance });
        clearInterval(previewIntervalId);
        onEntrarAtual({ name: salvo.nome, appearance: salvo.appearance });
      } catch (e) {
        alertaSalvar(e.message);
      } finally {
        botaoPronto.disabled = false;
      }
    });
  }

  function alertaSalvar(mensagem) {
    const rodape = document.querySelector('.editor-rodape');
    let aviso = document.getElementById('editor-erro');
    if (!aviso) {
      aviso = document.createElement('p');
      aviso.id = 'editor-erro';
      aviso.className = 'login-erro';
      rodape.appendChild(aviso);
    }
    aviso.textContent = mensagem;
  }

  window.Creator = { init };
})();
