"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import type * as THREE from "three";
import {
  CLIPES,
  CORES_POR_MATERIAL,
  COR_PISCADA,
  MATERIAIS_OLHO,
  MODELO_URL,
  OSSOS,
  QUEDA_ORELHA,
} from "./constants";

/**
 * Mascote 3D — Etapa 1: só o cachorro, "vivo" parado.
 *
 * Como funciona a camada de animação:
 *
 * 1. O clipe `Idle` do próprio arquivo roda no mixer e escreve a pose base em
 *    todos os ossos, todo frame.
 * 2. Depois disso, o `useFrame` daqui SOMA offsets por cima (orelha caída,
 *    rabo abanando, cabeça olhando em volta, respiração).
 *
 * A ordem importa: o `useAnimations` do drei registra o `useFrame` dele quando
 * é chamado, e o nosso é registrado logo em seguida — então o mixer sempre roda
 * antes. Como o mixer reescreve a pose a cada frame, usar `+=` aqui é aditivo
 * de verdade e não acumula.
 *
 * Convenção de eixos deste rig (medida no modelo renderizado, não chutada):
 * todo osso cresce no +Y local, então rotação em X = inclinar (cima/baixo) e
 * rotação em Z = girar pro lado (yaw, abanar, orelha caindo).
 */

export default function DogModel() {
  const grupo = useRef<THREE.Group>(null);
  const { scene, animations } = useGLTF(MODELO_URL);
  const { actions } = useAnimations(animations, grupo);

  /* --- Recoloração: husky cinza → cachorro caramelo -----------------------
   * O modelo não tem textura nenhuma (5 materiais de cor chapada), então dá
   * pra repintar por código. Clonamos o material antes de mexer pra não sujar
   * o cache global do useGLTF. */
  const materiaisOlho = useRef<THREE.MeshStandardMaterial[]>([]);
  const corOriginalOlho = useRef<number[]>([]);

  useLayoutEffect(() => {
    materiaisOlho.current = [];
    corOriginalOlho.current = [];

    scene.traverse((obj) => {
      const malha = obj as THREE.Mesh;
      if (!malha.isMesh) return;
      malha.castShadow = true;
      malha.receiveShadow = true;

      const material = malha.material as THREE.MeshStandardMaterial;
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

  /* --- Ossos que a gente controla na mão ---------------------------------
   * Guardados em ref (e não em useMemo) de propósito: o `useFrame` escreve
   * neles todo frame, e mutar valor memoizado depois do render é justamente o
   * que o React Compiler proíbe. */
  const ossos = useRef<{
    cabeca?: THREE.Object3D;
    pescoco: THREE.Object3D[];
    torso: THREE.Object3D[];
    orelhas: THREE.Object3D[][];
    cauda: THREE.Object3D[];
  }>({ pescoco: [], torso: [], orelhas: [[], []], cauda: [] });

  useLayoutEffect(() => {
    const buscar = (nome: string) => scene.getObjectByName(nome);
    const lista = (nomes: readonly string[]) =>
      nomes.map(buscar).filter((o): o is THREE.Object3D => Boolean(o));

    ossos.current = {
      cabeca: buscar(OSSOS.cabeca),
      pescoco: lista(OSSOS.pescoco),
      torso: lista(OSSOS.torso),
      orelhas: [lista(OSSOS.orelhaE), lista(OSSOS.orelhaD)],
      cauda: lista(OSSOS.cauda),
    };
  }, [scene]);

  /* --- Clipe base: Idle em loop ------------------------------------------ */
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

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const suave = Math.min(delta * 3, 1);
    const partes = ossos.current;

    /* Orelhas: dobra fixa pro lado (husky é orelha em pé, o spec pede caída)
       + um tremor leve, com a ponta mexendo mais que a base. O sinal é
       espelhado entre os lados pra cada orelha cair pra fora, não as duas
       pro mesmo lado. */
    partes.orelhas.forEach((orelha, lado) => {
      const espelho = lado === 0 ? 1 : -1;
      orelha.forEach((osso, i) => {
        osso.rotation.z += QUEDA_ORELHA[i] * espelho;
        osso.rotation.x += Math.sin(t * 1.6 + i * 0.7) * 0.03 * (i + 1);
      });
    });

    /* Rabo: abanar lateral (eixo Z), onda percorrendo a cauda. */
    partes.cauda.forEach((osso, i) => {
      osso.rotation.z += Math.sin(t * 2.6 - i * 0.45) * 0.12;
    });

    /* Respiração: peito subindo e descendo, bem sutil. */
    partes.torso.forEach((osso, i) => {
      osso.rotation.x += Math.sin(t * 0.9) * 0.012 * (i === 1 ? 1.6 : 1);
    });

    /* Olhar ocioso: de tempos em tempos escolhe um ponto novo e vai até ele
       devagar. Na Etapa 2 isso passa a seguir o cursor. */
    const o = olhar.current;
    if (t > o.proximaTroca) {
      o.alvoGiro = (Math.random() - 0.5) * 0.7;
      o.alvoInclinacao = (Math.random() - 0.5) * 0.3;
      o.proximaTroca = t + 2.5 + Math.random() * 3.5;
    }
    o.inclinacao += (o.alvoInclinacao - o.inclinacao) * suave * 0.6;
    o.giro += (o.alvoGiro - o.giro) * suave * 0.6;

    if (partes.cabeca) {
      partes.cabeca.rotation.x += o.inclinacao * 0.6;
      partes.cabeca.rotation.z += o.giro * 0.6;
    }
    // O pescoço acompanha só uma fração, senão o giro fica de robô.
    partes.pescoco.forEach((osso) => {
      osso.rotation.x += o.inclinacao * 0.15;
      osso.rotation.z += o.giro * 0.15;
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
