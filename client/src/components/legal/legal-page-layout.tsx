import type { ReactNode } from "react";
import { Link } from "wouter";
import { ArrowLeft } from "lucide-react";
import { PublicSiteHeader } from "./public-site-header";
import LegalFooter from "./legal-footer";

interface Props {
  eyebrow: string;
  title: string;
  summary: string;
  updated?: string;
  children: ReactNode;
}

export function LegalPageLayout({ eyebrow, title, summary, updated = "14 September 2026", children }: Props) {
  return (
    <div className="min-h-[calc(100vh-80px)] bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <PublicSiteHeader />
      <main>
        <section className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
          <div className="mx-auto max-w-4xl px-5 py-14 sm:px-8 sm:py-20">
            <Link href="/" className="mb-8 inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400">
              <ArrowLeft className="h-4 w-4" /> Back to Genius X1
            </Link>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">{eyebrow}</p>
            <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-slate-600 dark:text-slate-300">{summary}</p>
            <p className="mt-6 text-sm text-slate-400">Last updated {updated}</p>
          </div>
        </section>
        <article className="mx-auto max-w-4xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="space-y-10 text-[15px] leading-7 text-slate-700 dark:text-slate-300 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:underline-offset-4 hover:[&_a]:underline dark:[&_a]:text-blue-400 [&_h2]:mb-4 [&_h2]:text-2xl [&_h2]:font-semibold [&_h2]:tracking-tight [&_h2]:text-slate-950 dark:[&_h2]:text-white [&_h3]:mb-2 [&_h3]:mt-5 [&_h3]:text-lg [&_h3]:font-semibold [&_h3]:text-slate-900 dark:[&_h3]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_ul]:space-y-2">
            {children}
          </div>
        </article>
      </main>
      <LegalFooter />
    </div>
  );
}
