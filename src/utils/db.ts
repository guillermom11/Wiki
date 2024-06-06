import { getEnv } from './utils'
import postgres from 'postgres'

export const sql = postgres({
  host: getEnv('DATABASE_HOST'),
  database: getEnv('DATABASE_NAME'),
  port: Number(getEnv('DATABASE_PORT')),
  user: getEnv('DATABASE_USERNAME'),
  password: getEnv('DATABASE_PASSWORD'),
  prepare: false,
  connect_timeout: 60,
  idle_timeout: 60,
  ssl: {
    ca: getEnv('SUPABASE_CA_CERTIFICATE')
  }
  // ssl: {
  //   rejectUnauthorized: false
  // }
})
