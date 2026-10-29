"use client";

import Link from "next/link";
import { deleteProduct, setProductActive } from "./actions";

const small = "px-2 py-1 text-xs";

export function ProductRowActions({
  productId,
  name,
  isActive,
}: {
  productId: string;
  name: string;
  isActive: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Link href={`/products/${productId}/edit`} className={`btn-secondary ${small}`}>
        Edit
      </Link>
      <form action={setProductActive}>
        <input type="hidden" name="id" value={productId} />
        <input type="hidden" name="active" value={isActive ? "false" : "true"} />
        <button type="submit" className={`btn-secondary ${small}`}>
          {isActive ? "Deactivate" : "Activate"}
        </button>
      </form>
      <form
        action={deleteProduct}
        onSubmit={(event) => {
          const message = `Delete ${name}? Products used by quotations must be deactivated instead.`;
          if (!window.confirm(message)) event.preventDefault();
        }}
      >
        <input type="hidden" name="id" value={productId} />
        <button type="submit" className={`btn-danger ${small}`}>
          Delete
        </button>
      </form>
    </div>
  );
}
