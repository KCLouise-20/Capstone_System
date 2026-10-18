import { AppShell } from "@/components/layout/AppShell";
import {
  getSystemSettings,
  getCategories,
  getUnitsOfMeasure,
  getDepartments,
  type SystemSettings,
} from "@/lib/supabase/queries";
import { SettingsClient } from "./SettingsClient";

// Seed data (migration 09) guarantees the system_settings singleton row
// exists, but getSystemSettings()'s return type stays nullable since
// nothing in the schema actually forbids deleting it — fall back to
// blank-but-valid defaults rather than letting the settings form crash.
const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  institutionName: "",
  systemTitle: "",
  fiscalYearStart: "January",
  currency: "Philippine Peso (₱)",
  lowStockThresholdPercent: 20,
  categoryHealthRedMax: 25,
  categoryHealthYellowMax: 50,
  categoryHealthBlueMax: 75,
  officeName: "Supply and Property Management Office",
  address: "",
  contactInfo: "",
  fundCluster: "",
};

export default async function SystemSettingsPage() {
  const [settings, categories, units, departments] = await Promise.all([
    getSystemSettings(),
    getCategories(),
    getUnitsOfMeasure(),
    getDepartments(),
  ]);

  return (
    <AppShell title="System Settings">
      <SettingsClient
        settings={settings ?? DEFAULT_SYSTEM_SETTINGS}
        categories={categories}
        units={units}
        departments={departments}
      />
    </AppShell>
  );
}
