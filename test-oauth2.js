// Debug script to test OAuth token exchange with PKCE
const clientId = '01KQ4P02PXPT09ASA4HCKVERR7'
const clientSecret = '78f949faf01a215f94a1e6bc5eca83829e12edaa95fdda7c369d150c5254d8ba'
const redirectUri = 'https://tts-bot-alva.onrender.com/oauth/callback'

// You'll need to get the code by visiting the OAuth URL first
// Then manually paste it here for testing

async function testTokenExchange(code, codeVerifier) {
  console.log('Testing OAuth token exchange with PKCE...')
  console.log('Client ID:', clientId)
  console.log('Redirect URI:', redirectUri)
  
  const body = new URLSearchParams()
  body.set('grant_type', 'authorization_code')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)
  body.set('redirect_uri', redirectUri)
  body.set('code', code)
  body.set('code_verifier', codeVerifier)

  try {
    const response = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
    
    const data = await response.json()
    console.log('Status:', response.status)
    console.log('Response:', JSON.stringify(data, null, 2))
    
    if (data.access_token) {
      console.log('\n✅ Token obtained!')
      console.log('Access token:', data.access_token.substring(0, 20) + '...')
      console.log('Refresh token:', data.refresh_token?.substring(0, 20) + '...')
      console.log('Expires in:', data.expires_in, 'seconds')
      return data
    }
  } catch (e) {
    console.error('Error:', e.message)
  }
}

// Test sending a chat message with the token
async function testSendChat(accessToken, broadcasterUserId) {
  console.log('\nTesting send chat message...')
  
  const body = JSON.stringify({
    type: 'bot',
    content: 'Test message from bot - OAuth working!',
    broadcaster_user_id: broadcasterUserId
  })
  
  try {
    const response = await fetch('https://api.kick.com/public/v1/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body
    })
    
    const data = await response.json()
    console.log('Status:', response.status)
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error:', e.message)
  }
}

// If run with arguments
const args = process.argv.slice(2)
if (args.length >= 2) {
  testTokenExchange(args[0], args[1]).then(token => {
    if (token && args[2]) {
      testSendChat(token.access_token, args[2])
    }
  })
} else {
  console.log('Usage: node test-oauth2.js <code> <code_verifier> [broadcaster_user_id]')
  console.log('\nTo get the OAuth URL, run the server and visit /api/bot/oauth-url')
  console.log('Then visit the URL, authorize, and copy the code from the redirect URL')
}