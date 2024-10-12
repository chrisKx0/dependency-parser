/**
 * creates a regex that matches one or many packages
 * @param packageNameOrPattern name or pattern (e.g. @nx/*) of the package
 */
export const getPackageRegex = (packageNameOrPattern: string) => {
  const regexPrefix = '^(@[a-z0-9-~][a-z0-9-._~]*\\/)';
  const regexOne = '[a-z0-9-~][a-z0-9-._~]*$';
  const regexMany = '\\*$';
  let regexResult: string;
  if (new RegExp(`${regexPrefix}?${regexOne}`).test(packageNameOrPattern)) {
    // return name of the package as regex, if it matches the regex for only a single package
    regexResult = packageNameOrPattern;
  } else if (new RegExp(`${regexPrefix}?${regexMany}`).test(packageNameOrPattern)) {
    // return regex composed of the packages prefix (e.g. @nx/) and the regex for a single package
    // if the package name matches the regex for many packages (e.g. @nx/*)
    const prefix = new RegExp(regexPrefix).exec(packageNameOrPattern)?.[0] ?? '';
    regexResult = `^${prefix}${regexOne}`;
  }
  return regexResult;
};
