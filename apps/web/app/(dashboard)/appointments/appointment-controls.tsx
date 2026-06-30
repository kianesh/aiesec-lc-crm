"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Check, Copy } from "lucide-react";
import { cancelAppointment } from "./actions";

function CancelSubmit() {
  const { pending } = useFormStatus();
  return (
    <button className="button ghost danger" type="submit" style={{ fontSize: 11 }} disabled={pending}>
      {pending ? "Cancelling…" : "Cancel"}
    </button>
  );
}

export function CancelAppointmentButton({ id }: { id: string }) {
  return (
    <form
      action={cancelAppointment.bind(null, id)}
      style={{ display: "inline" }}
      onSubmit={(e) => {
        if (!confirm("Cancel this appointment? The guest's calendar invite will be removed.")) e.preventDefault();
      }}
    >
      <CancelSubmit />
    </form>
  );
}

export function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="button ghost"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard unavailable */
        }
      }}
    >
      {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copied" : "Copy link"}
    </button>
  );
}
