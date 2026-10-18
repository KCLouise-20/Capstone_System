"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal, ModalFooter } from "@/components/ui/Modal";
import {
  updateSystemSettings,
  createCategory,
  updateCategory,
  createUnitOfMeasure,
  updateUnitOfMeasure,
  createDepartment,
  updateDepartment,
} from "@/lib/supabase/mutations";
import type { SystemSettings } from "@/lib/supabase/queries";

interface Category {
  name: string;
  active: boolean;
}

interface UnitOfMeasure {
  name: string;
  abbreviation: string;
}

interface Department {
  name: string;
  description: string | null;
  active: boolean;
}

interface CategoryModalState {
  originalName: string | null;
  name: string;
  active: boolean;
}

interface UnitModalState {
  originalName: string | null;
  name: string;
  abbreviation: string;
}

interface DepartmentModalState {
  originalName: string | null;
  name: string;
  description: string;
  active: boolean;
}

export function SettingsClient({
  settings,
  categories,
  units,
  departments,
}: {
  settings: SystemSettings;
  categories: Category[];
  units: UnitOfMeasure[];
  departments: Department[];
}) {
  const router = useRouter();
  const [isSavingSettings, startSettingsTransition] = useTransition();
  const [isSavingCategory, startCategoryTransition] = useTransition();
  const [isSavingUnit, startUnitTransition] = useTransition();
  const [isSavingDepartment, startDepartmentTransition] = useTransition();

  const [form, setForm] = useState<SystemSettings>(settings);
  const [settingsError, setSettingsError] = useState("");
  const [savedNotice, setSavedNotice] = useState(false);

  const [categoryModal, setCategoryModal] = useState<CategoryModalState | null>(null);
  const [categoryError, setCategoryError] = useState("");
  const [unitModal, setUnitModal] = useState<UnitModalState | null>(null);
  const [unitError, setUnitError] = useState("");
  const [departmentModal, setDepartmentModal] = useState<DepartmentModalState | null>(null);
  const [departmentError, setDepartmentError] = useState("");

  function saveSettings() {
    startSettingsTransition(async () => {
      const result = await updateSystemSettings(form);
      if (result.error) {
        setSettingsError(result.error);
        setSavedNotice(false);
        return;
      }
      setSettingsError("");
      setSavedNotice(true);
      router.refresh();
    });
  }

  function saveCategory() {
    if (!categoryModal || !categoryModal.name.trim()) return;
    const input = { name: categoryModal.name.trim(), active: categoryModal.active };

    startCategoryTransition(async () => {
      const result = categoryModal.originalName
        ? await updateCategory(categoryModal.originalName, input)
        : await createCategory(input.name, input.active);

      if (result.error) {
        setCategoryError(result.error);
        return;
      }
      setCategoryError("");
      setCategoryModal(null);
      router.refresh();
    });
  }

  function saveUnit() {
    if (!unitModal || !unitModal.name.trim() || !unitModal.abbreviation.trim()) return;
    const input = { name: unitModal.name.trim(), abbreviation: unitModal.abbreviation.trim() };

    startUnitTransition(async () => {
      const result = unitModal.originalName
        ? await updateUnitOfMeasure(unitModal.originalName, input)
        : await createUnitOfMeasure(input.name, input.abbreviation);

      if (result.error) {
        setUnitError(result.error);
        return;
      }
      setUnitError("");
      setUnitModal(null);
      router.refresh();
    });
  }

  function saveDepartment() {
    if (!departmentModal || !departmentModal.name.trim()) return;
    const input = {
      name: departmentModal.name.trim(),
      description: departmentModal.description.trim(),
      active: departmentModal.active,
    };

    startDepartmentTransition(async () => {
      const result = departmentModal.originalName
        ? await updateDepartment(departmentModal.originalName, input)
        : await createDepartment(input.name, input.description, input.active);

      if (result.error) {
        setDepartmentError(result.error);
        return;
      }
      setDepartmentError("");
      setDepartmentModal(null);
      router.refresh();
    });
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-[1.1fr_1fr]">
        <Card>
          <CardHeader title="General Settings" />

          <Field label="Institution name">
            <input
              value={form.institutionName}
              onChange={(e) => setForm((f) => ({ ...f, institutionName: e.target.value }))}
              className="input"
            />
          </Field>
          <Field label="System title">
            <input
              value={form.systemTitle}
              onChange={(e) => setForm((f) => ({ ...f, systemTitle: e.target.value }))}
              className="input"
            />
          </Field>

          <div className="flex flex-col gap-1.5 border-t border-border-soft pt-3.5">
            <span className="text-xs font-bold text-muted">Printed Document Letterhead</span>
            <p className="text-[11.5px] text-muted-2">
              Shown on every printed RIS, Delivery Receipt, and Report — the USTP logo prints
              automatically, this is everything else on the letterhead.
            </p>
          </div>
          <Field label="Responsible office">
            <input
              value={form.officeName}
              onChange={(e) => setForm((f) => ({ ...f, officeName: e.target.value }))}
              placeholder="e.g. Supply and Property Management Office"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="Address">
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="e.g. USTP Villanueva Campus, Villanueva, Misamis Oriental"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="Contact info">
            <input
              value={form.contactInfo}
              onChange={(e) => setForm((f) => ({ ...f, contactInfo: e.target.value }))}
              placeholder="e.g. (088) 123-4567 · supply@ustp.edu.ph"
              className="input placeholder:text-muted-2"
            />
          </Field>
          <Field label="Fund Cluster">
            <input
              value={form.fundCluster}
              onChange={(e) => setForm((f) => ({ ...f, fundCluster: e.target.value }))}
              placeholder="e.g. IGI"
              className="input placeholder:text-muted-2"
            />
            <span className="text-[11px] font-normal normal-case text-muted-2">
              COA accounting classification — printed only on the Stock Card report, next to Entity Name.
            </span>
          </Field>

          <div className="grid grid-cols-1 gap-3 border-t border-border-soft pt-3.5 sm:grid-cols-2">
            <Field label="Fiscal year start">
              <select
                value={form.fiscalYearStart}
                onChange={(e) => setForm((f) => ({ ...f, fiscalYearStart: e.target.value }))}
                className="input"
              >
                <option>January</option>
                <option>July</option>
              </select>
            </Field>
            <Field label="Currency">
              <select
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
                className="input"
              >
                <option>Philippine Peso (₱)</option>
              </select>
            </Field>
          </div>

          <Field label="Low-stock notification threshold (%)">
            <input
              type="number"
              value={form.lowStockThresholdPercent}
              onChange={(e) =>
                setForm((f) => ({ ...f, lowStockThresholdPercent: Number(e.target.value) || 0 }))
              }
              className="input"
            />
          </Field>

          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold text-muted">
              Dashboard &quot;Stock by Category&quot; Bar Colors
            </span>
            <p className="text-[11.5px] text-muted-2">
              Colored by the % of each category&apos;s items that are healthy stock — red up to the
              first number, then yellow, then blue, then green above that.
            </p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Red up to (%)">
                <input
                  type="number"
                  value={form.categoryHealthRedMax}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryHealthRedMax: Number(e.target.value) || 0 }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Yellow up to (%)">
                <input
                  type="number"
                  value={form.categoryHealthYellowMax}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryHealthYellowMax: Number(e.target.value) || 0 }))
                  }
                  className="input"
                />
              </Field>
              <Field label="Blue up to (%)">
                <input
                  type="number"
                  value={form.categoryHealthBlueMax}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, categoryHealthBlueMax: Number(e.target.value) || 0 }))
                  }
                  className="input"
                />
              </Field>
            </div>
          </div>

          {settingsError && (
            <p
              role="alert"
              className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
            >
              {settingsError}
            </p>
          )}

          <div className="flex items-center justify-end gap-2.5">
            {savedNotice && <span className="text-[12px] font-medium text-ok-text">Saved.</span>}
            <Button
              variant="dark"
              className="self-end disabled:cursor-not-allowed disabled:opacity-60"
              onClick={saveSettings}
              disabled={isSavingSettings}
            >
              {isSavingSettings ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </Card>

        <div className="flex flex-col gap-3.5">
          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-bold">Categories</span>
              <button
                onClick={() => setCategoryModal({ originalName: null, name: "", active: true })}
                className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
              >
                <Plus size={13} strokeWidth={2} />
                Add
              </button>
            </div>
            <div className="flex flex-col">
              {categories.map((c, i) => (
                <div
                  key={c.name}
                  className={`flex items-center justify-between py-2.5 text-[13px] ${
                    i !== categories.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <span className="font-medium">{c.name}</span>
                  <div className="flex items-center gap-3">
                    <Badge tone={c.active ? "ok" : "neutral"}>{c.active ? "Active" : "Inactive"}</Badge>
                    <button
                      onClick={() => setCategoryModal({ originalName: c.name, name: c.name, active: c.active })}
                      aria-label={`Edit ${c.name} category`}
                      className="flex size-7 shrink-0 items-center justify-center text-muted-2 hover:text-foreground"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
              {categories.length === 0 && (
                <p className="py-4 text-center text-[12.5px] text-muted-2">No categories yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-bold">Units of Measure</span>
              <button
                onClick={() => setUnitModal({ originalName: null, name: "", abbreviation: "" })}
                className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
              >
                <Plus size={13} strokeWidth={2} />
                Add
              </button>
            </div>
            <div className="flex flex-col">
              {units.map((u, i) => (
                <div
                  key={u.name}
                  className={`flex items-center justify-between py-2.5 text-[13px] ${
                    i !== units.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <span className="font-medium">{u.name}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-2">{u.abbreviation}</span>
                    <button
                      onClick={() =>
                        setUnitModal({ originalName: u.name, name: u.name, abbreviation: u.abbreviation })
                      }
                      aria-label={`Edit ${u.name} unit`}
                      className="flex size-7 shrink-0 items-center justify-center text-muted-2 hover:text-foreground"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
              {units.length === 0 && (
                <p className="py-4 text-center text-[12.5px] text-muted-2">No units yet.</p>
              )}
            </div>
          </Card>

          <Card>
            <div className="flex items-center justify-between">
              <span className="text-[13.5px] font-bold">Departments</span>
              <button
                onClick={() => setDepartmentModal({ originalName: null, name: "", description: "", active: true })}
                className="flex items-center gap-1 text-xs font-semibold text-muted hover:text-foreground"
              >
                <Plus size={13} strokeWidth={2} />
                Add
              </button>
            </div>
            <div className="flex flex-col">
              {departments.map((d, i) => (
                <div
                  key={d.name}
                  className={`flex items-center justify-between py-2.5 text-[13px] ${
                    i !== departments.length - 1 ? "border-b border-border-soft" : ""
                  }`}
                >
                  <span className="font-medium">{d.name}</span>
                  <div className="flex items-center gap-3">
                    <Badge tone={d.active ? "ok" : "neutral"}>{d.active ? "Active" : "Inactive"}</Badge>
                    <button
                      onClick={() =>
                        setDepartmentModal({
                          originalName: d.name,
                          name: d.name,
                          description: d.description ?? "",
                          active: d.active,
                        })
                      }
                      aria-label={`Edit ${d.name} department`}
                      className="flex size-7 shrink-0 items-center justify-center text-muted-2 hover:text-foreground"
                    >
                      <Pencil size={13} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
              ))}
              {departments.length === 0 && (
                <p className="py-4 text-center text-[12.5px] text-muted-2">No departments yet.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={categoryModal !== null}
        onClose={() => setCategoryModal(null)}
        title={categoryModal?.originalName === null ? "Add Category" : "Edit Category"}
      >
        {categoryModal && (
          <>
            <div className="flex flex-col gap-3">
              <Field label="Category name">
                <input
                  value={categoryModal.name}
                  onChange={(e) => setCategoryModal({ ...categoryModal, name: e.target.value })}
                  placeholder="e.g. Office Supplies"
                  className="input placeholder:text-muted-2"
                />
              </Field>
              <Field label="Status">
                <select
                  value={categoryModal.active ? "Active" : "Inactive"}
                  onChange={(e) =>
                    setCategoryModal({ ...categoryModal, active: e.target.value === "Active" })
                  }
                  className="input"
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </Field>
              {categoryError && (
                <p
                  role="alert"
                  className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
                >
                  {categoryError}
                </p>
              )}
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={() => setCategoryModal(null)}>
                Cancel
              </Button>
              <Button
                variant="dark"
                onClick={saveCategory}
                disabled={isSavingCategory}
                className="disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingCategory ? "Saving..." : categoryModal.originalName === null ? "Add Category" : "Save Changes"}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      <Modal
        open={unitModal !== null}
        onClose={() => setUnitModal(null)}
        title={unitModal?.originalName === null ? "Add Unit of Measure" : "Edit Unit of Measure"}
      >
        {unitModal && (
          <>
            <div className="flex flex-col gap-3">
              <Field label="Unit name">
                <input
                  value={unitModal.name}
                  onChange={(e) => setUnitModal({ ...unitModal, name: e.target.value })}
                  placeholder="e.g. Bottle"
                  className="input placeholder:text-muted-2"
                />
              </Field>
              <Field label="Abbreviation">
                <input
                  value={unitModal.abbreviation}
                  onChange={(e) => setUnitModal({ ...unitModal, abbreviation: e.target.value })}
                  placeholder="e.g. btl"
                  className="input placeholder:text-muted-2"
                />
              </Field>
              {unitError && (
                <p
                  role="alert"
                  className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
                >
                  {unitError}
                </p>
              )}
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={() => setUnitModal(null)}>
                Cancel
              </Button>
              <Button
                variant="dark"
                onClick={saveUnit}
                disabled={isSavingUnit}
                className="disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingUnit ? "Saving..." : unitModal.originalName === null ? "Add Unit" : "Save Changes"}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>

      <Modal
        open={departmentModal !== null}
        onClose={() => setDepartmentModal(null)}
        title={departmentModal?.originalName === null ? "Add Department" : "Edit Department"}
      >
        {departmentModal && (
          <>
            <div className="flex flex-col gap-3">
              <Field label="Department name">
                <input
                  value={departmentModal.name}
                  onChange={(e) => setDepartmentModal({ ...departmentModal, name: e.target.value })}
                  placeholder="e.g. Engineering"
                  className="input placeholder:text-muted-2"
                />
              </Field>
              <Field label="Description (optional)">
                <input
                  value={departmentModal.description}
                  onChange={(e) => setDepartmentModal({ ...departmentModal, description: e.target.value })}
                  placeholder="e.g. College of Engineering"
                  className="input placeholder:text-muted-2"
                />
              </Field>
              <Field label="Status">
                <select
                  value={departmentModal.active ? "Active" : "Inactive"}
                  onChange={(e) =>
                    setDepartmentModal({ ...departmentModal, active: e.target.value === "Active" })
                  }
                  className="input"
                >
                  <option>Active</option>
                  <option>Inactive</option>
                </select>
              </Field>
              {departmentError && (
                <p
                  role="alert"
                  className="rounded-lg border border-critical-border bg-critical-bg px-3 py-2 text-[12.5px] font-medium text-critical-text"
                >
                  {departmentError}
                </p>
              )}
            </div>
            <ModalFooter>
              <Button variant="outline" onClick={() => setDepartmentModal(null)}>
                Cancel
              </Button>
              <Button
                variant="dark"
                onClick={saveDepartment}
                disabled={isSavingDepartment}
                className="disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSavingDepartment
                  ? "Saving..."
                  : departmentModal.originalName === null
                    ? "Add Department"
                    : "Save Changes"}
              </Button>
            </ModalFooter>
          </>
        )}
      </Modal>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-xs font-semibold text-muted">
      {label}
      {children}
    </label>
  );
}
