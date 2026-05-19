/**
 * Mneme Protocol version negotiated between clients and stores.
 *
 * Format follows semver. Pre-1.0.0, minor bumps may include breaking changes;
 * post-1.0.0 we commit to semver discipline. The string is what travels on the
 * wire in version handshakes and signed envelopes.
 */
export const PROTOCOL_VERSION = '0.1.0-draft' as const

export type ProtocolVersion = typeof PROTOCOL_VERSION
