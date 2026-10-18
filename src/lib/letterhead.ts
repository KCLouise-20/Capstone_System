import type { SystemSettings } from "@/lib/supabase/queries";

/**
 * Consolidated letterhead shape for printed documents (RIS, Delivery,
 * Stock Card, Period, SCIO). One object instead of five separate props so
 * every page.tsx that renders a printable document builds it once here
 * rather than repeating the same fallback strings in five places.
 */
export interface DocumentLetterhead {
  institutionName: string;
  systemTitle: string;
  officeName: string;
  address: string;
  contactInfo: string;
}

const DEFAULT_INSTITUTION_NAME = "University of Science and Technology of Southern Philippines";
const DEFAULT_SYSTEM_TITLE = "Supply and Property Management System";
const DEFAULT_OFFICE_NAME = "Supply and Property Management Office";

export function resolveLetterhead(settings: SystemSettings | null): DocumentLetterhead {
  return {
    institutionName: settings?.institutionName || DEFAULT_INSTITUTION_NAME,
    systemTitle: settings?.systemTitle || DEFAULT_SYSTEM_TITLE,
    officeName: settings?.officeName || DEFAULT_OFFICE_NAME,
    address: settings?.address || "",
    contactInfo: settings?.contactInfo || "",
  };
}
