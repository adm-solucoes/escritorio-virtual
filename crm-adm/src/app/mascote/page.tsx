import { notFound } from "next/navigation";

/**
 * Mascote 3D DESATIVADO a pedido do usuário.
 *
 * O código continua intacto em `src/components/login3d/` (DogModel, DogCanvas,
 * IntroStage, introTimeline, constants) e o modelo em `public/models/`, caso
 * o trabalho seja retomado depois. Esta rota só para de ser servida.
 *
 * O login de verdade (`src/app/login/page.tsx`) nunca usou nenhum desses
 * componentes — sempre foi o formulário padrão, então nada muda lá.
 */
export default function MascotePreviewPage() {
  notFound();
}
