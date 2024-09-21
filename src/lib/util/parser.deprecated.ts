import { validate } from 'compare-versions';
import { marked, Tokens } from 'marked';

interface DependencyEntryValue {
  [dependencyName: string]: string;
}

interface DependencyEntry {
  versions: string[];
  dependencies: DependencyEntryValue;
}

interface DependencyInfo {
  name: string;
  version: string;
}

// matches versions with the special characters ^, *, <, <=, >, >=, = and ranges between two versions connected by -
const VALIDATE_VERSION_REGEX = /((\^|\*|<|<=|>|>=|=)?\d+\.?\d*\.?\d*)(\s*-\s*((\^|\*|<|<=|>|>=|=)?\d+\.?\d*\.?\d*)|$)/;

/**
 * Parse UCS2 encoded console output file.
 * Can be created by running Powershell Out-Dir command with "npm/pnpm install".
 * @param output Content of the output file.
 * @deprecated
 */
export function parseConsoleOutput(output: string) {
  const dependencyInfos: DependencyInfo[] = [];

  [...output.matchAll(/^((?!missing peer).)+(\r\n|\n)(?=.*missing peer.*)/gm)]
    .map((match) => match[0].trim().replace('\r', '').replace('\n', ''))
    .forEach((match) => {
      const splits = match.split(' ');
      dependencyInfos.push({ version: splits.pop(), name: splits.pop() });
    });

  return dependencyInfos;
}

/**
 * Parses a markdown file for dependency matrices and returns a list of dependency entries.
 * @param markdown The string of the markdown file.
 * @param packageName Name of the package to find dependencies for.
 * @deprecated
 */
export function parseMarkdown(markdown: string, packageName: string): DependencyEntry[] {
  const tokens = marked.lexer(markdown);
  const packageNameShortened = packageName.split('/').pop();

  let foundDependencyToken = false;
  let tableToken: Tokens.Table;

  for (const token of tokens) {
    if (token.type === 'heading' && ['dependencies', 'versions'].includes(token.text.toLowerCase())) {
      foundDependencyToken = true;
      continue;
    }

    if (foundDependencyToken && token.type === 'table') {
      tableToken = token as Tokens.Table;
      break;
    }
  }

  const dependencyEntries: DependencyEntry[] = [];
  const headers = tableToken.header?.map((h) => h.text);
  const packageRowIndex = tableToken.header?.findIndex((h) => h.text === packageName || h.text === packageNameShortened);
  if (packageRowIndex === -1) {
    return dependencyEntries;
  }
  for (const row of tableToken.rows) {
    const entryValue: DependencyEntryValue = {};
    for (let i = 0; i < headers.length; i++) {
      if (i !== packageRowIndex && (validate(row[i].text) || VALIDATE_VERSION_REGEX.test(row[i].text.trim()))) {
        entryValue[headers[i]] = row[i].text;
      }
    }
    dependencyEntries.push({
      versions: row[packageRowIndex].text.split(',').map((v) => v.trim()),
      dependencies: entryValue,
    });
  }

  return dependencyEntries;
}
