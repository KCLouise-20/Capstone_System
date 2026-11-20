export type StockStatus = "OK" | "Low" | "Critical";

export type RequestStatus = "Draft" | "Pending" | "Approved" | "Rejected" | "Released";

export type UserRole = "Admin" | "Supply Officer" | "Faculty" | "Staff";

export type AccountStatus = "Active" | "Inactive";

export interface InventoryItem {
  itemCode: string;
  itemName: string;
  /** Brand/variant/color detail (e.g. "INPLAY COLOR BLACK") — the legacy COA Stock Card form's separate "Description" line under Item. */
  description: string | null;
  category: string;
  unit: string;
  onHand: number;
  unitCost?: number | null;
  reorderLevel: number;
  status: StockStatus;
  imageUrl: string | null;
}

export interface DeliveryItemLine {
  itemName: string;
  qty: number;
  unitCost: number;
  unit: string;
}

export interface DeliveryRecord {
  refNo: string;
  supplier: string;
  date: string;
  itemCount: number;
  items: DeliveryItemLine[];
  totalCost: number;
  poNumber?: string;
  receivedBy?: string;
  remarks?: string;
}

export interface RisItemLine {
  itemName: string;
  qtyRequested: number;
  stockOnHand: number;
  lowStock: boolean;
}

/**
 * A material someone has flagged as wanted but not (yet) in the inventory
 * catalog — not tied to an item_id. `departments` is only ever populated
 * server-side for an Officer/Admin viewer (see getWishListItems); a
 * Faculty/Staff viewer gets undefined here regardless of what the DB row
 * actually holds, so identity/department never reaches their browser at
 * all, not just hidden by the UI.
 */
export interface WishListItem {
  wishId: number;
  itemName: string;
  description: string | null;
  category: string | null;
  status: "open" | "fulfilled";
  createdAt: string;
  confirmCount: number;
  confirmedByMe: boolean;
  isMine: boolean;
  departments?: string[];
}

export interface RisRecord {
  risNo: string;
  department: string;
  date: string;
  status: RequestStatus;
  scio: string;
  purpose: string;
  items: RisItemLine[];
  requestedBy?: string;
  requestedByDesignation?: string;
  approvedBy?: string;
  approvedByDesignation?: string;
  approvedAt?: string;
  releasedAt?: string;
  rejectedAt?: string;
  remarks?: string;
}


export interface SupplyRequestItem {
  itemName: string;
  qty: number;
  unit?: string;
  stockOnHand?: number;
}

export interface SupplyRequest {
  refNo: string;
  date: string;
  itemCount: number;
  status: RequestStatus;
  items: SupplyRequestItem[];
  approvedBy?: string;
  /** The approver's role name, used as the RIS Designation. */
  approvedByDesignation?: string;
  approvedOn?: string;
  remarks?: string;
}


export interface SystemUser {
  fullName: string;
  initials: string;
  email: string;
  role: UserRole;
  department: string;
  status: AccountStatus;
}

export interface RoleDefinition {
  name: string;
  description: string;
  userCount: number;
  permissions: Record<string, boolean>;
}

export interface LogEntry {
  timestamp: string;
  user: string;
  action: "Create" | "Login" | "Update" | "Delete";
  module: string;
  description: string;
}

export interface CategoryStock {
  name: string;
  value: number;
  /** % of this category's items that are OK stock (not Low/Critical) — drives the Dashboard bar color. */
  healthPercent: number;
}

export interface PendingRequestSummary {
  refNo: string;
  itemName: string;
  department: string;
  qty: string;
  status: RequestStatus;
}

export interface StockCardLedgerRow {
  date: string;
  reference: string;
  receiptQty: number | null;
  /** Unit cost on a receipt row — the legacy Stock Card form's "Unit Cost" column, meaningless on an issue row. */
  unitCost: number | null;
  issueQty: number | null;
  /** Who/where the issue went to on an issue row — the legacy form's "Office" column under Issue. */
  office: string | null;
  balance: number;
  /** Estimated days until this balance is exhausted at the item's historical average daily issue rate — null when there isn't enough issue history to estimate (see computeDaysToConsume in queries.ts). The legacy form's "No. of Days to Consume" column. */
  daysToConsume: number | null;
}

/**
 * One row of the "Stock Summary List" — the master list of every item at a
 * glance (item code, name, current stock, average price), printed
 * separately from the per-item Stock Card ledger above. avgUnitCost is
 * averaged across every delivery this item has ever received, not just its
 * latest one — a school's supplier prices genuinely move between orders,
 * so "the" unit cost isn't a single fixed number the way it would be for a
 * catalog price.
 */
export interface StockSummaryRow {
  itemCode: string;
  itemName: string;
  unit: string;
  onHand: number;
  /** null when this item has never been delivered — nothing to average. */
  avgUnitCost: number | null;
}
