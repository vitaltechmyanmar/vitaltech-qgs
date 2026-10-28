import { requireRole } from "@/lib/session";
import { QuoteEditor } from "../quote-editor";
import { getEditorReference } from "../editor-data";

export const dynamic = "force-dynamic";
export const metadata = { title: "New quotation" };

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string | string[] }>;
}) {
  const session = await requireRole("sales", "admin");
  const params = await searchParams;
  const reference = await getEditorReference();
  const presetCustomerId =
    typeof params.customer === "string" &&
    reference.editorCustomers.some((customer) => customer.id === params.customer)
      ? params.customer
      : undefined;

  return (
    <QuoteEditor
      mode="create"
      customers={reference.editorCustomers}
      products={reference.editorProducts}
      defaults={reference.defaults}
      fxRates={reference.fxRates}
      isAdmin={session.user.role === "admin"}
      taxLabel={reference.company.taxLabel}
      presetCustomerId={presetCustomerId}
    />
  );
}
