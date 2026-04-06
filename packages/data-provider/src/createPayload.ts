import type * as t from './types';
import { EndpointURLs } from './config';
import { apiBaseUrl } from './api-endpoints';
import * as s from './schemas';
import { EModelEndpoint } from './schemas';

export default function createPayload(submission: t.TSubmission) {
  const {
    isEdited,
    addedConvo,
    userMessage,
    isContinued,
    isTemporary,
    isRegenerate,
    conversation,
    editedContent,
    ephemeralAgent,
    endpointOption,
  } = submission;
  const { conversationId } = s.tConvoUpdateSchema.parse(conversation);
  const { endpoint: _e, endpointType } = endpointOption as {
    endpoint: s.EModelEndpoint;
    endpointType?: s.EModelEndpoint;
  };

  const endpoint = _e as s.EModelEndpoint;
  let server = `${EndpointURLs[s.EModelEndpoint.agents]}/${endpoint}`;
  if (s.isAssistantsEndpoint(endpoint)) {
    server =
      EndpointURLs[(endpointType ?? endpoint) as 'assistants' | 'azureAssistants'] +
      (isEdited ? '/modify' : '');
  } else if (s.isAnalyticsEndpoint(endpoint)) {
    // Analytics endpoint uses its own route handler
    server = `${apiBaseUrl()}/api/analytics/chat`;
  }

  const payload: t.TPayload = {
    ...userMessage,
    ...endpointOption,
    endpoint,
    addedConvo,
    isTemporary,
    isRegenerate,
    editedContent,
    conversationId,
    isContinued: !!(isEdited && isContinued),
    ephemeralAgent: s.isAssistantsEndpoint(endpoint) ? undefined : ephemeralAgent,
  };

  // ⭐ Debug: Log analyticsModel and agentType in payload for analytics/closeAI endpoints
  if (s.isAnalyticsEndpoint(endpoint) || endpoint === EModelEndpoint.closeAI) {
    const analyticsModelInPayload = (endpointOption as any)?.analyticsModel;
    const agentTypeInPayload = (endpointOption as any)?.agentType;
    console.log('[createPayload] Analytics payload created:', {
      endpoint,
      server,
      analyticsModel: analyticsModelInPayload || 'NOT PROVIDED',
      hasAnalyticsModel: !!analyticsModelInPayload,
      agentType: agentTypeInPayload || 'NOT PROVIDED',
      hasAgentType: !!agentTypeInPayload,
      endpointOptionKeys: Object.keys(endpointOption || {}),
    });
  }

  return { server, payload };
}
