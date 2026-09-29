import { useState } from "react";
import { AudioLines, ChevronLeft, LockKeyhole, ShieldCheck } from "lucide-react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { Button, Input } from "../components/ui/primitives";
import loginBackground from "../assets/login-workspace-ai.png";
import { currentUser, login, platformHome, requestPasswordReset } from "../services/api";

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [forgotMode, setForgotMode] = useState(false);
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

  async function requestReset(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);
    try {
      const result = await requestPasswordReset(email);
      setMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to request a password reset.");
    } finally {
      setLoading(false);
    }
  }

  function showLogin() {
    setForgotMode(false);
    setError("");
    setMessage("");
  }

  return (
    <main className="relative min-h-[100dvh] overflow-x-hidden bg-slate-950 px-4 py-5 sm:px-8 sm:py-8 lg:p-10">
      <img src={loginBackground} alt="Professional working from home" className="absolute inset-0 h-full w-full object-cover object-[66%_center] sm:object-center" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,16,37,.78)_0%,rgba(3,21,48,.9)_45%,rgba(2,16,37,.97)_100%)] sm:bg-[linear-gradient(90deg,rgba(2,16,37,.96)_0%,rgba(3,21,48,.87)_43%,rgba(3,20,45,.32)_100%)]" />
      <div className="relative mx-auto flex min-h-[calc(100dvh-2.5rem)] max-w-7xl items-center sm:min-h-[calc(100dvh-4rem)] lg:min-h-[calc(100dvh-5rem)]">
        <section className="w-full max-w-md rounded-2xl border border-white/15 bg-white/[.96] p-5 shadow-2xl shadow-slate-950/30 backdrop-blur sm:p-8">
          <div className="mb-6 sm:mb-8">
            <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white shadow-lg shadow-teal-800/25"><AudioLines className="h-5 w-5" /></div>
            <p className="text-xs font-bold uppercase tracking-[.18em] text-brand">Trimurya Corporation</p>
            <h1 className="mt-2 text-xl font-bold tracking-tight text-slate-950 sm:text-2xl">{forgotMode ? "Reset your password" : "Welcome back"}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">{forgotMode ? "Enter your work email and we will send a secure reset link." : "Sign in to access your secure recording workspace."}</p>
          </div>
          {forgotMode ? (
            <form onSubmit={requestReset} className="space-y-4 sm:space-y-5">
              <label className="block text-sm font-semibold text-slate-700">Work email<Input className="mt-2 h-12 border-slate-200 bg-slate-50 px-3.5 text-base focus:bg-white sm:h-11 sm:text-sm" type="email" autoComplete="email" placeholder="name@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              {error && <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</p>}
              {message && <p className="rounded-lg border border-teal-100 bg-teal-50 p-3 text-sm text-teal-800">{message}</p>}
              <Button className="h-12 w-full rounded-lg shadow-lg shadow-teal-800/20 sm:h-11" type="submit" disabled={loading}>{loading ? "Sending link..." : "Send reset link"}</Button>
              <button type="button" onClick={showLogin} className="flex w-full items-center justify-center gap-2 text-sm font-semibold text-brand transition hover:text-teal-800"><ChevronLeft className="h-4 w-4" /> Back to sign in</button>
            </form>
          ) : (
            <form onSubmit={submit} className="space-y-4 sm:space-y-5">
              <label className="block text-sm font-semibold text-slate-700">Work email<Input className="mt-2 h-12 border-slate-200 bg-slate-50 px-3.5 text-base focus:bg-white sm:h-11 sm:text-sm" type="email" autoComplete="email" placeholder="name@company.com" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
              <label className="block text-sm font-semibold text-slate-700">Password<Input className="mt-2 h-12 border-slate-200 bg-slate-50 px-3.5 text-base focus:bg-white sm:h-11 sm:text-sm" type="password" autoComplete="current-password" placeholder="Enter your password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              {error && <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</p>}
              <Button className="h-12 w-full rounded-lg shadow-lg shadow-teal-800/20 sm:h-11" type="submit" disabled={loading}>{loading ? "Signing you in..." : "Sign in securely"}</Button>
              <button type="button" onClick={() => { setForgotMode(true); setError(""); }} className="w-full text-center text-sm font-semibold text-brand transition hover:text-teal-800">Forgot password?</button>
            </form>
          )}
          <div className="mt-7 flex items-center gap-3 border-t border-slate-100 pt-5 text-xs leading-5 text-slate-500"><ShieldCheck className="h-5 w-5 shrink-0 text-brand" /><span>Your access is protected with enterprise-grade security.</span></div>
        </section>
        <div className="pointer-events-none absolute bottom-0 left-0 hidden items-center gap-2 text-sm text-slate-200 lg:flex"><LockKeyhole className="h-4 w-4 text-teal-300" /> Secure recording operations</div>
      </div>
    </main>
  );
}