const axios = require('axios')
import fs from 'node:fs/promises'
const AdmZip = require('adm-zip')
import path from 'node:path'

type GitServiceType = 'github' | 'gitlab' | 'bitbucket'

export async function downloadAndExtractRepo(
  gitService: GitServiceType,
  user: string,
  repo: string,
  branch: string,
  token: string
) {
  let url, commitUrl, headers
  switch (gitService) {
    case 'github':
      url = `https://api.github.com/repos/${user}/${repo}/zipball/${branch}`
      commitUrl = `https://api.github.com/repos/${user}/${repo}/commits?sha=${branch}&per_page=1`
      headers = {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      }
      break
    case 'gitlab':
      url = `https://gitlab.com/api/v4/projects/${user}/${repo}/repository/archive.zip?sha=${branch}`
      commitUrl = `https://gitlab.com/api/v4/projects/${user}%2F${repo}/repository/commits/${branch}`
      headers = {
        Authorization: `Bearer ${token}`
      }
      break
    case 'bitbucket':
      url = `https://api.bitbucket.org/2.0/repositories/${user}/${repo}/get?at=${branch}`
      commitUrl = `https://api.bitbucket.org/2.0/repositories/${user}/${repo}/commits/${branch}`
      headers = {
        Authorization: `Bearer ${token}`
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

      const extractPath = `${tmpFolderPath}/${commitSha}_${user}_${repo}_${branch}`
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
      return path.join(extractPath, mainFolderPath)
    } catch (error) {
      console.log(error)
      throw error
    }
  } catch (error) {
    console.log(error)
  }
}
