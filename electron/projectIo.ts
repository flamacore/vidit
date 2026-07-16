import fs from 'node:fs/promises'
import type { SavedProject } from '../shared/savedProject'

export type { SavedProject }
export { PROJECT_VERSION } from '../shared/savedProject'

export async function writeProjectFile(filePath: string, project: SavedProject): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(project, null, 2), 'utf8')
}

export async function readProjectFile(filePath: string): Promise<SavedProject> {
  const raw = await fs.readFile(filePath, 'utf8')
  const data = JSON.parse(raw) as SavedProject
  if (!data || typeof data !== 'object' || !Array.isArray(data.assets)) {
    throw new Error('Invalid project file')
  }
  return data
}
