import { auth } from "@/lib/auth";
import { getCompanySettings, getQuotationDetail } from "@/lib/db/queries";
import { getFontCss } from "@/lib/pdf/fonts";
import { renderPdf } from "@/lib/pdf/render";
import { buildQuotationHtml } from "@/lib/pdf/template";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { id } = await context.params;
  const detail = await getQuotationDetail(id);
  if (!detail) {
    return new Response("Quotation not found", { status: 404 });
  }

  try {
    const [company, fonts] = await Promise.all([getCompanySettings(), getFontCss()]);
    const html = await buildQuotationHtml(detail, company, fonts.css);
    const pdf = await renderPdf(html);

    const download = new URL(request.url).searchParams.get("download") === "1";
    const filename = `${detail.quote.quoteNo}-rev${detail.quote.revision}.pdf`;

    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Length": String(pdf.length),
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("[pdf] render failed", { quotationId: id, error });
    return new Response("PDF generation failed", { status: 500 });
  }
}
