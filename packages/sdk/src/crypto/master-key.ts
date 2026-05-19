import { DEFAULT_KDF_PARAMS, type KdfParams, deriveMasterKey as argon2 } from './argon2'
import { type EncryptResult, decrypt, encrypt, randomBytes } from './envelope'
import { generateRecoveryPhrase, recoveryPhraseToEntropy } from './recovery-phrase'

const MASTER_KEY_LENGTH = 32
const SALT_LENGTH = 16

/**
 * v2 keyring metadata. The master key is a random 256-bit value, wrapped
 * independently under two derived keys:
 *
 * - `wrappedByPassphrase`: AES-GCM(masterKey, Argon2id(passphrase, passphraseSalt))
 * - `wrappedByRecovery`:   AES-GCM(masterKey, recoveryPhraseEntropy)
 *
 * Either wrapping unwraps the same master key, so a user can unlock with
 * either their passphrase or their recovery phrase. Adding a new wrapping
 * (e.g. for a second device, or after rotating the passphrase) is a future
 * extension that lives in this same table.
 */
export type MasterKeyMeta = {
  schemaVersion: 2
  passphraseSalt: Uint8Array
  wrappedByPassphrase: EncryptResult
  wrappedByRecovery: EncryptResult
  kdfParams: KdfParams
}

export type InitialiseResult = {
  masterKey: MasterKey
  meta: MasterKeyMeta
  recoveryPhrase: string
}

export class MasterKey {
  private constructor(private readonly key: Uint8Array) {}

  /** Raw 256-bit master key bytes. Internal use only — never persist. */
  bytes(): Uint8Array {
    return this.key
  }

  /**
   * Initialise a new encrypted store: generate a random master key, a fresh
   * 24-word recovery phrase, and wrap the master key under both the
   * passphrase-derived key and the recovery-phrase entropy.
   *
   * Returns the recovery phrase ONCE. The caller is responsible for showing
   * it to the user and never persisting it server-side.
   */
  static async initialise(
    passphrase: string,
    kdfParams: KdfParams = DEFAULT_KDF_PARAMS,
  ): Promise<InitialiseResult> {
    if (passphrase.length === 0) {
      throw new Error('passphrase must not be empty')
    }
    const masterKey = randomBytes(MASTER_KEY_LENGTH)
    const passphraseSalt = randomBytes(SALT_LENGTH)
    const passphraseKey = argon2(passphrase, passphraseSalt, kdfParams)
    const wrappedByPassphrase = await encrypt(masterKey, passphraseKey)

    const { phrase, entropy } = generateRecoveryPhrase()
    const wrappedByRecovery = await encrypt(masterKey, entropy)

    return {
      masterKey: new MasterKey(masterKey),
      meta: {
        schemaVersion: 2,
        passphraseSalt,
        wrappedByPassphrase,
        wrappedByRecovery,
        kdfParams,
      },
      recoveryPhrase: phrase,
    }
  }

  /**
   * Unlock an existing store with the user's passphrase. Throws when the
   * passphrase is wrong (AES-GCM tag mismatch on unwrap).
   */
  static async openWithPassphrase(passphrase: string, meta: MasterKeyMeta): Promise<MasterKey> {
    if (passphrase.length === 0) {
      throw new Error('passphrase must not be empty')
    }
    const passphraseKey = argon2(passphrase, meta.passphraseSalt, meta.kdfParams)
    try {
      const masterKey = await decrypt(
        meta.wrappedByPassphrase.ciphertext,
        meta.wrappedByPassphrase.nonce,
        passphraseKey,
      )
      return new MasterKey(masterKey)
    } catch {
      throw new Error('wrong passphrase')
    }
  }

  /**
   * Unlock an existing store with the user's recovery phrase. Throws when
   * the phrase is invalid (bad word / length / checksum) or does not match
   * the stored wrapping.
   */
  static async openWithRecoveryPhrase(phrase: string, meta: MasterKeyMeta): Promise<MasterKey> {
    const entropy = recoveryPhraseToEntropy(phrase)
    try {
      const masterKey = await decrypt(
        meta.wrappedByRecovery.ciphertext,
        meta.wrappedByRecovery.nonce,
        entropy,
      )
      return new MasterKey(masterKey)
    } catch {
      throw new Error('wrong recovery phrase')
    }
  }

  async wrap(dataKey: Uint8Array): Promise<EncryptResult> {
    return encrypt(dataKey, this.key)
  }

  async unwrap(wrapped: EncryptResult): Promise<Uint8Array> {
    return decrypt(wrapped.ciphertext, wrapped.nonce, this.key)
  }
}
