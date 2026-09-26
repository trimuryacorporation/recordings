import { ArrowRight, CheckCircle2, Lock, Mic, Radio, ShieldCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/ui/primitives";

const features = [
  "Single Recording",
  "Dual Recording",
  "Two-Track Sessions",
  "Script Management",
  "Vendor Management",
  "QA Management",
  "Analytics",
  "Enterprise Security"
];

export function LandingPage() {
  return (
    <main className="min-h-screen bg-white">
      <section className="relative overflow-hidden border-b border-line bg-slate-950 text-white">
        <div className="absolute inset-0 opacity-25" style={{ backgroundImage: "linear-gradient(135deg,#0f766e,#2563eb 55%,#101828)" }} />
        <div className="relative mx-auto grid min-h-[88vh] max-w-7xl content-center gap-10 px-6 py-20 lg:grid-cols-[1fr_420px] lg:px-8">
          <div>
            <p className="text-sm font-semibold text-teal-200">Trimurya Corporation Pvt. Ltd.</p>
            <h1 className="mt-5 max-w-4xl text-4xl font-bold leading-tight md:text-6xl">
              Enterprise Script Recording & Data Collection Platform
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-200">
              Manage single and dual-participant recording projects with secure workflows, synchronized sessions, scalable QA, and
              enterprise-grade operational controls.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link to="/login">
                <Button>
                  Get Started <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link to="/login">
                <Button variant="secondary">Login</Button>
              </Link>
            </div>
          </div>
          <div className="rounded-lg border border-white/15 bg-white/10 p-5 shadow-soft backdrop-blur">
            <div className="grid gap-3">
              {[Mic, Radio, ShieldCheck, Lock].map((Icon, index) => (
                <div key={features[index]} className="flex items-center gap-3 rounded-md border border-white/10 bg-white/10 p-4">
                  <Icon className="h-5 w-5 text-teal-200" />
                  <div>
                    <p className="font-semibold">{features[index]}</p>
                    <p className="text-sm text-slate-300">Operational workflow ready for production teams.</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="mx-auto max-w-7xl px-6 py-14 lg:px-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <div key={feature} className="flex items-center gap-2 rounded-lg border border-line p-4">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <span className="text-sm font-semibold">{feature}</span>
            </div>
          ))}
        </div>
      </section>
      <footer className="border-t border-line px-6 py-6 text-sm text-muted">Trimurya Corporation Pvt. Ltd. | Script Recording Platform</footer>
    </main>
  );
}
