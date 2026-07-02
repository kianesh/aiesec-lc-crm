"use client";

import { useRef } from "react";
import { Upload } from "lucide-react";
import { importContacts } from "./actions";

export function ImportContactsButton() {
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form action={importContacts} ref={formRef}>
      <input
        ref={inputRef}
        type="file"
        name="file"
        accept=".csv,text/csv"
        hidden
        onChange={() => formRef.current?.requestSubmit()}
      />
      <button type="button" className="button secondary" onClick={() => inputRef.current?.click()}>
        <Upload size={13} /> Import CSV
      </button>
    </form>
  );
}
