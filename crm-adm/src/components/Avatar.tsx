// Avatar circular — mostra a foto quando existe; quando não existe (é o caso de
// praticamente todo contato de WhatsApp/Instagram, já que as APIs de negócio não
// dão acesso à foto de perfil do cliente), cai pras iniciais com uma cor
// determinística a partir do nome — o mesmo comportamento do WhatsApp Web.

// Sem tons de vermelho/coral aqui de propósito — bateriam com o --adm-red da
// marca (usado no item ativo do menu e em ações destrutivas) e criariam uma
// falsa sensação de alerta/erro só por coincidência de hash do nome.
const CORES_INICIAIS = [
  "#2a78d6", "#1baf7a", "#eda100", "#e87ba4", "#4a3aa7", "#008300", "#6d5acf", "#0f8b8d",
];

function corPara(texto: string): string {
  let hash = 0;
  for (let i = 0; i < texto.length; i++) hash = texto.charCodeAt(i) + ((hash << 5) - hash);
  return CORES_INICIAIS[Math.abs(hash) % CORES_INICIAIS.length];
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const TAMANHOS = { sm: 28, md: 36, lg: 48 } as const;

export default function Avatar({
  nome,
  fotoUrl,
  tamanho = "md",
  className = "",
}: {
  nome: string;
  fotoUrl?: string | null;
  tamanho?: keyof typeof TAMANHOS;
  className?: string;
}) {
  const px = TAMANHOS[tamanho];

  if (fotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={fotoUrl}
        alt={nome}
        width={px}
        height={px}
        className={`rounded-full object-cover shrink-0 ${className}`}
        style={{ width: px, height: px }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-bold shrink-0 ${className}`}
      style={{ width: px, height: px, background: corPara(nome || "?"), fontSize: px * 0.4 }}
    >
      {iniciais(nome)}
    </div>
  );
}
