/**
 * Wire types for the v0.0.7 pairing ceremony (ADR 0009).
 *
 * All three messages are plain JSON-serialisable objects so any transport
 * (QR code, file copy, WebSocket, Cloud signalling) can carry them. They
 * MUST be passed through unmodified — any field tampering aborts the
 * ceremony at the next verification step.
 */

/** Sent A → B. Opens a pairing session. */
export type PairingInvite = {
  sessionId: string
  /** base64url X25519 public key of device A's ephemeral keypair. */
  pubA: string
  /** ISO-8601 timestamp; device B MUST refuse the invite past this. */
  expiresAt: string
  /** Pairing protocol version. v0.0.7 ships "mneme-pairing-v1". */
  version: 'mneme-pairing-v1'
}

/** Sent B → A in response to an invite. */
export type PairingResponse = {
  sessionId: string
  /** base64url X25519 public key of device B's ephemeral keypair. */
  pubB: string
}

/**
 * Sent A → B after both users have verified that the SAS displayed on each
 * device matches. Contains the master key encrypted under the session key.
 */
export type PairingTransferBundle = {
  sessionId: string
  /** base64url AES-256-GCM ciphertext of the master key bytes. */
  encryptedMasterKey: string
  /** base64url 96-bit AES-GCM nonce. */
  nonce: string
}
