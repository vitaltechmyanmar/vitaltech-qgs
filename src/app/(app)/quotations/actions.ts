"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import {
  companySettings,
  customers,
  products,
  quotationEvents,
  quotationItems,
  quotations,
  quotationStatusEnum,
  type Customer,
  type Quotation,
  type QuotationStatus,
} from "@/lib/db/schema";
import { getLatestFxRate } from "@/lib/db/queries";
import { Decimal, dec, money } from "@/lib/domain/money";
import { computeTotals } from "@/lib/domain/pricing";
import { evaluateGuardrails } from "@/lib/domain/guardrails";
import {
  saveQuotationSchema,
  type ActionResult,
  type LineInput,
} from "@/lib/domain/schemas";
import { requireRole } from "@/lib/session";

type SaveResult = ActionResult<{ id: string }>;

function validationFailure(
  fieldErrors: Record<string, string[] | undefined>,
): SaveResult {
  const cleaned: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(fieldErrors)) {
    if (value?.length) cleaned[key] = value;
  }
  return {
    ok: false,
    code: "VALIDATION",
    error: "Please fix the highlighted fields.",
    fieldErrors: cleaned,
  };
}

function customerSnapshot(customer: Customer) {
  return {
    name: customer.name,
    attention: customer.attention,
    taxId: customer.taxId,
    address: customer.address,
    city: customer.city,
    country: customer.country,
    phone: customer.phone,
    email: customer.email,
  };
}

function pricedLine(item: LineInput, product: { costPriceMmk: string } | undefined) {
  return {
    productId: item.productId ?? null,
    sku: product ? undefined : (item.sku ?? null),
    name: item.name,
    description: item.description ?? null,
    unit: item.unit || "pcs",
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountPct: item.discountPct || "0",
    taxRate: item.taxRate || "0",
    // Cost is authoritative from the catalog; ad-hoc lines start at zero.
    costUnitMmk: product ? product.costPriceMmk : item.costUnitMmk || "0",
  };
}

export async function saveQuotation(input: unknown): Promise<SaveResult> {
  const session = await requireRole("sales", "admin");
  const parsed = saveQuotationSchema.safeParse(input);
  if (!parsed.success) {
    return validationFailure(parsed.error.flatten().fieldErrors);
  }

  const data = parsed.data;
  const db = getDb();

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, data.customerId))
    .limit(1);

  if (!customer) {
    return { ok: false, code: "CUSTOMER_NOT_FOUND", error: "Customer not found." };
  }
  if (!customer.isActive) {
    return { ok: false, code: "CUSTOMER_INACTIVE", error: "Customer is inactive." };
  }

  const productIds = [
    ...new Set(
      data.items
        .map((item) => item.productId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const productRows = productIds.length
    ? await db.select().from(products).where(inArray(products.id, productIds))
    : [];
  const productById = new Map(productRows.map((product) => [product.id, product]));

  for (const item of data.items) {
    if (item.productId && !productById.has(item.productId)) {
      return {
        ok: false,
        code: "PRODUCT_NOT_FOUND",
        error: "One of the selected catalog items no longer exists.",
      };
    }
  }

  const lines = data.items.map((item) =>
    pricedLine(item, item.productId ? productById.get(item.productId) : undefined),
  );

  const totals = computeTotals(
    lines.map((line) => ({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPct: line.discountPct,
      taxRate: line.taxRate,
    })),
    data.discountKind,
    data.discountValue,
  );

  const costTotal = lines.reduce(
    (sum, line) => sum.plus(money(dec(line.quantity).mul(dec(line.costUnitMmk)))),
    new Decimal(0),
  );

  const newRate = await getLatestFxRate(data.currency);
  if (!newRate) {
    return {
      ok: false,
      code: "FX_RATE_MISSING",
      error: `No exchange rate is configured for ${data.currency}. Add one in Settings.`,
    };
  }

  const guardrails = evaluateGuardrails({
    totals,
    fxRateMmkPerUnit: newRate.mmkPerUnit,
    costTotalMmk: costTotal.toFixed(2),
    isAdmin: session.user.role === "admin",
  });

  if (guardrails.blockers.length > 0) {
    return {
      ok: false,
      code: "GUARDRAIL",
      error: guardrails.blockers.join(" "),
    };
  }

  const result = await db.transaction(async (tx): Promise<SaveResult> => {
    let quoteId: string;
    let fxRate = newRate.mmkPerUnit;
    let fxDate = newRate.effectiveDate;
    let existing: Quotation | undefined;

    if (data.id) {
      const [row] = await tx
        .select()
        .from(quotations)
        .where(eq(quotations.id, data.id))
        .limit(1)
        .for("update");
      existing = row;

      if (!existing) {
        return { ok: false, code: "NOT_FOUND", error: "Quotation not found." };
      }
      if (existing.status !== "draft") {
        return {
          ok: false,
          code: "NOT_DRAFT",
          error: "Only draft quotations can be edited. Create a revision instead.",
        };
      }
      if (
        session.user.role !== "admin" &&
        existing.preparedBy &&
        existing.preparedBy !== session.user.id
      ) {
        return {
          ok: false,
          code: "FORBIDDEN",
          error: "This draft belongs to another user.",
        };
      }
      if (data.expectedUpdatedAt) {
        const expected = new Date(data.expectedUpdatedAt).getTime();
        if (expected !== existing.updatedAt.getTime()) {
          return {
            ok: false,
            code: "CONFLICT",
            error: "This quotation changed in another tab. Reload before saving.",
          };
        }
      }

      // FX is frozen for the life of the quote. Only re-resolve it when the
      // quote currency itself changes.
      if (existing.currency === data.currency) {
        fxRate = existing.fxRateMmkPerUnit;
        fxDate = existing.fxRateDate ?? newRate.effectiveDate;
      }

      await tx
        .update(quotations)
        .set({
          customerId: customer.id,
          customerSnapshot: customerSnapshot(customer),
          projectTitle: data.projectTitle || null,
          subject: data.subject || null,
          currency: data.currency,
          fxRateMmkPerUnit: fxRate,
          fxRateDate: fxDate,
          defaultTaxRate: data.defaultTaxRate,
          discountKind: data.discountKind,
          discountValue: data.discountValue,
          validUntil: data.validUntil ?? null,
          paymentTerms: data.paymentTerms ?? null,
          deliveryTerms: data.deliveryTerms ?? null,
          warrantyTerms: data.warrantyTerms ?? null,
          exclusions: data.exclusions ?? null,
          notes: data.notes ?? null,
        })
        .where(eq(quotations.id, existing.id));

      await tx.delete(quotationItems).where(eq(quotationItems.quotationId, existing.id));
      quoteId = existing.id;
    } else {
      const [settings] = await tx
        .select({ prefix: companySettings.quotePrefix })
        .from(companySettings)
        .where(eq(companySettings.id, 1))
        .limit(1);

      const numberResult = await tx.execute(
        sql`select next_doc_no('quotation', ${settings?.prefix ?? "VT-Q"}) as quote_no`,
      );
      const quoteNo = String(
        (numberResult.rows[0] as unknown as { quote_no: string }).quote_no,
      );

      const [inserted] = await tx
        .insert(quotations)
        .values({
          quoteNo,
          revision: 1,
          customerId: customer.id,
          customerSnapshot: customerSnapshot(customer),
          projectTitle: data.projectTitle || null,
          subject: data.subject || null,
          status: "draft",
          currency: data.currency,
          fxRateMmkPerUnit: fxRate,
          fxRateDate: fxDate,
          defaultTaxRate: data.defaultTaxRate,
          discountKind: data.discountKind,
          discountValue: data.discountValue,
          validUntil: data.validUntil ?? null,
          paymentTerms: data.paymentTerms ?? null,
          deliveryTerms: data.deliveryTerms ?? null,
          warrantyTerms: data.warrantyTerms ?? null,
          exclusions: data.exclusions ?? null,
          notes: data.notes ?? null,
          preparedBy: session.user.id,
        })
        .returning({ id: quotations.id });

      quoteId = inserted.id;
    }

    await tx.insert(quotationItems).values(
      lines.map((line, index) => ({
        quotationId: quoteId,
        position: index,
        productId: line.productId,
        sku: line.sku ?? null,
        name: line.name,
        description: line.description,
        unit: line.unit,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        discountPct: line.discountPct,
        taxRate: line.taxRate,
        costUnitMmk: line.costUnitMmk,
      })),
    );

    await tx.insert(quotationEvents).values({
      quotationId: quoteId,
      eventType: existing ? "updated" : "created",
      actorId: session.user.id,
      details: {
        currency: data.currency,
        lines: lines.length,
        grandTotal: totals.grandTotal.toFixed(2),
      },
    });

    return { ok: true, data: { id: quoteId } };
  });

  if (result.ok) {
    revalidatePath("/quotations");
    revalidatePath(`/quotations/${result.data.id}`);
  }
  return result;
}

const TRANSITIONS: Record<QuotationStatus, QuotationStatus[]> = {
  draft: ["sent", "cancelled"],
  sent: ["accepted", "rejected", "expired", "cancelled"],
  accepted: [],
  rejected: [],
  expired: [],
  cancelled: [],
};

export async function updateStatus(formData: FormData): Promise<void> {
  const session = await requireRole("sales", "admin");

  const id = String(formData.get("id") ?? "");
  const nextStatus = String(formData.get("status") ?? "") as QuotationStatus;
  const note = String(formData.get("note") ?? "").trim();

  if (!id || !quotationStatusEnum.enumValues.includes(nextStatus)) {
    redirect("/quotations?error=invalid-status");
  }

  const db = getDb();
  await db.transaction(async (tx) => {
    const [quote] = await tx
      .select()
      .from(quotations)
      .where(eq(quotations.id, id))
      .limit(1)
      .for("update");

    if (!quote) return;
    if (!TRANSITIONS[quote.status].includes(nextStatus)) return;

    const patch: Partial<typeof quotations.$inferInsert> = { status: nextStatus };
    if (nextStatus === "sent") patch.sentAt = new Date();
    if (nextStatus === "accepted") patch.acceptedAt = new Date();

    await tx.update(quotations).set(patch).where(eq(quotations.id, id));
    await tx.insert(quotationEvents).values({
      quotationId: id,
      eventType: nextStatus,
      actorId: session.user.id,
      details: { from: quote.status, to: nextStatus, note: note || null },
    });
  });

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
  redirect(`/quotations/${id}`);
}

/** Clones a quotation into the next revision and opens the draft editor. */
export async function createRevision(formData: FormData): Promise<void> {
  const session = await requireRole("sales", "admin");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/quotations");

  const db = getDb();
  const [source] = await db.select().from(quotations).where(eq(quotations.id, id)).limit(1);
  if (!source) redirect("/quotations");

  const sourceItems = await db
    .select()
    .from(quotationItems)
    .where(eq(quotationItems.quotationId, id))
    .orderBy(quotationItems.position);

  const [revisionRow] = await db
    .select({ revision: sql<number>`coalesce(max(${quotations.revision}), 0)::int` })
    .from(quotations)
    .where(eq(quotations.quoteNo, source.quoteNo));

  const revision = Number(revisionRow?.revision ?? source.revision) + 1;
  const rate = await getLatestFxRate(source.currency);

  const newId = await db.transaction(async (tx) => {
    const [inserted] = await tx
      .insert(quotations)
      .values({
        quoteNo: source.quoteNo,
        revision,
        parentId: source.id,
        customerId: source.customerId,
        customerSnapshot: source.customerSnapshot,
        projectTitle: source.projectTitle,
        subject: source.subject,
        status: "draft",
        currency: source.currency,
        fxRateMmkPerUnit: rate?.mmkPerUnit ?? source.fxRateMmkPerUnit,
        fxRateDate: rate?.effectiveDate ?? source.fxRateDate,
        defaultTaxRate: source.defaultTaxRate,
        discountKind: source.discountKind,
        discountValue: source.discountValue,
        validUntil: source.validUntil,
        paymentTerms: source.paymentTerms,
        deliveryTerms: source.deliveryTerms,
        warrantyTerms: source.warrantyTerms,
        exclusions: source.exclusions,
        notes: source.notes,
        preparedBy: session.user.id,
      })
      .returning({ id: quotations.id });

    if (sourceItems.length > 0) {
      await tx.insert(quotationItems).values(
        sourceItems.map((item) => ({
          quotationId: inserted.id,
          position: item.position,
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountPct: item.discountPct,
          taxRate: item.taxRate,
          costUnitMmk: item.costUnitMmk,
        })),
      );
    }

    await tx.insert(quotationEvents).values({
      quotationId: inserted.id,
      eventType: "revised",
      actorId: session.user.id,
      details: { fromId: source.id, revision },
    });

    return inserted.id;
  });

  revalidatePath("/quotations");
  redirect(`/quotations/${newId}/edit`);
}

export async function deleteDraft(formData: FormData): Promise<void> {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/quotations");

  await getDb()
    .delete(quotations)
    .where(and(eq(quotations.id, id), eq(quotations.status, "draft")));

  revalidatePath("/quotations");
  redirect("/quotations");
}
