import { consentPage, consent, handleOAuth } from '../../../lib/mcp/oauth.js';
export const onRequestGet = context => handleOAuth(context, consentPage);
export const onRequestPost = context => handleOAuth(context, consent);
