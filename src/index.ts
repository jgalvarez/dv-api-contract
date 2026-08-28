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
  // Which OAuth providers this environment has credentials for. The frontend
  // renders a tile only for providers in this list, so an unconfigured
  // provider is absent rather than an enabled tile that dead-ends.
  available_oauth_providers: z.array(z.string()).optional(),
});
export type SessionStatusResponse = z.infer<typeof sessionStatusResponseSchema>;

export const vouchOutcomeResponseSchema = z.object({
  outcome: vouchOutcomeSchema,
  vouch_strength: z.number(),
  applicant_rescored: z.boolean(),
  applicant_score: z.number().optional(),
  applicant_zone: zoneSchema.optional(),
});
export type VouchOutcomeResponse = z.infer<typeof vouchOutcomeResponseSchema>;

export const caseReviewSourceSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: sourceCategorySchema,
  strength: sourceStrengthSchema,
  tenure: z.string(),
  corroboration: z.string(),
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
  recommendation: caseRecommendationSchema,
  confidence_label: confidenceLabelSchema,
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
