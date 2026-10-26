// Extrae el HTML de la respuesta del modelo: bloque ```html, o el HTML
// crudo desde su primera etiqueta (ignora la prosa que lo rodee).
export function extractHtml(content: string): string | null {
  const fenced = content.match(/```html\s*([\s\S]*?)```/i) || content.match(/```\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const idx = content.search(/<!DOCTYPE|<html/i);
  if (idx >= 0) return content.slice(idx).trim();
  return null;
}
