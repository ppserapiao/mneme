export { DEFAULT_KDF_PARAMS, deriveMasterKey } from './argon2'
export type { KdfParams } from './argon2'

export { decrypt, encrypt, generateDataKey, generateNonce, randomBytes } from './envelope'
export type { EncryptResult } from './envelope'

export { fromBase64Url, toBase64Url } from './base64'

export { MasterKey } from './master-key'
export type { InitialiseResult, MasterKeyMeta } from './master-key'

export { generateRecoveryPhrase, recoveryPhraseToEntropy } from './recovery-phrase'
export type { GeneratedRecoveryPhrase } from './recovery-phrase'

export { deriveSigningKeyPair, recordSigningPayload, sign, verify } from './signing'
export type { SigningKeyPair } from './signing'
