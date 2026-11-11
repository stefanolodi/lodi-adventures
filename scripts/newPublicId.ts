import { randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const NAME_LENGTH = 20;

// The name must not be guessable from the old URL, so it comes from a CSPRNG. See ADR 0005.
export function newPublicId(oldPublicId: string): string {
  const folder = oldPublicId.slice(0, oldPublicId.lastIndexOf('/') + 1);
  let name = '';
  for (let i = 0; i < NAME_LENGTH; i++) {
    name += ALPHABET[randomInt(ALPHABET.length)];
  }
  return folder + name;
}
