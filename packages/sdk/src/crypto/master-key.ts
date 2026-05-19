import { DEFAULT_KDF_PARAMS, type KdfParams, deriveMasterKey } from './argon2'
import { type EncryptResult, decrypt, encrypt, randomBytes } from './envelope'

const SALT_LENGTH_BYTES = 16
const VERIFIER_PLAINTEXT = new TextEncoder().encode('mneme-master-key-verifier-v1')

/**
 * Persisted metadata describing how the master key for a store was derived.
 * Written to the `crypto_metadata` SQLite row on first encrypted use; read
 * back on every subsequent open.
 */
export type MasterKeyMeta = {
  salt: Uint8Array
  verifier: EncryptResult
  kdfParams: KdfParams
}

/**
 * The master key for an encrypted mneme store. Wraps per-record data keys
 * with AES-256-GCM (key-wrapping) and is itself derived from a passphrase
 * via Argon2id.
 *
 * The key bytes are kept in this instance for the lifetime of the store.
 * Future work will zero them on close; v0.0.3 trusts the runtime GC.
 */
export class MasterKey {
  private constructor(private readonly key: Uint8Array) {}

  /**
   * Initialise a NEW master key for a fresh store. Generates a random salt,
   * derives the key from `passphrase`, and seals a verifier plaintext that
   * subsequent opens use to detect a wrong passphrase before doing any
   * record decryption.
   */
  static async initialise(
    passphrase: string,
    kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
  ): Promise<{ masterKey: MasterKey; meta: MasterKeyMeta }> {
    if (passphrase.length === 0) {
      throw new Error('passphrase must not be empty')
    }
    const salt = randomBytes(SALT_LENGTH_BYTES)
    const keyBytes = deriveMasterKey(passphrase, salt, kdfParams)
    const verifier = await encrypt(VERIFIER_PLAINTEXT, keyBytes)
    return {
      masterKey: new MasterKey(keyBytes),
      meta: { salt, verifier, kdfParams },
    }
  }

  /**
   * Re-derive the master key for an existing store using the stored salt
   * and KDF params, then verify against the stored verifier. Throws when
   * the passphrase is wrong.
   */
  static async open(passphrase: string, meta: MasterKeyMeta): Promise<MasterKey> {
    if (passphrase.length === 0) {
      throw new Error('passphrase must not be empty')
    }
    const keyBytes = deriveMasterKey(passphrase, meta.salt, meta.kdfParams)
    try {
      await decrypt(meta.verifier.ciphertext, meta.verifier.nonce, keyBytes)
    } catch {
      throw new Error('wrong passphrase')
    }
    return new MasterKey(keyBytes)
  }

  /** Wrap a per-record data key with this master key. */
  async wrap(dataKey: Uint8Array): Promise<EncryptResult> {
    return encrypt(dataKey, this.key)
  }

  /** Unwrap a per-record data key with this master key. */
  async unwrap(wrappedKey: EncryptResult): Promise<Uint8Array> {
    return decrypt(wrappedKey.ciphertext, wrappedKey.nonce, this.key)
  }
}
