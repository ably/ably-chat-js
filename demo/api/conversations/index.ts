import * as dotenv from 'dotenv';
import express from 'express';
import serverless from 'serverless-http';
import { router } from './routes';

dotenv.config();

const api = express();

api.use('/api/conversations/v1', router);

export const handler = serverless(api);
