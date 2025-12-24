# Privacy Policy

Last updated: 2025-12-09

This Privacy Policy explains how Shopfront International Pty Ltd (“we”, “our”, “us”) collects, uses, and protects information when you use the Stoker framework, CLI tools, website, and related services (collectively, the “Services”).

We are committed to minimising the data we collect and ensuring transparency in how any information is processed.

## 1. Alpha Mode

Stoker is currently in alpha development. Features, functionality, and data handling practices may change as we continue to improve the framework. While we make every effort to protect your information, the Services are still under active development and may contain bugs or limitations. By using Stoker in its alpha stage, you acknowledge that the Services are experimental and subject to updates.

## 2. Who We Are

Shopfront International Pty Ltd

4/8 Rocklea Dr, Port Melbourne, VIC, 3207, Australia

Contact: info@getoutpost.com

For personal data related to your account and billing, we act as the Data Controller.

For schema data transmitted during deployments, we act as a Data Processor, processing it solely on your instruction.

## 3. What Data We Collect

### 3.1. App Data

Stoker does NOT store, access, or manage your application's data.

All app data is stored in your own Google Cloud projects, using your own Google Cloud credentials.

We do NOT have access to your Google Cloud projects or your app data.

### 3.2. Schema Data You Send During Deployments

When you use commands such as:

- stoker deploy
- stoker add-tenant

your Stoker schema (JSON) is transmitted to our server only for the purpose of generating:

- Firestore index definitions
- Firestore Security Rules
- Firebase Storage Security Rules

We do not store, log, cache or retain your schema, generated rules, or index definitions after the request is completed. They are processed in-memory solely for the purpose of generating the required Firebase configuration files.

No AI is used for rule or index generation.

### 3.3. Technical Metadata

Like most online services, we may automatically receive limited metadata, such as:

- IP addresses
- Request timestamps
- User-agent and CLI version
- Error logs (if errors occur during requests)

This metadata is used only for operational, debugging, security, and abuse-prevention purposes.

No analytics or tracking data are collected from the Stoker CLI.

### 3.4. Account / Billing Information

If you purchase a plan, we may collect:

- Name
- Email address
- Billing information (processed by third-party payment processors)

We do not store payment card numbers.

## 4. How We Use Information

We process data strictly for the following purposes:

- Generating Firestore index definitions and Security Rules for your project
- Operating, maintaining, and improving the Services
- Security, debugging, and preventing misuse
- Account management and billing
- Compliance with legal obligations

We never sell or share your data for advertising.

## 5. Lawful Bases (GDPR)

If you are in the EEA, UK, or similar regions, we process your data under the following legal grounds:

- Contractual necessity – to provide the core functionality of Stoker
- Legitimate interests – security, debugging, preventing fraud
- Legal obligation – where required by law

## 6. Data Retention

- We do not store your Stoker schema or generated rules/index definitions.
- Temporary technical logs may be retained for up to 30 days for operational and security purposes (see section 3.3 for the types of logs retained).
- Account and billing information is retained as legally required.

## 7. Data Residency

Our services are hosted in Australia and the US. If you are located in the European Economic Area (EEA) or the UK, any data we process may be transferred outside your region, including to Australia or the US. We ensure that such transfers comply with applicable data protection laws (e.g., using Standard Contractual Clauses under GDPR) to protect your information.

## 8. Third-Party Service Providers

We may use third-party processors for:

- Hosting and infrastructure
- Error monitoring
- Payment processing
- Analytics on our website (Google Analytics)

Examples include:

- Google Cloud Platform
- Stripe
- Sentry

These providers process data only on our behalf and according to our instructions.

## 9. Your Rights

Depending on your region (GDPR, UK GDPR, CCPA/CPRA), you may have the right to:

- Access your personal data
- Correct inaccurate data
- Request deletion
- Object to processing
- Request data portability

To exercise these rights, contact: info@getoutpost.com

## 10. Security

We use industry-standard security measures to protect your information.

However, no method of transmission or storage is completely secure.

## 11. Children’s Privacy

We do not knowingly collect or process personal data from children under 16 years of age. If we discover that a child under 16 has submitted personal information to us, we will delete it as soon as reasonably possible. If you are a parent or guardian and believe a child has provided us with personal information, please contact us at info@getoutpost.com

## 12. Changes to This Policy

We may update this Privacy Policy from time to time.

The “Last updated” date indicates when changes were made.

## 13. Contact Us

If you have questions about this Privacy Policy or data practices, contact:

Shopfront International Pty Ltd

info@getoutpost.com
