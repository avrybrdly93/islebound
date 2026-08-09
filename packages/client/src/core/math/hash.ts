/**
 * FNV-1a hashing (BL-004).
 *
 * Two callers are already specified and both are load-bearing: `04` §4.2's
 * `worldHash()` ("FNV-1a over a canonical serialisation", the thing that makes
 * `pnpm sim --assert-hash` a real determinism test) and `23`'s save checksum.
 * A third is `17`'s uniform grid hash for socket queries.
 *
 * **FNV-1a and not something stronger**, deliberately. None of these uses is
 * adversarial: nothing here defends against a crafted collision, only against
 * an *accidental* one between two world states that differ. FNV-1a is a few
 * lines, has no dependency, and — the property that actually matters for this
 * project — is trivially identical on every machine, which a hash pulled from
 * a library is only as long as the library version is pinned.
 *
 * ## The 32-bit discipline
 *
 * JavaScript numbers are doubles, so a naive `hash * PRIME` loses the low bits
 * the moment the product passes 2⁵³ and the result stops being FNV at all
 * while still looking like a hash. Every multiply here goes through
 * `Math.imul`, which is defined to be exact 32-bit signed multiplication, and
 * every returned value goes through `>>> 0` to land in the unsigned range.
 * The mix helpers are written the same way for the same reason.
 */

/** FNV-1a 32-bit offset basis. */
export const FNV_OFFSET_BASIS = 0x811c9dc5;

/** FNV-1a 32-bit prime, 16777619. */
const FNV_PRIME = 0x01000193;

/**
 * Folds one byte into a running hash.
 *
 * Exported because callers hashing something that is neither a string nor a
 * word — a typed array, a bitfield — need the primitive, and re-deriving the
 * `imul`/`>>> 0` discipline at each site is how one of them ends up subtly
 * different from the others.
 */
export function hashByte(hash: number, byte: number): number {
  return Math.imul((hash ^ (byte & 0xff)) >>> 0, FNV_PRIME) >>> 0;
}

/**
 * Folds a string into a running hash, one **UTF-16 code unit** at a time as
 * two bytes, low byte first.
 *
 * Code units rather than UTF-8 bytes: it avoids an encoder, it is exactly
 * reproducible from the JS string alone, and it treats a surrogate pair as its
 * two halves, which hashes consistently even though it is not "characters".
 * Content ids are ASCII (`item.pine_plank`), so in practice the high byte is
 * always zero — but folding it in anyway is what keeps a non-ASCII player name
 * from colliding with a truncated one.
 */
export function hashStringInto(hash: number, value: string): number {
  let h = hash;
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    h = hashByte(h, unit & 0xff);
    h = hashByte(h, unit >>> 8);
  }
  return h;
}

/** Folds a 32-bit word into a running hash, four bytes, little-endian. */
export function hashU32Into(hash: number, value: number): number {
  const word = value >>> 0;
  let h = hashByte(hash, word & 0xff);
  h = hashByte(h, (word >>> 8) & 0xff);
  h = hashByte(h, (word >>> 16) & 0xff);
  h = hashByte(h, (word >>> 24) & 0xff);
  return h;
}

/**
 * Folds an arbitrary finite number into a running hash, by its **IEEE-754
 * bits** rather than by its decimal form.
 *
 * Hashing `String(value)` would be shorter and wrong in a way that only shows
 * up late: `-0` and `0` stringify identically but are different states, and
 * `0.1 + 0.2` stringifies to `0.30000000000000004` in every engine but that is
 * a guarantee about `toString`, not about the value. Bits are the state.
 *
 * `NaN` is folded as a single canonical quiet NaN, because JS exposes several
 * bit patterns for it and none of them is a distinguishable game state.
 */
export function hashNumberInto(hash: number, value: number): number {
  if (Number.isNaN(value)) return hashU32Into(hashU32Into(hash, 0x7ff80000), 0);
  scratchView.setFloat64(0, value, true);
  return hashU32Into(
    hashU32Into(hash, scratchView.getUint32(0, true)),
    scratchView.getUint32(4, true),
  );
}

/**
 * One module-level scratch buffer for {@link hashNumberInto}'s bit extraction.
 *
 * Module scope, not per call: `hashNumberInto` runs once per float in the
 * world state on every `worldHash()`, and allocating an eight-byte buffer each
 * time would make the determinism check the largest allocator in the build.
 * This is the "scratch objects at module scope" rule from CLAUDE.md, and it is
 * safe here because the module is single-threaded (a worker gets its own
 * module instance) and nothing yields between the write and the two reads.
 */
const scratchView = new DataView(new ArrayBuffer(8));

/** FNV-1a of a string, as an unsigned 32-bit integer. */
export function hashString(value: string): number {
  return hashStringInto(FNV_OFFSET_BASIS, value);
}

/** FNV-1a of a 32-bit word. */
export function hashU32(value: number): number {
  return hashU32Into(FNV_OFFSET_BASIS, value);
}

/**
 * FNV-1a of a sequence of 32-bit words, without allocating an array.
 *
 * This is the shape `rngFor(purpose, ...ints)` (BL-005) needs for a stream
 * seed and `17` needs for a grid-cell key, so the argument list is fixed at
 * three with defaults rather than being a rest parameter — a rest parameter
 * allocates an array per call, which the zero-allocation rule forbids on a
 * path called per entity per tick.
 */
export function hashWords(a: number, b = 0, c = 0): number {
  return hashU32Into(hashU32Into(hashU32Into(FNV_OFFSET_BASIS, a), b), c);
}

/**
 * Renders a hash as eight lowercase hex digits.
 *
 * Fixed width, so hashes line up in a log and a leading-zero hash is not
 * silently shorter than the others — which is how "the hash changed" gets
 * misread as "the hash is malformed".
 */
export function hashToHex(hash: number): string {
  return (hash >>> 0).toString(16).padStart(8, '0');
}
