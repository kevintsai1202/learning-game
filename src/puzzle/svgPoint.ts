/**
 * 把畫面上的點（clientX、clientY）換成 SVG 的座標（找不同、七巧板共用）。
 * 用 getScreenCTM 換算，SVG 怎麼縮放、置中留白都對得上。
 */
export function svgPoint(svg: SVGSVGElement, clientX: number, clientY: number): { x: number; y: number } {
  const m = svg.getScreenCTM();
  if (!m) return { x: -1, y: -1 };
  const p = new DOMPoint(clientX, clientY).matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}
