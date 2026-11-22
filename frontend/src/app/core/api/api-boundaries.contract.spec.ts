import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
const root = join(__dirname, '..', '..');
function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const file = join(dir, name);
    return statSync(file).isDirectory() ? files(file) : file.endsWith('.ts') && !file.endsWith('.spec.ts') ? [file] : [];
  });
}
describe('fronteras de adaptadores', () => {
  it('ninguna pantalla usa HttpClient directamente', () => {
    const violations = files(join(root, 'features')).filter(file => /\bHttpClient\b/.test(readFileSync(file, 'utf8'))).map(file => relative(root, file));
    expect(violations).toEqual([]);
  });
});
