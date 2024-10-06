export const exclude = (excludedPackage: string) => {
  const regexPrefix = '^(@[a-z0-9-~][a-z0-9-._~]*\\/)';
  const regexOne = '[a-z0-9-~][a-z0-9-._~]*$';
  const regexMany = '\\*$';
  let regexResult: string;
  if (new RegExp(`${regexPrefix}?${regexOne}`).test(excludedPackage)) {
    regexResult = excludedPackage;
  } else if (new RegExp(`${regexPrefix}?${regexMany}`).test(excludedPackage)) {
    const prefix = new RegExp(regexPrefix).exec(excludedPackage)?.[0] ?? '';
    regexResult = `^${prefix}${regexOne}`;
  }
  return regexResult;
};
