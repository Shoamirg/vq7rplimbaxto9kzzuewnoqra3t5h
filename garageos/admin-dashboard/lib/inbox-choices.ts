import type { ConvPriority, ConvType } from "./api/types";

export const CHOICE_KINDS = ["customer", "vehicle", "appointment", "case", "invoice", "assignee"] as const;
export type ChoiceKind = typeof CHOICE_KINDS[number];
export type ConversationChoice = { id: string; label: string; customer_id?: string | null; vehicle_id?: string | null; role?: string };
export type SelectedChoices = Partial<Record<ChoiceKind, ConversationChoice>>;
export type ChoicePage = { kind: ChoiceKind; items: ConversationChoice[]; total: number; limit: number; offset: number; has_more: boolean };
export const CHOICE_FIELDS = { customer: "customer_id", vehicle: "vehicle_id", appointment: "appointment_id",
  case: "case_id", invoice: "invoice_id", assignee: "assigned_user_id" } as const;
export function choiceQuery(kind: ChoiceKind, selected: SelectedChoices, search: string, offset: number) {
  const query = new URLSearchParams({ kind, limit: "50", offset: String(offset) });
  if (search) query.set("q", search);
  // Replacing one field validates all remaining selected context, without
  // restricting the replacement to the old value of that same field.
  for (const other of CHOICE_KINDS) if (other !== kind && selected[other]) query.set(CHOICE_FIELDS[other], selected[other]!.id);
  return query;
}
export function creationPayload(subject: string, type: ConvType, priority: ConvPriority, selected: SelectedChoices) {
  return { subject: subject || null, conv_type: type, priority,
    ...Object.fromEntries(CHOICE_KINDS.map(kind => [CHOICE_FIELDS[kind], selected[kind]?.id ?? null])) };
}
