import { serverMetadata, handleOAuth } from '../lib/mcp/oauth.js';
export const onRequestGet = context => handleOAuth(context, serverMetadata);
