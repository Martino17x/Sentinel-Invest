import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { authApi, setAccessToken, type User } from "@/lib/api";

interface AuthContextValue {
  user: User | null;
  loading: boolean; // true mientras restauramos la sesión al cargar la app
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, fullName?: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Al cargar la app: intentar restaurar la sesión con la cookie (si existe)
  useEffect(() => {
    (async () => {
      try {
        const { user, accessToken } = await authApi.me();
        if (accessToken) {
          // El server rotó tokens al restaurar la sesión con la cookie
          setAccessToken(accessToken);
        }
        setUser(user);
      } catch {
        // Sin sesión (o expirada y no recuperable) → quedamos deslogueados
        setUser(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    // flushSync: actualiza el estado de forma SÍNCRONA antes de que la
    // navegación (navigate("/dashboard")) lea `user`. Sin esto, hay un
    // race condition: el router monta ProtectedLayout con user=null
    // (estado viejo) y redirige de vuelta al login.
    flushSync(() => setUser(data.user));
  }, []);

  const register = useCallback(async (email: string, password: string, fullName?: string) => {
    const data = await authApi.register(email, password, fullName);
    flushSync(() => setUser(data.user));
  }, []);

  const logout = useCallback(async () => {
    await authApi.logout();
    setAccessToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
