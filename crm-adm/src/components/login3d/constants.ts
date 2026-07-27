/**
 * Constantes do mascote 3D.
 *
 * Os nomes de material e de osso abaixo NÃO são chute: vieram da inspeção do
 * próprio `public/models/dog.glb` (Husky low-poly da Quaternius, CC0). O modelo
 * não tem nenhuma textura — só 5 materiais de cor chapada —, e é justamente por
 * isso que dá pra transformar o husky cinza num cachorro caramelo trocando cor
 * por código, sem editar o arquivo.
 */

/** Caminho do modelo (Quaternius, CC0 — uso comercial livre, sem atribuição). */
export const MODELO_URL = "/models/dog.glb";

/**
 * Recoloração por material. A posição de cada um no corpo foi determinada
 * decodificando o bounding box das primitivas do .glb:
 *
 *  - "Material"      1484 vértices, dorso/topo, não encosta no chão  → pelo escuro
 *  - "Material.001"  2210 vértices, maior, desce até o chão          → pelo claro
 *  - "Material.006"   120 vértices, ponta frontal estreita e alta    → focinho
 *  - "Material.003"    38 vértices, simétrico em X na altura do olho → esclera
 *  - "Material.002"    48 vértices, dentro da esclera                → pupila
 */
export const CORES_POR_MATERIAL: Record<string, string> = {
  Material: "#8a5220", // dorso caramelo escuro
  "Material.001": "#c98f52", // trigo/caramelo claro (corpo, patas, face)
  "Material.006": "#2a1a12", // focinho escuro
  "Material.003": "#f3efe6", // esclera
  "Material.002": "#140f0b", // pupila
};

/** Cor usada pra "fechar" o olho durante a piscada (tom da pelagem da face). */
export const COR_PISCADA = "#c98f52";

/** Materiais que formam os olhos — usados na piscada. */
export const MATERIAIS_OLHO = ["Material.003", "Material.002"];

/**
 * Ossos usados nas animações aditivas. O rig tem 49 ossos; estes são os que
 * importam pro comportamento. Não existe osso de mandíbula nem de olho — por
 * isso a piscada é feita por troca de cor e não por pálpebra.
 *
 * ATENÇÃO aos nomes: no arquivo eles são "Ear1.L", mas o GLTFLoader do three.js
 * **remove o ponto** ao carregar, virando "Ear1L". Usar o nome do arquivo aqui
 * faz `getObjectByName` devolver `undefined` e a orelha simplesmente não mexe,
 * sem erro nenhum. Isso foi verificado no modelo carregado, não presumido.
 */
export const OSSOS = {
  cabeca: "Head",
  pescoco: ["Neck1", "Neck2", "Neck3"],
  torso: ["Torso", "Torso2", "Torso3"],
  orelhaE: ["Ear1L", "Ear2L", "Ear3L", "Ear4L"],
  orelhaD: ["Ear1R", "Ear2R", "Ear3R", "Ear4R"],
  cauda: ["Tail1", "Tail2", "Tail3", "Tail4", "Tail5", "Tail6"],
} as const;

/** Clipes de animação presentes no arquivo (12 únicos). */
export const CLIPES = {
  idle: "Idle",
  idle2: "Idle_2",
  cabecaBaixa: "Idle_2_HeadLow",
  sustoEsq: "Idle_HitReact_Left",
  sustoDir: "Idle_HitReact_Right",
  andar: "Walk",
  correr: "Gallop",
  correrPular: "Gallop_Jump",
  pular: "Jump_ToIdle",
  atacar: "Attack",
  comer: "Eating",
} as const;

/**
 * Convenção de eixos deste rig — medida no modelo carregado, girando osso por
 * osso e olhando o resultado renderizado:
 *
 *   rotation.z  →  lateral   (virar a cabeça, abanar o rabo, orelha caindo)
 *   rotation.x  →  inclinar  (cima/baixo)
 *   rotation.y  →  torcer    (roll, quase nunca útil)
 */
export const EIXO = { lateral: "z", inclinar: "x" } as const;

/**
 * O husky vem com orelha em pé; o spec pede orelha caída. Cada orelha tem 4
 * ossos, então dá pra dobrar em cascata — mais na base, menos na ponta.
 * Aplicado no eixo LATERAL (z), espelhado entre os lados, pra orelha cair pro
 * lado da cabeça em vez de pra trás. Valores em radianos, validados no render.
 */
export const QUEDA_ORELHA = [0.9, 0.75, 0.53, 0.3];

/** Limites do olhar — rastreamento de cursor e olhar ocioso aleatório (Etapa 2). */
export const LIMITE_OLHAR = {
  cabecaX: 0.35, // ~20° cima/baixo
  cabecaY: 0.44, // ~25° esquerda/direita
  pescocoFator: 0.4, // quanto do giro vai pro pescoço
};
