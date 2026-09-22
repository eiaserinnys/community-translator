import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export class BearerTokenVerifier {
  private readonly expectedDigest: Buffer;

  constructor(token: string) {
    if (token.length === 0) {
      throw new Error("Bearer token is required.");
    }
    this.expectedDigest = digest(token);
  }

  accepts(authorization: string | undefined): boolean {
    const match = authorization?.match(/^Bearer ([^\s]+)$/iu);
    if (!match?.[1]) {
      return false;
    }
    // Both sides are fixed-length digests, so the comparison time does not leak
    // how many leading characters of the presented token were correct.
    return timingSafeEqual(this.expectedDigest, digest(match[1]));
  }
}
