import { ArrowRight } from "lucide-react";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center px-6 py-16">
        <div className="max-w-2xl">
          <p className="text-sm font-medium uppercase tracking-wide text-primary">
            Phase 0 Scaffold
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            AIESEC LC CRM
          </h1>
          <p className="mt-5 text-lg leading-8 text-slate-600">
            Deployable empty app for the internal Local Committee CRM and operations platform.
          </p>
          <div className="mt-8 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Ready for Phase 1
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </div>
        </div>
      </section>
    </main>
  );
}
