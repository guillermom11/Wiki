import { getEnv } from "../utils"

export async function refreshAccessToken(refreshToken: string): Promise<any> {
  try {
    const url = new URL('https://gitlab.com/oauth/token')
    url.searchParams.set('refresh_token', refreshToken)
    url.searchParams.set('grant_type', 'refresh_token')
    url.searchParams.set('client_id', getEnv('GITLAB_APP_ID'))
    url.searchParams.set('client_secret', getEnv('GITLAB_SECRET_ID'))

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json'
      }
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