// Chamada de video/audio por proximidade (WebRTC P2P, sinalizacao via Socket.io).
// Quando dois bonecos ficam pertinho um do outro, os navegadores deles se conectam
// diretamente (o servidor so entrega o "bilhete" de sinalizacao, nunca ve o video).
(function () {
  // ---------------------------------------------------------------- alcance
  // Medido em TILES, e nao em pixels soltos: o mapa e uma grade, e "tres tiles"
  // e uma distancia que da pra enxergar na tela e conferir no mapa. Antes eram
  // 130px, que dao 4,1 tiles - com o zoom em 2x isso e meia tela de distancia,
  // e a chamada abria com gente que voce mal via.
  const TILE = 32;
  const TILES_ENTRAR = 3;
  const TILES_SAIR = 4.5; // a folga evita a chamada piscar quando voce anda na borda
  const RAIO_ENTRAR = TILES_ENTRAR * TILE;
  const RAIO_SAIR = TILES_SAIR * TILE;

  // De onde o som ja comeca a cair. Perto e volume cheio; dai pra fora vai
  // sumindo ate zero no raio de saida, como no Gather - o corte seco fazia a
  // conversa aparecer e desaparecer de uma vez.
  const TILES_VOLUME_CHEIO = 1.5;

  // Quanto tempo uma conexao pode ficar "quase la" antes de ser considerada
  // perdida. Ver `podarConexoesPresas`.
  const PACIENCIA_MS = 12000;

  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  let selfId = null;
  let localStream = null;
  let cameraAtiva = false;
  let temVideo = false;
  let micAtivo = true;
  let videoAtivo = true;
  let streamPendente = null; // camera aberta na tela de entrada, esperando o init
  let telaStream = null; // o que o navegador devolveu do getDisplayMedia
  let telaTrack = null; // a track de video da tela, enquanto ela esta dividida

  const peers = new Map(); // id do outro jogador -> { pc, videoEl, videoSender, remoteDescDefinida, candidatosPendentes }

  function palco() {
    return document.getElementById('palco-remoto');
  }

  function criarVideoRemoto(id) {
    const v = document.createElement('video');
    v.autoplay = true;
    v.playsInline = true;
    v.dataset.peerId = id;
    palco().appendChild(v);
    return v;
  }

  function fecharPeer(id) {
    const p = peers.get(id);
    if (!p) return;
    try { p.pc.close(); } catch (e) { /* ja fechada */ }
    if (p.videoEl) p.videoEl.remove();
    peers.delete(id);
  }

  // Qual video sai daqui agora: a tela, quando esta sendo dividida, senao a
  // camera. Um so - ver docs/plano-dividir-tela.md.
  function videoQueVaiSair() {
    if (telaTrack) return telaTrack;
    return localStream ? (localStream.getVideoTracks()[0] || null) : null;
  }

  // Garante que todas as tracks locais estao sendo enviadas nessa conexao.
  // Retorna true se alguma foi adicionada agora (ou seja, precisa renegociar).
  // Sem isso, quem cria a conexao antes da propria camera abrir fica mudo pro
  // outro lado pelo resto da chamada.
  //
  // O transmissor de VIDEO fica guardado em `p.videoSender`, e nao e procurado
  // de novo a cada vez. Motivo: ao parar a divisao de tela o transmissor fica
  // com track nula, e um transmissor de track nula nao diz de que tipo era -
  // procurando por `s.track.kind` a gente nao acharia esse e criaria um segundo
  // transmissor de video, o que faz o outro lado receber dois quadros.
  function sincronizarTracks(p) {
    if (!localStream) return false;
    let mudou = false;

    const jaEnviadas = p.pc.getSenders().map((s) => s.track).filter(Boolean);
    localStream.getAudioTracks().forEach((track) => {
      if (jaEnviadas.indexOf(track) === -1) {
        p.pc.addTrack(track, localStream);
        mudou = true;
      }
    });

    const video = videoQueVaiSair();
    if (video) {
      if (!p.videoSender) {
        p.videoSender = p.pc.addTrack(video, localStream);
        mudou = true;
      } else if (p.videoSender.track !== video) {
        // troca sem renegociar: e o que faz a tela entrar na hora
        p.videoSender.replaceTrack(video);
      }
    }
    return mudou;
  }

  async function renegociar(id) {
    const p = peers.get(id);
    if (!p || p.pc.signalingState !== 'stable') return;
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      Network.sendRtcSignal(id, { type: 'offer', sdp: offer.sdp });
    } catch (e) {
      /* renegociacao falhou: a chamada segue com o que ja estava negociado */
    }
  }

  function garantirPeer(id) {
    let p = peers.get(id);
    if (p) return p;

    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const videoEl = criarVideoRemoto(id);
    p = {
      pc, videoEl, videoSender: null,
      remoteDescDefinida: false, candidatosPendentes: [],
      nascidoEm: Date.now(), // pra saber quando desistir (ver podarConexoesPresas)
    };
    peers.set(id, p);

    sincronizarTracks(p);

    pc.ontrack = (ev) => { videoEl.srcObject = ev.streams[0]; };
    pc.onicecandidate = (ev) => {
      if (ev.candidate) Network.sendRtcSignal(id, { type: 'candidate', candidate: ev.candidate.toJSON() });
    };
    pc.onconnectionstatechange = () => {
      if (['failed', 'closed', 'disconnected'].includes(pc.connectionState)) fecharPeer(id);
    };

    return p;
  }

  async function iniciarChamada(id) {
    const p = garantirPeer(id);
    try {
      const offer = await p.pc.createOffer();
      await p.pc.setLocalDescription(offer);
      Network.sendRtcSignal(id, { type: 'offer', sdp: offer.sdp });
    } catch (e) {
      fecharPeer(id);
    }
  }

  async function tratarSinal({ from, signal }) {
    if (!signal || !from) return;

    if (signal.type === 'offer') {
      const p = garantirPeer(from);

      // Se os dois lados ofertarem ao mesmo tempo, quem tem o id maior cede
      // (desfaz a propria oferta e aceita a do outro); o de id menor ignora.
      const colisao = p.pc.signalingState !== 'stable';
      if (colisao && selfId < from) return;
      if (colisao) {
        try { await p.pc.setLocalDescription({ type: 'rollback' }); } catch (e) { return; }
      }

      await p.pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      p.remoteDescDefinida = true;
      for (const c of p.candidatosPendentes) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignora */ } }
      p.candidatosPendentes = [];
      // a camera pode ter aberto depois que essa conexao nasceu: a resposta ja
      // sai levando as tracks locais
      sincronizarTracks(p);
      const answer = await p.pc.createAnswer();
      await p.pc.setLocalDescription(answer);
      Network.sendRtcSignal(from, { type: 'answer', sdp: answer.sdp });
    } else if (signal.type === 'answer') {
      const p = peers.get(from);
      if (!p || p.pc.signalingState !== 'have-local-offer') return;
      await p.pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      p.remoteDescDefinida = true;
      for (const c of p.candidatosPendentes) { try { await p.pc.addIceCandidate(c); } catch (e) { /* ignora */ } }
      p.candidatosPendentes = [];
    } else if (signal.type === 'candidate') {
      const p = garantirPeer(from);
      if (p.remoteDescDefinida) {
        try { await p.pc.addIceCandidate(signal.candidate); } catch (e) { /* ignora */ }
      } else {
        p.candidatosPendentes.push(signal.candidate);
      }
    }
  }

  // Tem parede entre os dois? Anda pela reta que liga um ao outro, de quarto em
  // quarto de tile, e olha o que tem no caminho.
  //
  // So PAREDE e JANELA cortam. Movel nao: duas pessoas conversando por cima de
  // uma mesa e a coisa mais normal de um escritorio, e a mesa e tile solido
  // igual a parede - barrar por "solido" calaria a sede inteira.
  function paredeEntre(a, b) {
    const M = window.OfficeMap;
    if (!M) return false;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const passos = Math.ceil(Math.hypot(dx, dy) / (TILE / 4));
    if (passos <= 0) return false;
    for (let i = 1; i < passos; i++) {
      const x = a.x + (dx * i) / passos;
      const y = a.y + (dy * i) / passos;
      const t = M.tiles[Math.floor(y / TILE)] && M.tiles[Math.floor(y / TILE)][Math.floor(x / TILE)];
      if (t === M.PAREDE || t === M.JANELA) return true;
    }
    return false;
  }

  // ----------------------------------------------------- salas de conversa
  // Em que sala FECHADA a pessoa esta, se estiver em alguma. Sao as de reuniao
  // e as privativas de uma pessoa so - marcadas com `privativa: true` no mapa.
  function salaFechadaDe(p) {
    const M = window.OfficeMap;
    if (!M || !M.getRoomAtTile) return null;
    const sala = M.getRoomAtTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
    return sala && sala.privativa ? sala.id : null;
  }

  // A decisao de falar ou nao com alguem, num lugar so.
  //
  // Sala fechada MANDA mais que distancia, nos dois sentidos:
  //
  //   dentro da mesma sala -> conversa, e nao importa se estao nas duas pontas
  //     dela. Reuniao nao e proximidade: quem senta na outra ponta da mesa de
  //     conferencia participa igual.
  //
  //   um dentro, outro fora -> NAO conversa, e nao importa se estao a um passo
  //     um do outro. E o ponto inteiro de uma sala fechada: dava pra encostar do
  //     lado de fora da porta e cair na reuniao.
  //
  // Fora de sala fechada, vale o de sempre: perto e sem parede no meio.
  function deveFalarCom(self, outro) {
    const minha = salaFechadaDe(self);
    const dele = salaFechadaDe(outro);
    if (minha || dele) return minha === dele;
    const dist = Math.hypot(outro.x - self.x, outro.y - self.y);
    return dist < RAIO_ENTRAR && !paredeEntre(self, outro);
  }

  // Sair tem folga maior que entrar, senao a chamada pisca com a pessoa andando
  // em cima da borda. Dentro da mesma sala fechada nao ha borda: so sai quem
  // sair da sala.
  function deveContinuarCom(self, outro) {
    const minha = salaFechadaDe(self);
    const dele = salaFechadaDe(outro);
    if (minha || dele) return minha === dele;
    const dist = Math.hypot(outro.x - self.x, outro.y - self.y);
    return dist <= RAIO_SAIR && !paredeEntre(self, outro);
  }

  // Volume pela distancia: cheio pertinho, sumindo ate zero no raio de saida.
  function volumePara(dist) {
    const cheio = TILES_VOLUME_CHEIO * TILE;
    if (dist <= cheio) return 1;
    if (dist >= RAIO_SAIR) return 0;
    return 1 - (dist - cheio) / (RAIO_SAIR - cheio);
  }

  // Conexao que nasceu e nunca chegou a conectar vira lixo que BLOQUEIA: como
  // `peers.has(id)` continua verdadeiro, a proximidade nunca tenta de novo e as
  // duas pessoas ficam lado a lado sem chamada, pra sempre. Acontece de verdade
  // quando o outro lado recarrega a pagina no meio da negociacao.
  //
  // Depois da paciencia, o par e derrubado - e a proximidade, que roda todo
  // quadro, refaz a chamada sozinha no instante seguinte.
  function podarConexoesPresas() {
    const agora = Date.now();
    peers.forEach((p, id) => {
      if (p.pc.connectionState === 'connected') return;
      if (agora - p.nascidoEm < PACIENCIA_MS) return;
      fecharPeer(id);
    });
  }

  // Chamado a cada frame do jogo com o mapa atual de jogadores (id -> {x,y,...}).
  function updateProximity(playersMap) {
    if (!selfId) return;
    const self = playersMap.get(selfId);
    if (!self) return;

    podarConexoesPresas();

    playersMap.forEach((p, id) => {
      if (id === selfId) return;
      const jaConectado = peers.has(id);

      if (!jaConectado) {
        // QUALQUER um dos dois propoe - e nao so o de id menor, como era antes.
        //
        // O motivo e concreto: `updateProximity` roda no laco de desenho, e o
        // navegador CONGELA esse laco em aba de segundo plano. Com a regra
        // antiga, se justamente a pessoa de id menor estivesse com a aba atras
        // (alt-tab, o tempo todo), a chamada nunca abria - as duas ficavam lado
        // a lado sem nada acontecer, e nem dava pra desconfiar do porque.
        //
        // Os dois propondo ao mesmo tempo nao e problema: o `tratarSinal` ja
        // resolve a colisao de ofertas - o de id maior desfaz a propria e aceita
        // a do outro. Essa regra continua sendo a que decide quem cede.
        if (cameraAtiva && deveFalarCom(self, p)) iniciarChamada(id);
        return;
      }

      if (!deveContinuarCom(self, p)) {
        fecharPeer(id);
        return;
      }

      const par = peers.get(id);
      if (par && par.videoEl) {
        // Dentro da mesma sala fechada o volume e cheio, ponta a ponta: numa
        // reuniao ninguem fala mais baixo por estar na outra cabeceira.
        par.videoEl.volume = salaFechadaDe(self)
          ? 1
          : volumePara(Math.hypot(p.x - self.x, p.y - self.y));
      }
    });

    peers.forEach((_, id) => { if (!playersMap.has(id)) fecharPeer(id); });
  }

  function mostrarAviso(texto) {
    const el = document.getElementById('aviso-camera');
    if (!el) return;
    el.textContent = texto;
    el.classList.remove('oculto');
    clearTimeout(mostrarAviso._timer);
    mostrarAviso._timer = setTimeout(() => el.classList.add('oculto'), 4500);
  }

  async function ligarCamera() {
    let avisoParcial = null;
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      temVideo = true;
    } catch (eComVideo) {
      // camera falhou (ocupada, sem driver, etc) - tenta so com audio pra nao bloquear a chamada
      try {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
        temVideo = false;
        avisoParcial = 'Camera indisponivel (' + eComVideo.message + '). Entrando so com audio.';
      } catch (eSoAudio) {
        mostrarAviso('Nao foi possivel acessar camera nem microfone: ' + eSoAudio.message);
        return;
      }
    }
    cameraAtiva = true;
    micAtivo = true;
    videoAtivo = temVideo;

    // Conexoes que ja existiam nasceram sem as nossas tracks (a camera abriu
    // depois). Manda as tracks agora e renegocia, senao o outro lado nunca
    // recebe nosso video/audio nessa chamada.
    peers.forEach((p, id) => {
      if (sincronizarTracks(p)) renegociar(id);
    });

    aplicarUiCamera();
    if (avisoParcial) mostrarAviso(avisoParcial);
  }

  function aplicarUiCamera() {
    const videoLocal = document.getElementById('video-local');
    // Dividindo a tela, a previa mostra a TELA: sem esta guarda, qualquer mexida
    // na camera (mudo, video on/off) devolvia a previa pro rosto no meio da
    // apresentacao, e so a previa - o que o outro lado recebia continuava sendo
    // a tela. Ver duas coisas diferentes e pior que ver a errada.
    if (!telaTrack) videoLocal.srcObject = localStream;
    document.getElementById('preview-local').classList.remove('oculto');
    document.getElementById('preview-local').classList.toggle('sem-video', !temVideo && !telaTrack);
    document.getElementById('btn-camera').classList.add('ativo');
    document.getElementById('btn-mic').classList.toggle('desativado', !micAtivo);
    document.getElementById('btn-video-toggle').classList.toggle('desativado', !videoAtivo);
  }

  function desligarCamera() {
    // A tela vai junto: dividir tela com a camera desligada deixaria a pessoa
    // mandando a propria tela sem microfone e sem quadro nenhum na tela dela
    // pra lembrar disso.
    if (telaTrack) pararTela();
    if (localStream) localStream.getTracks().forEach((t) => t.stop());
    localStream = null;
    cameraAtiva = false;
    document.getElementById('preview-local').classList.add('oculto');
    document.getElementById('btn-camera').classList.remove('ativo');
    peers.forEach((_, id) => fecharPeer(id));
  }

  function alternarCamera() {
    if (cameraAtiva) desligarCamera();
    else ligarCamera();
  }

  // ------------------------------------------------------------ dividir a tela
  // A tela ENTRA NO LUGAR da camera, e nao junto: e uma troca de track no
  // transmissor que ja existe, entao o outro lado nao muda nada - o quadro que
  // mostrava seu rosto passa a mostrar sua tela. Ver docs/plano-dividir-tela.md.

  async function ligarTela() {
    if (!cameraAtiva) {
      mostrarAviso('Ligue a camera ou o microfone antes de dividir a tela.');
      return;
    }
    let stream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    } catch (e) {
      return; // a pessoa fechou a janela de escolha: nao ha nada a desfazer
    }
    const track = stream.getVideoTracks()[0];
    if (!track) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    telaStream = stream;
    telaTrack = track;
    // O navegador tem o proprio botao de "parar de compartilhar", fora da nossa
    // pagina. Sem escutar isto, a divisao parava pra ele e continuava ligada pra
    // gente: o botao ficaria aceso mandando uma track morta.
    telaTrack.addEventListener('ended', pararTela);

    peers.forEach((p, id) => {
      if (sincronizarTracks(p)) renegociar(id); // so-audio: nao havia video pra trocar
    });
    aplicarUiTela();
  }

  function pararTela() {
    if (!telaTrack) return;
    const camera = localStream ? (localStream.getVideoTracks()[0] || null) : null;
    telaTrack.removeEventListener('ended', pararTela);
    peers.forEach((p) => {
      // `replaceTrack(null)` para de mandar video sem derrubar o transmissor -
      // e por isso que `p.videoSender` fica guardado.
      if (p.videoSender) p.videoSender.replaceTrack(camera);
    });
    telaStream.getTracks().forEach((t) => t.stop());
    telaStream = null;
    telaTrack = null;
    aplicarUiTela();
  }

  function alternarTela() {
    if (telaTrack) pararTela();
    else ligarTela();
  }

  function aplicarUiTela() {
    const dividindo = !!telaTrack;
    const botao = document.getElementById('btn-tela');
    if (botao) {
      botao.classList.toggle('ativo', dividindo);
      botao.title = dividindo ? 'Parar de dividir a tela' : 'Dividir a tela';
    }
    const videoLocal = document.getElementById('video-local');
    if (videoLocal) {
      videoLocal.srcObject = dividindo ? telaStream : localStream;
      // no proprio video, e nao no quadro: a grade de chamada move este
      // elemento pra dentro dela (ver style.css, `video.mostrando-tela`)
      videoLocal.classList.toggle('mostrando-tela', dividindo);
    }
    const preview = document.getElementById('preview-local');
    if (preview) {
      preview.classList.toggle('sem-video', !dividindo && !temVideo);
      preview.classList.toggle('dividindo-tela', dividindo);
      if (dividindo) preview.classList.remove('oculto');
    }
  }

  function alternarMic() {
    if (!localStream) return;
    micAtivo = !micAtivo;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micAtivo; });
    document.getElementById('btn-mic').classList.toggle('desativado', !micAtivo);
  }

  function alternarVideo() {
    if (!localStream) return;
    videoAtivo = !videoAtivo;
    localStream.getVideoTracks().forEach((t) => { t.enabled = videoAtivo; });
    document.getElementById('btn-video-toggle').classList.toggle('desativado', !videoAtivo);
  }

  // A tela de entrada ja pediu permissao e abriu a camera/microfone. Guardamos o
  // stream aqui pra nao pedir tudo de novo quando a primeira chamada comecar.
  function usarStreamDaEntrada(streamDaEntrada, prefs) {
    streamPendente = { stream: streamDaEntrada, prefs: prefs || {} };
  }

  function adotarStreamPendente() {
    if (!streamPendente) return;
    const { stream, prefs } = streamPendente;
    streamPendente = null;

    localStream = stream;
    temVideo = stream.getVideoTracks().length > 0;
    cameraAtiva = true;
    micAtivo = prefs.micAtivo !== false;
    videoAtivo = temVideo && prefs.videoAtivo !== false;
    localStream.getAudioTracks().forEach((t) => { t.enabled = micAtivo; });
    localStream.getVideoTracks().forEach((t) => { t.enabled = videoAtivo; });
    aplicarUiCamera();
  }

  function init(idJogadorLocal) {
    selfId = idJogadorLocal;
    Network.on('rtc-signal', tratarSinal);
    adotarStreamPendente();
    document.getElementById('btn-camera').addEventListener('click', alternarCamera);
    document.getElementById('btn-mic').addEventListener('click', alternarMic);
    document.getElementById('btn-video-toggle').addEventListener('click', alternarVideo);

    const btnTela = document.getElementById('btn-tela');
    // Navegador sem `getDisplayMedia` (celular, quase sempre) nao ganha um botao
    // que so daria erro ao ser tocado.
    if (btnTela && navigator.mediaDevices && navigator.mediaDevices.getDisplayMedia) {
      btnTela.addEventListener('click', alternarTela);
    } else if (btnTela) {
      btnTela.remove();
    }
  }

  function temChamadaAtiva(id) {
    const p = peers.get(id);
    return !!(p && p.pc.connectionState === 'connected');
  }

  // true so quando ja da pra desenhar video de verdade (tem frame decodificado);
  // uma chamada so-audio fica com temChamadaAtiva=true mas isso aqui false.
  function temVideoRemoto(id) {
    const p = peers.get(id);
    return !!(p && p.videoEl && p.videoEl.readyState >= 2 && p.videoEl.videoWidth > 0);
  }

  function getVideoRemoto(id) {
    const p = peers.get(id);
    return p ? p.videoEl : null;
  }

  // Lista de participantes da(s) chamada(s) ativa(s) agora, pra montar o grid
  // de chamada (um grid so, mesmo que a "malha" P2P seja varias conexoes 1-a-1).
  function getPeersConectados() {
    const lista = [];
    peers.forEach((p, id) => {
      if (p.pc.connectionState !== 'connected') return;
      lista.push({
        id,
        stream: p.videoEl ? p.videoEl.srcObject : null,
        temVideo: temVideoRemoto(id),
      });
    });
    return lista;
  }

  function getLocalStream() { return localStream; }
  function isCameraAtiva() { return cameraAtiva; }
  function temVideoLocal() { return temVideo; }

  function estaDividindoTela() { return !!telaTrack; }

  window.Calls = {
    init, updateProximity, temChamadaAtiva, temVideoRemoto, getVideoRemoto,
    getPeersConectados, getLocalStream, isCameraAtiva, temVideoLocal,
    usarStreamDaEntrada, alternarTela, estaDividindoTela,
  };
})();
