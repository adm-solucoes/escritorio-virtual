import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase-proxy";
import {
  consumirCota,
  ehCronAutorizado,
  grupoDaRota,
  ipDaRequisicao,
  politicaPara,
  respostaLimiteExcedido,
} from "@/lib/rate-limit";

/**
 * Duas responsabilidades bem separadas por caminho:
 *
 *   /api/*  → só rate limit. A autenticação continua dentro de cada rota
 *             (cada uma tem regra própria: sessão, x-api-key, assinatura de
 *             webhook, CRON_SECRET), então o proxy não tenta adivinhar.
 *   demais  → só o redirect de login de sempre.
 *
 * O limite fica aqui, e não repetido em 35 rotas, porque assim vale também
 * pras rotas que alguém criar depois — ninguém precisa lembrar de aplicar.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    return limitarRotaDeApi(request, pathname);
  }

  return updateSession(request);
}

async function limitarRotaDeApi(request: NextRequest, pathname: string) {
  // Cron da própria Vercel: horário fixo e punhado de IPs, cairia no teto
  // por motivo errado. Só passa com o segredo correto.
  if (ehCronAutorizado(request.headers)) {
    return NextResponse.next();
  }

  const politica = politicaPara(pathname, request.method);
  const identificador = `${ipDaRequisicao(request.headers)}|${grupoDaRota(pathname)}`;
  const resultado = await consumirCota(identificador, politica);

  if (!resultado.permitido) {
    return respostaLimiteExcedido(resultado);
  }

  // Só o teto informativo aqui — NÃO o "restante".
  //
  // O restante do balde por IP (que é o que este middleware controla) não
  // vale pra resposta final: rotas de auth têm um segundo limite, por e-mail,
  // decidido lá dentro. Quando esse segundo limite barra, o header escrito
  // aqui sobrescrevia o da rota e o 429 saía anunciando "restante: 4" —
  // contraditório justamente na resposta em que o cliente decide se tenta de
  // novo. O Retry-After do 429 continua correto e é o que de fato importa.
  const resposta = NextResponse.next();
  resposta.headers.set("X-RateLimit-Limit", String(politica.limite));
  return resposta;
}

export const config = {
  // `api/` NÃO entra na lista de exclusão (diferente do resto) justamente pra
  // o rate limit acima alcançar as rotas de API.
  //
  // Continuam de fora: assets internos do Next, o fluxo de auth e qualquer
  // caminho com extensão de arquivo estático — sem essa última parte, imagens
  // de /public (logo da marca, SVGs, modelos 3D) eram redirecionadas pro
  // /login como se fossem página, e o <img> recebia HTML em vez do PNG.
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|auth/|redefinir-senha|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico|js|glb|html|css|map|txt|json|woff|woff2)$).*)",
  ],
};
