// Chamada de video/audio por proximidade (WebRTC P2P, sinalizacao via Socket.io).
// Quando dois bonecos ficam pertinho um do outro, os navegadores deles se conectam
// diretamente (o servidor so entrega o "bilhete" de sinalizacao, nunca ve o video).
(function () {
  const RAIO_ENTRAR = 130; // px: distancia pra iniciar a chamada
  const RAIO_SAIR = 170; // px: distancia pra encerrar (maior que a de entrar, evita ficar entrando/saindo)
  const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

  let selfId = null;
  let localStream = null;
  let cameraAtiva = false;
  let temVideo = false;
  let micAtivo = true;
  let videoAtivo = true;

  const peers = new Map(); // id do outro jogador -> { pc, videoEl, remoteDescDefinida, candidatosPendentes }

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

  // Garante que todas as tracks locais estao sendo enviadas nessa conexao.
  // Retorna true se alguma foi adicionada agora (ou seja, precisa renegociar).
  // Sem isso, quem cria a conexao antes da propria camera abrir fica mudo pro
  // outro lado pelo resto da chamada.
  function sincronizarTracks(p) {
    if (!localStream) return false;
    const jaEnviadas = p.pc.getSenders().map((s) => s.track).filter(Boolean);
    let mudou = false;
    localStream.getTracks().forEach((track) => {
      if (jaEnviadas.indexOf(track) === -1) {
        p.pc.addTrack(track, localStream);
        mudou = true;
      }
    });
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
    p = { pc, videoEl, remoteDescDefinida: false, candidatosPendentes: [] };
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

  // Chamado a cada frame do jogo com o mapa atual de jogadores (id -> {x,y,...}).
  function updateProximity(playersMap) {
    if (!selfId) return;
    const self = playersMap.get(selfId);
    if (!self) return;

    playersMap.forEach((p, id) => {
      if (id === selfId) return;
      const dist = Math.hypot(p.x - self.x, p.y - self.y);
      const jaConectado = peers.has(id);

      // so o lado com o id "menor" propoe a chamada, pra nao dar dois convites ao mesmo tempo
      if (!jaConectado && dist < RAIO_ENTRAR && cameraAtiva && selfId < id) {
        iniciarChamada(id);
      } else if (jaConectado && dist > RAIO_SAIR) {
        fecharPeer(id);
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

    const videoLocal = document.getElementById('video-local');
    videoLocal.srcObject = localStream;
    document.getElementById('preview-local').classList.remove('oculto');
    document.getElementById('preview-local').classList.toggle('sem-video', !temVideo);
    document.getElementById('btn-camera').classList.add('ativo');
    document.getElementById('btn-mic').classList.remove('desativado');
    document.getElementById('btn-video-toggle').classList.toggle('desativado', !temVideo);
    if (avisoParcial) mostrarAviso(avisoParcial);
  }

  function desligarCamera() {
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

  function init(idJogadorLocal) {
    selfId = idJogadorLocal;
    Network.on('rtc-signal', tratarSinal);
    document.getElementById('btn-camera').addEventListener('click', alternarCamera);
    document.getElementById('btn-mic').addEventListener('click', alternarMic);
    document.getElementById('btn-video-toggle').addEventListener('click', alternarVideo);
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

  window.Calls = {
    init, updateProximity, temChamadaAtiva, temVideoRemoto, getVideoRemoto,
    getPeersConectados, getLocalStream, isCameraAtiva, temVideoLocal,
  };
})();
