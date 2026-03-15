export class MemoryError extends Error {
  public readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "MemoryError";
    this.code = code;
  }
}

export class ValidationError extends MemoryError {
  constructor(message: string) {
    super("VALIDATION_ERROR", message);
    this.name = "ValidationError";
  }
}

export class NotFoundError extends MemoryError {
  constructor(message: string) {
    super("NOT_FOUND", message);
    this.name = "NotFoundError";
  }
}

export class PersistenceError extends MemoryError {
  constructor(message: string, options?: ErrorOptions) {
    super("PERSISTENCE_ERROR", message, options);
    this.name = "PersistenceError";
  }
}
