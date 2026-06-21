import { AppError } from './errors.js';
/**
 * Middleware to validate request body against a Zod schema
 */
export function validateBody(schema) {
    return (req, res, next) => {
        try {
            schema.parse(req.body);
            next();
        }
        catch (error) {
            throw new AppError('VALIDATION_ERROR', error.errors?.[0]?.message || 'Invalid request body', 400, error.errors);
        }
    };
}
/**
 * Middleware to validate request query parameters against a Zod schema
 */
export function validateQuery(schema) {
    return (req, res, next) => {
        try {
            schema.parse(req.query);
            next();
        }
        catch (error) {
            throw new AppError('VALIDATION_ERROR', error.errors?.[0]?.message || 'Invalid query parameters', 400, error.errors);
        }
    };
}
/**
 * Middleware to validate request parameters against a Zod schema
 */
export function validateParams(schema) {
    return (req, res, next) => {
        try {
            schema.parse(req.params);
            next();
        }
        catch (error) {
            throw new AppError('VALIDATION_ERROR', error.errors?.[0]?.message || 'Invalid parameters', 400, error.errors);
        }
    };
}
