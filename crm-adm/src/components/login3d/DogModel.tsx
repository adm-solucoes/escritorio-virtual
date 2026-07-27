"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import { Euler, type Object3D, type Group, type Mesh, type MeshStandardMaterial } from "three";
import {
  CLIPES,
  CORES_POR_MATERIAL,
  COR_PISCADA,
  LIMITE_OLHAR,
  MATERIAIS_OLHO,
  MODELO_URL,
  OSSOS,
  QUEDA_ORELHA,
} from "./constants";

/**
 * Mascote 3D — Etapa 1 (vivo parado) + Etapa 2 (rastreamento de cursor).
 *
 * ┌─ POR QUE ROTAÇÃO ABSOLUTA E NÃO `+=` ────────────────────────────────────┐
 * │ A primeira versão somava offsets (`osso.rotation.z += ...`) supondo que  │
 * │ o mixer reescrevia a pose de todos os ossos a cada frame. Não reescreve: │
 * │ o clipe `Idle` tem 24 canais para 49 ossos. Todo osso fora do clipe      │
 * │ nunca era resetado, então o `+=` acumulava frame após frame e em poucos  │
 * │ segundos o cachorro se retorcia (pescoço esticado, cabeça girando sem    │
 * │ parar, corpo empinando).                                                 │
 * │                                                                          │
 * │ Agora guardamos a pose de repouso de cada osso controlado e a cada frame │
 * │ fazemos `rotation = repouso + offset`. É idempotente: não importa quantos │
 * │ frames passem nem se o clipe toca aquele osso, o resultado é sempre o    │
 * │ mesmo. Em troca, o clipe deixa de influenciar ESSES ossos — o que é      │
 * │ intencional, já que a vida deles (respirar, abanar, olhar) é gerada aqui.│
 * └──────────────────────────────────────────────────────────────────────────┘
 *
 * Convenção de eixos deste rig, medida no modelo renderizado (não presumida):
 * todo osso cresce no +Y local, então `rotation.x` = inclinar (cima/baixo) e
 * `rotation.z` = girar pro lado (yaw, abanar, orelha caindo).
 */

/**
 * Pose de repouso por osso, fora do componente de propósito: sobrevive a
 * remontagem (StrictMode monta duas vezes em dev) e por isso sempre guarda a
 * rotação ORIGINAL, nunca uma já modificada por nós.
 */
const REPOUSO = new WeakMap<Object3D, Euler>();

function repousoDe(osso: Object3D): Euler {
  let base = REPOUSO.get(osso);
  if (!base) {
    base = osso.rotation.clone();
    REPOUSO.set(osso, base);
  }
  return base;
}

/** Define a rotação como repouso + offset. Idempotente por construção. */
function pose(osso: Object3D, dx: number, dy: number, dz: number) {
  const base = repousoDe(osso);
  osso.rotation.set(base.x + dx, base.y + dy, base.z + dz);
}

export default function DogModel() {
  const grupo = useRef<Group>(null);
  const { scene, animations } = useGLTF(MODELO_URL);
  const { actions } = useAnimations(animations, grupo);

  /* --- Recoloração: husky cinza → cachorro caramelo -----------------------
   * O modelo não tem textura nenhuma (5 materiais de cor chapada), então dá
   * pra repintar por código. Clonamos o material antes de mexer pra não sujar
   * o cache global do useGLTF. */
  const materiaisOlho = useRef<MeshStandardMaterial[]>([]);
  const corOriginalOlho = useRef<number[]>([]);

  useLayoutEffect(() => {
    materiaisOlho.current = [];
    corOriginalOlho.current = [];

    scene.traverse((obj) => {
      const malha = obj as Mesh;
      if (!malha.isMesh) return;
      malha.castShadow = true;
      malha.receiveShadow = true;

      const material = malha.material as MeshStandardMaterial;
      if (!material || Array.isArray(material)) return;

      const nova = CORES_POR_MATERIAL[material.name];
      if (!nova) return;

      const clone = material.clone();
      clone.color.set(nova);
      // O export vem com metalness 0.4, que deixa a pelagem com cara de plástico.
      clone.metalness = 0;
      clone.roughness = 0.85;
      malha.material = clone;

      if (MATERIAIS_OLHO.includes(material.name)) {
        materiaisOlho.current.push(clone);
        corOriginalOlho.current.push(clone.color.getHex());
      }
    });
  }, [scene]);

  /* --- Ossos controlados na mão ------------------------------------------
   * Em ref (não useMemo) porque o `useFrame` escreve neles todo frame, e mutar
   * valor memoizado depois do render é o que o React Compiler proíbe. */
  const ossos = useRef<{
    cabeca?: Object3D;
    pescoco: Object3D[];
    torso: Object3D[];
    orelhas: Object3D[][];
    cauda: Object3D[];
  }>({ pescoco: [], torso: [], orelhas: [[], []], cauda: [] });

  useLayoutEffect(() => {
    const buscar = (nome: string) => scene.getObjectByName(nome);
    const lista = (nomes: readonly string[]) =>
      nomes.map(buscar).filter((o): o is Object3D => Boolean(o));

    const partes = {
      cabeca: buscar(OSSOS.cabeca),
      pescoco: lista(OSSOS.pescoco),
      torso: lista(OSSOS.torso),
      orelhas: [lista(OSSOS.orelhaE), lista(OSSOS.orelhaD)],
      cauda: lista(OSSOS.cauda),
    };

    // Fixa a pose de repouso ANTES do mixer começar a escrever.
    if (partes.cabeca) repousoDe(partes.cabeca);
    for (const grupoOssos of [partes.pescoco, partes.torso, partes.cauda, ...partes.orelhas]) {
      for (const osso of grupoOssos) repousoDe(osso);
    }

    ossos.current = partes;
  }, [scene]);

  /* --- Clipe base: Idle em loop ------------------------------------------
   * Anima o que a gente não controla (patas, corpo). Os ossos controlados
   * acima são sobrescritos depois, no useFrame. */
  useEffect(() => {
    const idle = actions[CLIPES.idle];
    if (!idle) return;
    idle.reset().fadeIn(0.4).play();
    return () => {
      idle.fadeOut(0.3);
    };
  }, [actions]);

  /* --- Estado dos comportamentos ociosos --------------------------------- */
  const olhar = useRef({
    inclinacao: 0,
    giro: 0,
    alvoInclinacao: 0,
    alvoGiro: 0,
    proximaTroca: 1.5,
  });
  const piscada = useRef({ proxima: 2.5, terminaEm: 0, fechado: false });
  /* Cursor: guarda a última posição vista e quando ela mudou, pra saber se o
   * usuário está mexendo o mouse agora ou se já parou (aí volta pro olhar
   * ocioso aleatório da Etapa 1). */
  const cursor = useRef({ x: 0, y: 0, ultimoMovimento: -Infinity });

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const partes = ossos.current;

    /* Orelhas caídas: o husky vem com orelha em pé, o spec pede caída. A dobra
       é no eixo lateral e espelhada entre os lados, pra cada orelha cair pra
       fora — não as duas pro mesmo lado. Um tremor leve por cima, com a ponta
       mexendo mais que a base. */
    partes.orelhas.forEach((orelha, lado) => {
      const espelho = lado === 0 ? 1 : -1;
      orelha.forEach((osso, i) => {
        const tremor = Math.sin(t * 1.6 + i * 0.7) * 0.03 * (i + 1);
        pose(osso, tremor, 0, QUEDA_ORELHA[i] * espelho);
      });
    });

    /* Rabo: abanar lateral, com a onda percorrendo a cauda. */
    partes.cauda.forEach((osso, i) => {
      pose(osso, 0, 0, Math.sin(t * 2.6 - i * 0.45) * 0.12);
    });

    /* Respiração: peito subindo e descendo, bem sutil. */
    partes.torso.forEach((osso, i) => {
      pose(osso, Math.sin(t * 0.9) * 0.012 * (i === 1 ? 1.6 : 1), 0, 0);
    });

    /* Olhar: Etapa 2 — a cabeça segue o cursor (não existe osso de olho no
     * rig, então é a cabeça inteira que faz esse papel, dentro dos limites
     * de LIMITE_OLHAR). Quando o mouse fica parado por um tempo, volta pro
     * olhar ocioso aleatório da Etapa 1.
     *
     * `state.pointer` é a coordenada normalizada (-1..1) que o R3F já
     * calcula sozinho a partir do mouse sobre o Canvas — não precisa de
     * listener manual. x: -1 esquerda … 1 direita. y: -1 embaixo … 1 em cima.
     *
     * ⚠️ Sinal ainda não confirmado visualmente (não dá pra renderizar 3D
     * neste ambiente): o mapeamento abaixo assume que rotation.z positivo
     * gira a cabeça pra a direita da tela e rotation.x positivo inclina pra
     * cima. Se ao testar em /mascote o cachorro olhar pro lado/sentido
     * errado, é só inverter o sinal de `pointer.x` e/ou `pointer.y` aqui. */
    const o = olhar.current;
    const c = cursor.current;
    if (Math.abs(state.pointer.x - c.x) > 0.0008 || Math.abs(state.pointer.y - c.y) > 0.0008) {
      c.x = state.pointer.x;
      c.y = state.pointer.y;
      c.ultimoMovimento = t;
    }
    const seguindoCursor = t - c.ultimoMovimento < 4;

    if (seguindoCursor) {
      o.alvoGiro = c.x * LIMITE_OLHAR.cabecaY;
      o.alvoInclinacao = c.y * LIMITE_OLHAR.cabecaX;
    } else if (t > o.proximaTroca) {
      o.alvoGiro = (Math.random() - 0.5) * LIMITE_OLHAR.cabecaY;
      o.alvoInclinacao = (Math.random() - 0.5) * LIMITE_OLHAR.cabecaX * 0.6;
      o.proximaTroca = t + 2.5 + Math.random() * 3.5;
    }
    // Segue o cursor mais rápido que o olhar ocioso — fica mais "alerta".
    const velocidadeOlhar = seguindoCursor ? 5 : 3;
    o.inclinacao += (o.alvoInclinacao - o.inclinacao) * Math.min(delta * velocidadeOlhar, 1);
    o.giro += (o.alvoGiro - o.giro) * Math.min(delta * velocidadeOlhar, 1);

    if (partes.cabeca) pose(partes.cabeca, o.inclinacao, 0, o.giro);
    // O pescoço acompanha só uma fração, senão o giro fica de robô.
    partes.pescoco.forEach((osso) => {
      pose(osso, o.inclinacao * LIMITE_OLHAR.pescocoFator, 0, o.giro * LIMITE_OLHAR.pescocoFator);
    });

    /* Piscada: o rig não tem osso de olho nem morph target, então "fechar o
       olho" é pintar esclera e pupila da cor da pelagem por ~110ms. Em modelo
       low-poly isso lê como piscada. */
    const p = piscada.current;
    if (!p.fechado && t > p.proxima) {
      p.fechado = true;
      p.terminaEm = t + 0.11;
      for (const m of materiaisOlho.current) m.color.set(COR_PISCADA);
    } else if (p.fechado && t > p.terminaEm) {
      p.fechado = false;
      p.proxima = t + 2.5 + Math.random() * 4;
      materiaisOlho.current.forEach((m, i) => m.color.setHex(corOriginalOlho.current[i]));
    }
  });

  return (
    <group ref={grupo} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODELO_URL);
