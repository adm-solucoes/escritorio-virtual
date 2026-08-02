-- Guarda o link do evento do Google Calendar quando o agente de voz consegue
-- criar o agendamento de verdade (lead confirmou um horário oferecido na
-- ligação, dentre os horários reais consultados na agenda do time comercial).

alter table ligacoes_agente_voz add column if not exists evento_calendario_link text;
