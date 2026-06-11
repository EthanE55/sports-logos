export const UA =
  'sports-logos/0.1 (https://github.com/designer/sports-logos; local dev) Mozilla/5.0';

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
