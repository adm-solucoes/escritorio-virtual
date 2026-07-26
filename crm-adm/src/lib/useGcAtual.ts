"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { Gc } from "@/lib/types";

export function useGcAtual() {
  const [gc, setGc] = useState<Gc | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let cancelado = false;
    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelado || !data.user?.email) {
        if (!cancelado) setCarregando(false);
        return;
      }
      const { data: gcData } = await supabase.from("gcs").select("*").eq("email", data.user.email).maybeSingle();
      if (cancelado) return;
      setGc((gcData as Gc) ?? null);
      setCarregando(false);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  return { gc, carregando };
}
