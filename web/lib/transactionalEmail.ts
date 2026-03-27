import { ApiError } from "../api";

export function getTransactionalEmailErrorMessage(error: unknown, label: string): string {
  if (error instanceof ApiError) {
    if (error.code === "EMAIL_MISSING_RECIPIENT") {
      return `${label} could not be emailed because the client has no email address.`;
    }
    if (error.code === "EMAIL_NOT_CONFIGURED") {
      return `${label} could not be emailed because transactional email is not configured.`;
    }
    if (error.code === "EMAIL_SEND_FAILED") {
      return error.message || `${label} email failed to send.`;
    }
    return error.message || `${label} email failed.`;
  }
  if (error instanceof Error) {
    return error.message || `${label} email failed.`;
  }
  return `${label} email failed.`;
}
