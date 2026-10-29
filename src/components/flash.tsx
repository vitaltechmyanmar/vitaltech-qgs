export function Flash({
  tone,
  children,
}: {
  tone: "success" | "error";
  children: React.ReactNode;
}) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={
        tone === "error"
          ? "rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
          : "rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700"
      }
    >
      {children}
    </p>
  );
}
