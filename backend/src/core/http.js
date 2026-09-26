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
    if (error instanceof Error && error.message.startsWith("Invalid")) {
        return { status: 422, body: { message: error.message, code: "INVALID_STATE_TRANSITION" } };
    }
    return {
        status: 500,
        body: { message: "Something went wrong. Please try again.", code: "INTERNAL_ERROR" }
    };
}
