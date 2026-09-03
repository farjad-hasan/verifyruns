import Nav from "../components/Nav";
import Footer from "../components/Footer";
import useTitle from "../lib/useTitle";

/** Shared shell for /terms and /privacy. `sections` is [{title, paras: [string | JSX]}]. */
export default function LegalPage({ eyebrow, title, intro, updated, sections }) {
  useTitle(title.replace(/\.$/, "")); // the H1 keeps its full stop; the tab does not
  return (
    <div className="rp-page">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">{eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">{title}</h1>
        <p className="text-zinc-400 text-lg leading-relaxed max-w-[65ch]">{intro}</p>
        <p className="text-sm text-quiet mt-3 font-mono">Last updated {updated}</p>
        <div className="mt-12 space-y-8">
          {sections.map((s) => (
            <div key={s.title}>
              <h2 className="font-display text-xl mb-2">{s.title}</h2>
              {s.paras.map((p, i) => (
                <p key={i} className="text-zinc-400 leading-relaxed mb-2 max-w-[65ch]">{p}</p>
              ))}
              {s.list && (
                <ul className="list-disc pl-5 text-zinc-400 leading-relaxed space-y-1 max-w-[65ch]">
                  {s.list.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
      </div>
      <Footer />
    </div>
  );
}
