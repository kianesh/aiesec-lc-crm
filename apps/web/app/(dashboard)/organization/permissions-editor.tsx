"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Lock } from "lucide-react";
import { savePermissionMatrix } from "./actions";
import {
  CAPABILITIES,
  POSITION_LABELS,
  type Capability,
  type PermissionMatrix,
  type Position
} from "../../../lib/permissions";

// LCP always keeps full access; only these positions are customizable.
const EDITABLE: Position[] = ["lcvp", "team_leader", "member"];

function SaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="button primary" disabled={pending}>
      {pending ? "Saving…" : "Save permissions"}
    </button>
  );
}

export function PermissionsEditor({ initialMatrix }: { initialMatrix: PermissionMatrix }) {
  const [matrix, setMatrix] = useState<PermissionMatrix>(initialMatrix);

  function toggle(pos: Position, cap: Capability) {
    setMatrix((m) => {
      const has = m[pos].includes(cap);
      return { ...m, [pos]: has ? m[pos].filter((c) => c !== cap) : [...m[pos], cap] };
    });
  }

  return (
    <form action={savePermissionMatrix} className="permissions-editor">
      <input type="hidden" name="matrix" value={JSON.stringify({
        lcvp: matrix.lcvp, team_leader: matrix.team_leader, member: matrix.member
      })} />
      <div className="permissions-scroll">
        <table className="permissions-table">
          <thead>
            <tr>
              <th className="permissions-cap-col">Capability</th>
              <th className="permissions-lcp-col">
                {POSITION_LABELS.lcp} <Lock size={11} />
              </th>
              {EDITABLE.map((pos) => (
                <th key={pos}>{POSITION_LABELS[pos]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CAPABILITIES.map((cap) => (
              <tr key={cap.key}>
                <td className="permissions-cap-col">
                  <strong>{cap.label}</strong>
                  <small className="muted-note">{cap.description}</small>
                </td>
                <td className="permissions-lcp-col">
                  <input type="checkbox" checked readOnly disabled aria-label={`LCP ${cap.label}`} />
                </td>
                {EDITABLE.map((pos) => (
                  <td key={pos}>
                    <input
                      type="checkbox"
                      checked={matrix[pos].includes(cap.key)}
                      onChange={() => toggle(pos, cap.key)}
                      aria-label={`${POSITION_LABELS[pos]} ${cap.label}`}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="permissions-actions">
        <p className="muted-note">LCP and the workspace owner always keep full access.</p>
        <SaveButton />
      </div>
    </form>
  );
}
