// The titles of the tests a file really declares, read by parsing it with the project's own TypeScript. What counts is
// PERMITTED, not what is forbidden, because every list of bad shapes had one more (a comment, a string, a helper of the
// same name, a .bind): a call to `it` or `test` IMPORTED FROM "vitest" in this file — renamed on import is fine, and so
// are Vitest's own modifiers (MODIFIERS below) — whose first argument is a plain string. Nothing else counts, and that rejects some safe
// code on purpose:
//   - a global `it` / `test` (not imported): the file can redefine or reassign a global and nothing here can tell;
//   - a name imported from vitest that the file also declares anywhere else (a parameter, a local, a function);
//   - a title built at run time (it.each, a template with ${…}, a variable): nothing can tell what it will say.
//
//   node test-titles.mjs <file>   prints the titles as a JSON array
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const TEST_FUNCTIONS = new Set(["it", "test"]);
const VITEST = "vitest";

function loadTypeScript() {
  const typescript = (() => {
    try {
      return createRequire(path.join(process.cwd(), "package.json"))("typescript");
    } catch {
      console.error("the project has no typescript to read its tests with (add it as a dev dependency)");
      process.exit(1);
    }
  })();
  if (typeof typescript.createSourceFile !== "function") {
    console.error(
      `the project's typescript ${typescript.version} has no compiler API to read its tests with (TypeScript 7 ships none); keep it at 6: yarn add -D typescript@^6`,
    );
    process.exit(1);
  }
  return typescript;
}

const ts = loadTypeScript();

// Every name the file declares, with how many times: a parameter, a variable (destructured ones too), a function, a
// class, an import. A declaration anywhere counts, whatever scope it is in.
function declarationCounts(source) {
  const counts = new Map();
  const visit = (node) => {
    const parent = node.parent;
    const declares =
      ts.isIdentifier(node) &&
      parent !== undefined &&
      parent.name === node &&
      (ts.isVariableDeclaration(parent) ||
        ts.isBindingElement(parent) ||
        ts.isParameter(parent) ||
        ts.isFunctionDeclaration(parent) ||
        ts.isFunctionExpression(parent) ||
        ts.isClassDeclaration(parent) ||
        ts.isClassExpression(parent) ||
        ts.isEnumDeclaration(parent) ||
        ts.isImportSpecifier(parent) ||
        ts.isImportClause(parent) ||
        ts.isNamespaceImport(parent) ||
        ts.isImportEqualsDeclaration(parent));
    if (declares) counts.set(node.text, (counts.get(node.text) ?? 0) + 1);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return counts;
}

// The local names bound to vitest's `it` / `test` by an `import { … } from "vitest"` in this file.
function vitestTestNames(source) {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== VITEST) return [];
    const bindings = statement.importClause?.namedBindings;
    if (bindings === undefined || !ts.isNamedImports(bindings) || statement.importClause.isTypeOnly) return [];
    return bindings.elements
      .filter((element) => !element.isTypeOnly && TEST_FUNCTIONS.has((element.propertyName ?? element.name).text))
      .map((element) => element.name.text);
  });
}

// Vitest's own modifiers a test call may carry. Anything else on the way — .bind, .call, .apply, .each — is not a test
// declaration whose first argument is its title, so it does not count.
const MODIFIERS = new Set(["only", "skip", "todo", "concurrent", "sequential", "fails"]);

// The identifier a callee is rooted at: `it` in `it(…)`, `it.only(…)`, `it.skip.concurrent(…)`; nothing for anything else.
function rootOf(expression) {
  if (ts.isIdentifier(expression)) return expression;
  return ts.isPropertyAccessExpression(expression) && MODIFIERS.has(expression.name.text) ? rootOf(expression.expression) : null;
}

function titlesIn(source) {
  const counts = declarationCounts(source);
  // Imported from vitest, and declared nowhere else in the file: the import is its only declaration.
  const permitted = new Set(vitestTestNames(source).filter((name) => counts.get(name) === 1));
  const titles = [];
  const visit = (node) => {
    const root = ts.isCallExpression(node) ? rootOf(node.expression) : null;
    const [first] = root === null ? [] : node.arguments;
    if (root !== null && permitted.has(root.text) && first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) titles.push(first.text);
    ts.forEachChild(node, visit);
  };
  visit(source);
  return titles;
}

const file = process.argv[2];
if (!file || !existsSync(file)) {
  process.stdout.write("[]");
} else {
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  process.stdout.write(JSON.stringify(titlesIn(source)));
}
