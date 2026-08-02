-- A Instagram Graph API devolve a foto de perfil de quem manda mensagem
-- (campo profile_pic), diferente do WhatsApp Business API que não expõe foto
-- de contato de jeito nenhum (limitação da própria Meta). Guarda a URL aqui
-- pra mostrar no avatar em vez de sempre cair nas iniciais.
alter table instagram_conversas add column if not exists foto_perfil_url text;
