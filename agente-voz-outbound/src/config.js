import "dotenv/config";

/**
 * Config central. Falha rápido (na inicialização, não no meio de uma ligação)
 * se faltar algo obrigatório — melhor descobrir isso ao rodar `npm run dev`
 * do que quando o Twilio já está discando pro lead.
 */

function obrigatoria(nome) {
  const valor = process.env[nome];
  if (!valor) throw new Error(`Variável de ambiente obrigatória ausente: ${nome} (veja .env.example)`);
  return valor;
}

function numero(nome, padrao) {
  const valor = process.env[nome];
  if (valor === undefined || valor === "") return padrao;
  const n = Number(valor);
  if (Number.isNaN(n)) throw new Error(`Variável de ambiente ${nome} deveria ser numérica, recebi "${valor}"`);
  return n;
}

export const config = {
  porta: numero("PORT", 3000),
  urlPublica: obrigatoria("PUBLIC_BASE_URL").replace(/\/$/, ""),

  // Nome que o agente usa pra se apresentar. Fica aqui (e não fixo no
  // roteiro) porque tem que combinar com o GÊNERO DA VOZ escolhida no
  // provedor de TTS — voz masculina se apresentando com nome feminino é a
  // primeira coisa que denuncia que é robô. Trocou a voz, troque aqui.
  agente: {
    nome: process.env.AGENTE_NOME || "Rafael",
  },

  twilio: {
    accountSid: obrigatoria("TWILIO_ACCOUNT_SID"),
    authToken: obrigatoria("TWILIO_AUTH_TOKEN"),
    numeroOrigem: obrigatoria("TWILIO_PHONE_NUMBER"),
  },

  deepgram: {
    apiKey: obrigatoria("DEEPGRAM_API_KEY"),
    modelo: process.env.DEEPGRAM_MODEL || "nova-2",
    idioma: process.env.DEEPGRAM_LANGUAGE || "pt-BR",
  },

  llm: {
    provedor: process.env.LLM_PROVIDER || "groq",
    groq: {
      apiKey: process.env.GROQ_API_KEY || "",
      modelo: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
    },
  },

  tts: {
    // Trocável sem mexer no resto do sistema — troque TTS_PROVIDER no .env
    // e reinicie. "cartesia" (padrão, mais barato) ou "elevenlabs" (voz mais
    // elogiada, ~3-5x mais cara em volume). Deepgram Aura ainda não fala
    // português (só o Speech-to-Text deles tem PT-BR, checado em 2026).
    provedor: process.env.TTS_PROVIDER || "cartesia",
    cartesia: {
      apiKey: process.env.CARTESIA_API_KEY || "",
      modelo: process.env.CARTESIA_MODEL || "sonic-3.5",
      vozId: process.env.CARTESIA_VOICE_ID || "",
    },
    elevenlabs: {
      apiKey: process.env.ELEVENLABS_API_KEY || "",
      // Flash v2.5: modelo rápido/barato, é o recomendado pra voz em tempo
      // real (o eleven_multilingual_v2 é mais caro e mais lento).
      modelo: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
      vozId: process.env.ELEVENLABS_VOICE_ID || "",
    },
  },

  crm: {
    webhookUrl: obrigatoria("CRM_WEBHOOK_URL"),
    // Mandado como header x-api-key — o endpoint do CRM (crm-adm) recusa sem
    // isso. Mesmo valor cadastrado lá em AGENTE_VOZ_WEBHOOK_SECRET.
    webhookApiKey: process.env.CRM_WEBHOOK_API_KEY || "",
    regraDisparoWhatsapp: process.env.CRM_WHATSAPP_TRIGGER_RULE || "interessado", // "interessado" | "sempre"
    templateWhatsapp: process.env.CRM_WHATSAPP_TEMPLATE || "followup_pos_ligacao",
  },

  lote: {
    intervaloSegundos: numero("BATCH_INTERVALO_SEGUNDOS", 20),
    concorrenciaMaxima: numero("DISPARO_CONCORRENCIA_MAXIMA", 2),
  },

  custos: {
    twilioPorMinuto: process.env.CUSTO_TWILIO_POR_MINUTO
      ? Number(process.env.CUSTO_TWILIO_POR_MINUTO)
      : null, // null = "não confirmado", ver README
    deepgramPorMinuto: numero("CUSTO_DEEPGRAM_POR_MINUTO", 0.0077),
    cartesiaPorMinuto: numero("CUSTO_CARTESIA_POR_MINUTO", 0.03),
    // Flash v2.5 gasta ~0.5 crédito/caractere; plano Creator (US$11 =
    // 121.000 créditos) dá ~US$25 a cada milhão de caracteres nesse modelo.
    elevenlabsPorMilhaoCaracteres: numero("CUSTO_ELEVENLABS_POR_MILHAO_CARACTERES", 25),
    groqInputPorMilhaoTokens: numero("CUSTO_GROQ_INPUT_POR_MILHAO_TOKENS", 0.59),
    groqOutputPorMilhaoTokens: numero("CUSTO_GROQ_OUTPUT_POR_MILHAO_TOKENS", 0.79),
  },
};

/** Valida config obrigatória cedo. Chamado explicitamente no start do servidor. */
export function validarConfig() {
  if (!config.urlPublica.startsWith("https://") && !config.urlPublica.startsWith("wss://")) {
    throw new Error(
      `PUBLIC_BASE_URL deveria começar com https:// (recebi "${config.urlPublica}"). ` +
        `A Twilio exige TLS pra falar com seu servidor — use ngrok/Cloudflare Tunnel em dev.`
    );
  }
  if (!["interessado", "sempre"].includes(config.crm.regraDisparoWhatsapp)) {
    throw new Error(`CRM_WHATSAPP_TRIGGER_RULE deve ser "interessado" ou "sempre".`);
  }

  if (config.tts.provedor === "cartesia") {
    if (!config.tts.cartesia.apiKey) throw new Error("CARTESIA_API_KEY ausente no .env");
    if (!config.tts.cartesia.vozId) throw new Error("CARTESIA_VOICE_ID ausente no .env");
  } else if (config.tts.provedor === "elevenlabs") {
    if (!config.tts.elevenlabs.apiKey) throw new Error("ELEVENLABS_API_KEY ausente no .env");
    if (!config.tts.elevenlabs.vozId) throw new Error("ELEVENLABS_VOICE_ID ausente no .env");
  } else {
    throw new Error(
      `TTS_PROVIDER desconhecido: "${config.tts.provedor}". Use "cartesia" ou "elevenlabs".`
    );
  }

  return true;
}
