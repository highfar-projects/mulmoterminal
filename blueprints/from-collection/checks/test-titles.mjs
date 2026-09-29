// The titles of the tests a file really declares: the first argument of each it(…) / test(…) call — with modifiers such
// as it.only, test.skip or it.concurrent — when that argument is a plain string. Read by parsing the file with the
// project's own TypeScript, so a title in a comment, in a string, or in a call that is not a test is not a test.
// Deliberately narrow: a title built at run time (it.each, a template with ${…}, a variable) is not counted either,
// because nothing can tell from the text what it will say.
//
//   node test-titles.mjs <file>   prints the titles as a JSON array
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const TEST_FUNCTIONS = new Set(["it", "test"]);

function loadTypeScript() {
  try {
    return createRequire(path.join(process.cwd(), "package.json"))("typescript");
  } catch {
    console.error("the project has no typescript to read its tests with (add it as a dev dependency)");
    process.exit(1);
  }
}

const ts = loadTypeScript();

// `it`, `test`, or a chain of property accesses rooted at one of them (`it.only`, `test.skip.each` is not a call title).
function isTestCallee(expression) {
  if (ts.isIdentifier(expression)) return TEST_FUNCTIONS.has(expression.text);
  return ts.isPropertyAccessExpression(expression) && isTestCallee(expression.expression);
}

function titlesIn(source) {
  const titles = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && isTestCallee(node.expression)) {
      const [first] = node.arguments;
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) titles.push(first.text);
    }
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
