import { PMTiles, Protocol } from 'pmtiles'

export const PMTILES_KEY = 'local/regions'

class BufferSource {
  private buffer: ArrayBuffer

  constructor(buffer: ArrayBuffer) {
    this.buffer = buffer
  }

  getKey() {
    return PMTILES_KEY
  }

  async getBytes(offset: number, length: number) {
    return { data: this.buffer.slice(offset, offset + length) }
  }
}

let loadPromise: Promise<void> | null = null

export const pmtilesProtocol = new Protocol()

export async function ensureRegionsPmtiles() {
  if (!loadPromise) {
    loadPromise = (async () => {
      const response = await fetch(`${import.meta.env.BASE_URL}data/regions.pmtiles`)
      if (!response.ok) throw new Error('Failed to load map geometry')
      const buffer = await response.arrayBuffer()
      pmtilesProtocol.add(new PMTiles(new BufferSource(buffer)))
    })()
  }
  return loadPromise
}

export function pmtilesSourceUrl() {
  return `pmtiles://${PMTILES_KEY}`
}
