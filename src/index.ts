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
// Partner contract: the inquiry result and the error format.
//
// Everything below is what an integration partner may rely on. It is
// versioned on its own, separately from this package's version:
// `schema_version` on the result says which contract a response follows.
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
 * verified yet. `type` is a stable key such as `contact.email` or
 * `digital.email_history`; `detail` is a short human line describing what was
 * verified (for a pending item, "Not yet verified").
 */
export const resultSignalSchema = z.object({
  type: z.string(),
  status: z.enum(['verified', 'pending']),
  detail: z.string(),
  // When the evidence was collected. null while pending.
  verified_at: z.string().nullable(),
});
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
export const resultVoucherSchema = z.object({
  invitation_id: z.string(),
  voucher_name: z.string(),
  relationship: z.string(),
  status: z.string(),
  outcome: z.string().nullable(),
  // The voucher's own words, if they left any.
  outcome_notes: z.string().nullable(),
  // The voucher's answers to the organization's questions, keyed by question.
  qa_responses: z.record(z.unknown()).nullable(),
  outcome_recorded_at: z.string().nullable(),
  sent_at: z.string(),
  expires_at: z.string(),
});
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
export const resultEventSchema = z.object({
  kind: z.string(),
  at: z.string(),
  // A short human subtitle for the row, when there is one.
  detail: z.string().nullable(),
  actor: z.enum(['applicant', 'operator', 'voucher', 'system']).nullable(),
  // The id of the thing the event is about (the case, an invitation, an
  // evidence type or a reviewer action).
  source_id: z.string().nullable(),
});
export type ResultEvent = z.infer<typeof resultEventSchema>;

/**
 * GET /api/v1/inquiries/:inquiry_id/result, version 1.0.0.
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
export const inquiryResultResponseSchema = z.object({
  schema_version: z.string(),
  inquiry_id: z.string(),
  applicant: z.object({
    name: z.string(),
    // The domain of the verified email address, once one is verified.
    email_domain: z.string().nullable(),
  }),
  signals_summary: z.array(resultSignalSchema),
  // How far the applicant is through their steps. All zero before the
  // applicant has a link.
  verification_progress: z.object({
    current_step: z.number().optional(),
    steps_completed: z.array(z.string()),
    steps_total: z.number(),
    percent_complete: z.number(),
  }),
  // When the applicant submitted. null until then.
  submitted_at: z.string().nullable(),
  // When the organization's reviewer recorded a decision. null until then.
  decided_at: z.string().nullable(),
  // The reviewer's decision: `approved`, `denied`, `escalated` or
  // `requested_more_info`. null until one is recorded.
  operator_action: z.string().nullable(),
  vouchers: z.array(resultVoucherSchema),
  events: z.array(resultEventSchema),
});
export type InquiryResultResponse = z.infer<typeof inquiryResultResponseSchema>;

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
 * Retry rule: retry a 429 after `retry_after_seconds`, and a 5xx with the same
 * request; never retry any other 4xx unchanged.
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
  // 500: the organization's account is missing a setting needed for this job. Contact support.
  'NO_DEFAULT_CAMPAIGN',
  // 500: an unexpected error. Safe to retry.
  'INTERNAL_ERROR',
] as const;
export const partnerErrorCodeSchema = z.enum(PARTNER_ERROR_CODES);
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
export const partnerErrorSchema = z.object({
  code: partnerErrorCodeSchema,
  message: z.string(),
  field: z.string().optional(),
  // On a 429 only.
  retry_after_seconds: z.number().optional(),
});
export type PartnerError = z.infer<typeof partnerErrorSchema>;
