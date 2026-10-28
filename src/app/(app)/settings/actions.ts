"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { companySettings } from "@/lib/db/schema";
import { Decimal } from "@/lib/domain/money";
import { companySettingsSchema } from "@/lib/domain/schemas";
import { syncExchangeRates } from "@/lib/fx/sync";
import { requireAdmin } from "@/lib/session";

export type CompanySettingsState = {
  ok?: boolean;
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

export async function updateCompanySettings(
  _previous: CompanySettingsState,
  formData: FormData,
): Promise<CompanySettingsState> {
  await requireAdmin();

  const parsed = companySettingsSchema.safeParse({
    legalName: text(formData, "legalName"),
    brandName: text(formData, "brandName"),
    tagline: text(formData, "tagline"),
    registrationNo: text(formData, "registrationNo"),
    taxId: text(formData, "taxId"),
    address: text(formData, "address"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    website: text(formData, "website"),
    bankDetails: text(formData, "bankDetails"),
    quotePrefix: text(formData, "quotePrefix"),
    defaultCurrency: text(formData, "defaultCurrency"),
    defaultTaxPct: text(formData, "defaultTaxPct"),
    taxLabel: text(formData, "taxLabel"),
    defaultValidityDays: text(formData, "defaultValidityDays"),
    defaultPaymentTerms: text(formData, "defaultPaymentTerms"),
    defaultDeliveryTerms: text(formData, "defaultDeliveryTerms"),
    defaultWarrantyTerms: text(formData, "defaultWarrantyTerms"),
    footerNote: text(formData, "footerNote"),
  });

  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const [key, value] of Object.entries(parsed.error.flatten().fieldErrors)) {
      if (value?.length) fieldErrors[key] = value;
    }
    return {
      error: "Please fix the highlighted fields.",
      fieldErrors,
    };
  }

  const { defaultTaxPct, ...rest } = parsed.data;
  const values = {
    ...rest,
    // Stored as a fraction (0.05), edited as a percentage (5).
    defaultTaxRate: new Decimal(defaultTaxPct).div(100).toFixed(5),
  };

  await getDb()
    .insert(companySettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: companySettings.id, set: values });

  revalidatePath("/settings");
  return { ok: true };
}

export type FxRefreshState = {
  ok?: boolean;
  error?: string;
  message?: string;
};

export async function refreshExchangeRates(): Promise<FxRefreshState> {
  await requireAdmin();

  try {
    const result = await syncExchangeRates();
    revalidatePath("/settings");

    return {
      ok: true,
      message:
        result.updated.length > 0
          ? `Updated ${result.updated.join(" and ")} from ${result.provider} for ${result.effectiveDate}.`
          : `No rows changed — manual rates for ${result.effectiveDate} take precedence.`,
    };
  } catch (error) {
    console.error("[settings/fx] refresh failed", error);
    return {
      error:
        "Could not fetch exchange rates. Check outbound access to open.er-api.com and try again.",
    };
  }
}
