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
 *
 * Tentei validar visualmente em 2026-07-31 (pedido de redesign do login) mas
 * o painel do navegador desta sessão não compõe frames WebGL de verdade —
 * toDataURL() devolvia sempre o mesmo PNG em branco, sem erro nenhum no
 * console. Ou seja: não deu pra confirmar se o modelo Labrador renderiza
 * corretamente (eixo de rotação e mira do olhar também nunca foram
 * confirmados, ver constants.ts). Antes de usar isso no login de verdade,
 * abra /mascote localmente num navegador de verdade e confira.
 */
export default function MascotePreviewPage() {
  notFound();
}
