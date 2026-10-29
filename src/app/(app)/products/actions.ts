"use server";

import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { productPrices, products, quotationItems } from "@/lib/db/schema";
import { Decimal } from "@/lib/domain/money";
import { productInputSchema, type ProductInput } from "@/lib/domain/schemas";
import { requireRole } from "@/lib/session";

export type ProductFormState = {
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
): ProductFormState {
  const cleaned: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value?.length) cleaned[key] = value;
  }
  return { error: "Please fix the highlighted fields.", fieldErrors: cleaned };
}

function productValues(data: ProductInput) {
  return {
    sku: data.sku,
    name: data.name,
    description: data.description,
    category: data.category,
    unit: data.unit,
    costPriceMmk: new Decimal(data.costPriceMmk).toFixed(2),
    // Stored as a fraction (0.05), edited as a percentage (5).
    taxRate: new Decimal(data.taxPct).div(100).toFixed(5),
    isActive: data.isActive,
  };
}

function priceRows(data: ProductInput) {
  return [
    { currency: "MMK" as const, unitPrice: data.priceMmk },
    { currency: "USD" as const, unitPrice: data.priceUsd },
    { currency: "THB" as const, unitPrice: data.priceThb },
  ];
}

export async function saveProduct(
  _previous: ProductFormState,
  formData: FormData,
): Promise<ProductFormState> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (id && !UUID_RE.test(id)) {
    return { error: "Product not found." };
  }

  const parsed = productInputSchema.safeParse({
    sku: text(formData, "sku"),
    name: text(formData, "name"),
    description: text(formData, "description"),
    category: text(formData, "category"),
    unit: text(formData, "unit"),
    costPriceMmk: text(formData, "costPriceMmk"),
    taxPct: text(formData, "taxPct"),
    priceMmk: text(formData, "priceMmk"),
    priceUsd: text(formData, "priceUsd"),
    priceThb: text(formData, "priceThb"),
    isActive: formData.get("isActive") === "on",
  });

  if (!parsed.success) {
    return validationFailure(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const db = getDb();
  const isEdit = Boolean(id);

  try {
    await db.transaction(async (tx) => {
      let productId: string;

      if (id) {
        const [updated] = await tx
          .update(products)
          .set(productValues(data))
          .where(eq(products.id, id))
          .returning({ id: products.id });

        if (!updated) throw new Error("NOT_FOUND");
        productId = updated.id;
      } else {
        const [inserted] = await tx
          .insert(products)
          .values(productValues(data))
          .returning({ id: products.id });
        productId = inserted.id;
      }

      for (const price of priceRows(data)) {
        if (price.unitPrice === null) {
          await tx
            .delete(productPrices)
            .where(
              sql`${productPrices.productId} = ${productId} and ${productPrices.currency} = ${price.currency}`,
            );
          continue;
        }

        const unitPrice = new Decimal(price.unitPrice).toFixed(4);
        await tx
          .insert(productPrices)
          .values({ productId, currency: price.currency, unitPrice })
          .onConflictDoUpdate({
            target: [productPrices.productId, productPrices.currency],
            set: { unitPrice },
          });
      }
    });
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "23505") {
      return {
        error: "That SKU is already used by another product.",
        fieldErrors: { sku: ["That SKU is already used by another product."] },
      };
    }
    if (error instanceof Error && error.message === "NOT_FOUND") {
      return { error: "Product not found." };
    }
    throw error;
  }

  revalidatePath("/products");
  revalidatePath("/quotations/new");
  redirect(`/products?notice=${isEdit ? "updated" : "created"}`);
}

export async function setProductActive(formData: FormData): Promise<void> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (!UUID_RE.test(id)) redirect("/products?error=not-found");

  const active = text(formData, "active") === "true";
  const [updated] = await getDb()
    .update(products)
    .set({ isActive: active })
    .where(eq(products.id, id))
    .returning({ id: products.id });

  if (!updated) redirect("/products?error=not-found");

  revalidatePath("/products");
  revalidatePath("/quotations/new");
  redirect(`/products?notice=${active ? "activated" : "deactivated"}`);
}

export async function deleteProduct(formData: FormData): Promise<void> {
  await requireRole("sales", "admin");

  const id = text(formData, "id");
  if (!UUID_RE.test(id)) redirect("/products?error=not-found");

  const [references] = await getDb()
    .select({ count: sql<number>`count(*)::int` })
    .from(quotationItems)
    .where(eq(quotationItems.productId, id));

  if (Number(references?.count ?? 0) > 0) {
    redirect("/products?error=in-use");
  }

  await getDb().delete(products).where(eq(products.id, id));

  revalidatePath("/products");
  revalidatePath("/quotations/new");
  redirect("/products?notice=deleted");
}
