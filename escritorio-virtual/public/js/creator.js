// Editor de avatar, no formato do Gather: categorias na lateral, grade de
// opcoes e paleta de cores no meio, preview ao vivo do lado.
// So existem as categorias que os sprites LPC cobrem (pele, cabelo, camisa,
// calca, sapato e oculos) - barba/jaqueta/chapeu exigiriam novos assets.
(function () {
  const STORAGE_KEY = 'adm-escritorio-perfil';

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

  function loadProfile() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.appearance) return null;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function saveProfile(profile) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
      /* localStorage indisponivel: segue sem persistir */
    }
  }

  // Miniatura da opcao mostrando o boneco com a aparencia atual, so trocando o
  // item daquela categoria - igual ao Gather, que mostra voce em cada variacao.
  function desenharMiniatura(canvas, variacao) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const aparenciaVariante = Object.assign({}, appearance, variacao);
    Character.draw(ctx, canvas.width / 2, canvas.height - 6, aparenciaVariante, {
      dir: 'down', moving: false, walkTime: 0, scale: 1.05,
    });
  }

  function montarCategorias() {
    const nav = document.getElementById('editor-categorias');
    nav.innerHTML = '';
    CATEGORIAS.forEach((cat) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'editor-categoria' + (cat.id === categoriaAtual.id ? ' ativa' : '');
      btn.textContent = cat.nome;
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

    grade.innerHTML = '';
    if (cat.opcoes) {
      cat.opcoes().forEach((opt) => {
        const item = document.createElement('button');
        item.type = 'button';
        const selecionado = appearance[cat.campoOpcao] === opt.valor;
        item.className = 'editor-opcao' + (selecionado ? ' selecionada' : '');

        const mini = document.createElement('canvas');
        mini.width = 56;
        mini.height = 62;
        item.appendChild(mini);

        const rotulo = document.createElement('span');
        rotulo.textContent = opt.rotulo;
        item.appendChild(rotulo);

        Character.ready.then(() => {
          const variacao = {};
          variacao[cat.campoOpcao] = opt.valor;
          desenharMiniatura(mini, variacao);
        });

        item.addEventListener('click', () => {
          appearance[cat.campoOpcao] = opt.valor;
          montarPainel();
        });
        grade.appendChild(item);
      });
    } else {
      const dica = document.createElement('p');
      dica.className = 'editor-dica';
      dica.textContent = 'Escolha a cor abaixo.';
      grade.appendChild(dica);
    }

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

  function init(onEntrar) {
    const existing = loadProfile();
    appearance = Character.resolver((existing && existing.appearance) || Character.randomAppearance());
    let nome = (existing && existing.name) || '';

    const inputNome = document.getElementById('input-nome');
    const inputAdminCode = document.getElementById('input-admin-code');
    inputNome.value = nome;
    inputAdminCode.value = (existing && existing.adminCode) || '';

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
    const previewIntervalId = setInterval(renderPreview, 1000 / 60);

    montarCategorias();
    montarPainel();

    document.getElementById('btn-aleatorio').addEventListener('click', () => {
      appearance = Character.resolver(Character.randomAppearance());
      montarPainel();
    });

    document.getElementById('form-criador').addEventListener('submit', (ev) => {
      ev.preventDefault();
      nome = inputNome.value.trim();
      if (!nome) {
        inputNome.focus();
        return;
      }
      const adminCode = inputAdminCode.value.trim();
      const profile = { name: nome, appearance, adminCode };
      saveProfile(profile);
      clearInterval(previewIntervalId);
      onEntrar(profile);
    });
  }

  window.Creator = { init, loadProfile };
})();
