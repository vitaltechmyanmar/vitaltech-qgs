"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { customers, quotations } from "@/lib/db/schema";
import { customerInputSchema } from "@/lib/domain/schemas";
import { requireRole } from "@/lib/session";

export type CustomerFormState = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function text(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function validationFailure(
  fieldErrors: Record<string, string[] | undefined>,
): CustomerFormState {
  const cleaned: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value?.length) cleaned[key] = value;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors: cleaned };
}

export async function saveCustomer(
  _previous: CustomerFormState,
  formData: FormData,
): Promise<CustomerFormState> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (id && !UUID_RE.test(id)) {
    return { error: "Customer not found." };
  }

  const parsed = customerInputSchema.safeParse({
    name: text(formData, "name"),
    attention: text(formData, "attention"),
    taxId: text(formData, "taxId"),
    address: text(formData, "address"),
    city: text(formData, "city"),
    country: text(formData, "country"),
    phone: text(formData, "phone"),
    email: text(formData, "email"),
    defaultCurrency: text(formData, "defaultCurrency"),
    notes: text(formData, "notes"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return validationFailure(parsed.error.flatten().fieldErrors);
  }

  const db = getDb();
  const isEdit = Boolean(id);

  if (id) {
    const [updated] = await db
      .update(customers)
      .set(parsed.data)
      .where(eq(customers.id, id))
      .returning({ id: customers.id });

    if (!updated) return { error: "Customer not found." };
  } else {
    await db.insert(customers).values(parsed.data);
  }

  revalidatePath("/customers");
  revalidatePath("/quotations/new");
  redirect(`/customers?notice=${isEdit ? "updated" : "created"}`);
}

export async function setCustomerActive(formData: FormData): Promise<void> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (!UUID_RE.test(id)) redirect("/customers?error=not-found");

  const active = text(formData, "active") === "true";
  const [updated] = await getDb()
    .update(customers)
    .set({ isActive: active })
    .where(eq(customers.id, id))
    .returning({ id: customers.id });

  if (!updated) redirect("/customers?error=not-found");

  revalidatePath("/customers");
  revalidatePath("/quotations/new");
  redirect(`/customers?notice=${active ? "activated" : "deactivated"}`);
}

export async function deleteCustomer(formData: FormData): Promise<void> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (!UUID_RE.test(id)) redirect("/customers?error=not-found");

  const [references] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(quotations)
    .where(eq(quotations.customerId, id));

  if (Number(references?.count ?? 0) > 0) {
    revalidatePath("/customers");
    redirect("/customers?error=in-use");
  }

  try {
    await getDb().delete(customers).where(eq(customers.id, id));
  } catch (error) {
    // A quotation inserted between the reference check and the delete.
    if ((error as { code?: string }).code === "23503") {
      redirect("/customers?error=in-use");
    }
    throw error;
  }

  revalidatePath("/customers");
  revalidatePath("/quotations/new");
  redirect("/customers?notice=deleted");
}
