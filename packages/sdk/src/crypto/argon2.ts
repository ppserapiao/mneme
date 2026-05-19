import { argon2id } from '@noble/hashes/argon2.js'

/**
 * Argon2id parameters for master-key derivation. Defaults follow the OWASP
 * 2024+ recommendation for interactive use on consumer hardware (64 MiB
 * memory, 3 iterations, 4 lanes). Tunable for stronger or weaker hardware.
 *
 * Outputs a 32-byte key suitable for AES-256-GCM.
 */
export type KdfParams = {
  /** Memory cost in KiB. Defaults to 65 536 (64 MiB). */
  memoryKiB: number
  /** Time cost — number of passes. Defaults to 3. */
  iterations: number
  /** Parallelism — number of lanes. Defaults to 4. */
  parallelism: number
  /** Derived key length in bytes. Defaults to 32 (256 bits). */
  outputLength: number
}

export const DEFAULT_KDF_PARAMS: Readonly<KdfParams> = Object.freeze({
  memoryKiB: 64 * 1024,
  iterations: 3,
  parallelism: 4,
  outputLength: 32,
})

/**
 * Derive a master key from a passphrase and salt using Argon2id.
 *
 * The same `(passphrase, salt, params)` MUST always produce the same key —
 * this is what lets us re-derive the master key on subsequent opens.
 */
export function deriveMasterKey(
  passphrase: string,
  salt: Uint8Array,
  params: KdfParams = DEFAULT_KDF_PARAMS,
): Uint8Array {
  return argon2id(passphrase, salt, {
    t: params.iterations,
    m: params.memoryKiB,
    p: params.parallelism,
    dkLen: params.outputLength,
  })
}
