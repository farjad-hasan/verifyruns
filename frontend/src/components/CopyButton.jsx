import { useState } from "react";
import { Check, Copy } from "lucide-react";

export default function CopyButton({ text, label = "Copy", testid = "copy-btn" }) {
  const [copied, setCopied] = useState(false);
  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore clipboard errors */
    }
  };
  return (
    <button
      onClick={onClick}
      data-testid={testid}
      className="rp-btn-ghost rp-btn-xs"
      type="button"
    >
      {copied ? <Check size={13} className="text-emerald-400" /> : <Copy size={13} />}
      {copied ? "Copied" : label}
    </button>
  );
}
