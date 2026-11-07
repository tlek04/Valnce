import worker from '../../src/worker';
import { Env } from '../../src/server/types';
type RosterContext = { request: Request; env: Env };
export const onRequestGet = ({ request, env }: RosterContext) => worker.fetch(request, env);
export const onRequestPut = onRequestGet;
