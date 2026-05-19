/**
 * Closed set of protocol-defined error codes. Implementations MUST map
 * internal failures to one of these codes when surfacing errors to callers.
 */
export type MnemeErrorCode =
  | 'invalid_record'
  | 'record_not_found'
  | 'unauthorized'
  | 'rate_limited'
  | 'storage_failure'
  | 'unsupported_payload_mode'
  | 'protocol_version_mismatch'
  | 'conflict'

export class MnemeError extends Error {
  readonly code: MnemeErrorCode

  constructor(code: MnemeErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'MnemeError'
    this.code = code
  }

  static is(value: unknown): value is MnemeError {
    return value instanceof MnemeError
  }
}
