'use strict';

/**
 * Builds openapi/partner-api.json, the OpenAPI document for the partner
 * routes, from the partner schemas in src/index.ts (compiled to dist/).
 *
 *   node scripts/build-openapi.js           write the document
 *   node scripts/build-openapi.js --check   fail if the committed document is
 *                                           not what the schemas produce
 *
 * Both modes validate the document against the OpenAPI 3.1 specification.
 *
 * The bodies come from the zod schemas, so the document cannot describe a
 * shape the package does not export. What is written by hand below is what a
 * schema cannot say: the paths, the statuses, and which error codes each
 * status carries. Those are checked against the running API by a test in the
 * service that serves these routes.
 */

const fs = require('node:fs');
const path = require('node:path');
const SwaggerParser = require('@apidevtools/swagger-parser');
const { zodToJsonSchema } = require('zod-to-json-schema');
const contract = require('../dist/index.js');
const { version } = require('../package.json');

const OUTPUT = path.join(__dirname, '..', 'openapi', 'partner-api.json');

// ---------------------------------------------------------------------------
// Components, from the contract's schemas.
// ---------------------------------------------------------------------------

const COMPONENT_SCHEMAS = {
  IntakeApplicationRequest: contract.intakeApplicationRequestSchema,
  IntakeApplicationResponse: contract.intakeApplicationResponseSchema,
  InquiryResultResponse: contract.inquiryResultResponseSchema,
  ResultSignal: contract.resultSignalSchema,
  ResultVoucher: contract.resultVoucherSchema,
  ResultEvent: contract.resultEventSchema,
  InquirySessionResponse: contract.inquirySessionResponseSchema,
  InquiryListResponse: contract.inquiryListResponseSchema,
  InquiryListItem: contract.inquiryListItemSchema,
  PartnerError: contract.partnerErrorSchema,
};

/** One component, with every other component it contains as a $ref. */
function toComponent(name) {
  const others = Object.fromEntries(Object.entries(COMPONENT_SCHEMAS).filter(([n]) => n !== name));
  const json = zodToJsonSchema(COMPONENT_SCHEMAS[name], {
    target: 'jsonSchema2019-09',
    // An object schema stays open: a consumer must ignore fields it does not
    // know (the result contract's MINOR rule), and the routes ignore request
    // fields they do not read.
    removeAdditionalStrategy: 'strict',
    definitions: others,
  });
  delete json.$schema;
  delete json.definitions;
  return JSON.parse(JSON.stringify(json).replace(/"#\/definitions\//g, '"#/components/schemas/'));
}

const ref = (name) => ({ $ref: `#/components/schemas/${name}` });

// ---------------------------------------------------------------------------
// Responses.
// ---------------------------------------------------------------------------

const documentedCodes = new Set();

/** An error response whose `code` is one of `codes`, all from PARTNER_ERROR_CODES. */
function errorResponse(description, codes, extra = {}) {
  for (const code of codes) {
    if (!contract.PARTNER_ERROR_CODES.includes(code)) {
      throw new Error(`${code} is not in PARTNER_ERROR_CODES`);
    }
    documentedCodes.add(code);
  }
  return {
    description,
    ...extra,
    content: {
      'application/json': {
        schema: { allOf: [ref('PartnerError'), { properties: { code: { enum: codes } } }] },
      },
    },
  };
}

const authFailed = errorResponse('No `X-API-Key` header, or the key is not valid.', ['INVALID_AUTH']);

const orgSelectionInvalid = 'the `X-DigaVouch-Org` header is present but is not an organization id (ORG_SELECTION_INVALID).';
const orgSelectionForbidden = 'the `X-DigaVouch-Org` header names an organization this key is not for (ORG_SELECTION_FORBIDDEN).';

/** A sentence that is one of those clauses alone. */
const sentence = (clause) => clause.charAt(0).toUpperCase() + clause.slice(1);

const rateLimited = errorResponse(
  'Too many requests: more than 1000 a minute for this organization\'s key, or 300 a minute from one address without a valid key. Wait `retry_after_seconds` (the same value as the `Retry-After` header), then retry the same request.',
  ['RATE_LIMIT_EXCEEDED'],
  {
    headers: {
      'Retry-After': { description: 'Seconds to wait before retrying.', schema: { type: 'integer' } },
      'X-RateLimit-Limit': { description: 'Requests allowed in the window.', schema: { type: 'integer' } },
      'X-RateLimit-Remaining': { description: 'Requests left in the window.', schema: { type: 'integer' } },
      'X-RateLimit-Reset': { description: 'Seconds until the window resets.', schema: { type: 'integer' } },
    },
  },
);

const internalError = (codes, description) =>
  errorResponse(
    description ??
      'An unexpected error (INTERNAL_ERROR). Retry the same request a few times with backoff.',
    codes ?? ['INTERNAL_ERROR'],
  );

// ---------------------------------------------------------------------------
// Parameters.
// ---------------------------------------------------------------------------

const parameters = {
  InquiryId: {
    name: 'inquiry_id',
    in: 'path',
    required: true,
    description: 'The case id: `case_id` from creating a case, or `inquiry_id` from the case list.',
    schema: { type: 'string', format: 'uuid' },
  },
  OrgId: {
    name: 'org_id',
    in: 'path',
    required: true,
    description: "Your organization's id, given with your API key. It must be the key's own organization.",
    schema: { type: 'string', format: 'uuid' },
  },
  OrgSelection: {
    name: 'X-DigaVouch-Org',
    in: 'header',
    required: false,
    description:
      "Optional. An organization id; with an API key it may only repeat the key's own organization. Send it if you want a request refused, rather than answered, when it would act for an organization other than the one you meant.",
    schema: { type: 'string', format: 'uuid' },
  },
};
const p = (name) => ({ $ref: `#/components/parameters/${name}` });

// ---------------------------------------------------------------------------
// The document.
// ---------------------------------------------------------------------------

const INFO_DESCRIPTION = `The routes an integration partner uses to start a case for an applicant, follow it, and read its facts.

**Authentication.** Every route takes the organization's API key in the \`X-API-Key\` header. The key belongs to one organization and decides which organization a request acts for. A request that carries the key is answered only as this document describes: an \`Authorization\` header on it is ignored. A request with an \`Authorization\` header and no key is a person's login, not a partner request, and is not described here beyond intake refusing it (API_KEY_REQUIRED).

**Two names for one id.** A case id is called \`case_id\` when a case is created and \`inquiry_id\` everywhere else. They are the same value.

**Facts, not ratings.** The result reports what was verified, what is pending, who vouched and what they said, and what happened when. It carries no score, zone, recommendation or confidence.

**Errors.** Every error body has a \`code\` from a closed list, a \`message\` for people, and on a field error a \`field\`. Branch on the HTTP status first and the code second, and treat a code you do not know by its status. Some error bodies also carry older fields (\`error\`, \`statusCode\`); they are not part of the contract.

**Retries.** Retry a 429 after \`retry_after_seconds\`. Retry a 500 INTERNAL_ERROR with the same request a few times with backoff. Do not retry any other error unchanged. Creating a case is safe to retry: the application id makes a repeat return the same case.

**Limits.** 1000 requests a minute per organization key. Every response carries \`X-RateLimit-Limit\`, \`X-RateLimit-Remaining\` and \`X-RateLimit-Reset\` (seconds until the window resets), so you can slow down before a 429.

**Versioning.** The result carries \`schema_version\`; see its description. Fields not listed in this document may appear in responses: ignore them.`;

function buildDocument() {
  const schemas = Object.fromEntries(Object.keys(COMPONENT_SCHEMAS).map((n) => [n, toComponent(n)]));

  const doc = {
    openapi: '3.1.0',
    info: {
      title: 'Partner API',
      version,
      description: INFO_DESCRIPTION,
    },
    servers: [{ url: 'https://api.digavouch.com' }],
    security: [{ ApiKey: [] }],
    tags: [{ name: 'Cases' }],
    paths: {
      '/digavouch/v1/intake/applications': {
        post: {
          operationId: 'createCaseFromApplication',
          summary: 'Create a case from an application',
          tags: ['Cases'],
          description: `Sends one application from your system. The first time an application id is seen, a case is created and the applicant is invited (201). Sending the same application id again with the same email address returns the same case (200) and invites nobody, so a request that timed out can be retried as it is.

How the applicant is reached is the organization's setting: an email from us, the link in this response (\`verification_link\`), or both. The link is in the 201 only. If the organization takes the link in the response and a 201 is lost in transit, the retry's 200 carries no link: issue a fresh applicant link for the case instead.`,
          parameters: [p('OrgSelection')],
          requestBody: {
            required: true,
            content: { 'application/json': { schema: ref('IntakeApplicationRequest') } },
          },
          responses: {
            201: {
              description: 'A new case. The applicant is invited, or the link is in the body, as the organization chose.',
              headers: {
                'Cache-Control': {
                  description: '`no-store` when the body carries `verification_link`.',
                  schema: { type: 'string' },
                },
              },
              content: { 'application/json': { schema: ref('IntakeApplicationResponse') } },
            },
            200: {
              description:
                'This application id already has a case for this email address. `outcome` is `existing`; nothing was created, nobody was invited, and there is no link.',
              content: { 'application/json': { schema: ref('IntakeApplicationResponse') } },
            },
            400: errorResponse(
              `A field is missing or invalid (INVALID_REQUEST, with \`field\`: \`body\`, \`application_id\`, \`job_id\`, \`candidate\` or \`candidate.email\`), the body is not valid JSON (INVALID_REQUEST, without \`field\`), or ${orgSelectionInvalid}`,
              ['INVALID_REQUEST', 'ORG_SELECTION_INVALID'],
            ),
            401: authFailed,
            403: errorResponse(
              `A person's login was sent instead of an API key (API_KEY_REQUIRED), or ${orgSelectionForbidden}`,
              ['API_KEY_REQUIRED', 'ORG_SELECTION_FORBIDDEN'],
            ),
            409: errorResponse(
              'This application id already has a case for a different email address (APPLICATION_EMAIL_MISMATCH), or its case was deleted by the organization and is not recreated (CASE_DELETED). Nothing was created.',
              ['APPLICATION_EMAIL_MISMATCH', 'CASE_DELETED'],
            ),
            413: errorResponse('The body is larger than 1 MB.', ['INVALID_REQUEST']),
            415: errorResponse('The body is not `application/json`.', ['INVALID_REQUEST']),
            422: errorResponse(
              'The organization has not mapped this job and does not accept unmapped jobs. The job is recorded for the organization; no case was created.',
              ['UNMAPPED_JOB'],
            ),
            429: rateLimited,
            500: internalError(
              ['NO_DEFAULT_CAMPAIGN', 'INTERNAL_ERROR'],
              "The organization's account is missing a setting this job needs (NO_DEFAULT_CAMPAIGN): retrying does not help, contact support. Or an unexpected error (INTERNAL_ERROR): retry the same request a few times with backoff.",
            ),
          },
        },
      },
      '/api/v1/inquiries/{inquiry_id}/result': {
        get: {
          operationId: 'getCaseResult',
          summary: "Get a case's result",
          tags: ['Cases'],
          description:
            'The facts of one case as they are when you read it. Read it again to see changes.',
          parameters: [p('InquiryId'), p('OrgSelection')],
          responses: {
            200: {
              description: 'The case.',
              content: { 'application/json': { schema: ref('InquiryResultResponse') } },
            },
            400: errorResponse(sentence(orgSelectionInvalid), ['ORG_SELECTION_INVALID']),
            401: authFailed,
            403: errorResponse(
              `The case belongs to another organization (FORBIDDEN), or ${orgSelectionForbidden}`,
              ['FORBIDDEN', 'ORG_SELECTION_FORBIDDEN'],
            ),
            404: errorResponse(
              'No such case, an id that is not a UUID, or a case the organization deleted.',
              ['NOT_FOUND'],
            ),
            429: rateLimited,
            500: internalError(),
          },
        },
      },
      '/digavouch/v1/inquiries/{inquiry_id}/session': {
        post: {
          operationId: 'createApplicantLink',
          summary: 'Issue a fresh applicant link',
          tags: ['Cases'],
          description:
            'A new link for the applicant of an existing case, for example when the first one expired or never arrived. No email is sent: deliver the link yourself. Earlier links are not revoked; each stays valid until it expires. Send no body. A case the organization deleted gets no link: this route answers 404 for it, as its result does.',
          parameters: [p('InquiryId'), p('OrgSelection')],
          responses: {
            201: {
              description: 'The new link.',
              headers: {
                'Cache-Control': {
                  description: "`no-store`: the body carries the applicant's link.",
                  schema: { type: 'string' },
                },
              },
              content: { 'application/json': { schema: ref('InquirySessionResponse') } },
            },
            400: errorResponse(
              `A body was sent and is not valid JSON (INVALID_REQUEST), or ${orgSelectionInvalid}`,
              ['INVALID_REQUEST', 'ORG_SELECTION_INVALID'],
            ),
            401: authFailed,
            403: errorResponse(
              `The case belongs to another organization (ORG_MISMATCH), or ${orgSelectionForbidden}`,
              ['ORG_MISMATCH', 'ORG_SELECTION_FORBIDDEN'],
            ),
            404: errorResponse(
              'No such case, an id that is not a UUID, or a case the organization deleted.',
              ['INQUIRY_NOT_FOUND'],
            ),
            409: errorResponse(
              "The organization's reviewer has recorded a decision on this case, so no new link is issued.",
              ['INQUIRY_DECIDED'],
            ),
            429: rateLimited,
            500: internalError(),
          },
        },
      },
      '/api/v1/orgs/{org_id}/inquiries': {
        get: {
          operationId: 'listCases',
          summary: 'List cases',
          tags: ['Cases'],
          description: "The organization's cases, newest first, without paging. Deleted cases are left out.",
          parameters: [
            p('OrgId'),
            {
              name: 'status',
              in: 'query',
              required: false,
              description: 'Only cases in this processing state, such as `decided`.',
              schema: { type: 'string' },
            },
            p('OrgSelection'),
          ],
          responses: {
            200: {
              description: 'The cases.',
              content: { 'application/json': { schema: ref('InquiryListResponse') } },
            },
            400: errorResponse(sentence(orgSelectionInvalid), ['ORG_SELECTION_INVALID']),
            401: authFailed,
            403: errorResponse(
              `\`org_id\` is not the key's organization (ORG_MISMATCH), or ${orgSelectionForbidden}`,
              ['ORG_MISMATCH', 'ORG_SELECTION_FORBIDDEN'],
            ),
            429: rateLimited,
            500: internalError(
              undefined,
              'An unexpected error (INTERNAL_ERROR). Retry the same request a few times with backoff.',
            ),
          },
        },
      },
    },
    components: {
      securitySchemes: {
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: "The organization's API key. Keep it on your servers; never send it to a browser or an app.",
        },
      },
      parameters,
      schemas,
    },
  };

  // The validator does not check that a path's `{name}` has a parameter.
  for (const [route, ops] of Object.entries(doc.paths)) {
    for (const [method, op] of Object.entries(ops)) {
      const declared = op.parameters
        .map((x) => (x.$ref ? parameters[x.$ref.split('/').pop()] : x))
        .filter((x) => x.in === 'path')
        .map((x) => x.name);
      const inPath = [...route.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      if (inPath.join() !== declared.join()) {
        throw new Error(`${method.toUpperCase()} ${route}: path parameters ${inPath} but declared ${declared}`);
      }
    }
  }

  // The list is closed, so every code on it is documented somewhere: a code
  // added to PARTNER_ERROR_CODES without a route that sends it fails here.
  const undocumented = contract.PARTNER_ERROR_CODES.filter((c) => !documentedCodes.has(c));
  if (undocumented.length > 0) {
    throw new Error(`PARTNER_ERROR_CODES not documented on any route: ${undocumented.join(', ')}`);
  }

  return doc;
}

async function main() {
  const doc = buildDocument();
  // The validator resolves $refs in place, so it gets its own copy.
  await SwaggerParser.validate(structuredClone(doc));
  const text = `${JSON.stringify(doc, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const committed = fs.existsSync(OUTPUT) ? fs.readFileSync(OUTPUT, 'utf8').replace(/\r\n/g, '\n') : '';
    if (committed !== text) {
      console.error('openapi/partner-api.json is out of date. Run `npm run openapi` and commit the result.');
      process.exit(1);
    }
    console.log('openapi/partner-api.json is valid and up to date.');
    return;
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, text);
  console.log(`Wrote ${path.relative(process.cwd(), OUTPUT)}: valid OpenAPI ${doc.openapi}.`);
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
