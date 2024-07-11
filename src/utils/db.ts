import { AllowedTypes } from '../model/consts'
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


export interface GraphNode {
  id: string
  full_name: string
  type: AllowedTypes
  language: string
  documentation: string
  code: string
  code_no_body: string
  total_tokens: number
  in_degree: number
  out_degree: number
  label: string
  origin_file: string
  generated_documentation: string
  import_statements: string
}

export interface GraphLink {
  id: string
  node_source_id: string
  node_target_id: string
  label: string
  line: number
}