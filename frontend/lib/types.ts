export type Contact = {
  id: string; name: string; phone: string; email: string; address: string; kind: string;
  tags: string[]; blocked: boolean; spam_score: number; notes: string; created_at: string; calls?: number;
};

export type CallItem = {
  id: string; channel: string; from: string; status: string; outcome: string; intent: string; urgency: string;
  summary: string; duration_seconds: number; after_hours: boolean; needs_attention: boolean; started_at: string;
  contact: Contact | null;
};

export type Turn = { role: "assistant" | "user"; text: string };

export type CallDetail = CallItem & {
  to: string; transcript: Turn[]; extracted: Record<string, unknown>; recording_url: string; ended_at: string | null;
  profile_version: number; events: { kind: string; data: { args?: Record<string, unknown>; result?: Record<string, unknown> }; at: string }[];
  history: CallItem[];
};

export type Message = { id: string; channel: string; body: string; status: "sent" | "simulated" | "failed" | string; error: string; call_id?: string | null; created_at: string };

export type Task = { id: string; kind: string; title: string; detail: string; priority: string; status: string; call_id: string | null; created_at: string };

export type Analytics = {
  days: number; total_calls: number; booked: number; after_hours: number; autonomous_rate: number; conversion_rate: number;
  avg_duration_seconds: number; minutes: number; spam_blocked: number; missed_recovered: number; open_tasks: number;
  by_outcome: Record<string, number>; by_intent: Record<string, number>; by_day: { date: string; calls: number }[]; by_hour: number[];
};

export type Usage = {
  days: number; calls: number; minutes: number; messages: number; transfers: number; estimated_cost_usd: number;
  provider_reported_cost_usd: number; rates: { per_minute: number; per_sms: number }; projection: { minutes: number; cost_usd: number }[];
};

export type Service = { name: string; description: string; duration_minutes: number; price_from: number | null; price_to: number | null; price_note: string; bookable: boolean };
export type Faq = { question: string; answer: string };
export type Policy = { title: string; body: string };
export type DayHours = { day: string; open: string | null; close: string | null; closed: boolean };
export type Escalation = { name: string; role: string; phone: string; email: string; whatsapp: string; receives: string[] };
export type IntakeField = { key: string; label: string; required: boolean; hint: string };

export type Profile = {
  business_name: string; industry: string; description: string; website: string; address: string; timezone: string; currency: string;
  assistant_name: string; assistant_role: string; tone: string; greeting: string; after_hours_greeting: string; languages: string[];
  voice: { provider: string; voice_id: string; language: string; speed: number; background_sound: string; first_message_mode: string };
  routing_mode: "AI_FIRST" | "AI_OVERFLOW" | "AI_AFTER_HOURS" | "HUMAN_FIRST"; overflow_ring_seconds: number; hours: DayHours[];
  services: Service[]; service_area: string[]; service_area_note: string; faqs: Faq[]; policies: Policy[]; never_say: string[];
  intake_fields: IntakeField[]; emergency_keywords: string[]; emergency_script: string; escalation: Escalation[]; transfer_number: string;
  booking_enabled: boolean; booking_provider: string; booking_link: string; slot_minutes: number;
  followup: { enabled: boolean; days: number[]; channel: string };
  compliance: { disclose_ai: boolean; record_calls: boolean; recording_notice: string; region: string; retention_days: number; no_advice_domains: string[] };
  custom_instructions: string;
};

export type Preset = { key: string; label: string; summary: string; profile: Partial<Profile> };

export type KnowledgeDoc = { id: string; filename: string; pages: number; chars: number; status: string; proposed_changes: Partial<Profile>; created_at: string };

export type Me = { user: { id: string; email: string; name: string; role: string }; tenant: { id: string; slug: string; name: string; industry: string; plan: string } };

export type PhoneNumber = { id: string; e164: string; label: string; country: string; provider: string; provider_ref: string; forwarding_mode: string; active: boolean };
