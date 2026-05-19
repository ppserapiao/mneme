import {
  mnemonicToEntropy as bip39ToEntropy,
  generateMnemonic,
  validateMnemonic,
} from '@scure/bip39'
import { wordlist } from '@scure/bip39/wordlists/english.js'

/**
 * 24-word BIP-39 mnemonic. 256 bits of entropy, which matches the size of
 * the AES-256 master key we wrap with it.
 */
const ENTROPY_BITS = 256

export type GeneratedRecoveryPhrase = {
  phrase: string
  entropy: Uint8Array
}

/**
 * Produce a fresh 24-word BIP-39 recovery phrase plus the equivalent raw
 * entropy bytes. The entropy is what we use directly as an AES key to wrap
 * the master key; the phrase is what the user writes down on paper.
 */
export function generateRecoveryPhrase(): GeneratedRecoveryPhrase {
  const phrase = generateMnemonic(wordlist, ENTROPY_BITS)
  const entropy = bip39ToEntropy(phrase, wordlist)
  return { phrase, entropy }
}

/**
 * Convert a user-provided recovery phrase to its 32-byte entropy. Throws if
 * the phrase is invalid (bad word, bad length, bad checksum).
 *
 * Normalises whitespace and case so users can paste from a note app or
 * handwritten copy without surprises.
 */
export function recoveryPhraseToEntropy(phrase: string): Uint8Array {
  const normalised = phrase.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!validateMnemonic(normalised, wordlist)) {
    throw new Error('invalid recovery phrase')
  }
  return bip39ToEntropy(normalised, wordlist)
}
