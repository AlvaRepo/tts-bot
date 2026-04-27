allowCommandsFromSubscribers: input.allowCommandsFromSubscribers !== false,
    sessionToken: typeof input.sessionToken === 'string' && input.sessionToken.trim().length > 0 ? input.sessionToken.trim() : '',
    
    // Customer OAuth tokens (for sending TTS to customer's channel)
    customerAccessToken: null,
    customerRefreshToken: null,
    customerBroadcasterId: null,
    customerUsername: null,
    customerChatroomId: null