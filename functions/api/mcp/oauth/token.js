import { token, handleOAuth } from '../../../lib/mcp/oauth.js';
export const onRequestPost = context => handleOAuth(context, token);
