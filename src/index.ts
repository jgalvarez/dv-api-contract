import { z } from 'zod';

export const sourceCategorySchema = z.enum(['social', 'financial', 'other']);
export const sourceStrengthSchema = z.enum(['strong', 'moderate', 'limited']);
export const evidenceStatusSchema = z.enum(['verified', 'partial', 'missing']);
export const confidenceLabelSchema = z.enum([
  'Strong',
  'Moderate-High',
  'Moderate',
  'Limited',
  'Pending',
]);
export const caseRecommendationSchema = z.enum([
  'approve',
  'request_more_proof',
  'deny',
  'pending',
]);
export const zoneSchema = z.enum(['clear', 'gray', 'flag']);
export const vouchOutcomeSchema = z.enum(['confirm', 'decline', 'unable_to_confirm']);

/**
 * The kind of organization this is — the field a consumer keys vocabulary,
 * navigation and theme off. Known values are `residential_leasing` and
 * `hr_recruiting`.
 *
 * Not an enum on purpose. The set is open: the server stores this without a
 * constraint so that a new kind of organization costs nothing there, and an
 * enum here would turn that into a parse error on the consumer instead. A
 * value the consumer does not recognize should fall back, not fail.
 */
export const orgIndustrySchema = z.string();

export const signalSummarySchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(['verified', 'pending', 'missing', 'submitted_for_review']),
  detail: z.string().nullish(),
});
export type SignalSummary = z.infer<typeof signalSummarySchema>;

export const connectedProviderSchema = z.object({
  provider: z.string(),
  masked_identifier: z.string(),
  status: z.enum(['connected', 'reconnect_required', 'not_completed']),
  connected_at: z.string().optional(),
});
export type ConnectedProvider = z.infer<typeof connectedProviderSchema>;

export const workflowStepSchema = z.object({
  step_type: z.string(),
  required: z.boolean(),
  /** Other step types that also satisfy this step, when the step accepts alternatives. */
  satisfied_by: z.array(z.string()).optional(),
});
export type WorkflowStep = z.infer<typeof workflowStepSchema>;

/**
 * GET /sessions/:token — what the applicant flow renders from.
 *
 * `steps` is the ordered list for this session's workflow, and is the field to
 * render from when it is present. `verification_steps` is the older
 * organization-level list and remains the fallback for sessions that carry no
 * workflow of their own, where both `workflow_key` and `steps` are null.
 *
 * Order is significant. Membership is not derivable from `verification_steps`:
 * a workflow may include steps the organization-level list does not.
 *
 * Note that some step types can complete outside the applicant's current
 * position in the flow, so `steps.length` is not a reliable denominator for
 * progress. Use `progress` for that.
 */
export const sessionDetailResponseSchema = z.object({
  session_id: z.string(),
  status: z.string(),
  org_name: z.string(),
  inquiry_details: z
    .object({
      inquiry_id: z.string(),
      status: z.string().optional(),
      metadata: z.record(z.unknown()).optional(),
      declined_at: z.string().nullish(),
      decline_reason: z.string().nullish(),
    })
    .optional(),
  verification_steps: z.array(z.string()),
  workflow_key: z.string().nullish(),
  steps: z.array(workflowStepSchema).nullish(),
  progress: z
    .object({
      current_step: z.number().optional(),
      steps_completed: z.array(z.string()).optional(),
      steps_total: z.number().optional(),
      percent_complete: z.number().optional(),
    })
    .optional(),
  consent_status: z.enum(['granted', 'pending']),
});
export type SessionDetailResponse = z.infer<typeof sessionDetailResponseSchema>;

export const sessionStatusResponseSchema = z.object({
  session_id: z.string(),
  status: z.string(),
  current_step: z.number(),
  steps_completed: z.array(z.string()).optional(),
  steps_total: z.number().optional(),
  percent_complete: z.number().optional(),
  current_score: z.number().nullable().optional(),
  recommendation: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
  signals_verified: z.array(z.string()).optional(),
  org_name: z.string().optional(),
  // The organization's kind, carried here because both public journeys read
  // this endpoint: an invitation activates into a session token that resolves
  // against this same status route, so one field serves both.
  org_industry: orgIndustrySchema.optional(),
  applicant_name: z.string().optional(),
  applicant_email: z.string().nullish(),
  signals_summary: z.array(signalSummarySchema).optional(),
  connected_providers: z.array(connectedProviderSchema).optional(),
  step_up_required: z.boolean().optional(),
  expires_at: z.string().optional(),
  submitted_at: z.string().nullish(),
  applicant_submitted_at: z.string().nullish(),
  completed_at: z.string().optional(),
  is_voucher: z.boolean().optional(),
  vouching_for: z
    .object({ applicant_name: z.string(), relationship: z.string() })
    .nullable()
    .optional(),
  pending_vouchers_count: z.number().optional(),
  voucher_idv_required: z.boolean().optional(),
  voucher_idv_skipped: z.boolean().optional(),
  voucher_idv_verified: z.boolean().optional(),
  // Applicant-side Plaid IDV (BF-B1 / ADR-012). Same three shapes as the
  // voucher fields above; what differs is that nothing is gated on them —
  // `required` means the org ASKS, and the applicant may decline (R3).
  applicant_idv_required: z.boolean().optional(),
  applicant_idv_skipped: z.boolean().optional(),
  applicant_idv_verified: z.boolean().optional(),
  // ADR-012 R2's tier credit, published rather than left for the consumer to
  // re-derive (platform #525). `applicant_idv_verified` above comes from a
  // cross-DB attestation lookup that can under-report (lookup failure, or the
  // attestation write failing after the capture already committed);
  // `idv_credit_earned` is sourced server-side from the same computation the
  // submit gate itself uses, so a consumer that reads this instead of
  // deriving its own "did they earn the credit" answer from
  // `applicant_idv_verified` cannot land on a stricter number than the gate.
  idv_credit_earned: z.boolean().optional(),
  // The vouch requirement the submit gate applies to this session, and how far
  // the applicant is toward it. `required` is null when no requirement can be
  // stated yet. `required_by` names the rule that produced `required`: 'flow'
  // when the session's workflow states its own number, 'account_tier' when the
  // number follows connected accounts. Read these rather than re-deriving them.
  vouch_summary: z
    .object({
      sent: z.number(),
      completed: z.number(),
      required: z.number().nullable(),
      required_by: z.enum(['flow', 'account_tier']).optional(),
    })
    .optional(),
  // Whether POST /sessions/:token/submit would accept this session right now,
  // from the same computation the submit route runs.
  can_submit: z.boolean().optional(),
  // Which OAuth providers this environment has credentials for. The frontend
  // renders a tile only for providers in this list, so an unconfigured
  // provider is absent rather than an enabled tile that dead-ends.
  available_oauth_providers: z.array(z.string()).optional(),
});
export type SessionStatusResponse = z.infer<typeof sessionStatusResponseSchema>;

export const vouchOutcomeResponseSchema = z.object({
  outcome: vouchOutcomeSchema,
  // Absent on the confirm outcome; decline and unable_to_confirm still send a
  // hardcoded 0.
  vouch_strength: z.number().optional(),
  applicant_rescored: z.boolean(),
});
export type VouchOutcomeResponse = z.infer<typeof vouchOutcomeResponseSchema>;

export const caseReviewSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: sourceCategorySchema,
  // Optional: not every source carries a strength grade.
  strength: sourceStrengthSchema.optional(),
  // null when unknown; absent on a vouch source.
  tenure: z.string().nullish(),
  // Absent on a vouch source, which carries `voucher` and `detail` instead.
  corroboration: z.string().optional(),
  status: z.string().optional(),
  detail: z.string().optional(),
  confirmed_applicant: z.boolean().optional(),
  verified_facts: z.array(z.string()).optional(),
  voucher: z
    .object({
      display_name: z.string().optional(),
      relationship: z.string().optional(),
      contact_method: z.string().optional(),
    })
    .optional(),
});
export type CaseReviewSource = z.infer<typeof caseReviewSourceSchema>;

export const caseReviewEvidenceItemSchema = z.object({
  item: z.string(),
  status: evidenceStatusSchema,
});
export type CaseReviewEvidenceItem = z.infer<typeof caseReviewEvidenceItemSchema>;

export const caseReviewTimelineEventSchema = z.object({
  date: z.string(),
  event: z.string(),
  type: z.enum(['positive', 'neutral', 'amber']),
});
export type CaseReviewTimelineEvent = z.infer<typeof caseReviewTimelineEventSchema>;

export const caseReviewContinuityItemSchema = z.object({
  period: z.string(),
  fact: z.string(),
  status: z.enum([
    'aligned',
    'partially-aligned',
    'limited-evidence',
    'inconsistent',
    'needs-corroboration',
  ]),
  impact: z.string(),
  sources: z.array(z.string()),
});
export type CaseReviewContinuityItem = z.infer<typeof caseReviewContinuityItemSchema>;

export const caseReviewPillarSchema = z.object({
  label: z.string(),
  status: z.enum(['verified', 'partial', 'missing']),
  sources: z.number(),
});
export type CaseReviewPillar = z.infer<typeof caseReviewPillarSchema>;

export const caseReviewOpenQuestionSchema = z.object({
  key: z.string(),
  status: z.enum(['confirmed', 'connected', 'not_connected']),
});
export type CaseReviewOpenQuestion = z.infer<typeof caseReviewOpenQuestionSchema>;

export const caseReviewResponseSchema = z.object({
  applicant: z.object({ display_name: z.string() }),
  // The rating fields (`recommendation`, `confidence_label`, `zone`, and the
  // rating part of `confidence_panel`) are omitted for an organization that is
  // not sent a rating. The evidence fields are sent either way.
  recommendation: caseRecommendationSchema.optional(),
  confidence_label: confidenceLabelSchema.optional(),
  reviewer_note: z.string().nullable(),
  connected_sources: z.array(caseReviewSourceSchema),
  evidence_tree: z.object({
    baseline: z.array(caseReviewEvidenceItemSchema),
    digital: z.array(caseReviewEvidenceItemSchema),
    human: z.array(caseReviewEvidenceItemSchema),
    institutional: z.array(caseReviewEvidenceItemSchema),
  }),
  verification_timeline: z.array(caseReviewTimelineEventSchema),
  continuity_timeline: z.array(caseReviewContinuityItemSchema),
  confidence_pillars: z.array(caseReviewPillarSchema),
  open_questions: z.array(caseReviewOpenQuestionSchema),
  actions_available: z.object({
    proceed: z.boolean(),
    hold: z.boolean(),
    request_more: z.boolean(),
  }),
  ai_summary: z
    .object({
      narrative: z.string(),
      suggested_read: z.string(),
      generated_at: z.string(),
      model: z.string(),
    })
    .nullable()
    .optional(),
  confidence_panel: z.unknown().optional(),
  zone: z.string().nullish(),
  not_verified_reason: z.string().nullish(),
  not_verified_reason_label: z.string().nullish(),
  not_verified_note: z.string().nullish(),
});
export type CaseReviewResponse = z.infer<typeof caseReviewResponseSchema>;

// A flow an operator may start a case on.
//
// `workflow_key` is an ADDRESS — frozen, part of the definition table's unique
// constraint and persisted onto the session. `display_name` is PRESENTATION and
// moves freely; keeping them apart is what lets a flow be renamed without
// migrating live sessions.
//
// `display_name` is NULLABLE and is usually null: the column was added without
// a backfill because what these flows should be called is an open product
// question. **Null means fall back to the key** — never render the key as
// though it were a name without saying so.
export const workflowChoiceSchema = z.object({
  workflow_key: z.string(),
  display_name: z.string().nullable(),
});
export type WorkflowChoice = z.infer<typeof workflowChoiceSchema>;

export const operatorOrgSchema = z.object({
  org_id: z.string(),
  name: z.string(),
  subdomain: z.string().nullable(),
  // Optional so a consumer pinned to an older server keeps parsing. Absent
  // means unknown, which is not the same as any particular value — read it as
  // "fall back", never as a default.
  industry: orgIndustrySchema.optional(),
  // Non-'standard' workflow keys this org has definitions for. A statement of
  // fact about configuration, not a product label: the consumer decides what a
  // given key means. Empty array = no definitions, the default journey.
  // Optional so a consumer pinned to an older server keeps parsing.
  workflow_keys: z.array(z.string()).optional(),
  // The same set, carrying the name to show beside each key.
  //
  // A SECOND field rather than a widening of `workflow_keys`, because that
  // array's shape is already declared here and a consumer pinned to v0.1.6 must
  // keep parsing. The two are redundant on purpose and are derived from one
  // query server-side, so they cannot disagree.
  //
  // Optional so a consumer pinned to an older server keeps parsing.
  workflows: z.array(workflowChoiceSchema).optional(),
});
export type OperatorOrg = z.infer<typeof operatorOrgSchema>;

export const operatorMeResponseSchema = z.object({
  email: z.string().nullable(),
  // null = authenticated but not a member of any org. A routable state, not an
  // error, so this is a 200.
  org: operatorOrgSchema.nullable(),
});
export type OperatorMeResponse = z.infer<typeof operatorMeResponseSchema>;

// ---------------------------------------------------------------------------
// Partner contract: the partner routes' bodies and the error format.
//
// Everything below is what an integration partner may rely on. It is
// versioned on its own, separately from this package's version:
// `schema_version` on the result says which contract a response follows.
//
// The `.describe()` texts are not decoration: they become the descriptions in
// openapi/partner-api.json, which is generated from these schemas. Write them
// for the partner who reads that document.
// ---------------------------------------------------------------------------

/**
 * The result contract's version, sent as `schema_version` on every
 * GET /api/v1/inquiries/:inquiry_id/result response.
 *
 * Semantic versioning, applied to the response shape:
 * - MAJOR: a field is removed or renamed, or its type or meaning changes.
 * - MINOR: a field is added. A consumer must ignore fields it does not know.
 * - PATCH: documentation only; the shape is unchanged.
 */
export const RESULT_SCHEMA_VERSION = '1.0.0' as const;

/**
 * One piece of evidence the organization asks for, and whether it has been
 * verified yet.
 */
export const resultSignalSchema = z
  .object({
    type: z
      .string()
      .describe('A stable key for the kind of evidence, such as `contact.email` or `digital.email_history`.'),
    status: z.enum(['verified', 'pending']),
    detail: z
      .string()
      .describe('A short human line describing what was verified. For a pending item, "Not yet verified".'),
    verified_at: z.string().nullable().describe('When the evidence was collected. null while pending.'),
  })
  .describe('One piece of evidence the organization asks for, and whether it has been verified yet.');
export type ResultSignal = z.infer<typeof resultSignalSchema>;

/**
 * A reference (voucher) the applicant invited.
 *
 * `status` is the invitation's state. `accepted` means the voucher OPENED the
 * link, not that they answered. Whether they confirmed the applicant is
 * `outcome`, which stays null until they respond. Known outcomes are
 * `confirm`, `decline` and `unable_to_confirm`; the set is open, so treat an
 * unknown value as "responded, outcome not recognized".
 */
export const resultVoucherSchema = z
  .object({
    invitation_id: z.string(),
    voucher_name: z.string(),
    relationship: z.string(),
    status: z
      .string()
      .describe(
        'The invitation\'s state. `accepted` means the voucher opened the link, not that they answered: see `outcome`.',
      ),
    outcome: z
      .string()
      .nullable()
      .describe(
        'Whether the voucher confirmed the applicant: `confirm`, `decline` or `unable_to_confirm`. null until they respond. The set is open: treat an unknown value as "responded, outcome not recognized".',
      ),
    outcome_notes: z.string().nullable().describe("The voucher's own words, if they left any."),
    qa_responses: z
      .record(z.unknown())
      .nullable()
      .describe("The voucher's answers to the organization's questions, keyed by question."),
    outcome_recorded_at: z.string().nullable(),
    sent_at: z.string(),
    expires_at: z.string(),
  })
  .describe('A reference (voucher) the applicant invited.');
export type ResultVoucher = z.infer<typeof resultVoucherSchema>;

/**
 * Event kinds the result's activity stream sends today. Documentation, not a
 * parse rule: `kind` is an open string so that a new kind is a MINOR change.
 * A consumer should show an unknown kind generically rather than fail.
 */
export const RESULT_EVENT_KINDS = [
  'verification_link_sent',
  'verification_link_resent',
  'verification_submitted',
  'email_verified',
  'phone_verified',
  'email_history_verified',
  'social_account_verified',
  'developer_account_verified',
  'identity_verified',
  'income_verified',
  'vouch_invited',
  'vouch_responded',
  'identity_confidence_established',
  'identity_confidence_not_established',
  'additional_verification_requested',
  'applicant_opted_out',
  'case_closed',
  'operator_requested_more_info',
  'operator_sent_reminder',
  'operator_added_note',
  'operator_case_reopened',
] as const;

/**
 * One row of the activity stream, oldest first.
 *
 * `identity_confidence_established`, `identity_confidence_not_established`
 * and `additional_verification_requested` record the organization's own
 * reviewer decision, not a judgement made by the service.
 */
export const resultEventSchema = z
  .object({
    kind: z
      .string()
      .describe(
        `What happened. Kinds sent today: ${RESULT_EVENT_KINDS.map((k) => `\`${k}\``).join(', ')}. The set is open: show an unknown kind generically rather than fail. \`identity_confidence_established\`, \`identity_confidence_not_established\` and \`additional_verification_requested\` record the organization's own reviewer decision, not a judgement made by the service.`,
      ),
    at: z.string(),
    detail: z.string().nullable().describe('A short human subtitle for the row, when there is one.'),
    actor: z.enum(['applicant', 'operator', 'voucher', 'system']).nullable(),
    source_id: z
      .string()
      .nullable()
      .describe('The id of the thing the event is about: the case, an invitation, an evidence type or a reviewer action.'),
  })
  .describe('One row of the activity stream. The stream is oldest first.');
export type ResultEvent = z.infer<typeof resultEventSchema>;

/**
 * GET /api/v1/inquiries/:inquiry_id/result, contract version 1 (see
 * RESULT_SCHEMA_VERSION for the exact version).
 *
 * Facts only: what was verified, what is pending, who vouched and what they
 * said, and what happened when. It carries no score, zone, recommendation,
 * per-item confidence or score breakdown, and never will under this contract.
 *
 * A response may contain fields this schema does not declare (older fields
 * kept for existing consumers). They are not part of the contract and may
 * disappear in a MAJOR version. In particular:
 * - `applicant.dob` and `applicant.property` come from an earlier product
 *   line and are empty for a hiring case.
 * - `vouchers[].voucher_email` is a third party's contact detail. The
 *   contract carries what the voucher said, not a way to reach them.
 */
export const inquiryResultResponseSchema = z
  .object({
    // Any 1.x.y. A MINOR or PATCH version still parses; a new MAJOR version
    // fails here on purpose, because its fields may mean something else.
    schema_version: z
      .string()
      .regex(/^1\.\d+\.\d+$/)
      .describe(
        'The result contract version this response follows. MINOR adds a field (ignore fields you do not know); MAJOR removes, renames or changes one.',
      ),
    inquiry_id: z.string().describe('The case id.'),
    applicant: z.object({
      name: z.string(),
      email_domain: z.string().nullable().describe('The domain of the verified email address, once one is verified.'),
    }),
    signals_summary: z.array(resultSignalSchema),
    verification_progress: z
      .object({
        current_step: z.number().optional(),
        steps_completed: z.array(z.string()),
        steps_total: z.number(),
        percent_complete: z.number(),
      })
      .describe('How far the applicant is through their steps. All zero before the applicant has a link.'),
    submitted_at: z.string().nullable().describe('When the applicant submitted. null until then.'),
    decided_at: z
      .string()
      .nullable()
      .describe("When the organization's reviewer recorded a decision. null until then."),
    operator_action: z
      .string()
      .nullable()
      .describe(
        "The organization's reviewer decision: `approved`, `denied`, `escalated` or `requested_more_info`. null until one is recorded.",
      ),
    vouchers: z.array(resultVoucherSchema),
    events: z.array(resultEventSchema),
  })
  .describe(
    'The facts of one case: what was verified, what is pending, who vouched and what they said, and what happened when. No score, zone, recommendation, per-item confidence or score breakdown, under this contract version or any 1.x. A response may carry older fields this schema does not declare (`applicant.dob`, `applicant.property`, `vouchers[].voucher_email`); they are not part of the contract and may disappear in a MAJOR version.',
  );
export type InquiryResultResponse = z.infer<typeof inquiryResultResponseSchema>;

/**
 * POST /digavouch/v1/intake/applications: the request body. One application
 * in the caller's own system becomes one case here.
 *
 * The route trims `application_id`, `job_id` and `candidate.email` before it
 * checks them, so a value that is only spaces is refused. Fields not declared
 * here are ignored and not stored. The organization comes from the API key,
 * never from the body.
 */
export const intakeApplicationRequestSchema = z
  .object({
    application_id: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "The application's id in your system: required, not blank, at most 200 characters after trimming. It is the key that makes a retry safe, so it must never change and never be reused for another application.",
      ),
    job_id: z
      .string()
      .min(1)
      .max(200)
      .describe(
        "The job posting's id in your system, with the same limits. Use an id that stays the same for the life of the posting (a database row id, not an editable slug): the organization maps it to what the applicant is asked to verify.",
      ),
    job_title: z
      .string()
      .optional()
      .describe('Optional. Used only to label a job the organization has not mapped yet.'),
    candidate: z.object({
      name: z.string().nullish().describe('Optional. Used to greet the applicant.'),
      email: z
        .string()
        .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
        .describe('Required. Where the applicant is invited, unless the organization takes the link in the response instead.'),
    }),
  })
  .describe(
    'One application from your system. Fields not listed here are ignored and not stored; do not send more than this. The organization comes from the API key, never from the body.',
  );
export type IntakeApplicationRequest = z.infer<typeof intakeApplicationRequestSchema>;

/**
 * POST /digavouch/v1/intake/applications: the success body, on 201
 * (`created`) and on 200 (`existing`, a repeat of an application already
 * received with the same email address).
 *
 * `verification_link` and `verification_link_expires_at` appear only on a 201,
 * and only when the organization takes the link in the response. They never
 * appear on a 200: the link is stored only in a form that cannot be turned
 * back into the link, so a repeat cannot return it.
 */
export const intakeApplicationResponseSchema = z
  .object({
    case_id: z.string().describe('The case id. Use it to read the result and to issue a fresh applicant link.'),
    outcome: z
      .enum(['created', 'existing'])
      .describe('`created`: a new case (201). `existing`: this application id already has a case for this email address (200); nothing new was created and no second invite was sent.'),
    verification_link: z
      .string()
      .optional()
      .describe(
        "The applicant's link, on a 201 only, and only when the organization takes the link in the response instead of, or as well as, an email. It is a credential to the applicant's session: give it only to the applicant, and do not log or store it.",
      ),
    verification_link_expires_at: z
      .string()
      .optional()
      .describe('When the link expires (ISO 8601). Sent with `verification_link`.'),
  })
  .describe('The case this application created or already had.');
export type IntakeApplicationResponse = z.infer<typeof intakeApplicationResponseSchema>;

/**
 * POST /digavouch/v1/inquiries/:inquiry_id/session: the 201 body.
 *
 * The response also carries `session_token`, the same token that ends
 * `verification_link`. It is not part of the contract: the link is what a
 * partner hands on, and one copy of a credential is enough.
 */
export const inquirySessionResponseSchema = z
  .object({
    verification_link: z
      .string()
      .describe(
        "A new link for the applicant, valid for 72 hours. No email is sent: deliver it yourself. It is a credential to the applicant's session: give it only to the applicant, and do not log or store it.",
      ),
    inquiry_id: z.string().describe('The case id.'),
    org_id: z.string().describe("The organization's id."),
  })
  .describe(
    'A fresh applicant link. The response also carries `session_token`, the token at the end of the link; it is not part of the contract and may disappear in a MAJOR version.',
  );
export type InquirySessionResponse = z.infer<typeof inquirySessionResponseSchema>;

/**
 * One case in GET /api/v1/orgs/:org_id/inquiries.
 *
 * Each row also carries `person_id`, an internal identifier no partner route
 * takes; it is not part of the contract.
 */
export const inquiryListItemSchema = z
  .object({
    inquiry_id: z.string().describe('The case id.'),
    org_id: z.string(),
    status: z
      .string()
      .describe(
        "The case's processing state. `decided` means the organization's reviewer recorded a decision (see `operator_action`). The set is open: read any other value as not decided, and read the result for the facts.",
      ),
    source: z.string().describe('How the case was created, such as `api` or `ats_sync`. The set is open.'),
    operator_action: z
      .string()
      .nullable()
      .describe(
        "The organization's reviewer decision: `approved`, `denied`, `escalated` or `requested_more_info`. null until one is recorded.",
      ),
    operator_action_at: z.string().nullable().describe('When that decision was recorded. null until then.'),
    created_at: z.string(),
    updated_at: z.string(),
    applicant_name: z.string().nullable(),
  })
  .describe(
    'One case, newest first. Each row also carries `person_id`, which no partner route takes; it is not part of the contract.',
  );
export type InquiryListItem = z.infer<typeof inquiryListItemSchema>;

/** GET /api/v1/orgs/:org_id/inquiries: the 200 body. */
export const inquiryListResponseSchema = z
  .object({
    inquiries: z.array(inquiryListItemSchema).describe('Every case the organization has not deleted, newest first. There is no paging.'),
    total: z.number().describe('The number of cases in `inquiries`.'),
  })
  .describe("The organization's cases.");
export type InquiryListResponse = z.infer<typeof inquiryListResponseSchema>;

/**
 * Every machine-readable error code a partner-facing route returns. Closed: a
 * partner-facing route returns no code outside this list. Adding a code is a
 * new package version, so branch on the HTTP status first and on the code
 * second, and treat an unknown code by its status.
 *
 * Two pairs mean the same thing and both stay because existing callers
 * already receive them: FORBIDDEN and ORG_MISMATCH (the record or path
 * belongs to another organization), NOT_FOUND and INQUIRY_NOT_FOUND.
 *
 * Retry rule: retry a 429 after `retry_after_seconds`, and INTERNAL_ERROR
 * with the same request a few times with backoff; never retry any other code
 * unchanged. A body that is not valid JSON currently also returns 500
 * INTERNAL_ERROR, so check the body before retrying.
 */
export const PARTNER_ERROR_CODES = [
  // 400: a field is missing or invalid. `field` names it (dotted path) when known.
  'INVALID_REQUEST',
  // 400: the organization-selection header is not an organization id.
  'ORG_SELECTION_INVALID',
  // 401: no API key, or the key is not valid.
  'INVALID_AUTH',
  // 403: this route takes a server-held API key, not a person's login.
  'API_KEY_REQUIRED',
  // 403: the record belongs to another organization.
  'FORBIDDEN',
  // 403: the organization in the path or body is not the key's organization.
  'ORG_MISMATCH',
  // 403: the organization-selection header names an organization the key is not for.
  'ORG_SELECTION_FORBIDDEN',
  // 404: no such case for this organization.
  'NOT_FOUND',
  'INQUIRY_NOT_FOUND',
  // 409: the case already has a decision, so no new applicant link is issued.
  'INQUIRY_DECIDED',
  // 409: this application id is already linked to a case for a different email address.
  'APPLICATION_EMAIL_MISMATCH',
  // 409: the case for this application id was deleted by the organization; it is not recreated.
  'CASE_DELETED',
  // 422: the job is not mapped and the organization does not accept unmapped jobs.
  'UNMAPPED_JOB',
  // 429: too many requests. `retry_after_seconds` says when to try again.
  'RATE_LIMIT_EXCEEDED',
  // 500: the organization's account is missing a setting needed for this job.
  // Retrying does not help; contact support.
  'NO_DEFAULT_CAMPAIGN',
  // 500: an unexpected error. Retry with backoff (see the retry rule above).
  'INTERNAL_ERROR',
] as const;
export const partnerErrorCodeSchema = z
  .enum(PARTNER_ERROR_CODES)
  .describe(
    'For machines; a code never changes meaning. The list is closed, and adding a code is a new contract package version: branch on the HTTP status first and the code second, and treat an unknown code by its status. FORBIDDEN and ORG_MISMATCH mean the same thing, as do NOT_FOUND and INQUIRY_NOT_FOUND; both of each pair stay because existing callers receive them.',
  );
export type PartnerErrorCode = z.infer<typeof partnerErrorCodeSchema>;

/**
 * The error body of every partner-facing route: start a check, get a result,
 * issue a fresh applicant link, list cases, and the decision log.
 *
 * `code` is for machines and never changes meaning. `message` is for people,
 * may be reworded, and never contains the applicant's or a voucher's personal
 * data, so it is safe to log or pass on. Some responses also carry older
 * fields (`error`, `statusCode`) kept for existing callers; they are not part
 * of the contract.
 */
export const partnerErrorSchema = z
  .object({
    code: partnerErrorCodeSchema,
    message: z
      .string()
      .describe(
        "For people. May be reworded. Never contains the applicant's or a voucher's personal data, so it is safe to log or pass on.",
      ),
    field: z
      .string()
      .optional()
      .describe('On INVALID_REQUEST, the field that is missing or invalid, as a dotted path, when known.'),
    retry_after_seconds: z.number().optional().describe('On a 429 only: how many seconds to wait before retrying.'),
  })
  .describe(
    'The error body of every partner route. Retry rule: retry a 429 after `retry_after_seconds`, and INTERNAL_ERROR with the same request a few times with backoff; never retry any other code unchanged. Some responses also carry older fields (`error`, `statusCode`) kept for existing callers; they are not part of the contract.',
  );
export type PartnerError = z.infer<typeof partnerErrorSchema>;
