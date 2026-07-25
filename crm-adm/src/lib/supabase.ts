import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Sessão persiste por 30 dias por padrão (o login tem a opção "manter
// conectado" que ajusta isso quando desmarcada).
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookieOptions: { maxAge: 60 * 60 * 24 * 30 },
});
