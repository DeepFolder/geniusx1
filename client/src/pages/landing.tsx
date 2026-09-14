import { Link } from "wouter";
import { ArrowRight, BookOpenCheck, Calculator, Sparkles } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { PublicSiteHeader } from "@/components/legal/public-site-header";
import LegalFooter from "@/components/legal/legal-footer";
import { WorkspacePreview } from "@/components/marketing/workspace-preview";
import { EmptyHero } from "@/features/genius/EmptyHero";

const features = [
  {
    icon: Sparkles,
    title: "From question to method",
    description: "Describe the engineering problem in plain language and review the proposed assumptions, inputs, and equations before building.",
  },
  {
    icon: Calculator,
    title: "Transparent arithmetic",
    description: "Numerical work is evaluated on the server with visible substitutions, units, intermediate steps, and editable inputs.",
  },
  {
    icon: BookOpenCheck,
    title: "Traceable work",
    description: "Keep references, calculation versions, comments, attachments, and recalculation history together in one worksheet.",
  },
];

export default function LandingPage() {
  const { isAuthenticated } = useAuth();
  const workspaceHref = isAuthenticated ? "/workspace" : "/auth";

  return (
    <div className="min-h-[calc(100vh-80px)] bg-white text-slate-950 dark:bg-slate-950 dark:text-white">
      <PublicSiteHeader />
      <main>
        <section className="relative overflow-hidden border-b border-slate-200 dark:border-slate-800">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_8%,rgba(37,99,235,0.13),transparent_28%)]" />
          <div className="relative mx-auto max-w-7xl px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20">
            <div className="mx-auto max-w-3xl text-center">
              <EmptyHero isGenerating={false} />
              <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
                <Link href={workspaceHref} className="inline-flex items-center justify-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/20 transition hover:bg-blue-700">
                  {isAuthenticated ? "Open workspace" : "Start calculating"} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link href="/about" className="inline-flex items-center justify-center rounded-full border border-slate-300 px-6 py-3.5 text-sm font-semibold text-slate-700 transition hover:border-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900">
                  How Genius X1 works
                </Link>
              </div>
            </div>

            <div className="relative mt-12 sm:mt-16">
              <WorkspacePreview />
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">A reviewable workflow</p>
            <h2 className="mt-4 text-3xl font-bold tracking-tight sm:text-4xl">More than a final number.</h2>
            <p className="mt-4 text-lg leading-8 text-slate-600 dark:text-slate-300">See how the result was formed, change the variables, and keep the engineering trail with the work.</p>
          </div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {features.map(({ icon: Icon, title, description }) => (
              <article key={title} className="rounded-2xl border border-slate-200 p-6 dark:border-slate-800 dark:bg-slate-900/30">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300"><Icon className="h-5 w-5" /></div>
                <h3 className="mt-5 text-lg font-semibold">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-slate-600 dark:text-slate-300">{description}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-5 py-20 text-center sm:px-8 sm:py-24">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Start with the engineering question.</h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-600 dark:text-slate-300">Turn it into a calculation you can review, refine, recalculate, and save.</p>
          <Link href={workspaceHref} className="mt-8 inline-flex items-center gap-2 rounded-full bg-blue-600 px-6 py-3.5 text-sm font-semibold text-white hover:bg-blue-700">
            {isAuthenticated ? "Open workspace" : "Sign in to Genius X1"} <ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <LegalFooter />
    </div>
  );
}
