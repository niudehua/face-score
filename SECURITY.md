# Security policy

Security fixes target the current main branch. There is no maintained release/version support matrix.

Do not include API credentials, OAuth tokens, upload private keys, original face photos or signed image URLs in public issues. Use the repository's private vulnerability reporting feature when it is enabled, or contact the maintainer privately through their published contact details. This repository does not currently specify a dedicated security email address or response SLA.

Deployment requirements and remaining limits are documented in README.md under access controls and upgrade notes. In particular, production administrators require GitHub OAuth and an explicit allowlist; maintenance requests require authentication; WeChat AppSecret and CI upload private keys must remain separate.

Earlier versions logged sensitive OAuth response data and CI upload key contents. Removing those log statements does not remove historic logs or invalidate existing credentials. Deployment owners should review historic logs and arrange credential rotation through the relevant providers when needed. No automatic rotation is performed by this repository.
