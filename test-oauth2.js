// Debug script to test OAuth token endpoint
const clientId = '01KQ4P02PXPT09ASA4HCKVERR7'
const clientSecret = '78f949faf01a215f94a1e6bc5eca83829e12edaa95fdda7c369d150c5254d8ba'

async function test() {
  console.log('Testing OAuth token endpoint...')
  
  const body = new URLSearchParams()
  body.set('grant_type', 'client_credentials')
  body.set('client_id', clientId)
  body.set('client_secret', clientSecret)

  try {
    const response = await fetch('https://id.kick.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString()
    })
    
    const data = await response.json()
    console.log('Status:', response.status)
    console.log('Response:', JSON.stringify(data, null, 2))
  } catch (e) {
    console.error('Error:', e.message)
  }
}

test()