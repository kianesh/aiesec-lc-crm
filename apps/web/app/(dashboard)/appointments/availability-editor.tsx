"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Plus, Trash2 } from "lucide-react";
import { saveAvailability } from "./actions";

type Rule = { weekday: number; startTime: string; endTime: string };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? "Saving…" : "Save availability"}
    </button>
  );
}

export function AvailabilityEditor({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState<Rule[]>(
    initialRules.length > 0 ? initialRules : [{ weekday: 1, startTime: "14:00", endTime: "17:00" }]
  );

  function update(i: number, patch: Partial<Rule>) {
    setRules((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function remove(i: number) {
    setRules((rs) => rs.filter((_, idx) => idx !== i));
  }
  function add() {
    setRules((rs) => [...rs, { weekday: 1, startTime: "09:00", endTime: "12:00" }]);
  }

  return (
    <form action={saveAvailability} className="availability-editor">
      <input type="hidden" name="rules" value={JSON.stringify(rules)} />
      <div className="availability-rows">
        {rules.map((r, i) => (
          <div className="availability-row" key={i}>
            <select value={r.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}>
              {WEEKDAYS.map((d, idx) => (
                <option key={idx} value={idx}>
                  {d}
                </option>
              ))}
            </select>
            <input type="time" value={r.startTime} onChange={(e) => update(i, { startTime: e.target.value })} />
            <span className="availability-dash">–</span>
            <input type="time" value={r.endTime} onChange={(e) => update(i, { endTime: e.target.value })} />
            <button type="button" className="icon-button" aria-label="Remove" onClick={() => remove(i)}>
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
      <div className="availability-actions">
        <button type="button" className="button ghost" onClick={add}>
          <Plus size={15} /> Add window
        </button>
        <SaveButton />
      </div>
    </form>
  );
}
