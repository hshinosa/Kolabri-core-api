import { Request, Response, NextFunction } from 'express';
import { PRIVACY_POLICY, DATA_CATEGORIES } from '../config/privacy-policy.js';

export class PrivacyController {
    /**
     * GET /api/privacy/policy
     * Returns the privacy policy (public, no auth required)
     */
    static async getPolicy(_req: Request, res: Response, next: NextFunction) {
        try {
            res.json({ data: PRIVACY_POLICY });
        } catch (error) {
            next(error);
        }
    }

    /**
     * GET /api/privacy/data-categories
     * Returns data categories (public, no auth required)
     */
    static async getDataCategories(_req: Request, res: Response, next: NextFunction) {
        try {
            res.json({ data: DATA_CATEGORIES });
        } catch (error) {
            next(error);
        }
    }
}
