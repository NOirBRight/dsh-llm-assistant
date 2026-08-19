import { describe, expect, it } from 'vitest'

import { decodeSendRequest } from '../src/contract.ts'

describe('send image contract', () => {
  it('rejects an oversize image instead of silently dropping it', () => {
    const huge = 'a'.repeat(5_000_001)
    expect(decodeSendRequest({
      text: 'see this',
      images: [{ name: 'big.png', mediaType: 'image/png', dataBase64: huge }],
    })).toBeUndefined()
  })

  it('accepts a small image payload', () => {
    expect(decodeSendRequest({
      text: 'see this',
      images: [{ name: 'ok.png', mediaType: 'image/png', dataBase64: 'AAAA' }],
    })).toEqual({
      text: 'see this',
      images: [{ name: 'ok.png', mediaType: 'image/png', dataBase64: 'AAAA' }],
    })
  })
})
