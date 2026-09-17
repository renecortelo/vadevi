const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encode(value: bigint, length: number): string {
  let output = "";
  for (let index = 0; index < length; index += 1) {
    output = alphabet[Number(value & 31n)]! + output;
    value >>= 5n;
  }
  return output;
}

export function createUlid(timestamp = Date.now()): string {
  const random = crypto.getRandomValues(new Uint8Array(10));
  let randomValue = 0n;
  for (const byte of random) randomValue = (randomValue << 8n) | BigInt(byte);
  return `${encode(BigInt(timestamp), 10)}${encode(randomValue, 16)}`;
}
