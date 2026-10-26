// Almacén en memoria por instancia (MVP): archivos generados por proyecto.
// /code lee por usuario; /preview lee el último generado (compartido).
const files = new Map<string, string>();
const key = (owner: string, project: string, path: string) => `${owner}\n${project}\n${path}`;
export function putFile(owner: string, project: string, path: string, content: string): void {
  files.set(key(owner, project, path), content);
}
export function getFile(owner: string, project: string, path: string): string | null {
  return files.get(key(owner, project, path)) ?? null;
}
export function getSharedFile(project: string, path: string): string | null {
  return getFile('__shared__', project, path);
}
