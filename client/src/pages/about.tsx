import { Link } from "wouter";
import { ArrowRight, Braces, ClipboardCheck, Gauge, ShieldCheck } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PublicSiteHeader } from "@/components/legal/public-site-header";
import LegalFooter from "@/components/legal/legal-footer";

const steps = [
  { number: "01", title: "Describe", text: "State the engineering problem, known values, constraints, and the result you need." },
  { number: "02", title: "Review", text: "Inspect the proposed method, assumptions, equations, references, and units before proceeding." },
  { number: "03", title: "Calculate", text: "Genius X1 evaluates numerical expressions and unit relationships in a structured worksheet." },
  { number: "04", title: "Verify", text: "A qualified engineer checks every input, result, source, load case, safety factor, and applicable code." },
];

export default function About() {
  const { isAuthenticated } = useAuth();

  return (
    <div className="min-h-[calc(100vh-80px)] bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
      <PublicSiteHeader />
      <main>
        <section className="border-b border-slate-200 dark:border-slate-800">
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-28">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">About Genius X1</p>
            <h1 className="mt-5 max-w-4xl text-5xl font-bold tracking-[-0.04em] sm:text-6xl">A clearer path from engineering question to reviewable calculation.</h1>
            <p className="mt-7 max-w-3xl text-lg leading-8 text-slate-600 dark:text-slate-300">Genius X1 is an AI-assisted engineering calculation workspace operated by DeepFolder. It organizes the calculation process so engineers can see—and challenge—the assumptions, equations, arithmetic, units, references, and revisions behind a result.</p>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8">
          <div className="grid gap-12 lg:grid-cols-[0.75fr_1.25fr]">
            <div>
              <h2 className="text-3xl font-bold tracking-tight">How it works</h2>
              <p className="mt-4 leading-7 text-slate-600 dark:text-slate-300">The software helps structure engineering work. It does not authorize, certify, stamp, or approve a design.</p>
            </div>
            <div className="grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-2">
              {steps.map((step) => (
                <article key={step.number} className="bg-white p-7 dark:bg-slate-950">
                  <p className="font-mono text-sm font-semibold text-blue-600 dark:text-blue-400">{step.number}</p>
                  <h3 className="mt-4 text-xl font-semibold">{step.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{step.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-y border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/40">
          <div className="mx-auto grid max-w-7xl gap-5 px-5 py-16 sm:px-8 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: Braces, title: "Visible equations", text: "Review formulas and substitutions instead of receiving only an answer." },
              { icon: Gauge, title: "Unit-aware", text: "Inspect values and dimensions throughout the calculation workflow." },
              { icon: ClipboardCheck, title: "Editable record", text: "Change inputs, recalculate, save, and revisit calculation versions." },
              { icon: ShieldCheck, title: "Human responsibility", text: "Final technical judgment and compliance remain with the user." },
            ].map(({ icon: Icon, title, text }) => (
              <article key={title} className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-950">
                <Icon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <h3 className="mt-4 font-semibold">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">{text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-4xl px-5 py-20 text-center sm:px-8 sm:py-24">
          <h2 className="text-3xl font-bold tracking-tight">Make the reasoning easier to review.</h2>
          <p className="mx-auto mt-4 max-w-2xl leading-7 text-slate-600 dark:text-slate-300">Use Genius X1 as one input to a documented engineering process—not as the final authority.</p>
          <Link href={isAuthenticated ? "/workspace" : "/auth"} className="mt-8 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-blue-700">
            {isAuthenticated ? "Open workspace" : "Sign in"} <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
