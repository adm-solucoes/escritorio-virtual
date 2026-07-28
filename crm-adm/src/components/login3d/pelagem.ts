import { CanvasTexture, RepeatWrapping } from "three";

/**
 * Gera uma textura de relevo (bump map) por código pra simular pelagem curta
 * de pelúcia — sem precisar de um asset de textura pintado, que o modelo não
 * tem. Ruído em 2 camadas (grossa + fina) em vez de ruído puro por pixel,
 * que ficaria com cara de "estática de TV" em vez de pelo agrupado.
 *
 * ⚠️ Efeito visual (o quanto "peludo" fica) não foi conferido renderizado —
 * `bumpScale` em DogModel.tsx é o parâmetro pra ajustar depois de ver.
 */
export function gerarTexturaPelagem(tamanho = 256): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = tamanho;
  const ctx = canvas.getContext("2d")!;

  // Camada grossa: grade de baixa resolução, upscaled (dá o "agrupamento" do
  // pelo, em vez de ruído uniforme).
  const grade = 24;
  const valoresGrade: number[][] = Array.from({ length: grade }, () =>
    Array.from({ length: grade }, () => Math.random())
  );
  const amostrarGrade = (u: number, v: number) => {
    const gx = u * (grade - 1);
    const gy = v * (grade - 1);
    const x0 = Math.floor(gx), y0 = Math.floor(gy);
    const x1 = Math.min(x0 + 1, grade - 1), y1 = Math.min(y0 + 1, grade - 1);
    const fx = gx - x0, fy = gy - y0;
    const a = valoresGrade[y0][x0], b = valoresGrade[y0][x1];
    const c = valoresGrade[y1][x0], d = valoresGrade[y1][x1];
    return a * (1 - fx) * (1 - fy) + b * fx * (1 - fy) + c * (1 - fx) * fy + d * fx * fy;
  };

  const imageData = ctx.createImageData(tamanho, tamanho);
  for (let y = 0; y < tamanho; y++) {
    for (let x = 0; x < tamanho; x++) {
      const grossa = amostrarGrade(x / tamanho, y / tamanho);
      const fina = Math.random();
      // 70% grossa (agrupamento) + 30% fina (textura do fio), centrado em ~190/255
      const v = Math.round(140 + (grossa * 0.7 + fina * 0.3) * 100);
      const i = (y * tamanho + x) * 4;
      imageData.data[i] = v;
      imageData.data[i + 1] = v;
      imageData.data[i + 2] = v;
      imageData.data[i + 3] = 255;
    }
  }
  ctx.putImageData(imageData, 0, 0);

  const textura = new CanvasTexture(canvas);
  textura.wrapS = textura.wrapT = RepeatWrapping;
  textura.repeat.set(16, 16); // repete bastante — pelo curto, não manchas grandes
  textura.needsUpdate = true;
  return textura;
}
