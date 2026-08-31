import { Link } from "react-router-dom";
import Nav from "../components/Nav";
import useTitle from "../lib/useTitle";

/** Shared shell for /terms and /privacy. `sections` is [{title, paras: [string | JSX]}]. */
export default function LegalPage({ eyebrow, title, intro, updated, sections }) {
  useTitle(title);
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="max-w-3xl mx-auto px-6 lg:px-10 pt-16 pb-24">
        <p className="text-xs uppercase tracking-widest text-emerald-400 mb-3">{eyebrow}</p>
        <h1 className="font-display text-4xl sm:text-5xl font-semibold tracking-tight mb-4">{title}</h1>
        <p className="text-zinc-400 text-lg leading-relaxed">{intro}</p>
        <p className="text-sm text-quiet mt-3 font-mono">Last updated {updated}</p>
        <div className="mt-12 space-y-8">
          {sections.map((s) => (
            <div key={s.title}>
              <p className="font-display text-xl mb-2">{s.title}</p>
              {s.paras.map((p, i) => (
                <p key={i} className="text-zinc-400 leading-relaxed mb-2">{p}</p>
              ))}
              {s.list && (
                <ul className="list-disc pl-5 text-zinc-400 leading-relaxed space-y-1">
                  {s.list.map((l, i) => <li key={i}>{l}</li>)}
                </ul>
              )}
            </div>
          ))}
        </div>
        <p className="text-sm text-quiet mt-12">
          <Link to="/privacy" className="underline underline-offset-4 hover:text-zinc-300">Privacy</Link> · <Link to="/terms" className="underline underline-offset-4 hover:text-zinc-300">Terms</Link> · <Link to="/data" className="underline underline-offset-4 hover:text-zinc-300">What we store</Link> · <Link to="/security" className="underline underline-offset-4 hover:text-zinc-300">Security</Link>
        </p>
      </div>
    </div>
  );
}
