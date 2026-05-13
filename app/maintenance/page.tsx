export default function MaintenancePage() {
  return (
    <main className="min-h-screen bg-[#07111f] text-white">
      <div className="flex min-h-screen items-center justify-center px-6 py-16">
        <section className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/[0.06] p-8 text-center shadow-2xl shadow-black/30 backdrop-blur">
          <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-500/15 text-lg font-bold text-blue-200 ring-1 ring-blue-300/20">
            CB
          </div>

          <p className="mb-3 text-sm font-semibold uppercase tracking-[0.24em] text-blue-200/80">
            CrewBids
          </p>

          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            CrewBids is temporarily down for maintenance.
          </h1>

          <p className="mt-5 text-base leading-7 text-slate-300">
            We're retooling CrewBids for the new bid package format and
            expect to be back online within the next 24-48 hours.
          </p>
        </section>
      </div>
    </main>
  );
}
