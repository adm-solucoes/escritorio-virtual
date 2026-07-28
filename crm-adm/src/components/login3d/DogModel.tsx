"use client";

import { useLayoutEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Euler, type Object3D, type Group, type Mesh, type MeshStandardMaterial } from "three";
import { CORES_POR_MATERIAL, LIMITE_OLHAR, MATERIAL_PELAGEM, MODELO_URL, OSSOS } from "./constants";
import { gerarTexturaPelagem } from "./pelagem";

// Gerada uma vez (client-only, dentro do useLayoutEffect) e reaproveitada —
// não precisa de uma textura nova por remontagem do componente.
let texturaPelagemCache: ReturnType<typeof gerarTexturaPelagem> | null = null;

/**
 * Mascote 3D — modelo ADMSOLUÇÕES.glb. Diferente do Husky usado nas Etapas
 * 1-3, este modelo não tem NENHUM clipe de animação — não existe um "Idle"
 * pra tocar em loop cobrindo o que a gente não controla na mão. Isso muda a
 * arquitetura: aqui, TODO o comportamento (inclusive parado) é pose absoluta
 * escrita por código, sempre. Não tem clipe pra crossfade nem pra "herdar"
 * movimento de pernas.
 *
 * Pose de repouso = a pose em que o artista modelou o rig (bind pose), lida
 * uma vez de cada osso controlado. A cada frame: rotação = repouso + offset.
 * Mesma técnica idempotente já usada no Husky (ver commit "corrige
 * retorcimento progressivo"), só que aqui é a ÚNICA fonte de movimento —
 * não tem clipe por baixo pra brigar com ela.
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

function pose(osso: Object3D | undefined, dx: number, dy: number, dz: number) {
  if (!osso) return;
  const base = repousoDe(osso);
  osso.rotation.set(base.x + dx, base.y + dy, base.z + dz);
}

interface Props {
  /** Desliga o olhar/piscada/orelha/rabo/respiração "vivos" — reservado pras
   * cenas de corrida/andar da intro, que (quando escritas) vão controlar essas
   * partes com um ciclo de marcha próprio, não com o comportamento ocioso. */
  suspenderComportamentoOcioso?: boolean;
}

export default function DogModel({ suspenderComportamentoOcioso = false }: Props) {
  const grupo = useRef<Group>(null);
  const { scene } = useGLTF(MODELO_URL);

  /* --- Recoloração por material + pelagem de pelúcia ----------------------
   * "Corpo" já vem com a cor certa no arquivo; "Preto"/"Branco" vêm cinza
   * (0.8,0.8,0.8) — provavelmente pensados pra receber textura/paint que não
   * veio no export, então força a cor pelo nome. Clona o material antes de
   * mexer pra não sujar o cache global do useGLTF.
   *
   * O material do corpo (MATERIAL_PELAGEM) ganha, além da cor, um bump map
   * gerado por código (pelagem.ts) simulando pelo curto — o arquivo não tem
   * textura de pelagem nenhuma, então isso é a única forma de não ficar
   * completamente liso/plástico. Focinho/coleira/plaquinha ficam lisos de
   * propósito, pro contraste. */
  useLayoutEffect(() => {
    if (!texturaPelagemCache) texturaPelagemCache = gerarTexturaPelagem();

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
      clone.metalness = 0;

      if (material.name === MATERIAL_PELAGEM) {
        clone.roughness = 0.95; // fosco, sem brilho — mais feltro/pelúcia
        clone.bumpMap = texturaPelagemCache;
        clone.bumpScale = 0.025;
      } else {
        clone.roughness = 0.5; // focinho/coleira/plaquinha: lisos, quase plástico
      }

      malha.material = clone;
    });
  }, [scene]);

  /* --- Ossos controlados na mão -------------------------------------------
   * Em ref (não useMemo): o useFrame escreve neles todo frame. */
  const ossos = useRef<{
    cabeca?: Object3D;
    mandibula?: Object3D;
    pingente?: Object3D;
    orelhaE?: Object3D;
    orelhaD?: Object3D;
    pescoco?: Object3D;
    torso: Object3D[];
    cauda: Object3D[];
  }>({ torso: [], cauda: [] });

  useLayoutEffect(() => {
    const buscar = (nome: string) => scene.getObjectByName(nome) ?? undefined;
    const lista = (nomes: readonly string[]) =>
      nomes.map(buscar).filter((o): o is Object3D => Boolean(o));

    const partes = {
      cabeca: buscar(OSSOS.cabeca),
      mandibula: buscar(OSSOS.mandibula),
      pingente: buscar(OSSOS.pingente),
      orelhaE: buscar(OSSOS.orelhaE),
      orelhaD: buscar(OSSOS.orelhaD),
      pescoco: buscar(OSSOS.pescoco),
      torso: lista(OSSOS.torso),
      cauda: lista(OSSOS.cauda),
    };

    // Fixa a pose de repouso ANTES de qualquer offset ser aplicado.
    for (const osso of [partes.cabeca, partes.mandibula, partes.pingente, partes.orelhaE, partes.orelhaD, partes.pescoco, ...partes.torso, ...partes.cauda]) {
      if (osso) repousoDe(osso);
    }

    ossos.current = partes;
  }, [scene]);

  /* --- Estado dos comportamentos ociosos --------------------------------- */
  const olhar = useRef({ inclinacao: 0, giro: 0, alvoInclinacao: 0, alvoGiro: 0, proximaTroca: 1.5 });
  const cursor = useRef({ x: 0, y: 0, ultimoMovimento: -Infinity });

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const partes = ossos.current;

    if (!suspenderComportamentoOcioso) {
      /* Orelhas: um leve tremor/balanço, sem "queda" forçada — diferente do
       * Husky (que precisava dobrar a orelha em pé pra ficar caída), esse
       * modelo já deve vir modelado com a orelha na posição certa. */
      pose(partes.orelhaE, 0, 0, Math.sin(t * 1.6) * 0.05);
      pose(partes.orelhaD, 0, 0, Math.sin(t * 1.6 + 0.4) * 0.05 * -1);

      /* Rabo: abanar lateral, onda entre os 2 segmentos. */
      partes.cauda.forEach((osso, i) => {
        pose(osso, 0, 0, Math.sin(t * 2.6 - i * 0.6) * 0.18);
      });

      /* Respiração: sobe/desce sutil na coluna (Chest é o mais visível). */
      partes.torso.forEach((osso, i) => {
        pose(osso, Math.sin(t * 0.9) * 0.01 * (i === 0 ? 1.6 : 1), 0, 0);
      });

      /* Pingente: balanço passivo simples (pêndulo), mais lento que o rabo. */
      pose(partes.pingente, Math.sin(t * 1.1) * 0.06, 0, Math.cos(t * 0.9) * 0.04);

      /* Olhar: cabeça segue o cursor (mesma lógica/limites do Husky — ver
       * aviso de sinal não confirmado no componente anterior; vale o mesmo
       * aqui, ainda mais porque é um rig diferente). */
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
      const velocidadeOlhar = seguindoCursor ? 5 : 3;
      o.inclinacao += (o.alvoInclinacao - o.inclinacao) * Math.min(delta * velocidadeOlhar, 1);
      o.giro += (o.alvoGiro - o.giro) * Math.min(delta * velocidadeOlhar, 1);

      pose(partes.cabeca, o.inclinacao, 0, o.giro);
      pose(partes.pescoco, o.inclinacao * LIMITE_OLHAR.pescocoFator, 0, o.giro * LIMITE_OLHAR.pescocoFator);
    }
  });

  return (
    <group ref={grupo} dispose={null}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODELO_URL);
