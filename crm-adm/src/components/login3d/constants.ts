/**
 * Constantes do mascote 3D — modelo Labrador.glb (asset de terceiro, rig com
 * IK completo). Nomes de osso vieram da inspeção do arquivo (script Node
 * lendo o JSON interno do .glb), não são chute.
 *
 * Diferenças importantes em relação ao modelo ADMSOLUÇÕES.glb usado antes:
 * - Textura PBR real (cor+normal+roughness) já embutida no material — não
 *   precisa mais de recoloração por material nem de bump map gerado por
 *   código (ver pelagem.ts, que fica sem uso pra este modelo).
 * - Pescoço é uma corrente de 3 ossos (Neck1→Neck2→Neck3), não 1 só.
 * - Cauda é uma corrente de 6 ossos (Tail1..Tail6), bem mais longa.
 * - Orelha é uma corrente de 4 ossos por lado (Ear1..Ear4), controla-se pelo
 *   osso raiz (Ear1) e o resto segue por herança de transform (FK).
 * - Não tem osso de mandíbula nem pingente — o arquivo já traz 1 clipe de
 *   animação ("Animation", 13s) que anima cabeça/pescoço + um morph target
 *   de boca/língua (ofegando), mas ISSO NÃO É USADO aqui: a arquitetura
 *   deste componente é 100% pose absoluta por código (ver DogModel.tsx),
 *   pra manter controle fino sobre olhar/estados da intro sem brigar com um
 *   clipe rodando por baixo. O clipe do arquivo fica sem uso.
 * - Pernas têm cadeia FK real (Shoulder→UpperLeg→LowerLeg) usada aqui, MAIS
 *   uma cadeia de ossos de controle IK (IKFrontLeg, PoleTarget, FF, FFB) que
 *   no Blender original dirigia a FK via constraint — mas glTF não exporta
 *   constraints, só a hierarquia+skin, então esses ossos IK ficam soltos
 *   (fazem parte do skin mas não têm efeito nenhum se a gente não escrever
 *   código pra movê-los). Ignorados aqui — controla-se a perna direto pela
 *   cadeia FK, igual a qualquer outro osso.
 * - Ainda **não tem ciclo de marcha em código** (mesma limitação do modelo
 *   anterior) — as pernas ficam na pose de bind exceto quando/se um ciclo for
 *   escrito à mão.
 */

export const MODELO_URL = "/models/labrador-dog.glb";

/** Osso raiz do armature — usado pra medir a caixa delimitadora em bind pose
 * e escalar o modelo automaticamente (ver DogModel.tsx), em vez de chutar um
 * fator de escala fixo igual se fez (com dor) para os modelos anteriores. */
export const ALTURA_ALVO = 1.8;

/** Ossos usados nas animações. Nomes exatos do arquivo glTF. */
export const OSSOS = {
  cabeca: "Head",
  orelhaE: "Ear1.L",
  orelhaD: "Ear1.R",
  pescoco: ["Neck1", "Neck2", "Neck3"],
  torso: ["Torso", "Torso2", "Torso3"],
  cauda: ["Tail1", "Tail2", "Tail3", "Tail4", "Tail5", "Tail6"],
  patas: {
    frenteE: ["FrontShoulder.L", "FrontUpperLeg.L", "FrontLowerLeg.L"],
    frenteD: ["FrontShoulder.R", "FrontUpperLeg.R", "FrontLowerLeg.R"],
    trasE: ["BackShoulder.L", "BackUpperLeg.L", "BackLowerLeg.L"],
    trasD: ["BackShoulder.R", "BackUpperLeg.R", "BackLowerLeg.R"],
  },
} as const;

/** Convenção de eixos — assumida igual aos modelos anteriores (bone cresce em
 * +Y local, rotation.x = inclinar, rotation.z = lateral), padrão comum em
 * rigs exportados do Blender, mas **não confirmada visualmente neste modelo
 * especificamente**. Se ao testar em /mascote a orelha/cabeça girar no eixo
 * errado, é essa suposição que precisa ajustar. */
export const EIXO = { lateral: "z", inclinar: "x" } as const;

/** Limites do olhar — mesmo valor usado nos modelos anteriores (chute
 * razoável, ainda não recalibrado pra esse modelo). */
export const LIMITE_OLHAR = {
  cabecaX: 0.35,
  cabecaY: 0.44,
  pescocoFator: 0.4,
};

/** Escala aplicada pela cena ao redor do modelo (IntroStage.tsx). Este
 * modelo se auto-escala pra ALTURA_ALVO dentro do próprio DogModel (ver
 * ajuste de bounding box lá), então aqui fica 1 — mantido só pra não quebrar
 * quem já lê ESCALA_MODELO. */
export const ESCALA_MODELO = 1;
