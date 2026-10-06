import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL } from "@/lib/legal";

// Simple readable layout for legal documents.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← {LEGAL.serviceName}
        </Link>
        <h1 className="mt-4 text-2xl font-bold sm:text-3xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Редакция от {LEGAL.updatedAt}</p>
        <div className="legal-text mt-8 space-y-4 text-[15px] leading-relaxed [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1">
          {children}
        </div>
      </div>
    </main>
  );
}
