export class HttpError extends Error {
    status;
    code;
    constructor(status, message, code = "REQUEST_FAILED") {
        super(message);
        this.status = status;
        this.code = code;
    }
}
export function friendlyError(error) {
    if (error?.code === 11000) {
        const field = Object.keys(error.keyPattern ?? {})[0] ?? "value";
        return { status: 409, body: { message: `This ${field} is already registered.`, code: "DUPLICATE_VALUE" } };
    }
    if (error instanceof HttpError) {
        return { status: error.status, body: { message: error.message, code: error.code } };
    }
    // Zod validation errors carry structured issue details. Convert those into
    // a safe, useful response instead of masking a bad form value as a 500.
    if (Array.isArray(error?.issues)) {
        const issue = error.issues[0] ?? {};
        const field = (issue.path ?? []).map(String).join(".");
        const label = field
            ? field.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (letter) => letter.toUpperCase())
            : "Input";
        const message = issue.code === "too_small" && typeof issue.minimum === "number"
            ? `${label} must be at least ${issue.minimum} characters.`
            : issue.message ?? `Invalid ${label.toLowerCase()}.`;
        return { status: 422, body: { message, code: "VALIDATION_ERROR" } };
    }
    if (error instanceof Error && error.message.startsWith("Invalid")) {
        return { status: 422, body: { message: error.message, code: "INVALID_STATE_TRANSITION" } };
    }
    return {
        status: 500,
        body: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" }
    };
}
