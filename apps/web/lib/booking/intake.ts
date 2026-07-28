// Custom intake questions attached to an appointment type, shown before a
// booking is confirmed.

export type IntakeFieldType = "short_text" | "long_text" | "email" | "phone" | "number" | "select" | "checkbox";

export type IntakeField = {
  id: string;
  label: string;
  type: IntakeFieldType;
  required: boolean;
  options?: string[]; // for "select"
};

export const INTAKE_FIELD_TYPES: { value: IntakeFieldType; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Paragraph" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
  { value: "number", label: "Number" },
  { value: "select", label: "Dropdown" },
  { value: "checkbox", label: "Checkbox" }
];

const VALID_TYPES = new Set<IntakeFieldType>(INTAKE_FIELD_TYPES.map((t) => t.value));

// Coerce arbitrary stored/submitted JSON into a clean IntakeField[].
export function normalizeIntakeFields(raw: unknown): IntakeField[] {
  if (!Array.isArray(raw)) return [];
  const out: IntakeField[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const label = typeof r.label === "string" ? r.label.trim().slice(0, 200) : "";
    const type = (typeof r.type === "string" && VALID_TYPES.has(r.type as IntakeFieldType) ? r.type : "short_text") as IntakeFieldType;
    if (!label) continue;
    const id = typeof r.id === "string" && r.id ? r.id.slice(0, 40) : `f${out.length + 1}`;
    const options = Array.isArray(r.options)
      ? r.options.map((o) => String(o).trim()).filter(Boolean).slice(0, 25)
      : undefined;
    out.push({
      id,
      label,
      type,
      required: Boolean(r.required),
      ...(type === "select" && options && options.length ? { options } : {})
    });
    if (out.length >= 25) break;
  }
  return out;
}

export type IntakeResponse = { label: string; value: string };

// Read submitted answers (form fields named `intake_<id>`) against the type's
// field definitions. Returns { responses, error } — error is a user-facing
// message when a required field is missing.
export function collectIntakeResponses(
  fields: IntakeField[],
  get: (name: string) => string | null
): { responses: IntakeResponse[]; error?: string } {
  const responses: IntakeResponse[] = [];
  for (const field of fields) {
    const raw = (get(`intake_${field.id}`) ?? "").trim();
    if (field.type === "checkbox") {
      const checked = raw === "on" || raw === "true" || raw === "yes";
      if (field.required && !checked) return { responses, error: `Please check “${field.label}”.` };
      responses.push({ label: field.label, value: checked ? "Yes" : "No" });
      continue;
    }
    if (field.required && !raw) return { responses, error: `Please fill in “${field.label}”.` };
    if (raw) responses.push({ label: field.label, value: raw.slice(0, 2000) });
  }
  return { responses };
}
