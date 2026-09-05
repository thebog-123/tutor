"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui";

/**
 * The referrer's code plus a share link. The link is built on the client so
 * it carries whatever origin the portal is actually being served from.
 */
export function ReferralCode({ code }: { code: string }) {
  const [shareUrl, setShareUrl] = useState("");
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  useEffect(() => {
    setShareUrl(`${window.location.origin}/?ref=${code}#enquire`);
  }, [code]);

  async function copy(value: string, which: "code" | "link") {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(which);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      // Clipboard access can be blocked; the value is on screen to copy by hand.
      setCopied(null);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <p className="field-label">Your referral code</p>
        <p className="mt-1.5 font-mono text-3xl font-semibold tracking-[0.15em] text-ink-900">
          {code}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => copy(code, "code")}>
          {copied === "code" ? "Copied" : "Copy code"}
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!shareUrl}
          onClick={() => copy(shareUrl, "link")}
        >
          {copied === "link" ? "Copied" : "Copy share link"}
        </Button>
      </div>
    </div>
  );
}
