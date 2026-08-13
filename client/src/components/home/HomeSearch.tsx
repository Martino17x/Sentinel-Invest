import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Búsqueda global de activos: navega a /quotes?q=<símbolo>
 * (la página de cotizaciones inicializa su buscador con ese parámetro).
 */
export function HomeSearch() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    navigate(`/quotes?q=${encodeURIComponent(q.toUpperCase())}`);
  }

  return (
    <form onSubmit={handleSubmit} className="relative">
      <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        className="pl-9"
        placeholder="Buscar por nombre o símbolo"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar activos"
      />
    </form>
  );
}
