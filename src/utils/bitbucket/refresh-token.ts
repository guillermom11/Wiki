import { getEnv } from "../utils"

export async function refreshAccessToken(refreshToken: string): Promise<any> {
  try {
    const rawBody = {
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      client_id: getEnv('BITBUCKET_KEY'),
      client_secret: getEnv('BITBUCKET_SECRET')
    }

    const body = Object.entries(rawBody)
      .map(([key, value]) => `${key}=${value}`)
      .join('&')

    const res = await fetch('https://bitbucket.org/site/oauth2/access_token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body
    })

    if (res.ok) {
      const { access_token: newAccessToken, refresh_token: newRefreshToken } = await res.json()

      return {
        newAccessToken,
        newRefreshToken
      }
    } else {
      const data = await res.json()
      console.error('Error al renovar el token de acceso:', data)
      return null
    }
  } catch (error) {
    console.error('Error al renovar el token de acceso:', error)
    return null
  }
}