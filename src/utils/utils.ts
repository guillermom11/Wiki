export const ENV_VARS = {

  DATABASE_USERNAME: process.env.DATABASE_USERNAME,
  DATABASE_PASSWORD: process.env.DATABASE_PASSWORD,
  DATABASE_HOST: process.env.DATABASE_HOST,
  DATABASE_PORT: process.env.DATABASE_PORT,
  DATABASE_NAME: process.env.DATABASE_NAME,
  SUPABASE_CA_CERTIFICATE: process.env.SUPABASE_CA_CERTIFICATE,
  SUPABASE_JWT: process.env.SUPABASE_JWT,
  GITLAB_APP_ID: process.env.GITLAB_APP_ID,
  GITLAB_SECRET_ID: process.env.GITLAB_SECRET_ID,
  BITBUCKET_KEY: process.env.BITBUCKET_KEY,
  BITBUCKET_SECRET: process.env.BITBUCKET_SECRET,
}
//
export function getEnv(envKey: keyof typeof ENV_VARS) {
  const env = ENV_VARS[envKey]
  if (env == null) {
    throw new Error(`Missing environment variable ${envKey}`)
  }

  return env
}