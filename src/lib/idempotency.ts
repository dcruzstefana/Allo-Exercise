import db from './db';

/**
 * Checks if a request with the given Idempotency-Key has already been processed.
 * If yes, returns the saved status and body to be re-served.
 */
export async function checkIdempotency(key: string | null) {
  if (!key) return null;

  try {
    const record = await db.idempotentRequest.findUnique({
      where: { key },
    });

    if (record) {
      console.log(`[Idempotency] Duplicate request detected for key: ${key}. Re-serving response.`);
      return {
        status: record.responseStatus,
        body: JSON.parse(record.responseBody),
      };
    }
  } catch (error) {
    console.error('[Idempotency Check Error]:', error);
  }

  return null;
}

/**
 * Saves the response status and body against the Idempotency-Key.
 */
export async function saveIdempotency(key: string | null, status: number, body: any) {
  if (!key) return;

  try {
    await db.idempotentRequest.upsert({
      where: { key },
      update: {
        responseStatus: status,
        responseBody: JSON.stringify(body),
      },
      create: {
        key,
        responseStatus: status,
        responseBody: JSON.stringify(body),
      },
    });
    console.log(`[Idempotency] Saved response for key: ${key}`);
  } catch (error) {
    console.error('[Idempotency Save Error]: Failed to store response:', error);
  }
}
