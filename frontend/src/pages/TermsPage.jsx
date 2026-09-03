import { Link } from "react-router-dom";
import LegalPage from "./LegalPage";

const MAIL = <a className="rp-inline" href="mailto:farjad.developer@gmail.com?subject=VerifyRuns%20terms">farjad.developer@gmail.com</a>;

const SECTIONS = [
  { title: "Who you are dealing with", paras: [<>VerifyRuns is operated by Farjad Hasan, an individual developer based in Pakistan. By creating an account you agree to these terms and to the <Link className="rp-inline" to="/privacy">privacy policy</Link>. Contact: {MAIL}.</>] },
  {
    title: "Early access",
    paras: ["VerifyRuns is in early access and currently free. Features, limits and prices can change; paid plans will be announced on the pricing page and by email before anyone is charged. The service may be paused or discontinued — if that happens, account holders get at least 30 days' notice by email and can delete their data at any time before then."],
  },
  {
    title: "What you may do with it",
    paras: ["Use VerifyRuns to verify destinations your automations write to. That means:"],
    list: [
      "Only configure destinations, credentials and alert targets you are authorised to use. Pointing VerifyRuns at a database, endpoint, webhook or inbox that isn't yours to read or message is a breach of these terms.",
      "Use read-only credentials wherever the destination supports them.",
      "Don't use the service to probe, load-test or scan systems, to send unsolicited alerts, or to circumvent its rate limits or address restrictions.",
      "Keep your webhook secret and password to yourself; you are responsible for what happens under your account.",
    ],
  },
  {
    title: "What we may do",
    paras: ["We may suspend or delete accounts that break the rules above or that put the service or other users at risk, and we may set limits on Checks, runs and history per plan. We will not read your destinations for any purpose other than producing your verdicts."],
  },
  {
    title: "No warranty",
    paras: ["VerifyRuns is provided as is, without a service-level agreement. A PASS means the destination looked right by the rules you set; it is not a guarantee that your data is correct, and a missed or late alert does not make us liable for what your automation did or did not do. To the extent the law allows, our total liability to you is limited to the amount you paid for the service in the twelve months before the claim — which, during early access, is nothing."],
  },
  {
    title: "Your data",
    paras: [<>Your destinations and their contents stay yours. What we keep, for how long, and how to delete it is set out in the <Link className="rp-inline" to="/privacy">privacy policy</Link> and <Link className="rp-inline" to="/data">What we store</Link>.</>],
  },
  {
    title: "Changes and law",
    paras: ["Changes to these terms are dated at the top of this page and material ones are emailed to account holders before they apply. These terms are governed by the laws of Pakistan."],
  },
];

export default function TermsPage() {
  return <LegalPage eyebrow="Terms" title="Terms of service." intro="What you agree to when you create an account, and what you can expect back. Written plainly because there's not much to it." updated="2026-08-29" sections={SECTIONS} />;
}
