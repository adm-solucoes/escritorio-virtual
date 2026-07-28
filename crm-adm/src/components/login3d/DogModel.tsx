"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import { Box3, Euler, Vector3, type Object3D, type Group, type Mesh } from "three";
import { ALTURA_ALVO, LIMITE_OLHAR, MODELO_URL, OSSOS } from "./constants";

/**
 * Mascote 3D — modelo Labrador.glb. Diferente do ADMSOLUÇÕES.glb usado antes,
 * este tem textura PBR real (não precisa recolorir material nem gerar
 * pelagem por bump map) e um clipe de animação embutido — mas o clipe NÃO é
 * tocado aqui: a arquitetura continua 100% pose absoluta por código, mesma
 * técnica idempotente já usada nos modelos anteriores, pra manter controle
 * fino do olhar/estados da intro sem um clipe rodando por baixo brigando com
 * essas poses.
 *
 * Pose de repouso = a pose em que o artista modelou o rig (bind pose), lida
 * uma vez de cada osso controlado. A cada frame: rotação = repouso + offset.
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

  /* --- Sombra + auto-escala -------------------------------------------
   * Este modelo vem de um asset de terceiro com unidades desconhecidas de
   * antemão — em vez de chutar um fator de escala fixo (erro cometido com os
   * modelos anteriores, corrigido só depois de ver renderizado), mede a
   * caixa delimitadora real da bind pose e calcula o fator que faz a altura
   * bater com ALTURA_ALVO, plantando os pés em y=0. */
  const ajuste = useMemo(() => {
    const caixa = new Box3().setFromObject(scene);
    const tamanho = caixa.getSize(new Vector3());
    const escala = ALTURA_ALVO / (tamanho.y || 1);
    return { escala, offsetY: -caixa.min.y * escala };
  }, [scene]);

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const malha = obj as Mesh;
      if (!malha.isMesh) return;
      malha.castShadow = true;
      malha.receiveShadow = true;
    });
  }, [scene]);

  /* --- Ossos controlados na mão -------------------------------------------
   * Em ref (não useMemo): o useFrame escreve neles todo frame. */
  const ossos = useRef<{
    cabeca?: Object3D;
    orelhaE?: Object3D;
    orelhaD?: Object3D;
    pescoco: Object3D[];
    torso: Object3D[];
    cauda: Object3D[];
  }>({ pescoco: [], torso: [], cauda: [] });

  useLayoutEffect(() => {
    const buscar = (nome: string) => scene.getObjectByName(nome) ?? undefined;
    const lista = (nomes: readonly string[]) =>
      nomes.map(buscar).filter((o): o is Object3D => Boolean(o));

    const partes = {
      cabeca: buscar(OSSOS.cabeca),
      orelhaE: buscar(OSSOS.orelhaE),
      orelhaD: buscar(OSSOS.orelhaD),
      pescoco: lista(OSSOS.pescoco),
      torso: lista(OSSOS.torso),
      cauda: lista(OSSOS.cauda),
    };

    // Fixa a pose de repouso ANTES de qualquer offset ser aplicado.
    for (const osso of [partes.cabeca, partes.orelhaE, partes.orelhaD, ...partes.pescoco, ...partes.torso, ...partes.cauda]) {
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
      /* Orelhas: leve tremor/balanço — o resto da corrente (Ear2-4) segue por
       * herança de transform (FK), então só o osso raiz precisa de pose. */
      pose(partes.orelhaE, 0, 0, Math.sin(t * 1.6) * 0.05);
      pose(partes.orelhaD, 0, 0, Math.sin(t * 1.6 + 0.4) * 0.05 * -1);

      /* Rabo: abanar lateral, onda correndo pelos 6 segmentos. */
      partes.cauda.forEach((osso, i) => {
        pose(osso, 0, 0, Math.sin(t * 2.6 - i * 0.6) * 0.18);
      });

      /* Respiração: sobe/desce sutil na coluna (Torso é o mais visível). */
      partes.torso.forEach((osso, i) => {
        pose(osso, Math.sin(t * 0.9) * 0.01 * (i === 0 ? 1.6 : 1), 0, 0);
      });

      /* Olhar: cabeça + corrente de pescoço seguem o cursor. O fator é
       * dividido pelo número de ossos da corrente pra o efeito acumulado
       * (cada rotação soma na cadeia FK) bater com o mesmo ângulo total
       * usado nos modelos anteriores (pescoço de 1 osso só). */
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
      const fatorPorOsso = LIMITE_OLHAR.pescocoFator / (partes.pescoco.length || 1);
      partes.pescoco.forEach((osso) => {
        pose(osso, o.inclinacao * fatorPorOsso, 0, o.giro * fatorPorOsso);
      });
    }
  });

  return (
    <group ref={grupo} dispose={null} position={[0, ajuste.offsetY, 0]} scale={ajuste.escala}>
      <primitive object={scene} />
    </group>
  );
}

useGLTF.preload(MODELO_URL);
