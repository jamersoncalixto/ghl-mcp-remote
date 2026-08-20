/**
 * Scopes requested at agency-install time. Must match (a subset of / exactly) what the
 * GHL Marketplace app was configured with, or GHL will reject/trim the authorization request.
 */
export const GHL_SCOPES = [
  "companies.readonly",
  "locations.readonly",
  "contacts.readonly",
  "contacts.write",
  "opportunities.readonly",
  "opportunities.write",
  "calendars.readonly",
  "calendars.write",
  "calendars/events.readonly",
  "calendars/events.write",
  "conversations.readonly",
  "conversations.write",
  "conversations/message.readonly",
  "conversations/message.write",
  "forms.readonly",
  "funnels/funnel.readonly",
  "funnels/page.readonly",
  "locations/tags.readonly",
  "locations/tags.write",
  "locations/customFields.readonly",
  "locations/customFields.write",
  "locations/customValues.readonly",
  "locations/customValues.write",
  "workflows.readonly",
  // Note: unlike most other resources, GHL's LC Phone scopes use ".read", not ".readonly".
  "phonenumbers.read",
  "phonenumbers.write",
] as const;

export const GHL_SCOPE_STRING = GHL_SCOPES.join(" ");
