export function parseLnkStrings(buf: Buffer): {
  flags: number;
  strings: {
    name: string;
    relativePath: string;
    workingDir: string;
    arguments: string;
    iconLocation: string;
  };
  extraOffset: number;
};
export function patchLnkUnicodeStrings(
  path: string,
  updates: {
    argumentsText?: string;
    workingDir?: string;
    description?: string;
  },
): void;
