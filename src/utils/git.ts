const axios = require('axios')
import fs from 'node:fs/promises'
const AdmZip = require('adm-zip')
import path from 'node:path'
import { sql } from './db'

type GitServiceType = 'github' | 'gitlab' | 'bitbucket'

export async function downloadAndExtractRepo(
  gitService: GitServiceType,
  repoOrg: string,
  repoName: string,
  branch: string,
  accessToken: string
) {
  let url, commitUrl, headers
  switch (gitService) {
    case 'github':
      url = `https://api.github.com/repos/${repoOrg}/${repoName}/zipball/${branch}`
      commitUrl = `https://api.github.com/repos/${repoOrg}/${repoName}/commits?sha=${branch}&per_page=1`
      headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${accessToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
      break
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${repoOrg}/${repoName}/repository/archive.zip?sha=${branch}`
      commitUrl = `https://gitlab.com/api/v4/projects/${repoOrg}%2F${repoName}/repository/commits/${branch}`
      headers = {
        Authorization: `Bearer ${accessToken}`
      }
      break
    case 'bitbucket':
      url = `https://api.bitbucket.org/2.0/repositories/${repoOrg}/${repoName}/get?at=${branch}`
      commitUrl = `https://api.bitbucket.org/2.0/repositories/${repoOrg}/${repoName}/commits/${branch}`
      headers = {
        Authorization: `Bearer ${accessToken}`
      }
      break
  }
  try {
    const commitResponse = await axios({
      method: 'GET',
      url: commitUrl,
      headers
    })
    const commitSha = commitResponse.data[0].sha
    console.log(commitSha)
    try {
      const response = await axios({
        method: 'GET',
        url,
        responseType: 'arraybuffer',
        headers
      })

      const tmpFolderPath = `${process.cwd()}/tmp`
      await fs.mkdir(tmpFolderPath, { recursive: true })

      const extractPath = `${tmpFolderPath}/${commitSha}_${repoOrg}_${repoName}_${branch}`
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
      ).entryName
      zip.extractAllTo(extractPath, true)

      // Delete zip
      await fs.unlink(zipPath)
      return { commitSha, codebasePath: path.join(extractPath, mainFolderPath) }
    } catch (error) {
      console.log(error)
      throw error
    }
  } catch (error) {
    console.log(error)
  }
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
