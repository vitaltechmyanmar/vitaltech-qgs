import { notFound, redirect } from "next/navigation";
import { getQuotationDetail } from "@/lib/db/queries";
import { requireRole } from "@/lib/session";
import { QuoteEditor } from "../../quote-editor";
import { getEditorReference, toEditorQuote } from "../../editor-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "Edit quotation" };

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await requireRole("sales", "admin");
  const { id } = await params;
  const detail = await getQuotationDetail(id);
  if (!detail) notFound();

  if (detail.quote.status !== "draft") {
    redirect(`/quotations/${id}`);
  }
  if (
    session.user.role !== "admin" &&
    detail.quote.preparedBy &&
    detail.quote.preparedBy !== session.user.id
  ) {
    redirect(`/quotations/${id}?error=owner`);
  }

  const reference = await getEditorReference();

  return (
    <QuoteEditor
      mode="edit"
      quote={toEditorQuote(detail)}
      customers={reference.editorCustomers}
      products={reference.editorProducts}
      defaults={reference.defaults}
      fxRates={reference.fxRates}
      isAdmin={session.user.role === "admin"}
      taxLabel={reference.company.taxLabel}
    />
  );
}
