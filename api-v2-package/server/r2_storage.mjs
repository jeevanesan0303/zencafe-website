
import crypto from 'node:crypto'
import dotenv from 'dotenv'
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3'

dotenv.config()

export const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
])

// Test-only storage. Never used as a production fallback.
export const mockR2Storage = new Map()

let cachedClient = null
let cachedSignature = ''

function isTestMode() {
  return (
    process.env.NODE_ENV === 'test' ||
    process.env.ZEN_TEST_MODE === 'true'
  )
}

export function checkR2Configuration() {
  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucketName = process.env.R2_BUCKET_NAME || ''
  const publicDomain = process.env.R2_PUBLIC_DOMAIN || ''

  const configured = Boolean(
    accountId &&
    accessKeyId &&
    secretAccessKey &&
    bucketName
  )

  return {
    provider: 'Cloudflare R2',
    configured,
    accountId: accountId ? `${accountId.slice(0, 6)}...` : null,
    bucketName: bucketName || null,
    hasAccessKey: Boolean(accessKeyId),
    hasSecretKey: Boolean(secretAccessKey),
    publicDomain: publicDomain || null,
    blockers: [
      !accountId && 'Missing R2_ACCOUNT_ID in environment',
      !accessKeyId && 'Missing R2_ACCESS_KEY_ID in environment',
      !secretAccessKey && 'Missing R2_SECRET_ACCESS_KEY in environment',
      !bucketName && 'Missing R2_BUCKET_NAME in environment',
    ].filter(Boolean),
    mode: configured
      ? 'production-r2'
      : isTestMode()
        ? 'safe-local-mock-r2'
        : 'unconfigured',
  }
}

function getR2Client() {
  const config = checkR2Configuration()

  if (!config.configured) {
    throw new Error(
      `Cloudflare R2 is not configured: ${config.blockers.join(', ')}`
    )
  }

  const signature = [
    process.env.R2_ACCOUNT_ID,
    process.env.R2_ACCESS_KEY_ID,
    process.env.R2_SECRET_ACCESS_KEY,
  ].join(':')

  if (cachedClient && cachedSignature === signature) {
    return cachedClient
  }

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
    maxAttempts: 3,
  })

  cachedSignature = signature
  return cachedClient
}

function getBucketName() {
  return process.env.R2_BUCKET_NAME
}

function validateKey(key) {
  if (
    typeof key !== 'string' ||
    !key ||
    key.startsWith('/') ||
    key.includes('\\') ||
    key.split('/').includes('..')
  ) {
    throw new Error('Invalid R2 object key.')
  }

  return key
}

export function validateImageBuffer(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    throw new Error('Invalid image payload: expected binary buffer.')
  }

  if (buffer.length === 0) {
    throw new Error('Image file is empty.')
  }

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(
      `Image exceeds maximum allowed size of 5 MB (current: ${(buffer.length / (1024 * 1024)).toFixed(2)} MB).`
    )
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { valid: true, mime: 'image/jpeg', ext: 'jpg' }
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { valid: true, mime: 'image/png', ext: 'png' }
  }

  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return { valid: true, mime: 'image/webp', ext: 'webp' }
  }

  throw new Error('Unsupported image format. Use JPEG, PNG, or WebP.')
}

export function generateStorageKey(ext = 'jpg') {
  const allowedExtensions = new Set(['jpg', 'jpeg', 'png', 'webp'])
  const extension = String(ext).toLowerCase().replace(/^\./, '')

  if (!allowedExtensions.has(extension)) {
    throw new Error('Unsupported image extension.')
  }

  const now = new Date()
  const year = now.getUTCFullYear()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  const uuid = crypto.randomUUID()

  return `gallery/${year}/${month}/${uuid}.${extension}`
}

export async function putObjectToR2(
  firstArg,
  maybeBuffer,
  maybeContentType
) {
  let key
  let buffer
  let contentType

  if (
    typeof firstArg === 'object' &&
    firstArg !== null &&
    !Buffer.isBuffer(firstArg)
  ) {
    key = firstArg.key
    buffer = firstArg.buffer
    contentType = firstArg.contentType || 'image/jpeg'
  } else {
    key = firstArg
    buffer = maybeBuffer
    contentType = maybeContentType || 'image/jpeg'
  }

  validateKey(key)

  const detected = validateImageBuffer(buffer)

  if (contentType !== detected.mime) {
    throw new Error('Image content type does not match the file.')
  }

  const config = checkR2Configuration()

  if (!config.configured) {
    if (!isTestMode()) {
      throw new Error('Cloudflare R2 credentials are required.')
    }

    mockR2Storage.set(key, {
      buffer: Buffer.from(buffer),
      contentType,
      size: buffer.length,
      uploadedAt: new Date().toISOString(),
    })

    return {
      success: true,
      key,
      url: `/api/gallery/image/${encodeURIComponent(key)}`,
      backend: 'safe-local-mock-r2',
    }
  }

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )

  return {
    success: true,
    key,
    url: `/api/gallery/image/${encodeURIComponent(key)}`,
    backend: 'cloudflare-r2',
  }
}

export async function getObjectFromR2(key) {
  validateKey(key)

  const config = checkR2Configuration()

  if (!config.configured) {
    if (!isTestMode()) {
      throw new Error('Cloudflare R2 credentials are required.')
    }

    const stored = mockR2Storage.get(key)

    return stored
      ? {
          buffer: Buffer.from(stored.buffer),
          contentType: stored.contentType,
          size: stored.size,
        }
      : null
  }

  try {
    const response = await getR2Client().send(
      new GetObjectCommand({
        Bucket: getBucketName(),
        Key: key,
      })
    )

    if (!response.Body) {
      return null
    }

    const bytes = await response.Body.transformToByteArray()
    const buffer = Buffer.from(bytes)

    return {
      buffer,
      contentType: response.ContentType || 'application/octet-stream',
      size: buffer.length,
    }
  } catch (error) {
    if (
      error.name === 'NoSuchKey' ||
      error.name === 'NotFound' ||
      error.$metadata?.httpStatusCode === 404
    ) {
      return null
    }

    throw error
  }
}

export async function deleteObjectFromR2(key) {
  validateKey(key)

  const config = checkR2Configuration()

  if (!config.configured) {
    if (!isTestMode()) {
      throw new Error('Cloudflare R2 credentials are required.')
    }

    mockR2Storage.delete(key)
    return { success: true, key }
  }

  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
      Key: key,
    })
  )

  return { success: true, key }
}

export function getMockStorageCount() {
  return mockR2Storage.size
}

export function clearMockStorage() {
  mockR2Storage.clear()
}
