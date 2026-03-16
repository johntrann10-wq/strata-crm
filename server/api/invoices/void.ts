/**
 * Void invoice API handler
 */

export async function voidInvoice(id: string) {
  // TODO: validate id, set invoice status to void
  return { ok: true, id };
}
