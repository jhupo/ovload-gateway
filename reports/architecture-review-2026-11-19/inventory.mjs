import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'

const root = process.cwd()
const require = createRequire(path.join(root, 'web/package.json'))
const ts = require('typescript')
const files = execFileSync('rg', ['--files', 'web/src', 'src', '-g', '*.ts', '-g', '*.tsx', '-g', '*.rs'], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 })
  .trim().split(/\r?\n/).map(file => file.replaceAll('\\', '/'))
const frontend = files.filter(file => file.startsWith('web/src/') && !file.endsWith('.test.ts') && !file.endsWith('.test.tsx') && !file.endsWith('routeTree.gen.ts'))
const frontendSet = new Set(frontend)
const records = []
const imports = []
const featureImports = []
const lowerLayerFeatureImports = []
const tableOwners = []
const graph = new Map(frontend.map(file => [file, []]))

function resolve(from, specifier) {
  const base = specifier.startsWith('@/')
    ? 'web/src/' + specifier.slice(2)
    : specifier.startsWith('.')
      ? path.posix.normalize(path.posix.join(path.posix.dirname(from), specifier))
      : undefined
  return base && [base, base + '.ts', base + '.tsx', base + '/index.ts', base + '/index.tsx'].find(file => frontendSet.has(file))
}

for (const file of frontend) {
  const source = fs.readFileSync(file, 'utf8')
  records.push({ file, lines: source.split('\n').length })
  const syntax = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true)
  if (/useReactTable\s*\(/.test(source)) tableOwners.push(file)
  for (const node of syntax.statements) {
    if (!(ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue
    const target = resolve(file, node.moduleSpecifier.text)
    if (!target) continue
    const typeOnly = Boolean(node.isTypeOnly || node.importClause?.isTypeOnly)
    const line = syntax.getLineAndCharacterOfPosition(node.getStart(syntax)).line + 1
    const edge = { from: file, to: target, line, typeOnly }
    imports.push(edge)
    graph.get(file).push(target)
    const owner = file.match(/^web\/src\/features\/([^/]+)/)?.[1]
    const dependency = target.match(/^web\/src\/features\/([^/]+)/)?.[1]
    if (owner && dependency && owner !== dependency) featureImports.push(edge)
    if (!owner && dependency) lowerLayerFeatureImports.push(edge)
  }
}

let next = 0
const indices = new Map()
const low = new Map()
const stack = []
const active = new Set()
const cycles = []
function visit(file) {
  indices.set(file, next)
  low.set(file, next++)
  stack.push(file)
  active.add(file)
  for (const target of graph.get(file)) {
    if (!indices.has(target)) {
      visit(target)
      low.set(file, Math.min(low.get(file), low.get(target)))
    } else if (active.has(target)) low.set(file, Math.min(low.get(file), indices.get(target)))
  }
  if (indices.get(file) !== low.get(file)) return
  const component = []
  let target
  do {
    target = stack.pop()
    active.delete(target)
    component.push(target)
  } while (target !== file)
  if (component.length > 1) cycles.push(component.sort())
}
for (const file of frontend) if (!indices.has(file)) visit(file)

const rust = files.filter(file => file.endsWith('.rs') && !file.includes('/tests/') && !file.includes('/examples/'))
const rustMetrics = rust.map(file => ({ file, lines: fs.readFileSync(file, 'utf8').split('\n').length }))
const metadata = JSON.parse(execFileSync('cargo', ['metadata', '--offline', '--locked', '--no-deps', '--format-version', '1'], {
  encoding: 'utf8', maxBuffer: 8 * 1024 * 1024,
}))
const members = metadata.packages.filter(pkg => metadata.workspace_members.includes(pkg.id))
const memberNames = new Set(members.map(pkg => pkg.name))
const backendCrates = members.map(pkg => ({
  name: pkg.name,
  manifest: path.relative(root, pkg.manifest_path).replaceAll('\\', '/'),
  dependencies: pkg.dependencies.filter(dep => dep.kind === null && memberNames.has(dep.name)).map(dep => dep.name).sort(),
})).sort((a, b) => a.name.localeCompare(b.name))
const folderTotals = new Map()
for (const file of frontend) {
  const feature = file.match(/^web\/src\/features\/([^/]+)/)?.[1]
  if (feature) folderTotals.set(feature, (folderTotals.get(feature) ?? 0) + 1)
}
const result = {
  generatedAt: new Date().toISOString(),
  repository: root,
  scope: 'Current working tree, including untracked source. Generated routes and frontend tests excluded from the import graph. Static import/export edges include type-only imports; they are not all runtime cycles. Rust counts include inline tests.',
  frontendFiles: frontend.length,
  featureCount: folderTotals.size,
  rustProductionFiles: rust.length,
  backendCrates,
  internalFrontendImports: imports.length,
  crossFeatureImports: featureImports,
  lowerLayerFeatureImports,
  importStronglyConnectedComponents: cycles,
  tableOwners,
  largestFrontendFiles: records.sort((a, b) => b.lines - a.lines).slice(0, 18),
  largestRustProductionFiles: rustMetrics.sort((a, b) => b.lines - a.lines).slice(0, 14),
  features: [...folderTotals].map(([name, files]) => ({ name, files })).sort((a, b) => b.files - a.files),
}
const output = path.join(root, 'reports/architecture-review-2026-11-19/inventory.json')
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n')
console.log(JSON.stringify({ frontendFiles: result.frontendFiles, featureCount: result.featureCount, rustProductionFiles: result.rustProductionFiles, crossFeatureImports: featureImports.length, lowerLayerFeatureImports: lowerLayerFeatureImports.length, stronglyConnectedComponents: cycles.length, tableOwners: tableOwners.length, largestFrontendFiles: result.largestFrontendFiles.slice(0, 8) }, null, 2))
