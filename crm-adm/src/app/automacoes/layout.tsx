import ListaAutomacoesSidebar from "@/components/automacoes/ListaAutomacoesSidebar";

export default function AutomacoesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex-1 flex min-h-0">
      <ListaAutomacoesSidebar />
      <div className="flex-1 min-w-0 flex flex-col">{children}</div>
    </div>
  );
}
