// A separate error type supports redacted provider-failure monitoring.
export class FeeValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeeValidationError";
  }
}
