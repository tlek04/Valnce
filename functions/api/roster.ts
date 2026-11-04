import { handleRoster, RosterEnv } from '../../src/server/roster';

// Pages compatibility entry point; Workers uses the same handler.
type RosterContext = { request: Request; env: RosterEnv };
export const onRequestGet = ({ request, env }: RosterContext) => handleRoster(request, env);
export const onRequestPut = ({ request, env }: RosterContext) => handleRoster(request, env);
