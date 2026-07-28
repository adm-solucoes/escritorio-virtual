/**
 * Constantes do mascote 3D — modelo ADMSOLUÇÕES.glb (custom, autoral, exportado
 * do Blender). Nomes de osso/material vieram da inspeção do arquivo (script
 * Node lendo o JSON interno do .glb), não são chute.
 *
 * Diferenças importantes em relação ao Husky genérico usado nas Etapas 1-3:
 * - Tem osso de MANDÍBULA (Jaw) e PINGENTE (Pendant) — o Husky não tinha.
 * - Orelha é 1 osso por lado (Ear_L/Ear_R), não uma corrente de 4.
 * - Cauda é 2 ossos (Tail1/Tail2), não 6.
 * - Coluna é Chest → Spinr → Spine2 → Pelvis (3 ossos "de torso" + pelve).
 * - Ainda NÃO tem osso de olho (Head só tem Ear_L/Ear_R como filhos).
 * - **Não tem nenhum clipe de animação** — tudo (inclusive andar/correr) tem
 *   que ser escrito em código. Os clipes do Husky (CLIPES) não existem aqui.
 * - Só 3 materiais (Corpo, Preto, Branco) — diferente dos 5 do Husky, que
 *   isolavam esclera/pupila em materiais próprios pro truque de piscar. Aqui
 *   ainda não deu pra confirmar visualmente qual das 3 primitivas corresponde
 *   ao olho, então a piscada por enquanto fica desligada (ver DogModel.tsx).
 */

export const MODELO_URL = "/models/adm-dog.glb";

/** Cor base de cada material — recalibrada depois de ver renderizado (não é
 * mais chute). Confirmado visualmente em /mascote:
 * - "Corpo": corpo inteiro (pelagem).
 * - "Preto": focinho + coleira — já renderiza certo.
 * - "Branco": os DOIS OLHOS (267 vértices, região alta/frontal da cabeça) —
 *   não "plaquinha" como eu supunha antes. O arquivo não tem pupila pintada
 *   (cor de vértice uniforme nessa região), então um olho branco sólido
 *   ficava com cara de assombrado. Trocado pra um marrom escuro — sem
 *   distinção esclera/pupila, mas muito mais parecido com "olhão de
 *   pelúcia" da referência do que branco vazio. */
export const CORES_POR_MATERIAL: Record<string, string> = {
  Corpo: "#c1863f", // dourado/caramelo quente, tipo golden retriever
  Preto: "#171310", // focinho + coleira
  Branco: "#3b2415", // olhos — marrom escuro, não branco
};

/** Nome do material que representa o corpo/pelagem — só ele recebe a
 * textura de relevo (bump map) que simula pelo curto de pelúcia; "Preto" e
 * "Branco" (coleira, focinho, plaquinha) ficam lisos de propósito, pro
 * contraste "plástico/feltro liso vs. pelagem" igual a referência. */
export const MATERIAL_PELAGEM = "Corpo";

/** Ossos usados nas animações. Nomes exatos do arquivo (glTF preserva o nome
 * do Blender sem transformação, diferente do Husky que perdia pontos). */
export const OSSOS = {
  cabeca: "Head",
  mandibula: "Jaw",
  pingente: "Pendant",
  orelhaE: "Ear_L",
  orelhaD: "Ear_R",
  pescoco: "Neck", // um osso só, não uma corrente como no Husky
  torso: ["Chest", "Spinr", "Spine2", "Pelvis"],
  cauda: ["Tail1", "Tail2"],
  patas: {
    frenteE: ["Front_L_Upper", "Front_L_Lower", "Front_L_Foot", "Front_L_Toe"],
    frenteD: ["Front_R_Upper", "Front_R_Lower", "Front_R_Foot", "Front_R_Toe"],
    trasE: ["Back_L_Upper", "Back_L_Lower", "Back_L_Foot", "Back_L_Toe"],
    trasD: ["Back_R_Upper", "Back_R_Lower", "Back_R_Foot", "Back_R_Toe"],
  },
} as const;

/** Convenção de eixos — assumida igual à do Husky (bone cresce em +Y local,
 * rotation.x = inclinar, rotation.z = lateral) por ser o padrão mais comum
 * em rigs exportados do Blender, mas **não confirmada visualmente neste
 * modelo especificamente**. Se ao testar em /mascote a orelha/cabeça girar
 * no eixo errado, é essa suposição que precisa ajustar. */
export const EIXO = { lateral: "z", inclinar: "x" } as const;

/** Limites do olhar — mesmo valor usado no Husky (chute razoável, ainda não
 * recalibrado pra esse modelo). */
export const LIMITE_OLHAR = {
  cabecaX: 0.35,
  cabecaY: 0.44,
  pescocoFator: 0.4,
};

/** Escala aplicada ao modelo na cena — o bind pose deste .glb mede ~1×2×2
 * unidades (bem menor que o Husky, ~3,9×3,2), e a câmera do DogCanvas foi
 * calibrada pro Husky. Valor de 1.8 é um primeiro palpite pra ocupar um
 * enquadramento parecido — **não confirmado visualmente**, ajustar depois de
 * ver renderizado em /mascote. */
export const ESCALA_MODELO = 1.8;
