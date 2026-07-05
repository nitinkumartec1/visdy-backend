/**
 * Global Error Handler Middleware
 * Must be the LAST middleware registered in Express.
 * Catches all errors thrown/passed via next(err).
 */
const errorHandler = (err, req, res, next) => {
    const statusCode = err.statusCode || 500;

    // Only log stack traces in development
    if (process.env.NODE_ENV !== "production") {
        console.error(`\n🔥 [${statusCode}] ${err.message}`);
        console.error(err.stack);
    }

    res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
        errors: err.errors || [],
        data: null,
        // Only include stack trace in development
        ...(process.env.NODE_ENV !== "production" && { stack: err.stack }),
    });
};

export { errorHandler };