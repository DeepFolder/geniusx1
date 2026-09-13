import { Session } from 'express-session';
import { User } from '@shared/schema';

declare module 'express-session' {
  interface SessionData {
    userId?: string;
    user?: User;
  }
}

export {};