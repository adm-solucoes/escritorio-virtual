import { CanvasTexture, RepeatWrapping } from "three";

/**
 * Gera uma textura de relevo (bump map) por código pra simular pelagem curta
 * de pelúcia — sem precisar de um asset de textura pintado, que o modelo não
 * tem.
 *
 * Primeira versão usava ruído por pixel (2 camadas, grossa+fina): ficou com
 * cara de "estática de TV"/listra regular, não de pelo. Fio de pelo real tem
 * DIREÇÃO — então aqui desenha milhares de traços curtos quase-verticais
 * (technique clássica de "fake fur" em canvas 2D), não ruído isotrópico.
 * Cada traço = um fio. Ângulo/comprimento/tom variam por traço, dando o
 * aspecto "penteado" da referência em vez de grão uniforme.
 */
export function gerarTexturaPelagem(tamanho = 512): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d")!;

  // Base neutra (nem alto nem baixo — bump map em 128/255 = "sem relevo").
  ctx.fillStyle = "rgb(150,150,150)";
  ctx.fillRect(0, 0, tamanho, tamanho);

  const NUM_FIOS = 9000;
  for (let i = 0; i < NUM_FIOS; i++) {
    const x = Math.random() * tamanho;
    const y = Math.random() * tamanho;
    const comprimento = 4 + Math.random() * 7;
    // Quase vertical, com um leve desvio aleatório — "penteado", não reto.
    const angulo = (Math.random() - 0.5) * 0.9 + Math.PI / 2;
    const dx = Math.cos(angulo) * comprimento;
    const dy = Math.sin(angulo) * comprimento;

    const tom = 120 + Math.floor(Math.random() * 110); // 120–230: alguns fios claros, outros escuros
    ctx.strokeStyle = `rgb(${tom},${tom},${tom})`;
    ctx.lineWidth = 1;
    ctx.globalAlpha = 0.55 + Math.random() * 0.25;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + dx, y + dy);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const textura = new CanvasTexture(canvas);
  textura.wrapS = textura.wrapT = RepeatWrapping;
  textura.repeat.set(10, 10);
  textura.needsUpdate = true;
  return textura;
}
