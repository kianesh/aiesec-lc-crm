"use client";

import { useFormStatus } from "react-dom";
import { cancelBooking } from "./actions";

function CancelSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="book-cancel" disabled={pending}>
      {pending ? "Cancelling…" : "Cancel this booking"}
    </button>
  );
}

export function CancelButton({ token }: { token: string }) {
  return (
    <form
      action={cancelBooking.bind(null, token)}
      onSubmit={(e) => {
        if (!confirm("Cancel this appointment? This will also remove the calendar invite.")) {
          e.preventDefault();
        }
      }}
    >
      <CancelSubmit />
    </form>
  );
}
