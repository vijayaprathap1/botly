import type { SupabaseClient } from "@supabase/supabase-js";
import { FOUNDING } from "../plans";

/** How long a checkout holds a founding slot before it is offered to someone else. */
export const FOUNDING_HOLD_MINUTES = 30;

/**
 * Holds one of the founding slots for this workspace while it pays (true = go ahead).
 * Atomic in the database, so two shops can never take the 25th slot together.
 * A workspace that already holds or owns a slot always gets true.
 */
export async function reserveFoundingSlot(db: SupabaseClient, orgId: string): Promise<boolean> {
  const { data, error } = await db.rpc("claim_founding_slot", { p_org_id: orgId, p_cap: FOUNDING.slots, p_hold_minutes: FOUNDING_HOLD_MINUTES });
  if (error) {
    console.error("[billing] founding reserve", error.message);
    return false;
  }
  return data === true;
}

/** Slots still open (paid + currently held ones count as taken). null if the database isn't migrated yet. */
export async function foundingSlotsLeft(db: SupabaseClient): Promise<number | null> {
  const { data, error } = await db.rpc("founding_slots_left", { p_cap: FOUNDING.slots });
  if (error || typeof data !== "number") return null;
  return data;
}
