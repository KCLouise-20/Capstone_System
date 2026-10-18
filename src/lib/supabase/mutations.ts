"use server";

// ---------------------------------------------------------------------
// Every create/update/approve/etc. action across all 10 screens. Split
// from queries.ts (reads only) because a file with a file-level
// "use server" directive must export only async functions — queries.ts
// also exports the sync computeStockStatus() helper and isn't meant to be
// imported by Client Components at all, so mixing the two here would pull
// its next/headers-dependent reads into the client bundle the moment any
// modal imported a mutation directly.
//
// Every mutation returns a small MutationResult instead of throwing, so
// the calling component can show `result.error` inline the same way
// src/app/login/LoginForm.tsx shows `state.error` — see that file for the
// established UI pattern this mirrors.
// ---------------------------------------------------------------------

import { randomUUID } from "node:crypto";
import { createClient as createServiceRoleClient } from "@supabase/supabase-js";
import type { PostgrestError } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus, UserRole } from "@/lib/types";
import type { SystemSettings } from "./queries";

export interface MutationResult<T = void> {
  error?: string;
  data?: T;
}

type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>;

/**
 * The UI's UserRole type has separate "Faculty" / "Staff" values (an old
 * mock-data holdover), but the live schema only has one merged
 * 'Faculty / Staff' role (see supabase/migrations/20260821000200 and the
 * seed data) — the Use Case Diagram never treated them as distinct roles.
 * Every mutation that writes a role name goes through this so a UI value
 * of either "Faculty" or "Staff" lands on the one real row.
 */
function toDbRoleName(uiRole: string): string {
  if (uiRole === "Faculty" || uiRole === "Staff") return "Faculty / Staff";
  return uiRole;
}

async function resolveRoleId(supabase: ServerSupabaseClient, uiRole: string): Promise<number | null> {
  const { data } = await supabase
    .from("roles")
    .select("role_id")
    .eq("name", toDbRoleName(uiRole))
    .maybeSingle<{ role_id: number }>();
  return data?.role_id ?? null;
}

async function resolveCategoryId(supabase: ServerSupabaseClient, categoryName: string): Promise<number | null> {
  const { data } = await supabase
    .from("categories")
    .select("category_id")
    .eq("category_name", categoryName)
    .maybeSingle<{ category_id: number }>();
  return data?.category_id ?? null;
}

async function resolveDepartmentId(supabase: ServerSupabaseClient, deptName: string): Promise<number | null> {
  const { data } = await supabase
    .from("departments")
    .select("dept_id")
    .eq("dept_name", deptName)
    .maybeSingle<{ dept_id: number }>();
  return data?.dept_id ?? null;
}

/** Item pickers across the app work off item NAME (see the mock-data-shaped UI), not item_code, so every line-item mutation resolves names to item_id in one round trip here. */
async function resolveItemIdsByName(
  supabase: ServerSupabaseClient,
  names: string[],
): Promise<Map<string, { id: number; unitCost: number }>> {
  const unique = Array.from(new Set(names));
  if (unique.length === 0) return new Map();

  const { data } = await supabase
    .from("items")
    .select("item_id, item_name, unit_cost")
    .in("item_name", unique)
    .returns<{ item_id: number; item_name: string; unit_cost: number }[]>();

  const map = new Map<string, { id: number; unitCost: number }>();
  for (const row of data ?? []) map.set(row.item_name, { id: row.item_id, unitCost: row.unit_cost });
  return map;
}

/**
 * items.stock_quantity has `check (stock_quantity >= 0)` (migration 04).
 * Approving/releasing a request whose quantity exceeds what's on hand
 * makes the trigger's UPDATE on items violate that check, which surfaces
 * here as Postgres error code 23514 on the *releases* update the caller
 * made (see supabase/migrations/20260821000600_releases.sql,
 * apply_release_stock_effect) — this is the one error shape callers must
 * not see as a raw Postgres message.
 */
function friendlyMutationError(error: PostgrestError | { code?: string | null; message: string }): string {
  if (error.code === "23514") {
    return "There isn't enough stock on hand to complete this action.";
  }
  if (error.code === "23505") {
    return "That reference is already in use.";
  }
  if (error.code === "23503") {
    return "This can't be deleted — other records still reference it.";
  }
  return error.message || "Something went wrong. Please try again.";
}

// ---------------------------------------------------------------------
// Inventory mutations
// ---------------------------------------------------------------------

export interface InventoryItemInput {
  itemCode: string;
  itemName: string;
  /** Brand/variant/color detail — the legacy COA Stock Card's separate "Description" line under Item. */
  description?: string;
  category: string;
  unit: string;
  onHand: number;
  reorderLevel: number;
  unitCost?: number;
  /** Public Storage URL from uploadItemImage(), or null to clear it. */
  imageUrl?: string | null;
}

/** Backs the "Add item" modal on src/app/inventory/page.tsx. */
export async function createInventoryItem(input: InventoryItemInput): Promise<MutationResult> {
  const itemCode = input.itemCode.trim();
  const itemName = input.itemName.trim();
  if (!itemCode || !itemName) {
    return { error: "Item code and item name are required." };
  }

  const supabase = await createClient();
  const categoryId = await resolveCategoryId(supabase, input.category);
  if (categoryId === null) return { error: `Unknown category "${input.category}".` };

  const { error } = await supabase.from("items").insert({
    item_code: itemCode,
    item_name: itemName,
    description: input.description?.trim() || null,
    category_id: categoryId,
    unit: input.unit,
    stock_quantity: input.onHand,
    reorder_level: input.reorderLevel,
    unit_cost: input.unitCost ?? 0,
    image_url: input.imageUrl ?? null,
    status: "active",
  });

  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/**
 * Backs the "Edit item" modal (item fields only). Lifecycle status
 * (active/inactive/discontinued) is a separate concern from the on-hand
 * quantity fields the edit modal collects — see setItemLifecycleStatus.
 */
export async function updateInventoryItem(
  itemCode: string,
  input: Partial<InventoryItemInput>,
): Promise<MutationResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.itemName !== undefined) patch.item_name = input.itemName.trim();
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.unit !== undefined) patch.unit = input.unit;
  if (input.onHand !== undefined) patch.stock_quantity = input.onHand;
  if (input.reorderLevel !== undefined) patch.reorder_level = input.reorderLevel;
  if (input.unitCost !== undefined) patch.unit_cost = input.unitCost;
  if (input.imageUrl !== undefined) patch.image_url = input.imageUrl;
  if (input.category !== undefined) {
    const categoryId = await resolveCategoryId(supabase, input.category);
    if (categoryId === null) return { error: `Unknown category "${input.category}".` };
    patch.category_id = categoryId;
  }

  const { error } = await supabase.from("items").update(patch).eq("item_code", itemCode);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

/**
 * Backs the image picker on the Add/Edit Item modal. Uploads to the
 * public `item-images` Storage bucket (migration 22) and returns its
 * public URL — the caller still has to pass that URL into
 * createInventoryItem/updateInventoryItem's imageUrl field themselves;
 * this only handles the file, not the items row.
 *
 * Storage's own RLS policies already gate the actual write to
 * Manage-inventory permission, but checking here too means a
 * non-Officer gets a clean error message instead of a raw Storage 403,
 * and the upload never happens at all for a caller who can't use it.
 */
export async function uploadItemImage(formData: FormData): Promise<MutationResult<{ url: string }>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: callerProfile } = await supabase
    .from("users")
    .select("status, roles(role_permissions(permission_key, allowed))")
    .eq("id", user.id)
    .single<{
      status: string;
      roles: { role_permissions: { permission_key: string; allowed: boolean }[] } | null;
    }>();
  const canManageInventory = (callerProfile?.roles?.role_permissions ?? []).some(
    (p) => p.permission_key === "Manage inventory" && p.allowed,
  );
  if (!callerProfile || callerProfile.status !== "active" || !canManageInventory) {
    return { error: "You don't have permission to upload item images." };
  }

  const itemCode = String(formData.get("itemCode") ?? "").trim();
  const file = formData.get("file");
  if (!itemCode || !(file instanceof File)) {
    return { error: "Missing item code or file." };
  }
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return { error: "Only JPEG, PNG, WebP, or GIF images are allowed." };
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return { error: "Image must be 5MB or smaller." };
  }

  const ext = file.type.split("/")[1];
  const path = `${itemCode}/${randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from("item-images").upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { error: uploadError.message };

  const {
    data: { publicUrl },
  } = supabase.storage.from("item-images").getPublicUrl(path);

  return { data: { url: publicUrl } };
}

/** Lifecycle status toggle (active/inactive/discontinued) — see migration 04's note distinguishing this from the OK/Low/Critical stock badge. */
export async function setItemLifecycleStatus(
  itemCode: string,
  status: "active" | "inactive" | "discontinued",
): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("items").update({ status }).eq("item_code", itemCode);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/**
 * Backs "Delete" on Inventory. Unlike deleteSystemUser (migration 24 made
 * that safe to always allow, since every dependent row keeps its own
 * name/email snapshot), deliveries.item_id and releases.item_id have no
 * such snapshot — a delivery or release row's whole meaning is "N units of
 * *this item*", so nulling that reference out would leave a nonsensical
 * orphaned line, not a merely-less-detailed one. So this checks for
 * dependent rows first and refuses outright when any exist, same
 * proactive-check reasoning deleteSystemUser used to use before migration
 * 24 — "use Discontinued instead" is the real answer for an item with
 * real history, not a workaround.
 */
export async function deleteInventoryItem(itemCode: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: item } = await supabase
    .from("items")
    .select("item_id")
    .eq("item_code", itemCode)
    .maybeSingle<{ item_id: number }>();
  if (!item) return { error: "Item not found." };

  const [deliveries, releases] = await Promise.all([
    supabase.from("delivery_items").select("delivery_item_id", { count: "exact", head: true }).eq("item_id", item.item_id),
    supabase.from("release_items").select("release_item_id", { count: "exact", head: true }).eq("item_id", item.item_id),
  ]);
  const hasHistory = [deliveries, releases].some((r) => (r.count ?? 0) > 0);
  if (hasHistory) {
    return {
      error:
        "This item has delivery or release history on record and can't be permanently deleted — set it to Discontinued instead so it stops being orderable.",
    };
  }

  const { error } = await supabase.from("items").delete().eq("item_code", itemCode);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

// ---------------------------------------------------------------------
// Delivery mutations
// ---------------------------------------------------------------------

export interface DeliveryLineInput {
  itemName: string;
  qty: number;
  unitCost: number;
}

export interface RecordDeliveryInput {
  refNo: string;
  poNumber?: string;
  date: string; // yyyy-mm-dd
  supplier: string;
  receivedBy?: string; // users.id (uuid); defaults to the signed-in officer
  remarks?: string;
  items: DeliveryLineInput[];
}

/**
 * Inserts deliveries then delivery_items as two plain REST calls rather
 * than wrapping both in a Postgres RPC. Considered an RPC for atomicity,
 * but: (a) the delivery_items insert is a single multi-row INSERT
 * statement, which Postgres already runs atomically — it can't leave a
 * half-written set of line items behind; the only failure modes are "zero
 * line items inserted" or "all of them did"; and (b) an extra RPC is a
 * bigger surface to keep in sync than a compensating delete on the rare
 * failure path below. If delivery_items fails outright, the just-inserted
 * deliveries header is deleted so no delivery-with-no-items record is
 * left behind.
 */
export async function recordDelivery(input: RecordDeliveryInput): Promise<MutationResult> {
  const refNo = input.refNo.trim();
  const supplier = input.supplier.trim();
  if (!refNo || !supplier || input.items.length === 0) {
    return { error: "Supplier, reference number, and at least one delivery item are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const receivedById = input.receivedBy ?? user?.id ?? null;
  // Snapshot the receiver's name/email at the moment of this delivery (see
  // migration 24) — looked up fresh rather than trusting `user`'s own auth
  // metadata, since input.receivedBy can name someone other than the
  // signed-in caller.
  const receiver = receivedById
    ? (
        await supabase.from("users").select("full_name, email").eq("id", receivedById).maybeSingle<{
          full_name: string;
          email: string;
        }>()
      ).data
    : null;

  const { data: delivery, error: deliveryError } = await supabase
    .from("deliveries")
    .insert({
      ref_no: refNo,
      po_number: input.poNumber?.trim() || null,
      delivery_date: input.date,
      supplier,
      received_by: receivedById,
      received_by_name: receiver?.full_name ?? null,
      received_by_email: receiver?.email ?? null,
      remarks: input.remarks?.trim() || null,
    })
    .select("delivery_id")
    .single<{ delivery_id: number }>();

  if (deliveryError || !delivery) {
    return { error: deliveryError ? friendlyMutationError(deliveryError) : "Could not record this delivery." };
  }

  const itemIds = await resolveItemIdsByName(
    supabase,
    input.items.map((line) => line.itemName),
  );
  const lineRows = input.items.map((line) => ({
    delivery_id: delivery.delivery_id,
    item_id: itemIds.get(line.itemName)?.id,
    quantity: line.qty,
    unit_cost: line.unitCost,
  }));

  if (lineRows.some((row) => !row.item_id)) {
    await supabase.from("deliveries").delete().eq("delivery_id", delivery.delivery_id);
    return { error: "One or more selected items could not be found." };
  }

  const { error: itemsError } = await supabase
    .from("delivery_items")
    .insert(lineRows as { delivery_id: number; item_id: number; quantity: number; unit_cost: number }[]);

  if (itemsError) {
    await supabase.from("deliveries").delete().eq("delivery_id", delivery.delivery_id);
    return { error: friendlyMutationError(itemsError) };
  }

  return {};
}

// ---------------------------------------------------------------------
// Release / RIS mutations (submission + Officer approve/reject/release)
// ---------------------------------------------------------------------

export interface ReleaseLineInput {
  itemName: string;
  qty: number;
}

export interface CreateReleaseInput {
  department?: string;
  scio?: string;
  purpose?: string;
  date?: string; // release_date, yyyy-mm-dd; defaults to today
  items: ReleaseLineInput[];
}

/**
 * Delegates to the next_release_ref() SQL function (migration
 * 20260821001100) rather than SELECTing releases.ris_number directly
 * through this RLS-scoped client: releases_select (migration 06) only
 * lets a Faculty/Staff caller see their OWN rows, so a plain client-side
 * "max + 1" over a filtered view would let two different first-time
 * requesters compute the identical ref number and collide on
 * ris_number's unique constraint. The RPC is SECURITY DEFINER and sees
 * every row regardless of caller.
 *
 * Falls back to a timestamp-based ref (still globally unique, just not
 * as pretty) if the RPC can't be reached — e.g. the migration hasn't been
 * applied yet — so a missing migration degrades gracefully instead of
 * hard-failing the whole submission.
 */
async function nextReleaseRefNumber(supabase: ServerSupabaseClient, prefix: string, pad: number): Promise<string> {
  const { data, error } = await supabase.rpc("next_release_ref", { p_prefix: prefix, p_pad: pad });
  if (error || typeof data !== "string") {
    return `${prefix}${Date.now().toString(36).toUpperCase()}`;
  }
  return data;
}

/**
 * Shared insert path for both "submit a request" flows in this app: the
 * Faculty/Staff Request Supplies screen and the Officer's own "New RIS
 * form" on the Releases screen (src/app/releases/page.tsx) — both create a
 * pending releases + release_items row for requested_by = the signed-in
 * user; they only differ in ref-number convention. See releases RLS
 * (migration 06): Officer's insert is allowed via has_permission('Process
 * RIS'), Faculty/Staff's via the is_faculty_staff()+own-row branch.
 *
 * Item names are resolved to item_id BEFORE the releases row is inserted
 * (not after, unlike recordDelivery's line-item step) specifically so a
 * bad item name never leaves an empty pending release behind: a
 * Faculty/Staff requester can only delete their own release row while it's
 * still 'pending' (see migration 20260821001000), so a rollback attempted
 * after insert would silently no-op under RLS for that caller instead of
 * actually cleaning up. Resolving items first means that path is only
 * ever needed for the rarer release_items insert failure below, which the
 * new migration's self-delete policy now genuinely covers for every
 * caller (Officer and Faculty/Staff alike).
 */
async function insertReleaseRequest(
  refPrefix: string,
  refPad: number,
  input: CreateReleaseInput,
  status: "pending" | "draft" = "pending",
  lockDepartmentToSelf = false,
): Promise<MutationResult<{ refNo: string }>> {
  if (status === "pending" && input.items.length === 0) {
    return { error: "Add at least one item before submitting." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { error: "You must be signed in to submit a request." };
  }

  const itemIds = await resolveItemIdsByName(
    supabase,
    input.items.map((line) => line.itemName),
  );
  if (input.items.some((line) => !itemIds.has(line.itemName))) {
    return { error: "One or more selected items could not be found." };
  }

  const refNo = await nextReleaseRefNumber(supabase, refPrefix, refPad);

  // Faculty/Staff always file under their own department — resolved
  // server-side from their profile rather than trusting the client's
  // `input.department`, so a request can never be filed under a
  // department other than the one Admin actually assigned this account
  // to. The Officer's own "New RIS" form is the one caller that passes
  // `lockDepartmentToSelf: false`, since an Officer legitimately logs
  // paper RIS forms submitted by other departments.
  const department = lockDepartmentToSelf
    ? await currentUserDepartment(supabase, user.id)
    : input.department?.trim() || null;

  // Snapshot the requester's name/email at submission time (migration 24)
  // — looked up fresh from public.users rather than trusting auth
  // metadata, which is the same source-of-truth pattern recordDelivery's
  // received_by_name/_email use.
  const requester = (
    await supabase.from("users").select("full_name, email").eq("id", user.id).maybeSingle<{
      full_name: string;
      email: string;
    }>()
  ).data;

  const { data: release, error: releaseError } = await supabase
    .from("releases")
    .insert({
      ris_number: refNo,
      release_date: input.date ?? new Date().toISOString().slice(0, 10),
      requested_by: user.id,
      requested_by_name: requester?.full_name ?? null,
      requested_by_email: requester?.email ?? null,
      department,
      scio: input.scio?.trim() || null,
      purpose: input.purpose?.trim() || null,
      status,
    })
    .select("release_id")
    .single<{ release_id: number }>();

  if (releaseError || !release) {
    return { error: releaseError ? friendlyMutationError(releaseError) : "Could not submit this request." };
  }

  // A draft can legitimately have zero items yet (just saving progress on
  // the department/purpose/date fields before picking items) — nothing
  // to insert into release_items in that case.
  if (input.items.length === 0) {
    return { data: { refNo } };
  }

  // unit_cost is stamped at release time (mirrors recordDelivery's own
  // line.unitCost capture) so a valuation report re-run later reflects what
  // this release actually cost when it happened, not whatever items.unit_cost
  // happens to be today — see getPeriodSummaryReport/getScioReport's
  // items.unit_cost fallback in queries.ts, which only exists for release
  // rows inserted before this fix.
  const lineRows = input.items.map((line) => {
    const resolved = itemIds.get(line.itemName) as { id: number; unitCost: number };
    return {
      release_id: release.release_id,
      item_id: resolved.id,
      quantity: line.qty,
      unit_cost: resolved.unitCost,
    };
  });

  const { error: itemsError } = await supabase.from("release_items").insert(lineRows);

  if (itemsError) {
    // Safe for both Officer and Faculty/Staff callers — see migration
    // 20260821001000, which lets a requester delete their own still-
    // pending release, not just an Officer with 'Process RIS'.
    await supabase.from("releases").delete().eq("release_id", release.release_id);
    return { error: friendlyMutationError(itemsError) };
  }

  return { data: { refNo } };
}

/** Backs "Submit request" on src/app/request-supplies/page.tsx (Faculty/Staff). Ref numbers follow the mock's REQ-#### convention. */
export async function submitSupplyRequest(input: CreateReleaseInput): Promise<MutationResult<{ refNo: string }>> {
  return insertReleaseRequest("REQ-", 4, input, "pending", true);
}

/** Backs "Save draft" on the same screen — same shape as submitSupplyRequest, just lands as 'draft' instead of 'pending' and doesn't require any items yet. */
export async function saveSupplyRequestDraft(input: CreateReleaseInput): Promise<MutationResult<{ refNo: string }>> {
  return insertReleaseRequest("REQ-", 4, input, "draft", true);
}

/** Backs "Submit for approval" on the Officer's New RIS form, src/app/releases/page.tsx. Ref numbers follow the mock's RIS-<year>-#### convention. */
export async function createRisRequest(input: CreateReleaseInput): Promise<MutationResult<{ refNo: string }>> {
  const year = new Date().getFullYear();
  return insertReleaseRequest(`RIS-${year}-`, 4, input, "pending");
}

/** Backs "Save draft" on the same form. */
export async function saveRisRequestDraft(input: CreateReleaseInput): Promise<MutationResult<{ refNo: string }>> {
  const year = new Date().getFullYear();
  return insertReleaseRequest(`RIS-${year}-`, 4, input, "draft");
}

/**
 * Promotes an existing draft to 'pending' — the actual "submit for
 * approval" action once a draft has what it needs. RLS (migration 14)
 * already restricts this to the draft's own requester or an Officer;
 * this only adds the item-count check RLS doesn't do on its own, since a
 * draft is deliberately allowed to have zero items while still a draft.
 */
export async function submitDraftRequest(risNumber: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data: release } = await supabase
    .from("releases")
    .select("release_id")
    .eq("ris_number", risNumber)
    .maybeSingle<{ release_id: number }>();
  if (!release) return { error: "Request not found." };

  const { count } = await supabase
    .from("release_items")
    .select("release_item_id", { count: "exact", head: true })
    .eq("release_id", release.release_id);
  if (!count) return { error: "Add at least one item before submitting." };

  const { error } = await supabase.from("releases").update({ status: "pending" }).eq("ris_number", risNumber);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/**
 * Backs "Delete" on a Draft row — both the Officer's RIS tab and
 * Faculty/Staff's Request Supplies "My Request Status" panel. RLS
 * (`releases_delete`, migration 06) already allows this for the request's
 * own requester (while still pending/draft) or any Officer, so this is
 * mostly a thin wrapper; the .select() + row-count check exists to turn a
 * silent RLS no-op (0 rows deleted, no Postgres error) into a real error
 * instead of a misleading "success."
 */
export async function deleteRelease(risNumber: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from("releases").delete().eq("ris_number", risNumber).select("ris_number");

  if (error) return { error: friendlyMutationError(error) };
  if (!data || data.length === 0) {
    return { error: "Couldn't delete this — it may have already been submitted or removed." };
  }
  return {};
}

/**
 * Approve. Sets approved_by to the acting officer. If approving would take
 * any line item's stock below zero, apply_release_stock_effect's UPDATE on
 * items fails the 23514 check constraint, which aborts this releases
 * UPDATE too (status stays 'pending') — surfaced here as a friendly error
 * instead of a raw Postgres message.
 */
const ALREADY_ACTED_ON_ERROR =
  "This request was already acted on by someone else — refresh and try again.";

export async function approveRelease(risNumber: string): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Snapshot the approver's name/email at approval time (migration 24) —
  // same source-of-truth pattern as received_by_name/requested_by_name.
  const approver = user
    ? (
        await supabase.from("users").select("full_name, email").eq("id", user.id).maybeSingle<{
          full_name: string;
          email: string;
        }>()
      ).data
    : null;

  // .eq("status", "pending") is a precondition, not just a filter: without
  // it, two officers acting on the same stale-cached "Pending" row (or one
  // officer double-clicking) can both have this succeed, re-running
  // apply_release_stock_effect's stock deduction a second time and silently
  // overriding whatever the first action already decided.
  const { data, error } = await supabase
    .from("releases")
    .update({
      status: "approved",
      approved_by: user?.id ?? null,
      approved_by_name: approver?.full_name ?? null,
      approved_by_email: approver?.email ?? null,
    })
    .eq("ris_number", risNumber)
    .eq("status", "pending")
    .select("ris_number");

  if (error) return { error: friendlyMutationError(error) };
  if (!data || data.length === 0) return { error: ALREADY_ACTED_ON_ERROR };
  return {};
}

/**
 * Reject. Deliberately does not touch approved_by — that column means "who
 * approved this," and there's no separate rejected_by column in the
 * schema (see migration 06). If the row was previously approved/released,
 * the trigger reverses the earlier stock deduction automatically.
 */
export async function rejectRelease(risNumber: string, remarks?: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .update({ status: "rejected", remarks: remarks?.trim() || null })
    .eq("ris_number", risNumber)
    .eq("status", "pending")
    .select("ris_number");

  if (error) return { error: friendlyMutationError(error) };
  if (!data || data.length === 0) return { error: ALREADY_ACTED_ON_ERROR };
  return {};
}

/** Mark released. Same 23514 handling as approveRelease — relevant when a pending row is released directly without a separate approval step. */
export async function markReleaseReleased(risNumber: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("releases")
    .update({ status: "released" })
    .eq("ris_number", risNumber)
    .eq("status", "approved")
    .select("ris_number");

  if (error) return { error: friendlyMutationError(error) };
  if (!data || data.length === 0) return { error: ALREADY_ACTED_ON_ERROR };
  return {};
}

// ---------------------------------------------------------------------
// Manage Users mutations
// ---------------------------------------------------------------------

export interface CreateSystemUserInput {
  fullName: string;
  email: string;
  role: UserRole | string;
  department?: string;
  status?: AccountStatus;
  /** Optional — set the account's real password directly instead of emailing a reset link. At least 8 characters if provided. */
  password?: string;
}

export interface UpdateSystemUserInput {
  fullName?: string;
  email?: string;
  role?: UserRole | string;
  department?: string;
  status?: AccountStatus;
  /** Optional — set the account's password directly instead of emailing a reset link. At least 8 characters if provided. */
  password?: string;
}

/**
 * Server-only Supabase client authenticated with the service-role key, for
 * the one thing the regular cookie-based client structurally cannot do:
 * provision a new auth.users row for someone else. Never send this key to
 * the browser — it bypasses RLS entirely. Returns null (not a throw) when
 * the env var isn't set, so createSystemUser can surface a clean setup
 * message instead of a stack trace.
 */
function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return null;
  return createServiceRoleClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Backs "Add user" on src/app/admin/users/page.tsx. Creates the real
 * auth.users row via the Admin API (service-role key, see
 * getServiceRoleClient), then relies on the handle_new_user trigger
 * (migration 03) to provision the matching public.users profile row from
 * the metadata passed here — no separate insert into public.users is
 * made. If the Admin sets a password directly, that's the account's real
 * password immediately (no email round-trip needed — useful when email
 * delivery isn't configured, or for handing credentials straight to
 * someone in person). Left blank, this falls back to the original
 * design: a random unusable password plus a normal password-reset email
 * so the new user sets their own.
 */
export async function createSystemUser(input: CreateSystemUserInput): Promise<MutationResult> {
  const fullName = input.fullName.trim();
  const email = input.email.trim().toLowerCase();
  if (!fullName || !email) {
    return { error: "Full name and email are required." };
  }
  if (input.password && input.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  // The service-role client below bypasses RLS entirely, so this function
  // must do its own caller check rather than trusting proxy.ts's /admin/*
  // route guard (an unsigned, forgeable cookie — see its own comments) as
  // the only thing standing between any signed-in user and creating a new
  // Admin account. Uses the normal RLS-scoped client so this always
  // reflects the caller's real row, not anything client-supplied.
  const callerSupabase = await createClient();
  const {
    data: { user: caller },
  } = await callerSupabase.auth.getUser();
  if (!caller) return { error: "Not signed in." };
  const { data: callerProfile } = await callerSupabase
    .from("users")
    .select("status, roles(name)")
    .eq("id", caller.id)
    .single();
  const callerRole = (callerProfile as { roles?: { name?: string } } | null)?.roles?.name;
  if (!callerProfile || callerProfile.status !== "active" || callerRole !== "Admin") {
    return { error: "Only an Administrator can create accounts." };
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Account creation isn't configured on this server yet. An administrator needs to set SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase Studio -> Settings -> API).",
    };
  }

  const roleName = toDbRoleName(input.role);
  const status: "active" | "inactive" = input.status === "Inactive" ? "inactive" : "active";
  const department = input.department?.trim() || null;
  const adminSetPassword = input.password?.trim();
  // Random, never surfaced anywhere, when the Admin didn't set one directly
  // — the account is unusable until the reset-password email below lets
  // the new user set their own.
  const temporaryPassword = adminSetPassword || `${randomUUID()}Aa1!`;

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      role_name: roleName,
      username: email.split("@")[0],
      full_name: fullName,
      department,
      status,
    },
  });

  if (createError || !created.user) {
    return { error: createError?.message ?? "Could not create this account." };
  }

  // Only chase this with a reset email when the Admin didn't set a real
  // password directly — that password already works, so a reset link
  // would just be noise (and would invalidate it before anyone uses it).
  if (!adminSetPassword) {
    try {
      const supabase = await createClient();
      await supabase.auth.resetPasswordForEmail(email);
    } catch {
      // Best-effort — account creation itself already succeeded; the admin
      // can still use "Reset password" on this user later (resetUserPassword).
    }
  }

  return {};
}

/**
 * Backs "Edit user" (profile fields, not password) on the same screen.
 * Goes through the normal cookie-authenticated client — RLS's users_update
 * policy already permits an Admin to update any row (migration 03). An
 * email change also updates public.users directly (that's the row every
 * other read in this app joins against) and, best-effort, the matching
 * auth.users row via the service-role admin API so the account can still
 * log in with its new address — not fatal if the key isn't configured or
 * the call fails, since public.users is already correct either way.
 */
export async function updateSystemUser(
  email: string,
  input: UpdateSystemUserInput,
): Promise<MutationResult> {
  if (input.password && input.password.length < 8) {
    return { error: "Password must be at least 8 characters." };
  }

  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.fullName !== undefined) patch.full_name = input.fullName.trim();
  if (input.email !== undefined) patch.email = input.email.trim().toLowerCase();
  if (input.department !== undefined) {
    const trimmed = input.department.trim();
    if (!trimmed) {
      patch.department_id = null;
    } else {
      const departmentId = await resolveDepartmentId(supabase, trimmed);
      if (departmentId === null) return { error: `Unknown department "${trimmed}".` };
      patch.department_id = departmentId;
    }
  }
  if (input.status !== undefined) patch.status = input.status === "Inactive" ? "inactive" : "active";
  if (input.role !== undefined) {
    const roleId = await resolveRoleId(supabase, input.role);
    if (roleId === null) return { error: `Unknown role "${input.role}".` };
    patch.role_id = roleId;
  }

  const { data, error } = await supabase
    .from("users")
    .update(patch)
    .eq("email", email)
    .select("id, email")
    .single<{ id: string; email: string }>();

  if (error || !data) {
    return { error: error ? friendlyMutationError(error) : "Could not update this user." };
  }

  if (input.email !== undefined && data.email !== email) {
    const admin = getServiceRoleClient();
    if (admin) {
      try {
        await admin.auth.admin.updateUserById(data.id, { email: data.email });
      } catch {
        // Best-effort — public.users (used everywhere else) is already correct.
      }
    }
  }

  // Sets the account's real password immediately, same Admin API path as
  // createSystemUser's optional password field — needed because several
  // seed accounts use placeholder addresses (@school.edu.ph) that were
  // never real inboxes, so "Reset Password" (an actual email send) can
  // never reach them. Unlike the email sync above, this one isn't
  // best-effort: if it fails, the Admin needs to know the password wasn't
  // actually changed, not see a false "Saved."
  if (input.password) {
    const admin = getServiceRoleClient();
    if (!admin) {
      return {
        error:
          "Password changes aren't configured on this server yet. An administrator needs to set SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase Studio -> Settings -> API).",
      };
    }
    const { error: passwordError } = await admin.auth.admin.updateUserById(data.id, {
      password: input.password,
    });
    if (passwordError) return { error: passwordError.message };
  }

  return {};
}

/**
 * Backs "Delete" on Manage Users. Permanently removes the auth.users row
 * (public.users cascades off it — migration 03). Uses the service-role
 * client, so — same reasoning as createSystemUser — this does its own
 * caller-is-Admin check first rather than trusting the /admin/* route
 * cookie alone.
 *
 * No longer blocked by activity on record (an earlier version of this
 * function refused to delete any account with a delivery/release/report/
 * log row attached to it, precisely because those FKs had no ON DELETE
 * behavior). Migration 24 fixed the real problem instead of working around
 * it: every one of those tables now keeps its own permanent snapshot of
 * the actor's name/email at the time of the transaction, and their users.id
 * foreign keys are ON DELETE SET NULL — so deleting the account here
 * detaches the live link but every past transaction still shows exactly
 * who did it and when, unaffected. Deactivating (see updateSystemUser's
 * status field / UsersClient's per-row toggle) remains the way to revoke
 * access without deleting the account at all.
 */
export async function deleteSystemUser(email: string): Promise<MutationResult> {
  const trimmedEmail = email.trim().toLowerCase();
  const callerSupabase = await createClient();
  const {
    data: { user: caller },
  } = await callerSupabase.auth.getUser();
  if (!caller) return { error: "Not signed in." };

  const { data: callerProfile } = await callerSupabase
    .from("users")
    .select("status, roles(name)")
    .eq("id", caller.id)
    .single();
  const callerRole = (callerProfile as { roles?: { name?: string } } | null)?.roles?.name;
  if (!callerProfile || callerProfile.status !== "active" || callerRole !== "Admin") {
    return { error: "Only an Administrator can delete accounts." };
  }

  const { data: target } = await callerSupabase
    .from("users")
    .select("id, email")
    .eq("email", trimmedEmail)
    .maybeSingle<{ id: string; email: string }>();
  if (!target) return { error: "User not found." };
  if (target.id === caller.id) return { error: "You can't delete your own account while signed in as it." };

  const admin = getServiceRoleClient();
  if (!admin) {
    return {
      error:
        "Account deletion isn't configured on this server yet. An administrator needs to set SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase Studio -> Settings -> API).",
    };
  }

  const { error } = await admin.auth.admin.deleteUser(target.id);
  if (error) return { error: error.message };
  return {};
}

/** Backs the "Reset password" action in the Edit user modal — sends a normal Supabase password-recovery email, no service-role key needed. */
export async function resetUserPassword(email: string): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

// ---------------------------------------------------------------------
// Manage Roles mutations
// ---------------------------------------------------------------------

// The fixed set of permission keys every role gets a row for (matches
// migration 09's seed list) — a role with no role_permissions rows at all
// would render an empty, un-toggleable permissions panel on
// src/app/admin/roles/page.tsx, so a freshly created role needs these
// seeded (all off) up front, the same way the 3 built-in roles start out.
const PERMISSION_KEYS = [
  "Manage inventory",
  "Record deliveries",
  "Process RIS",
  "Generate reports",
  "Manage users",
  "System settings",
  "View system logs",
  "Approve requests",
];

/** Backs "New role" on src/app/admin/roles/page.tsx. */
export async function createRole(name: string, description: string): Promise<MutationResult> {
  const supabase = await createClient();

  const { data: role, error: roleError } = await supabase
    .from("roles")
    .insert({ name, description: description || null })
    .select("role_id")
    .single<{ role_id: number }>();
  if (roleError || !role) return { error: roleError ? friendlyMutationError(roleError) : "Could not create this role." };

  const { error: permError } = await supabase
    .from("role_permissions")
    .insert(PERMISSION_KEYS.map((permission_key) => ({ role_id: role.role_id, permission_key, allowed: false })));
  if (permError) return { error: friendlyMutationError(permError) };

  return {};
}

/** Backs "Save permissions" on src/app/admin/roles/page.tsx — upserts every toggled permission for one role in a single request. */
export async function setRolePermissions(
  roleName: string,
  permissions: Record<string, boolean>,
): Promise<MutationResult> {
  const supabase = await createClient();

  const { data: role } = await supabase
    .from("roles")
    .select("role_id")
    .eq("name", roleName)
    .maybeSingle<{ role_id: number }>();
  if (!role) return { error: `Unknown role "${roleName}".` };

  const rows = Object.entries(permissions).map(([permission_key, allowed]) => ({
    role_id: role.role_id,
    permission_key,
    allowed,
  }));
  if (rows.length === 0) return {};

  const { error } = await supabase.from("role_permissions").upsert(rows, { onConflict: "role_id,permission_key" });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Single-toggle convenience wrapper around setRolePermissions, for a UI that saves one switch at a time instead of a whole-panel "Save". */
export async function setRolePermission(
  roleName: string,
  permissionKey: string,
  allowed: boolean,
): Promise<MutationResult> {
  return setRolePermissions(roleName, { [permissionKey]: allowed });
}

// ---------------------------------------------------------------------
// System Settings mutations (see queries.ts for the SystemSettings type
// and getSystemSettings read)
// ---------------------------------------------------------------------

/** Backs "Save changes" in the General settings panel on src/app/admin/settings/page.tsx. */
export async function updateSystemSettings(input: Partial<SystemSettings>): Promise<MutationResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.institutionName !== undefined) patch.institution_name = input.institutionName.trim();
  if (input.systemTitle !== undefined) patch.system_title = input.systemTitle.trim();
  if (input.fiscalYearStart !== undefined) patch.fiscal_year_start = input.fiscalYearStart;
  if (input.currency !== undefined) patch.currency = input.currency;
  if (input.lowStockThresholdPercent !== undefined) patch.low_stock_threshold_percent = input.lowStockThresholdPercent;
  if (input.categoryHealthRedMax !== undefined) patch.category_health_red_max = input.categoryHealthRedMax;
  if (input.categoryHealthYellowMax !== undefined) patch.category_health_yellow_max = input.categoryHealthYellowMax;
  if (input.categoryHealthBlueMax !== undefined) patch.category_health_blue_max = input.categoryHealthBlueMax;
  if (input.officeName !== undefined) patch.office_name = input.officeName.trim();
  if (input.address !== undefined) patch.address = input.address.trim();
  if (input.contactInfo !== undefined) patch.contact_info = input.contactInfo.trim();
  if (input.fundCluster !== undefined) patch.fund_cluster = input.fundCluster.trim();

  const { error } = await supabase.from("system_settings").update(patch).eq("id", true);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs the Categories "Add"/edit modal on the same screen. */
export async function createCategory(name: string, active = true): Promise<MutationResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Category name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").insert({
    category_name: trimmed,
    status: active ? "active" : "inactive",
  });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

export async function updateCategory(
  currentName: string,
  input: { name?: string; active?: boolean },
): Promise<MutationResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.category_name = input.name.trim();
  if (input.active !== undefined) patch.status = input.active ? "active" : "inactive";

  const { error } = await supabase.from("categories").update(patch).eq("category_name", currentName);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs the Departments "Add"/edit modal on System Settings — the real DEPARTMENTS entity (migration 20), mirroring createCategory/updateCategory exactly. */
export async function createDepartment(
  name: string,
  description: string,
  active = true,
): Promise<MutationResult> {
  const trimmed = name.trim();
  if (!trimmed) return { error: "Department name is required." };

  const supabase = await createClient();
  const { error } = await supabase.from("departments").insert({
    dept_name: trimmed,
    description: description.trim() || null,
    status: active ? "active" : "inactive",
  });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

export async function updateDepartment(
  currentName: string,
  input: { name?: string; description?: string; active?: boolean },
): Promise<MutationResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.dept_name = input.name.trim();
  if (input.description !== undefined) patch.description = input.description.trim() || null;
  if (input.active !== undefined) patch.status = input.active ? "active" : "inactive";

  const { error } = await supabase.from("departments").update(patch).eq("dept_name", currentName);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs the Units of measure "Add"/edit modal on the same screen. */
export async function createUnitOfMeasure(name: string, abbreviation: string): Promise<MutationResult> {
  const trimmedName = name.trim();
  const trimmedAbbr = abbreviation.trim();
  if (!trimmedName || !trimmedAbbr) return { error: "Unit name and abbreviation are required." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("units_of_measure")
    .insert({ name: trimmedName, abbreviation: trimmedAbbr });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

export async function updateUnitOfMeasure(
  currentName: string,
  input: { name?: string; abbreviation?: string },
): Promise<MutationResult> {
  const supabase = await createClient();

  const patch: Record<string, unknown> = {};
  if (input.name !== undefined) patch.name = input.name.trim();
  if (input.abbreviation !== undefined) patch.abbreviation = input.abbreviation.trim();

  const { error } = await supabase.from("units_of_measure").update(patch).eq("name", currentName);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

// ---------------------------------------------------------------------
// Report generation logging (see migration 07's `reports` table —
// report_id/report_type/parameters/file_path/generated_by/generated_at —
// which nothing has ever written to; RLS's reports_insert_officer policy
// already requires generated_by = auth.uid(), satisfied directly below).
// ---------------------------------------------------------------------

/**
 * Records that a report was generated from the Reports screen. `parameters`
 * is stored as JSON text (not jsonb) because that's the column type the
 * schema already defines. `file_path` is left null — there's no export/
 * download pipeline yet that would produce an actual file to point at.
 */
export async function logReportGeneration(
  reportType: string,
  parameters: Record<string, unknown>,
): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to generate a report." };

  // Snapshot the generator's name/email (migration 24) — same
  // source-of-truth pattern as received_by_name/requested_by_name.
  const generator = (
    await supabase.from("users").select("full_name, email").eq("id", user.id).maybeSingle<{
      full_name: string;
      email: string;
    }>()
  ).data;

  const { error } = await supabase.from("reports").insert({
    report_type: reportType,
    parameters: JSON.stringify(parameters),
    generated_by: user.id,
    generated_by_name: generator?.full_name ?? null,
    generated_by_email: generator?.email ?? null,
  });

  if (error) return { error: friendlyMutationError(error) };
  return {};
}

// ---------------------------------------------------------------------
// Material wishlist — a material not (yet) in the inventory catalog, or
// nothing currently offered through Request Supplies. department is
// captured from the poster's own profile at write time (same reasoning as
// releases.department — see migration 06) rather than resolved later via
// a join, so nothing here ever needs read access to another user's row.
// ---------------------------------------------------------------------

async function currentUserDepartment(supabase: ServerSupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase
    .from("users")
    .select("departments(dept_name)")
    .eq("id", userId)
    .maybeSingle<{ departments: { dept_name: string } | null }>();
  return data?.departments?.dept_name ?? null;
}

/** Backs the "Suggest a material" form on the Wish List page. */
export async function submitWish(
  itemName: string,
  description: string,
  categoryName: string,
): Promise<MutationResult> {
  const trimmed = itemName.trim();
  if (!trimmed) return { error: "Item name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to suggest a material." };

  const department = await currentUserDepartment(supabase, user.id);

  const { error } = await supabase.from("wishlist_items").insert({
    item_name: trimmed,
    description: description.trim() || null,
    category_name: categoryName || null,
    department,
    requested_by: user.id,
  });

  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs the "Confirm / Unconfirm" (me too) button on someone else's wish. */
export async function toggleWishConfirmation(wishId: number, currentlyConfirmed: boolean): Promise<MutationResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "You must be signed in to confirm a wish." };

  if (currentlyConfirmed) {
    const { error } = await supabase
      .from("wishlist_confirmations")
      .delete()
      .eq("wish_id", wishId)
      .eq("user_id", user.id);
    if (error) return { error: friendlyMutationError(error) };
    return {};
  }

  // getWishListItems()'s confirmCount assumes the poster never appears in
  // wishlist_confirmations (it adds +1 for the poster's own implicit want) —
  // the UI already hides this button for item.isMine, but that's not itself
  // enforced anywhere below the UI, so guard it here too.
  const { data: wish } = await supabase
    .from("wishlist_items")
    .select("requested_by")
    .eq("wish_id", wishId)
    .maybeSingle<{ requested_by: string }>();
  if (wish?.requested_by === user.id) {
    return { error: "You already implicitly want your own suggestion." };
  }

  const department = await currentUserDepartment(supabase, user.id);
  const { error } = await supabase
    .from("wishlist_confirmations")
    .insert({ wish_id: wishId, user_id: user.id, department });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs "Withdraw" on your own wish (or Admin moderating someone else's). */
export async function deleteWish(wishId: number): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("wishlist_items").delete().eq("wish_id", wishId);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs Officer/Admin marking a wish "Fulfilled" once it's been sourced or added to inventory. */
export async function setWishStatus(wishId: number, status: "open" | "fulfilled"): Promise<MutationResult> {
  const supabase = await createClient();
  const { error } = await supabase.from("wishlist_items").update({ status }).eq("wish_id", wishId);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

// ---------------------------------------------------------------------
// Update Profile mutations (src/app/profile) — the "Update Profile" use
// case from the thesis Use Case Diagram, an <<include>> for all three
// actors alongside View Dashboard, that never had a screen built for it.
// Both go through the normal cookie-authenticated client acting on the
// CALLER's own row/session only — never take a target user id as input,
// so there's no risk of this becoming an "edit anyone" path by accident.
// ---------------------------------------------------------------------

/** Backs "Save changes" on /profile. Only full_name is editable — email/username/department/role are admin-managed elsewhere (Manage Users). */
export async function updateOwnProfile(fullName: string): Promise<MutationResult> {
  const trimmed = fullName.trim();
  if (!trimmed) return { error: "Full name is required." };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("users").update({ full_name: trimmed }).eq("id", user.id);
  if (error) return { error: friendlyMutationError(error) };
  return {};
}

/** Backs "Change password" on /profile — supabase-js validates the caller already has a live session, so no separate re-auth step is needed here. */
export async function changeOwnPassword(newPassword: string): Promise<MutationResult> {
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { error: friendlyMutationError(error) };
  return {};
}
