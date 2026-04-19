import { Hono } from 'hono';
import { version as APP_VERSION } from '../../../package.json';

const router = new Hono();

router.get('/', (c) => {
  return c.json({ version: APP_VERSION });
});

export default router;

