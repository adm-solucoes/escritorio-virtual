"use client";

import { use, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function OportunidadeRedirectPage({ params }: { params: Promise<{ oportunidade_id: string }> }) {
  const { oportunidade_id } = use(params);
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    supabase
      .from("oportunidades")
      .select("empresa_id")
      .eq("id", oportunidade_id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelado) return;
        if (data?.empresa_id) {
          router.replace(`/empresas/${data.empresa_id}?oportunidade=${oportunidade_id}`);
        } else {
          router.replace("/pipeline");
        }
      });
    return () => {
      cancelado = true;
    };
  }, [oportunidade_id, router]);

  return <p className="p-6 text-sm text-navy/50">Redirecionando...</p>;
}
