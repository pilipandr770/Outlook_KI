import { NextFunction, Request, RequestHandler, Response } from "express";

// Express 4 does not catch rejected promises from async handlers — an unhandled
// rejection there crashes the whole process. Wrap every async route with this.
export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
}
