import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { AudioLines, CheckCircle2 } from "lucide-react";
import { Button, Input } from "../components/ui/primitives";
import loginBackground from "../assets/login-workspace-ai.png";
import { resetPassword } from "../services/api";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [complete, setComplete] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!token) return setError("This password-reset link is invalid or incomplete.");
    if (password !== confirmPassword) return setError("Passwords do not match.");
    setError("");
    setLoading(true);
    try {
      await resetPassword(token, password);
      setComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reset your password.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="relative grid min-h-[100dvh] place-items-center overflow-hidden bg-slate-950 px-4 py-5 sm:p-8">
    <img src={loginBackground} alt="Professional working from home" className="absolute inset-0 h-full w-full object-cover object-[66%_center] sm:object-center" />
    <div className="absolute inset-0 bg-slate-950/80" />
    <section className="relative w-full max-w-md rounded-2xl border border-white/15 bg-white/[.96] p-5 shadow-2xl sm:p-8">
      <div className="mb-7"><div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white"><AudioLines className="h-5 w-5" /></div><p className="text-xs font-bold uppercase tracking-[.18em] text-brand">TRT Tools</p><h1 className="mt-2 text-2xl font-bold text-slate-950">Create a new password</h1></div>
      {complete ? <div className="space-y-5"><div className="rounded-lg bg-teal-50 p-4 text-sm text-teal-900"><CheckCircle2 className="mb-2 h-5 w-5 text-brand" />Your password has been reset successfully.</div><Link to="/login"><Button className="w-full">Go to sign in</Button></Link></div> : <form onSubmit={submit} className="space-y-5"><label className="block text-sm font-semibold text-slate-700">New password<Input className="mt-2 h-12 border-slate-200 bg-slate-50 text-base sm:h-11 sm:text-sm" type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label><label className="block text-sm font-semibold text-slate-700">Confirm new password<Input className="mt-2 h-12 border-slate-200 bg-slate-50 text-base sm:h-11 sm:text-sm" type="password" minLength={8} autoComplete="new-password" required value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>{error && <p className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-danger">{error}</p>}<Button className="h-12 w-full sm:h-11" type="submit" disabled={loading}>{loading ? "Resetting password..." : "Reset password"}</Button></form>}
    </section>
  </main>;
}