import axios from 'axios'
import fs from 'node:fs/promises'
import AdmZip from 'adm-zip'
import path from 'node:path'
import { sql } from './db'

export type GitServiceType = 'github' | 'gitlab' | 'bitbucket'

export async function downloadAndExtractRepo(
  gitService: GitServiceType,
  repoOrg: string,
  repoName: string,
  branch: string,
  accessToken: string,
  commitSha: string,
  gitlabRepoId?: number
): Promise<string> {
  let url

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`
  }

  switch (gitService) {
    case 'github':
      url = `https://api.github.com/repos/${repoOrg}/${repoName}/zipball/${branch}`

      headers['Accept'] = 'application/vnd.github+json'
      headers['X-GitHub-Api-Version'] = '2022-11-28'
      break
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${gitlabRepoId}/repository/archive.zip?sha=${branch}`

      break
    case 'bitbucket':
      url = `https://bitbucket.org/${repoOrg}/${repoName}/get/${branch}.zip`

      break
  }
  
  try {
    const response = await axios({
      method: 'GET',
      url,
      responseType: 'arraybuffer',
      headers
    })

    const tmpFolderPath = `${process.cwd()}/tmp`
    await fs.mkdir(tmpFolderPath, { recursive: true })

    const extractPath = path.join(tmpFolderPath, `${commitSha}_${repoOrg}_${repoName}_${branch}`)

    // Save zip
    const zipPath = `${extractPath}.zip`
    await fs.writeFile(zipPath, response.data)

    // Extract zip
    const zip = new AdmZip(zipPath)

    const zipEntries = zip.getEntries()

    const mainFolderPath = zipEntries.find(
      (entry: any) =>
        entry.isDirectory &&
        entry.entryName.endsWith('/') &&
        (entry.entryName.match(/\//g) || []).length == 1
    )?.entryName
    zip.extractAllTo(extractPath, true)

    // Delete zip
    await fs.unlink(zipPath)
    return path.join(extractPath, mainFolderPath ?? '')
  } catch (error) {
    console.log(error)
    throw error
  }
}

export async function getCommitRepo(
  gitService: GitServiceType,
  repoOrg: string,
  repoName: string,
  branch: string,
  accessToken: string,
  gitlabRepoId?: number 
): Promise<string> {
  let commitUrl

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`
  }

  switch (gitService) {
    case 'github':
      commitUrl = `https://api.github.com/repos/${repoOrg}/${repoName}/commits?sha=${branch}&per_page=1`

      headers['X-GitHub-Api-Version'] = '2022-11-28'
      headers['Accept'] = 'application/vnd.github+json'

      break
    case 'gitlab':
      commitUrl = `https://gitlab.com/api/v4/projects/${gitlabRepoId}/repository/commits?ref_name=${branch}`
      break
    case 'bitbucket':
      commitUrl = `https://api.bitbucket.org/2.0/repositories/${repoOrg}/${repoName}/commits/${branch}`
      break
  }
  try {
    const res = await fetch(commitUrl, {
      headers
    })

    if (!res.ok) {
      const error = await res.json()
      console.log({ error })
      throw new Error('Error fetching commit')
    }

    const data = await res.json()

    const commitSha = getCommitHash(gitService, data)
    return commitSha
  } catch (error) {
    console.log(error)
    throw error
  }
}

function getCommitHash(provider: 'github' | 'gitlab' | 'bitbucket', data: any): string {
  if (provider === 'github') {
    return data[0].sha
  } else if (provider === 'gitlab') {
    return data[0].id
  } else if (provider === 'bitbucket') {
    return data.values[0].hash
  }

  return ''
}

export async function getAccessToken(
  gitProvider: GitServiceType,
  connectionId: string,
  UserOrgId: string
): Promise<string | null> {
  if (connectionId === '-1') {
    return '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'
  }

  try {
    const table = `${gitProvider}_connections`
    const rows = await sql`
      SELECT 
        access_token
      FROM ${sql(table)}
      WHERE 
        id = ${connectionId}
        AND org_id = ${UserOrgId}
    `

    if (rows.length === 0) return null
    return rows[0].access_token
  } catch (error) {
    console.log(error)
    return null
  }
}
