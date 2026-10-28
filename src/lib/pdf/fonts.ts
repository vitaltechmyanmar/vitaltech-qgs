import { readFile } from "node:fs/promises";
import path from "node:path";

type FontCss = { css: string };

let cached: Promise<FontCss> | null = null;

async function load(): Promise<FontCss> {
  const dir = path.join(process.cwd(), "public", "fonts");
  const [inter, noto, padauk] = await Promise.all([
    readFile(path.join(dir, "Inter.ttf")),
    readFile(path.join(dir, "NotoSansMyanmar.ttf")),
    readFile(path.join(dir, "Padauk-Regular.ttf")),
  ]);

  const css = `
@font-face {
  font-family: "Inter";
  src: url(data:font/ttf;base64,${inter.toString("base64")}) format("truetype");
  font-weight: 100 900;
  font-style: normal;
}
@font-face {
  font-family: "Noto Sans Myanmar";
  src: url(data:font/ttf;base64,${noto.toString("base64")}) format("truetype");
  font-weight: 100 900;
  font-style: normal;
}
@font-face {
  font-family: "Padauk";
  src: url(data:font/ttf;base64,${padauk.toString("base64")}) format("truetype");
  font-weight: 400;
  font-style: normal;
}
`;

  return { css };
}

export function getFontCss(): Promise<FontCss> {
  if (!cached) cached = load();
  return cached;
}
