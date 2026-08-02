import { MessageCircle, Camera } from "lucide-react";

export type Canal = "whatsapp" | "instagram";

const TAMANHOS = { sm: 14, md: 16, lg: 20 } as const;

/** Selinho pequeno no canto do avatar identificando o canal da conversa —
 * o mesmo padrão de caixa de entrada unificada de outros CRMs. */
export default function CanalBadge({ canal, tamanho = "md" }: { canal: Canal; tamanho?: keyof typeof TAMANHOS }) {
  const px = TAMANHOS[tamanho];
  const Icon = canal === "whatsapp" ? MessageCircle : Camera;
  return (
    <span
      className="absolute -bottom-0.5 -right-0.5 rounded-full flex items-center justify-center ring-2 ring-white shrink-0"
      style={{
        width: px,
        height: px,
        background: canal === "whatsapp" ? "#25D366" : "linear-gradient(135deg, #f58529, #dd2a7b, #8134af)",
      }}
      title={canal === "whatsapp" ? "WhatsApp" : "Instagram"}
    >
      <Icon size={px * 0.62} className="text-white" strokeWidth={2.5} />
    </span>
  );
}
