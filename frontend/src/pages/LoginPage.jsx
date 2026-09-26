import { useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Card, Input } from "../components/ui/primitives";
import { currentUser, login, platformHome } from "../services/api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const authenticatedUser = currentUser();

  if (authenticatedUser) return <Navigate to={platformHome(authenticatedUser)} replace />;

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await login(email, password);
      const returnTo = searchParams.get("returnTo");
      navigate(returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : platformHome(result.user), { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-4">
      <Card className="w-full max-w-md" title="Welcome back">
        <form onSubmit={submit} className="space-y-4">
          <div>
            <p className="text-sm font-bold text-brand">Trimurya Corporation Pvt. Ltd.</p>
            <p className="text-sm text-muted">Script Recording Platform</p>
          </div>
          <label className="block text-sm font-medium">
            Email
            <Input className="mt-1" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
          </label>
          <label className="block text-sm font-medium">
            Password
            <Input className="mt-1" type="password" autoComplete="current-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-danger">{error}</p>}
          <Button className="w-full" type="submit" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </Button>
          <div className="text-sm font-semibold text-brand">
            <button type="button">Forgot Password</button>
          </div>
        </form>
      </Card>
    </main>
  );
}
