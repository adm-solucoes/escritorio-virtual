-- Adiciona motivo de perda às oportunidades (Fase 2 — alta prioridade)
alter table oportunidades add column if not exists motivo_perda text;
