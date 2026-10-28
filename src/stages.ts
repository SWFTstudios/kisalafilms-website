/**
 * The build timeline, in order. The portal draws it from this list, the admin
 * moves a job along it, and every stage change emails the customer with the
 * `customer` line. `cancelled` sits outside the order on purpose.
 */
export const STAGES = [
  { id: "inquiry", label: "Inquiry received", customer: "Your build is in. Expect a written quote off your photos." },
  { id: "quoted", label: "Quote ready", customer: "Your quote is ready to review and approve in your portal." },
  { id: "booked", label: "Booked", customer: "Your deposit is in and your studio date is held." },
  { id: "checked_in", label: "Bike checked in", customer: "Your bike is at the studio and has been inspected." },
  { id: "prep", label: "Prep & disassembly", customer: "Panels are coming off and surfaces are being prepped." },
  { id: "wrapping", label: "Wrapping", customer: "Film is going on." },
  { id: "reassembly", label: "Reassembly & QC", customer: "Your bike is being rebuilt and checked panel by panel." },
  { id: "ready", label: "Ready for pickup", customer: "Your bike is ready. Pay the balance and arrange collection in your portal." },
  { id: "complete", label: "Complete", customer: "Enjoy the ride. Your care guide is in your portal." },
] as const;

export type StageId = (typeof STAGES)[number]["id"] | "cancelled";

export const STAGE_IDS = new Set<string>([...STAGES.map((s) => s.id), "cancelled"]);

/** Once the bike is in the studio the customer can no longer change the brief. */
export const EDITABLE_STAGES = new Set<string>(["inquiry", "quoted", "booked"]);

export function stageLabel(id: string): string {
  if (id === "cancelled") return "Cancelled";
  return STAGES.find((s) => s.id === id)?.label ?? id;
}
