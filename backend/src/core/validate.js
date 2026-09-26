export const validate = (schema) => (req, res, next) => {
    const parsed = schema.safeParse({ body: req.body, query: req.query, params: req.params });
    if (!parsed.success) {
        res.status(422).json({
            message: "Please check the highlighted fields.",
            code: "VALIDATION_FAILED",
            issues: parsed.error.flatten()
        });
        return;
    }
    req.body = parsed.data.body ?? req.body;
    req.query = parsed.data.query ?? req.query;
    req.params = parsed.data.params ?? req.params;
    next();
};
