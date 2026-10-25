import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import sharp from "sharp";
import { DetailOutline } from "@/components/detail-outline";
it("keeps the inside of a ring-shaped mask transparent", async () => {
  const svg = renderToStaticMarkup(
    createElement(DetailOutline, {
      outline: {
        path: "M0,0L1000,0L1000,1000L0,1000ZM250,250L750,250L750,750L250,750Z",
      },
    }),
  );
  const { data, info } = await sharp(
    Buffer.from(svg.replace("<svg", '<svg width="100" height="100"')),
  )
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  expect(data[(50 * info.width + 50) * 4 + 3]).toBe(0);
  expect(data[(10 * info.width + 10) * 4 + 3]).toBeGreaterThan(0);
});
